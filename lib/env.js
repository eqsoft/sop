'use strict';

/** 
 * lib env is responsible for availability of proper runtime env: db, io and srv 
 * the run() event must be triggered by components itself (som and sop), because of sequential dependencies but
 * env ensures rte running status if either som or sop is opened. 
 * it listens to all window tabs and stops if neither any som nor sop instance is running.
 * this should work un desktop and android env
 * 
 * if som and env are not running and user tries to open a bookmarked scorm course at localhost:serverPort, 
 * the httpObserver will trigger the rte to start before the network request will be completed   
 *      
*/

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

const appId = require('self').id;
const system = require("sdk/system");
const data = require('self').data;
var windows = require("sdk/windows").browserWindows;
var tabs = require("sdk/tabs");
var winutils = require('sdk/window/utils');
var file = require("sdk/io/file");
var { startServerAsync } = require("sdk/test/httpd");
var { nsHttpServer } = require("sdk/test/httpd");

Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import(data.url("som/modules/sqlite.js"));

var db = require("./db");
var main = require("./main");
var som = require("./som");
var gui = require("./gui");
var utils = require("./utils");

gui.on("managerUnload", onManagerUnload);
gui.on("playerUnload", onPlayerUnload);

var srv;



var rte = {
	running 		: false,
	run			: run,
	stop			: stop,
	initIO			: initIO,
	cleanProfileData	: cleanProfileData,
	populateProfile		: populateProfile
}

var io = {}
var db;
var srv;
var lms = {}; // learning modules
 
var globals = {
	managerTitle : "SCORM Offline Manager",
	playerTitle : "SCORM Offline Player",
	tmpDirName : "sopTmpDir",
	sopDirName : "sop",
	sopDbName : "sop.sqlite",
	serverPort: 50012
}

var httpRequestObserver = {
	observe	: function(subject, topic, data) {
		if (topic == "http-on-modify-request") {
			if (rte.running) { // nothing to do
				return; 
			}
			subject.QueryInterface(Ci.nsIHttpChannel);
			var host = subject.URI.host;
			var port = subject.URI.port;
			if ((/(localhost|127\.0\.0\.1)/g.test(host)) && port == globals.serverPort) {
				run();
			}
		} 
	},

	get observerService() {  
		return Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);  
	},
  
	register: function() {  
		this.observerService.addObserver(this, "http-on-modify-request", false);  
	},  
  
	unregister: function()  {  
		this.observerService.removeObserver(this, "http-on-modify-request");  
	}
}

httpRequestObserver.register();	

function run() {
	utils.log("running: " + rte.running);
	if (rte.running) {
		utils.log("rte is already running");
	}	
	else {
		utils.log("rte run");
		initIO();
		populateProfile();
		db.openDb();
		startServer();  
		rte.running = true;
		emit(exports,"run"); 
	}
}

function initIO() {
	utils.log("init io...");
	io = {};
	var profDir = FileUtils.getFile("ProfD",[]);
	var tmpDir = profDir.clone();
	tmpDir.append(globals.tmpDirName);
	
	var sopSrcDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	sopSrcDir.initWithPath(file.join(tmpDir.path,"resources", "sop", "data", "som", "profile", "sop"));
	var sopDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	sopDir.initWithPath(file.join(profDir.path, globals.sopDirName));
	
	var sopSrcDb = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	sopSrcDb.initWithPath(file.join(tmpDir.path,"resources", "sop", "data", "som", "profile", "sop.sqlite"));
	var sopDb = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	sopDb.initWithPath(file.join(profDir.path, globals.sopDbName));
	
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

function populateProfile() {
	//cleanProfileData();
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

function stop() {
	utils.log("rte stop()");
	if (!rte.running) {
		return;
	}
	rte.running = false;
	stopServer();
	db.closeDb();
	utils.log("rte stop");
}


/**
 * gui events
 */

function onPlayerUnload() {
	utils.log("env: onPlayerUnload");
	onUnload();
}

function onManagerUnload() {
	utils.log("env: onManagerUnload");
	onUnload();
}

function onUnload() {
	var w = winutils.getMostRecentBrowserWindow();
	if (w) {
		utils.log("check for any other open manager or player instances");
		w.setTimeout(function() {checkRte()},2000);
	}
	else {
		utils.log("no browser window, stop rte...");
		stop();
	}
}

function checkRte() {
	for each (var win in windows) {
		for each (var tab in win.tabs) {
			if (tab.title === globals.managerTitle || tab.title === globals.playerTitle) { // don't stop rte 
				return;
			}
		}
	}
	stop();
}
	
/**  
 * server
 */

function startServer(async=false) {
	utils.log("try to start server...")
	var path = file.join(system.pathFor("ProfD"),"sop");
	if (async) {
		try {
			srv = startServerAsync(globals.serverPort, path);
		}
		catch (e) {
			utils.err(e);
		}
	}
	else {
		try {
			srv = new nsHttpServer();
			srv.registerDirectory("/",io.sopDir);
			srv.start(globals.serverPort);
		}
		catch(e) {
			utils.err(e);
		}
	}
	utils.log("server started on port " + globals.serverPort + " with basepath: " + path);
}

function stopServer() {
	utils.log("try to stop server...");
	srv.stop(function() {
		utils.log("server stopped...");
		//log("server stopped."); // you should continue execution from this point.
	});
}

/* late binding of exports and exposed props */
exports.io = io;
exports.globals = globals;
exports.rte = rte;

exports.__exposedProps__["rte"] = "r";
exports.__exposedProps__["io"] = "r";
exports.__exposedProps__["globals"] = "r";

