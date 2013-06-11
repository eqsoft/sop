'use strict';

module.metadata = {
  "stability": "unstable"
};

const {Cc, Ci, Cu, Cr, Cm} = require("chrome");
var { emit, on, once, off } = require("sdk/event/core");
exports.on = on.bind(null, exports); // early binding of "on" and "removeListener" event handler
exports.removeListener = function removeListener(type, listener) {
	off(exports, type, listener);
};
exports.__exposedProps__ = { // early exposing of "on" and "removeListener" event handler
	on 		: "rw",
	removeListener	: "rw"
};

/**
 * sdk packages
 */
 
var data = require('self').data;
var system = require("sdk/system");
var windows = require("sdk/windows").browserWindows;
var winutils = require('sdk/window/utils');
var tabs = require("sdk/tabs");
//var tabutils = require("sdk/tabs/utils");
var file = require("sdk/io/file");
var net = require("sdk/net/url");

/** 
 * custom modules and variables
 */
var main = require("./main");
var utils = require("./utils");
var som = require("./som");
var db = require("./db");
var env	= require("./env");

var mtab = null; // manager tab (only one instance)
var mw = null; // unwrapped manager window (only one instance) 

var ps = {}; // player instances

var mts = { lms : "", lm : ""} 	// manager templates, must be manually registered: see data/som/templates/manager/*.html
var pts = {}; 			// player templates, must be manually registered: see data/som/templates/player/*.html

main.on("startup", startup );
main.on("install", startup );
main.on("downgrade", downgrade );
windows.on("open",onWinOpen); // for event if manager or player is dragged to a new window
tabs.on("ready",onTabReady);
var prefs = require('sdk/simple-prefs').prefs;
require('sdk/simple-prefs').on("startSOM", onPrefStartSom);
require('sdk/simple-prefs').on("stopSOM", onPrefStopSom);
require('sdk/simple-prefs').on("resetSOM", onPrefResetSom);
 
som.on("allLmChanged",renderAllLm);
som.on("lmChanged",renderLm);

const maxReloadTries = 5;
var reloadTries = 0;

function startup() {
	if (prefs.autoStart) {
		utils.log("gui startup");
		if (mtab) {
			utils.log("already started");
			return;
		}
		openSomTab();
	}
}

function downgrade() {
	if (mtab) { // comes from unload
		try {
			env.rte.stop();
		}
		catch (e) {
			utils.err(e);
		}
	}
	else { // comes from new install
		var windows = require("sdk/windows").browserWindows;
		// this will stop rte env!
		for each (var tab in windows.activeWindow.tabs) {
			if (tab.title == env.globals.managerTitle || tab.title == env.globals.playerTitle) {
				utils.log("close tab " + tab.title);
				tab.close();
			}
		}
		startup(); 
	}
}

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
				env.rte.run(); 
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
				env.rte.run();
				initPlayer(tab);
			}
			break;
		default :
			utils.log("external tab " + tab.title + ": no initialization");
	}
}

function initManager(tab) {
	utils.log("init manager");
	mtab = tab;
	if (prefs.pinTab) { // experimental
		tab.pin();
	}
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
}

