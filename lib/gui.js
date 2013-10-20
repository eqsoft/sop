/**
 * GUI class for SCORM-Offline-Manager and -Player
 *  
 * @class gui
 **/ 
'use strict';

module.metadata = {
  "stability": "unstable"
};

const {Cc, Ci, Cu, Cr, Cm} = require("chrome");
/**
 * @public
 * @method on
 **/
/**
 * @public
 * @method once
 **/
/**
 * @public
 * @method removeListener
 **/
var { emit, off, on, once } = require("sdk/event/core");
exports.on = on.bind(null, exports);
exports.once = once.bind(null, exports);
exports.removeListener = function removeListener(type, listener) {
	off(exports, type, listener);
};
exports.__exposedProps__ = {
	on 		: "rw",
	removeListener	: "rw"
};

// sdk packages
 
var data = require('self').data;
var windows = require("sdk/windows").browserWindows;
var winutils = require('sdk/window/utils');
var tabs = require("sdk/tabs");
var net = require("sdk/net/url");

// custom modules and variables
 
var main = require("./main");
var utils = require("./utils");
var som = require("./som");
var db = require("./db");
var env	= require("./env");

var mtab = null; // manager tab (only one instance)
var mw = null; // unwrapped manager window (only one instance) 

var ps = {}; // player instances

var mts = { lms : "", lm : "" } 	// manager templates, must be manually registered: see data/som/templates/manager/*.html
var pts = {}; 			// player templates, must be manually registered: see data/som/templates/player/*.html

main.on("startup", startup );
main.on("install", startup );
main.on("downgrade", downgrade );
windows.on("open",onWinOpen); // for event if manager or player is dragged to a new window
tabs.on("ready",onTabReady);
var prefs = require('sdk/simple-prefs').prefs;
var _ = require("sdk/l10n").get;
require('sdk/simple-prefs').on("prefStartSOM", onPrefStartSom);
require('sdk/simple-prefs').on("prefStopSOM", onPrefStopSom);
require('sdk/simple-prefs').on("prefResetSOM", onPrefResetSom);
require('sdk/simple-prefs').on("prefSkin", onPrefSkin);
 
som.on("allLmChanged",renderAllLm);
som.on("lmChanged",renderLm);

const maxReloadTries = 5;
var reloadTries = 0;

/**
 * EventListener for startup event, will open a som tab if prefs.autoStart is set 
 * @private
 * @method startup
 **/ 
function startup() {
	if (prefs.prefAutoStart) {
		utils.log("gui startup");
		if (mtab) {
			utils.log("already started");
			return;
		}
		openSomTab();
	}
}

/**
 * EventListener for downgrade event, will stop the environment components in an unload context 
 * and in a load context will shutdown all existing player and manager tabs and trigger a new startup()  
 * @private
 * @method downgrade
 **/
function downgrade(load=false) { // needs to be tested on Android!
	if (!load) { // fired from unload
		try {
			env.stop();
		}
		catch (e) {
			utils.err(e);
		}
	}
	else { // fired from new install
		var windows = require("sdk/windows").browserWindows;
		// this will stop env running!
		for each (var tab in windows.activeWindow.tabs) {
			if (tab.title == env.globals.managerTitle || tab.title == env.globals.playerTitle) {
				utils.log("close tab " + tab.title);
				tab.close();
			}
		}
		startup(); 
	}
}

/**
 * Triggered on tabs.on("open") event.
 * Checks if the window title is a player or manager title and initializes the component.
 * The method ensures, that the environment runs and only one manager tab and only one learning module instance is running.
 * @private
 * @method init
 * @param {Object} tab    
 **/ 
function init(tab) {
	utils.log("init gui");
	switch (tab.title) {
		case env.globals.managerTitle :
			if (mtab) {
				utils.log("som already started.");
				tab.close();
				activateManager();
			}
			else {
				env.run(); 
				initManager(tab);
			}
			break;
		case env.globals.playerTitle :
			var params = getParams(tab.url);
			var id = params.client+"_"+params.obj_id;
			if (id in ps) { 
				utils.log("lm with id " + id + " is already running");
				tab.close();
				activatePlayer(id);
			}
			else {
				env.run();
				initPlayer(tab);
			}
			break;
		default :
			var rw = winutils.getMostRecentBrowserWindow();
			var w = rw.content.wrappedJSObject;
			var metas = w.document.getElementsByTagName('meta'); 
			for (var i=0; i<metas.length; i++) { 
				if (metas[i].getAttribute("name") == "require-sop-version") {
					utils.log("connector request from: " + tab.url); 
					w.sopConnector = som.connectorFuncs;
				} 
			}
			utils.log("external tab " + tab.title + ": no player or manager initialization");
	}
}

