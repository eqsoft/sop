'use strict';

module.metadata = {
  "stability": "unstable"
};

const {Cc, Ci, Cu, Cr, Cm} = require("chrome");
var { emit, on, once, off } = require("sdk/event/core");
/**
 * sdk packages
 */
const system = require("sdk/system");
const data = require('self').data;
const appId = require('self').id;
const windows = require("sdk/windows").browserWindows;
const tabs = require("sdk/tabs");
const winutils = require('sdk/window/utils');
const file = require("sdk/io/file");
var { startServerAsync } = require("sdk/test/httpd");
var { nsHttpServer } = require("sdk/test/httpd");

/**
 * generic XPCOM JS Modules and sqlite module  
 */
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import(data.url("som/modules/sqlite.js")); 
 
/** 
 * custom modules and variables
 */
const utils = require("./utils");
const db = require("./db");
const gui = require("./gui");
const tmpDirName = "sopTmpDir";
const sopDirName = "sop";
const sopDbName = "sop.sqlite";
const managerTitle = "SCORM Offline Manager";
const playerTitle = "SCORM Offline Player";
var win = null;
var srv;
var cleanProfile = false;
var io = {};
var lms = {};
var started = false;

/**
 * init
 */
  
function init(tab) {
	utils.log("som init: " + appId);
	switch (tab.title) {
		case managerTitle :
			gui.initManager(tab);
			break
		case playerTitle :
			gui.initPlayer(tab);
			break;
		default :
			utils.log("external tab " + tab.title + ": no initialization");
		
	}
}

/** 
 * io
 */ 

function initIO() {
	utils.log("init io...");
	var profDir = FileUtils.getFile("ProfD",[]);
	var tmpDir = profDir.clone();
	tmpDir.append(tmpDirName);
	
	var sopSrcDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	sopSrcDir.initWithPath(file.join(tmpDir.path,"resources", "sop", "data", "som", "profile", "sop"));
	var sopDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	sopDir.initWithPath(file.join(profDir.path, sopDirName));
	
	var sopSrcDb = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	sopSrcDb.initWithPath(file.join(tmpDir.path,"resources", "sop", "data", "som", "profile", "sop.sqlite"));
	var sopDb = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	sopDb.initWithPath(file.join(profDir.path, sopDbName));
	
	var xpi = FileUtils.getFile("ProfD",["extensions", appId + ".xpi"]);
	io.profDir = profDir;
	io.tmpDir = tmpDir;
	io.xpi = xpi;
	io.sopSrcDir = sopSrcDir;
	io.sopDir = sopDir;
	io.sopSrcDb = sopSrcDb;
	io.sopDb = sopDb;
	utils.log("init io completed");
}

/**
 * LM
 */
  
function getAllLm() { // ToDo: getData as Object or as String?
	lms = {}; // delete all
	var d = db.getData("lmGetAll",null,true,true);
	for each (var row in d) {
		var id = row.client + "_" + row.obj_id;
		var lm = getLmById(id,row);
		lms[id] = lm;
	} 
	emit(exports, "allLmChanged");
	return lms;
}

function getLmById(id,row=false) { // client_{obj_id}
	var idArr = id.split("_");
	var client = idArr[0];
	var obj_id = idArr[1];
	var lm;
	if (!row) { // not called from getAllLm
		var r = db.getData("lmGetAllByClientAndObjId",[client,obj_id],true,true);
		lm = r[0];
	}
	else {
		lm = row;
	}
	// push some extra infos from user data to lm
	var rec = db.getData("lmGetUser_dataByClientAndObjId",[client,obj_id],true,true); // as string!
	var tt = "";
	if (typeof rec === "object") {
		var ud = rec[0].user_data;
		if (ud !== "") {
			ud = JSON.parse(ud);
			if (typeof ud === "object") {
				tt = utils.findIn(ud,"total_time");
				utils.log("total_time: "+tt);
			}
			else {
				utils.err("user data is not an object: " + ud);
			}
		}
	}
	lm["total_time"] = tt;
	if (!row) { // update lm object in lms
		delete lms[id];
		lms[id] = lm;
		emit(exports, "lmChanged", id);
	}
	return lm;
}

function getLmsObj() {
	return lms;
}
/**
 * profile
 */
 
function cleanProfileData() {
	if (io.tmpDir.exists()) {
		utils.log("remove " + io.tmpDir.path);
		io.tmpDir.remove(true);
	}
	if (io.sopDir.exists()) {
		utils.log("remove " + io.sopDir.path);
		io.sopDir.remove(true);
	}
	if (io.sopDb.exists()) {
		utils.log("remove " + io.sopDb.path);
		io.sopDb.remove(false);
	}
}
 
function populateProfile() {
	utils.log("populateProfile");
	if (io.sopDir.exists() && io.sopDb.exists()) {
		utils.log("sop dir and db exists, nothing to populate");
		return;
	}
	if (!io.xpi.exists()) {
		utils.err("strange: could not find xpi: " + appId + ".xpi");
		return;
	} 
	if (io.tmpDir.exists()) {
		utils.log("remove " + io.tmpDir.path);
		io.tmpDir.remove(true);
	}
	io.tmpDir.create(Ci.nsIFile.DIRECTORY_TYPE,FileUtils.PERMS_DIRECTORY);
	
	utils.extractFiles(io.xpi,io.tmpDir);
	if (!io.sopDir.exists()) {
		utils.log("copy " + io.sopSrcDir.path + " to " + io.profDir.path);
		io.sopSrcDir.copyTo(io.profDir,null);
	}
	if (!io.sopDb.exists()) {
		utils.log("copy " + io.sopSrcDb.path + " to " + io.profDir.path);
		io.sopSrcDb.copyTo(io.profDir,null);
	} 
	io.tmpDir.remove(true);
}

