'use strict';

module.metadata = {
  "stability": "unstable"
};

const {Cc, Ci, Cu, Cr, Cm} = require("chrome");
var { emit, on, once, off } = require("sdk/event/core");
/**
 * sdk packages
 */

const data = require('self').data;
const system = require("sdk/system");
const winutils = require('sdk/window/utils');
const file = require("sdk/io/file");
const net = require("sdk/net/url");

/** 
 * custom modules and variables
 */
var utils = require("./utils");
var som = require("./som");
var db = require("./db");

var mtab; // manager tab
var ptab; // player tab
var mw; // unwrapped manager window
var pw; // unwrapped player window
var mts = { lms : "", lm : ""} 	// manager templates, must be manually registered: see data/som/templates/manager/*.html
var pts = {}; 			// player templates, must be manually registered: see data/som/templates/player/*.html

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
	//db.on("lmUserDataChanged",function() { renderAllLm() }); //
}

function initPlayer(tab) {
	utils.log("init player");
	ptab = tab;
	var pwin = winutils.getMostRecentBrowserWindow();
	getPlayerTemplates();
	pw = pwin.content.wrappedJSObject;
	pw.som = som;
	pw.db = db;
	pw.utils = utils;
	pw.gui = playerFuncs;
	pw.addEventListener("load", onPlayerLoad, true);
	pw.addEventListener("unload", onPlayerUnload, true);
}

function getMTab() {
	return mtab;
}

function getPTab() {
	return ptab;
}
/**
 * event handler
 */
  
function onManagerLoad() {
	utils.log("manager ready");
	som.on("allLmChanged",renderAllLm);
	som.on("lmChanged",renderLm);
	var lms = som.getAllLm(); // this will trigger som event lmsChanged
}

function onManagerUnload() {
	utils.log("manager closed");
}

function onPlayerLoad() {
	utils.log("player ready");
}

function onPlayerUnload() {
	utils.log("player closed");
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
	utils.log("renderAllLm"); // ToDo: Problem of second installation if player is open lm will be not rendered: empty page ?? 
	var lms = som.getLmsObj();
	var str = "";
	var tmp = mts.lms;
	for each (var lm in lms) {
		var id = lm.client + "_" + lm.obj_id;
		var s = tmp.replace(/__\#VAR_CRSID__/g, id);
		s = s.replace(/__\#VAR_TITLE__/g,lm.title);
		s = s.replace(/__\#VAR_CRSDETAILS__/g,"detail_" + lm.client + "_" + lm.obj_id);
		str += s;
		str = renderLm(id,str);
	}
	var elLm = mw.document.getElementById("acLm");
	elLm.innerHTML = str; 
}

function renderLm(id,str=false) {
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
 
function getParams(win) {
	var qs = {}, queryString = win.document.location.search.slice(1), re = /([^&=]+)=([^&]*)/g, m;
	while (m = re.exec(queryString)) qs[win.decodeURIComponent(m[1])] = win.decodeURIComponent(m[2]);
	return qs;
}

function getManagerParams() {
	return JSON.stringify(getParams(mw));
}

function getPlayerParams() {
	return JSON.stringify(getParams(pw));
}

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
	getPlayerParams : getPlayerParams,
	getData		: getData,
	setData		: setData,	
	__exposedProps__ : {
		getPlayerParams : "r",
		getData : "r",
		setData : "r"
	}
}

/* addon avents */
exports.initManager = initManager;
exports.initPlayer = initPlayer;
exports.getMTab = getMTab;
exports.getPTab = getPTab;