function initPlayer(tab) {
	utils.log("init player");
	if (reloadTries === maxReloadTries) {
		utils.err("max reload tries reached, sorry something goes wrong...");
		return;
	}
	
	var brWin = winutils.getMostRecentBrowserWindow();
	var wrapWin = brWin.content.wrappedJSObject;
	
	if (wrapWin.document.title != env.globals.playerTitle) {
		utils.log("window BUG: must reload tab...");
		tab.activate();
		tab.window.activate();
		reloadTries ++
		tab.reload();
		return;
	}
	reloadTries = 0;
	var id = getId(getParams(tab.url));
	
	if (utils.findIn(ps,id)) {
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
	getPlayerTemplates(); 
}

function openSomTab() {
	var url = data.url("som/som.html");
	tabs.open({ url: url });
}

function getMTab() {
	return mtab;
}

function getPs() {
	return ps;
}
 
function activateManager() {
	utils.log("activate Manager");
	try {
		mtab.activate();
		mtab.window.activate();
	}
	catch(e) {
		utils.err(e);
	}
}

function activatePlayer(id) {
	utils.log("activate Player");
	try {
		ps[id].tab.activate();
		ps[id].tab.window.activate();
	}
	catch(e) {
		utils.err(e);
	}
}

/**
 * prefs events
 */ 

function onPrefStartSom() {
	utils.log("onPrefStartSom");
	onPrefStopSom();
	openSomTab();
}

function onPrefStopSom() {
	utils.log("onPrefStopSom");
	for each (var p in ps) {
		if (p.tab) {
			p.tab.close();
		}
	}
	ps = {};
	if (mtab) {
		mtab.close();
		mtab = null;
		mw = null;
	}
	env.rte.stop();
}

function onPrefResetSom() {
	utils.log("onPrefResetSom");
	onPrefStopSom();
	env.rte.cleanProfileData();
	env.rte.initIO();
	env.rte.populateProfile();
	openSomTab();
}

/**
 * manager and player events 
 */
  
function onManagerLoad() {
	utils.log("manager ready");
	var lms = som.getAllLm(); // this will trigger som event lmsChanged
}

function onManagerUnload() {
	utils.log("manager closed");
	mw = null;
	mtab = null;
	emit(exports,"managerUnload");
}

function onPlayerLoad(id) {
	utils.log("player ready: " + id);
	renderLmStatus(id,"running");
	emit(exports, "playerLoad");
}

function onPlayerUnload(id) {
	utils.log("gui emit playerUnload");
	delete ps[id];
	renderLmStatus(id);
	emit(exports,"playerUnload",id);
	
}

/**
 * window events
 */ 
 
function onWinOpen(win) { // check if a player window was dragged to a new window
	utils.log("gui onWinOpen");
	var brWin = winutils.getMostRecentBrowserWindow();
	brWin.setTimeout(function () { checkNewWindow(win.tabs[0],brWin) }, 1000);
}

function onWinClose(window) {
	utils.log("gui onWinClose");
}

function onWinActivate(window) {
	utils.log("gui onWinActivate");
}

function onWinDeactivate(window) {
	utils.log("gui onWinDeactivate");
}

/**
 * tab events 
 */
  
function onTabReady(tab) {
	utils.log("tab ready: " + tab.title);
	init(tab); 
}

function onTabClose(tab) { // Buggy
	utils.log("tab close");
}

function onTabActivate(tab) {
	utils.log("tab activate");  
}

function onTabDeactivate(tab) {
	utils.log("tab deactivate");
}

/**
 * misc functions
 */ 

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

function getId(params) {
	try {
		return params.client + "_" + params.obj_id;
	}
	catch(e) {
		utils.err(e);
	}
}

function getManagerParams() {
	return JSON.stringify(getParams(mw));
}

function getPlayerParams(win) {
	return JSON.stringify(getParams(win));
}

function getParams(win) { // window object or url string
	var w = winutils.getMostRecentBrowserWindow();
	var qs = {};
	var queryString;
	queryString = (typeof win === "string") ? win.split("\?")[1] : win.document.location.search.slice(1);
	var re = /([^&=]+)=([^&]*)/g;
	var m;
	while (m = re.exec(queryString)) {
		qs[w.decodeURIComponent(m[1])] = w.decodeURIComponent(m[2]);
	}
	return qs;
}

/**
 * templates
 */

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
	utils.log("renderAllLm"); // ToDo: Problem of second installation if player is open lm will be not rendered: empty page ?? 
	var lms = som.getLmsObj();
	var str = "";
	var tmp = mts.lms;
	for each (var lm in lms) {
		var id = lm.client + "_" + lm.obj_id;
		var player = (lm.scorm_version == "1.2") ? "player12.htm" : "player2004.html"
		var url = "http://localhost:50012/" + player + "?client=" + lm.client + "&obj_id=" + lm.obj_id;
		var s = tmp.replace(/__\#VAR_LINK__/g, url);
		s = s.replace(/__\#VAR_CRSID__/g, id);
		s = s.replace(/__\#VAR_TITLE__/g,lm.title);
		s = s.replace(/__\#VAR_CRSDETAILS__/g,"detail_" + lm.client + "_" + lm.obj_id);
		var st = (lm.status) ? lm.status.replace("trac_","") : "not_attempted";
		s = s.replace(/__\#VAR_STATUSICON__/g,"images/" + st + ".png");
		s = s.replace(/__\#VAR_STATUSTITLE__/g,st);
		str += s;
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
	tmp = tmp.replace(/__\#VAR_DESCRIPTION__/g,lm.description);
	var tt = (lm.total_time !== "") ? mw.decodeURIComponent(lm.total_time) : "";
	tmp = tmp.replace(/__\#VAR_TOTALTIME__/g,tt);
	
	if (str) { // comming from renderAllLm
		return str.replace(/__\#TMP_LM__/g,tmp); 
	}
	else {
		var elLmDetail = mw.document.getElementById("aciLm");
		elLmDetail.innerHTML = tmp;
	}
}

function renderLmStatus(id,status) {
	if (!mw) {
		return;
	}
	utils.log("renderLmStatus: " + id);
	if (!status) {
		var lms = som.getLmsObj();
		status = lms[id].status.replace("trac_","");
	}
	var img = mw.document.getElementById("status_" + id);
	img.src = "images/" + status + ".png";
}

/**
 * gui actions
 */
  
function getData(statement, params, asRecordObject) {
	return db.getData(statement, params, false, asRecordObject);
}

function setData(statement, params) {
	return db.setData(statement, params)
}

var managerFuncs = {
	getManagerParams : getManagerParams,
	__exposedProps__ : {
		getManagerParams : "r"
	}
} 

var playerFuncs = {
	getParams	: getParams,
	getPlayerParams : getPlayerParams,
	getData		: getData,
	setData		: setData,	
	__exposedProps__ : {
		getParams : "r",
		getPlayerParams : "r",
		getData : "r",
		setData : "r"
	}
}

/* late binding of exports and exposed props */
exports.getParams = getParams;
exports.initManager = initManager;
exports.initPlayer = initPlayer;
exports.getMTab = getMTab;
exports.getPs = getPs;
exports.activateManager = activateManager;
exports.activatePlayer = activatePlayer;