/**
 * GUI
 */
 
function openSomTab() {
	var url = data.url("som/som.html");
	tabs.open({ url: url });
}

function closeSomTab() {
	var mtab = gui.getMTab();
	mtab.close();
}
/** 
 * sop
 */

function openCourse(id) { // ToDo: port number variable
	var crs = id.split("_");
	var crs = lms[id];
	var player = (crs.scorm_version == "1.2") ? "player12.htm" : "player2004.html"
	var url = "http://localhost:50012/" + player + "?client=" + crs.client + "&obj_id=" + crs.obj_id;  
	tabs.open({ url: url });
}

/**  
 * server
 */

function startServer(async=false) {
	utils.log("try to start server...")
	var port = 50012; // port number variable
	var path = file.join(system.pathFor("ProfD"),"sop");
	if (async) {
		try {
			srv = startServerAsync(port, path);
		}
		catch (e) {
			utils.err(e);
		}
	}
	else {
		try {
			srv = new nsHttpServer();
			srv.registerDirectory("/",io.sopDir);
			srv.start(port);
		}
		catch(e) {
			utils.err(e);
		}
	}
	utils.log("server started on port " + port + " with basepath: " + path);
}

function stopServer() {
	utils.log("try to stop server...");
	srv.stop(function() {
		utils.log("server stopped...");
		//log("server stopped."); // you should continue execution from this point.
	});
}

/**
 * window events
 */ 

function onWinOpen(window) {
	utils.log("browser window open");
	var w = winutils.getMostRecentBrowserWindow();
	w.wrappedJSObject.setTimeout(function() {
		for each (var tab in window.tabs) {
			if (tab.title == managerTitle) {	
				init(tab,w);
			}
		}
	}, 2000); 
}

function onWinClose(window) {
	utils.log("browser window close");
}

function onWinActivate(window) {
	utils.log("browser window activate");
}

function onWinDectivate(window) {
	utils.log("browser window deactivate");
}

function onTabReady(tab) {
	utils.log("tab ready: " + tab.title);
	//utils.log(utils.isMobile());
	init(tab);
	if (utils.isMobile()) {
		tab.activate();
	}
}

function onTabClose(tab) {
	utils.log("tab close");
}

function onTabActivate(tab) {
	utils.log("tab activate");
	/*
	if (utils.isMobile()) {
		init(tab);
	}
	*/  
}

function onTabDectivate(tab) {
	utils.log("tab deactivate");
}

/** 
 * db events 
 */
 
db.on("lmUserDataChanged", function(id) {
	utils.log("lmUserDataChanged: " + id);
	getLmById(id);
}); 

/** 
 * addon lifecycle events
 */

function install(options,callback) {
	utils.log("install");
	startup(options,callback);
	//startup(options,callback);
}

function startup(options,callback) {
	if (started) {
		utils.log("already started");
		return;
	}
	utils.log("startup...");
	initIO();
	if (options) {
		cleanProfile = options.staticArgs.cleanProfile;
		if (cleanProfile) {
			cleanProfileData();
		}
	}
	//cleanProfileData();
	populateProfile();
	startServer();
	db.openDb();
	openSomTab();
	started = true;
}
  
function enable(options,callback) {
	utils.log("enable");
	startup(options,callback);
}

function upgrade(options,callback) {
	utils.log("upgrade");
}
function downgrade(options,callback) {  // signal 2 times: 1. uninstall, 2. install 
	if (started) {
		try {
			stopServer();
			db.closeDb();
		}
		catch (e) {
			utils.err(e);
		}
	}
	else {
		var windows = require("sdk/windows").browserWindows;
		for each (var tab in windows.activeWindow.tabs) {
			if (tab.title == managerTitle || tab.title == playerTitle) {
				tab.close();
			}
		}
		startup(false,false);
	}
}

function uninstall(reason) {
	utils.log("uninstall");
}

function disable(reason) { // ToDo: why event tab.close is triggered, but tab still open? close som an so window manually
	utils.log("disable");
	try {
		stopServer();
		db.closeDb();
	}
	catch(e) {}
}

function shutdown(reason) {
	utils.log("shutdown");
	stopServer();
	db.closeDb();
}

/* addon avents */
exports.install = install;
exports.startup = startup;
exports.enable = enable;
exports.upgrade = upgrade;
exports.downgrade = downgrade;
exports.uninstall = uninstall;
exports.disable = disable;
exports.shutdown = shutdown;

/* window events */
exports.onWinOpen = onWinOpen;
exports.onWinClose = onWinClose;
exports.onWinActivate = onWinActivate;
exports.onWinDectivate = onWinDectivate;

/* tab events */
exports.onTabReady = onTabReady;
exports.onTabClose = onTabClose;
exports.onTabActivate = onTabActivate;
exports.onTabDectivate = onTabDectivate;

/* gui delegates */
exports.openCourse = openCourse;
exports.getAllLm = getAllLm;
exports.getLmsObj = getLmsObj;

/* event listeners */

exports.on = on.bind(null, exports);
exports.removeListener = function removeListener(type, listener) {
	off(exports, type, listener);
};

exports.__exposedProps__ = {
	openCourse 	: "r",
	getAllLm	: "r",
	getLmsObj	: "r",
	on		: "rw",
	removeListener	: "rw"
};
 