/**
 * Triggered on tabs.on("open") event and window.title = managerTitle. 
 * Injects the necessary communication objects and gui scripts to the content.
 * Adds load and unload EventListeners to the DOMDocument. 
 * @private
 * @method initManager
 * @param {Object} tab    
 **/ 
function initManager(tab) {
	utils.log("init manager");
	mtab = tab;
	var jq = data.url("som/jquery/jquery.js");
	var bs = data.url("som/bootstrap/js/bootstrap.min.js");
	var mwin = winutils.getMostRecentBrowserWindow();
	getManagerTemplates();
	mw = mwin.content.wrappedJSObject;
	mw.som = som;
	mw.db = db;
	mw.utils = utils;
	mw.gui = managerFuncs;
	mw.addEventListener("load", onManagerLoad, true);
	mw.addEventListener("unload", onManagerUnload, true);
	var mworker = tab.attach( { 'contentScriptFile' : [jq,bs] }); 
	onPrefSkin();
}

/**
 * Triggered on tabs.on("open") event and window.title = playerTitle. 
 * Injects the necessary communication objects and gui scripts to the content. 
 * Adds load and unload EventListeners to the DOMDocument. 
 * @private
 * @method initPlayer
 * @param {Object} tab    
 **/ 
function initPlayer(tab) {
	utils.log("init player");
	if (reloadTries === maxReloadTries) {
		utils.err("max reload tries reached, sorry something goes wrong...");
		return;
	}
	
	var brWin = winutils.getMostRecentBrowserWindow();
	var wrapWin = brWin.content.wrappedJSObject;
	
	if (wrapWin.document.title != env.globals.playerTitle) { // ToDo: only instring of title
		utils.log("window BUG: must reload tab...");
		tab.activate();
		if (tab.window) {
			tab.window.activate();
		}
		reloadTries ++
		tab.reload();
		return;
	}
	reloadTries = 0;
	var id = getId(getParams(tab.url));
	//wrapWin.document.title += " " + id; 
	//utils.log("1 " + typeof ps[id]);
	//utils.log("findIn: " + typeof ps + " id: " + id);
	
	if (id in ps) { // deprecated: see httpObserver
		utils.log("player instance exists: " + id);
		tab.close();
		ps[id].win.activate();
		ps[id].tab.activate(); // ToDo: if opened in new window activate window first
		return;
	}
	wrapWin.som = som;
	wrapWin.db = db;
	wrapWin.utils = utils;
	wrapWin.gui = playerFuncs;
	wrapWin.addEventListener("load", function() { onPlayerLoad(id) }, false);
	wrapWin.addEventListener("unload", function() { onPlayerUnload(id) }, false);
	ps[id] = {
		id 		: id,
		tab		: tab,
		brWin		: brWin,
		wrapWin		: wrapWin
	}
	//utils.log("ps.length: " + ps.length);
	//utils.log("2 " + typeof ps[id]);
	getPlayerTemplates(); 
}

/**
 * Opens a Tab with SCORM-Offline-Manager
 * @private 
 * @method openSomTab
 **/ 
function openSomTab() {
	var url = data.url("som/som.html");
	tabs.open({ url: url });
}

/**
 * Returns the Manager Tab  
 * @private 
 * @method getMTab
 * @return {Object} mtab
 **/
function getMTab() {
	return mtab;
}

/**
 * Returns the Object with all active player instances  
 * @private 
 * @method getPs
 * @return {Object} ps
 **/
function getPs() {
	return ps;
}

/**
 * Activates the Manager Tab  
 * @private 
 * @method activateManager
 **/
function activateManager() {
	utils.log("activate Manager");
	
	try {
		mtab.activate();
		if (mtab.window) {
			mtab.window.activate();
		}
	}
	catch(e) {
		utils.err(e);
	}
}

/**
 * Activates a Player Tab with the given id  
 * @private 
 * @method activatePlayer
 * @param {String} id 
 **/
function activatePlayer(id) {
	utils.log("activate Player");
	try {
		ps[id].tab.activate();
		if (ps[id].tab.window) {
			ps[id].tab.window.activate();
		}
	}
	catch(e) {
		utils.err(e);
	}
}

/**
 * opens an new or activate an existing SOM Instance (called from a player instance)   
 * @public 
 * @method openSomHome
 **/
function openSomHome() {
	if (mtab) {
		utils.log("som already started.");
		activateManager();
	}
	else {
		openSomTab();
	}
}

// prefs events

/**
 * eventHandler for preference button "Start SOM". 
 * close existing som tab and starts a new one.
 * 
 * @private
 * @method onPrefStartSom
 **/   
function onPrefStartSom() {
	utils.log("onPrefStartSom");
	onPrefStopSom();
	openSomTab();
}

/**
 * eventHandler for preference button "Stop SOM". 
 * close existing som tab and window references and stops the environment
 * 
 * @private
 * @method onPrefStopSom
 **/  
function onPrefStopSom() {
	utils.log("onPrefStopSom"); 
	if (mtab) {
		mtab.close();
		mtab = null;
		mw = null;
	}
	env.stop();
}

/**
 * eventHandler for preference button "Reset SOM". 
 * stop som, reset to the profile factory setting and start som
 * 
 * @private
 * @method onPrefResetSom
 **/ 
function onPrefResetSom() {
	utils.log("onPrefResetSom");
	onPrefStopSom();
	env.cleanProfileData();
	env.initIO();
	env.populateProfile();
	openSomTab();
}

/**
 * eventHandler for preference button "SOM Skin". 
 * switches the som skin css on the fly (android: need a firefox restart) 
 * 
 * @private
 * @method onPrefSkin
 **/ 
function onPrefSkin() {
	utils.log("onPrefSkin: " + prefs.prefSkin);
	var skin = mw.document.getElementById("skin");
	var href = skin.href;
	var newHref = href.replace(/^(.*?\/)([a-zA-Z]+)(\/som\.css)$/, function(a,b,c,d) { return b + prefs.prefSkin + d } );
	if (href != newHref) {
		skin.href = newHref;
	}
}

// manager and player events 

/**
 * eventHandler bound to the manager dom window (mw) load event. 
 * fetches all learning modules and if player instances of lms are open, the status signal is set to "running"  
 * 
 * @private
 * @method onManagerLoad
 **/   
function onManagerLoad() {
	utils.log("manager ready");
	var lms = som.getAllLm(); // this will trigger som event lmsChanged
	for each (var p in ps) {
		renderLmStatus(p.id,"running");
	}
}

/**
 * @event managerUnload
 **/ 
/**
 * eventHandler bound to the manager dom window (mw) unload event. 
 * setting the global variables mw and mtab to null and emitting managerUnload event   
 * 
 * @private
 * @method onManagerUnload
 **/ 
function onManagerUnload() {
	utils.log("manager closed");
	mw = null;
	mtab = null;
	emit(exports,"managerUnload");
}

/**
 * @event playerLoad
 **/ 
/**
 * eventHandler bound to the players dom window (ps[p.id].wrapWin) load event. 
 * rendering running status of actual lm and emitting playerLoad event 
 * 
 * @private
 * @method onPlayerLoad
 **/   
function onPlayerLoad(id) {
	utils.log("player ready: " + id);
	renderLmStatus(id,"running");
	emit(exports, "playerLoad");
}

/**
 * @event playerUnload
 **/ 
/**
 * eventHandler bound to the players dom window (ps[p.id].wrapWin) unload event. 
 * deleting ps[p.id] object, rendering running status and emitting playerUnload event    
 * 
 * @private
 * @method onPlayerUnload
 **/ 
function onPlayerUnload(id) {
	utils.log("gui emit playerUnload");
	delete ps[id];
	renderLmStatus(id);
	emit(exports,"playerUnload",id);
	
}

// window events

/**
 * eventhandler triggered on all new window.open events
 * needed for controlling a player window dragged to a new browser window (see checkNewWindow)
 * 
 * @private
 * @method onWinOpen
 **/  
function onWinOpen(win) { // check if a player window was dragged to a new window
	utils.log("gui onWinOpen");
	var brWin = winutils.getMostRecentBrowserWindow();
	brWin.setTimeout(function () { checkNewWindow(win.tabs[0],brWin) }, 1000);
}

/**
 * eventhandler triggered on all window.close events
 * only event logging
 * 
 * @private
 * @method onWinClose
 **/ 
function onWinClose(window) {
	utils.log("gui onWinClose");
}

/**
 * eventhandler triggered on all window.activate events
 * only event logging
 * 
 * @private
 * @method onWinActivate
 **/ 
function onWinActivate(window) {
	utils.log("gui onWinActivate");
}

/**
 * eventhandler triggered on all window.deactivate events
 * only event logging
 * 
 * @private
 * @method onWinDeactivate
 * @param {window Object} window
 **/
function onWinDeactivate(window) {
	utils.log("gui onWinDeactivate");
}

// tab events 

/**
 * eventhandler triggered on all tab.ready events
 * triggers init(tab) for initialization of manager and player tabs
 * 
 * @private
 * @method onTabReady
 * @param {tab Object} tab
 **/  
function onTabReady(tab) {
	utils.log("tab ready: " + tab.title);
	init(tab); 
}

/**
 * eventhandler triggered on all tab.close events
 * only event logging
 * 
 * @private
 * @method onTabClose
 * @param {tab Object} tab
 **/ 
function onTabClose(tab) { // Buggy
	utils.log("tab close");
}

/**
 * eventhandler triggered on all tab.activate events
 * only event logging
 * 
 * @private
 * @method onTabActivate
 * @param {tab Object} tab
 **/ 
function onTabActivate(tab) {
	utils.log("tab activate");  
}

/**
 * eventhandler triggered on all tab.deactivate events
 * only event logging
 * 
 * @private
 * @method onTabDeactivate
 * @param {tab Object} tab
 **/ 
function onTabDeactivate(tab) {
	utils.log("tab deactivate");
}

// misc functions

/**
 * dragging an existing player tab to a new browser window needs updating the ps[p.id] window and tab objects
 * 
 * @private
 * @method checkNewWindow
 * @param {tab Object} tab
 * @param {BrowserWindow object} brWin
 **/ 
function checkNewWindow(tab,brWin) {
	utils.log("checkNewWindow: " + tab.title);
	for each (var p in ps) {		
		if (p.tab.title === undefined) { // was copied to the new window (puhhh...)
			utils.log("new win and tab for existing player");
			ps[p.id]["tab"] = tab;
			ps[p.id]["brWin"] = brWin;
		}
	}
}

/**
 * returns an lm.id created from querystring paramters
 * 
 * @private
 * @method getId
 * @param {params Object} params
 * @return {String} id
 **/ 
function getId(params) {
	try {
		return params.client + "_" + params.obj_id;
	}
	catch(e) {
		utils.err(e);
	}
}

/**
 * returns true if url is a player url
 * 
 * @public
 * @method isPlayerUrl
 * @param {String} url
 * @return {String|Boolean} p.id if url is a player url else false
 **/ 
function isPlayerUrl(url) {
	var ret = /(localhost|127\.0\.0\.1).*?player.*/g.test(url);
	if (ret) {
		return getIdFromUrl(url); 
	}
	else {
		return false;
	}
}

/**
 * returns true if url is a player url
 * 
 * @public
 * @method isPlayerOpen
 * @param {String} id
 * @return {Boolean} true if url is a player with id is open
 **/ 
function isPlayerOpen(id) {
	return (id in ps);
}

/**
 * closes recent empty tabs
 * 
 * @public
 * @method closeRecentTab
 **/ 
function closeRecentTab() {
	if (tabs.activeTab.url == "about:blank") { //close only empty invalid windows opened with a href link
		tabs.activeTab.close();
		utils.log("closeRecentTab: " + tabs.activeTab.title + " url: " + tabs.activeTab.url);
	}
}

/**
 * get player id from url
 * 
 * @public
 * @method getIdFromUrl
 * @param {String} url
 * @return {String|Boolean} player id else false
 **/ 
function getIdFromUrl(url) {
	try {
		return getId(getParams(url));
	}
	catch(e) {
		utils.err(e);
		return false;
	}
}

function getManagerParams() {
	return JSON.stringify(getParams(mw));
}

function getPlayerParams(win) {
	return JSON.stringify(getParams(win));
}

function getParams(win) { // window object or url string
	var qs = {};
	var queryString;
	queryString = (typeof win === "string") ? win.split("\?")[1] : win.document.location.search.slice(1);
	var re = /([^&=]+)=([^&]*)/g;
	var m;
	while (m = re.exec(queryString)) {
		qs[decodeURIComponent(m[1])] = decodeURIComponent(m[2]);
	}
	return qs;
}

// templates

function getManagerTemplates() {
	for each (var tmp in Object.keys(mts)) {
		var u = data.url("som/templates/manager/" + tmp + ".html");
		net.readURI(u, {sync: true, charset : "UTF-8"}).then(function(c) { mts[tmp] = c } );
	}
}

function getPlayerTemplates() {
	// no templates
}

function renderAllLm() {
	if (!mw) {
		return;
	}
	//utils.log("renderLm");
	//utils.log("renderAllLm"); // ToDo: Problem of second installation if player is open lm will not be rendered: empty page ?? 
	var lms = som.getLmsObj();
	var str = "";
	var tmp = mts.lms;
	
	for each (var lm in lms) {
		var id = lm.client + "_" + lm.obj_id; 
		/*
		var player = (lm.scorm_version == "1.2") ? "player12.html" : "player2004.html"
		var url = "http://localhost:50012/" + player + "?client=" + lm.client + "&obj_id=" + lm.obj_id;
		*/
		var st = som.getLmStatusText(lm.status); 
		//utils.log(JSON.stringify(lm));
		var link = som.getOfflineUrl(id);
		var data = {
			LINK 		: link,
			CRSID 		: id,
			TITLE 		: lm.title,
			CRSDETAILS 	: "detail_" + lm.client + "_" + lm.obj_id,
			STATUSICON	: "images/" + st + ".png",
			STATUSTITLE	: _(st)
		}
		str += getTemplateContent(tmp,data);
		str = renderLm(id,str);
	}
	var elLm = mw.document.getElementById("acLm");
	elLm.innerHTML = str; 
}

function renderLm(id,str=false) {
	if (!mw) {
		return;
	}
	var lms = som.getLmsObj();
	var lm = lms[id];
	var tmp = mts.lm;
	var time = utils.secondsToTime(lm.sco_total_time_sec);
	var firstaccess = "";
	var dl = new Date(lm.last_access);
	var lastaccess = dl.toLocaleString();
	var status = _(som.getLmStatusText(lm.status));
	var data = {
		DESCRIPTION 	: lm.description,
		TOTALTIME 		: time,
		ATTEMPTS		: lm.package_attempts,
		FIRSTACCESS		: firstaccess,
		LASTACCESS		: lastaccess,
		STATUS			: status
	};
	tmp = getTemplateContent(tmp,data);
	if (str) { // comming from renderAllLm
		data = { LM : tmp };
		return getTemplateContent(str,data);
	}
	else {
		try {
			var elLmDetail = mw.document.getElementById("aciLm");
			elLmDetail.innerHTML = tmp;
		}
		catch(e) {
			utils.err(e);
		}
	}
}

function renderLmStatus(id,status) {
	if (!mw) {
		return;
	}
	var st = status;
	if (undefined===status) {
		var lms = som.getLmsObj();
		st = som.getLmStatusText(lms[id].status);
	}
	var img = mw.document.getElementById("status_" + id);
	img.src = "images/" + st + ".png"; 
	img.title = _(st);
}

function getTemplateContent(str,data) {
	return str.replace(/__\#VAR_([a-zA-Z]+)__/g, function(a,b){return(undefined===data[b])?a:data[b]}).replace(/__\#LNG_([a-zA-Z]+)__/g,function(a,b){return _(b);});
}

// gui actions

function getData(statement, params, asRecordObject) {
	return db.getData(statement, params, false, asRecordObject);
}

function setData(statement, params) {
	return db.setData(statement, params)
}

function log(msg) {
	utils.log(msg);
}

var managerFuncs = {
	getManagerParams : getManagerParams,
	__exposedProps__ : {
		getManagerParams : "r"
	}
} 

// connector functions

function getSopVersion() {
	return "0.1";
}

function getOfflineUrl(id) {
	var url = som.getOfflineUrl();
	return url;
}

var playerFuncs = {
	getParams	: getParams,
	getPlayerParams : getPlayerParams,
	openSomHome	: openSomHome,
	getData		: getData,
	setData		: setData,
	log			: log,	
	__exposedProps__ : {
		getParams : "r",
		getPlayerParams : "r",
		openSomHome : "r",
		getData : "r",
		setData : "r",
		log		: "r"
	}
}

// late binding of exports and exposed props

exports.getParams = getParams;
exports.getIdFromUrl = getIdFromUrl;
exports.isPlayerOpen = isPlayerOpen;
exports.isPlayerUrl = isPlayerUrl;
exports.closeRecentTab = closeRecentTab;
exports.activatePlayer = activatePlayer; 
