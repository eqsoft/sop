/**
 * environment class
 *  
 * The environment class is responsible for the availability of a proper runtime: db, profile, io objects and webserver. 
 * The run event must be triggered from the som and sop classes, but the env class ensures that the env is running only once.
 * The environment listens to all window tabs and stops if neither som nor sop instances are running.
 * 
 * If no som instance is open and the env is not running and the user tries to open a bookmarked SCORM course at localhost:serverPort, 
 * the httpObserver ensures that the env is running before the network request will be completed.   
 *   
 * @class env
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
var _ = require("sdk/l10n").get;
var running = false;

/**
 * get the running status
 * The function needs early binding for other classes
 * 
 * @public
 * @method isRunning
 * @return {Boolean} running
 **/
function isRunning() {
	return running;
}
exports.isRunning = isRunning;

const appId = require("sdk/self").id;
var system = require("sdk/system");
var data = require("sdk/self").data;
var windows = require("sdk/windows").browserWindows;
var tabs = require("sdk/tabs");
var winutils = require('sdk/window/utils');
var file = require("sdk/io/file");
var { startServerAsync } = require("sdk/test/httpd");
var { nsHttpServer } = require("sdk/test/httpd");
var prefs = require('sdk/simple-prefs').prefs;

Cu.import("resource://gre/modules/FileUtils.jsm");

var db = require("./db");
var main = require("./main");
var som = require("./som");
var gui = require("./gui");
var utils = require("./utils");

main.on("install", startup );
main.on("startup", startup );
main.on("enable", enable );
main.on("disable", disable );
main.on("downgrade", downgrade );
main.on("upgrade", upgrade );
main.on("shutdown", shutdown );

gui.on("managerUnload", onManagerUnload);
gui.on("playerUnload", onPlayerUnload);

var srv;

/**
 * IO Object
 * Provides all File and Directory Objects
 * @public 
 * @property io
 **/
var io = {};
 
/**
 * Globals Object
 * Provides all global Variables
 * @public 
 * @property globals
 **/ 
var globals = {
		managerTitle 	: "ILIAS SCORM Offline Manager",
		playerTitle 	: "ILIAS SCORM Offline Player",
		tmpDirName 	: "sopTmpDir",
		sopDirName 	: "sop",
		sopDbName 	: "sop.sqlite",
		serverPort	: 50012,
		serverName	: "localhost",
		serverProtocol	: "http",
		player12	: "player12.html",
		player2004	: "player2004.html",
		msgPage		: "msg.html"
	}

/**
 * httpObserver
 * Observes browser network requests to sop webserver at localhost:serverPort.
 * If the browser requests a Learning-Module and the environment is not running, the observer starts the environment. 
 * @private 
 * @property httpRequestObserver
 **/
 
var httpRequestObserver = {};

/**
 * creates and register httpObserver (called in main.js)
 * The observer must be registered bevor any other objects are initialized.  
 * @public 
 * @method httpRequestObserver
 **/
function createHttpRequestObserver() {
	httpRequestObserver = {
		observe	: function(subject, topic, data) {
			if (topic == "http-on-modify-request") {
				subject.QueryInterface(Ci.nsIHttpChannel);
				var url = subject.URI.spec
				var host = subject.URI.host;
				var port = subject.URI.port;
				if ((/(localhost|127\.0\.0\.1)/g.test(host)) && port == globals.serverPort) {
					//subject.setRequestHeader("X-SCORM-Offline-Player","0.1",false);
					if (!isRunning()) {
						run();
					}
					
					var id = gui.isPlayerUrl(url);
					if (id) {	
						if (gui.isPlayerOpen(id)) {
							utils.log("player with id "  + id + " is already open: cancel network");
							subject.cancel(Cr.NS_BINDING_ABORTED);
							gui.closeRecentTab();
							gui.activatePlayer(id);
						}
					}
					else {
						var ret = som.isImportRequest(url); 
						if (ret) {
							subject.cancel(Cr.NS_BINDING_ABORTED);
							som.importLm(url);
						} 	
					}	
				}
			}
			/* 
			else if (topic == "http-on-examine-response") {
				subject.QueryInterface(Ci.nsITraceableChannel);
				utils.log(subject);
			}
			*/  
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
}

/**
 * @event run
 **/ 
/**
 * starts the environment components (io, db, server) and populates the profile
 * 
 * emits a run event
 * 
 * @public
 * @method run
 **/ 
function run() {
	utils.log("running: " + isRunning());
	if (isRunning()) {
		utils.log("env is already running");
	}	
	else {
		utils.log("env run");
		initIO();
		populateProfile();
		db.openDb();
		startServer(prefs.prefAsyncWebserver);  
		running = true;
		emit(exports,"run"); 
	}
}

/**
 * initialize all necessary file and directory objects
 * 
 * @public
 * @method initIO
 **/

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
	return io;
}

/**
 * populates the profile folder with an initial db and a webserver root folder with the SCORM-Offline-Player files if not exists.
 * 
 * @public
 * @method populateProfile
 **/
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
 * deletes existing db and webroot in the profile folder  
 * 
 * @public
 * @method cleanProfileData
 **/
function cleanProfileData() {
	initIO();
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

/**
 * stops the webserver closes the db and set the private running variable to false 
 * 
 * @public
 * @method stop
 **/
function stop() {
	utils.log("env stop()");
	if (!isRunning()) {
		return;
	}
	stopServer();
	db.closeDb();
	running = false;
	
	utils.log("env stop");
}



// gui events

/**
 * unloads the player 
 * 
 * @private
 * @method onPlayerUnload
 **/
function onPlayerUnload() {
	utils.log("env: onPlayerUnload");
	onUnload();
}

/**
 * unloads the manager 
 * 
 * @private
 * @method onManagerUnload
 **/
function onManagerUnload() {
	utils.log("env: onManagerUnload");
	onUnload();
}

/**
 * base unload function for player and manager 
 * 
 * @private
 * @method onUnload
 **/
function onUnload() {
	var w = winutils.getMostRecentBrowserWindow();
	if (w) {
		utils.log("check for any other open manager or player instances");
		w.setTimeout(function() {checkRte()},2000);
	}
	else {
		utils.log("no browser window, stop env...");
		stop();
	}
}

/**
 * checks if any player and manager instances are open, if not the environment will be stopped. 
 * 
 * @private
 * @method checkRte
 **/
function checkRte() {
	for each (var win in windows) {
		for each (var tab in win.tabs) {
			if (tab.title === globals.managerTitle || tab.title === globals.playerTitle) { // don't stop rte 
				utils.log("checkRTE: open tab found: " + tab.title);
				return;
			}
		}
	}
	stop();
}
	
  
// server

/**
 * starts the internal webserver 
 * 
 * @private
 * @method startServer
 * @param async=false 
 **/
function startServer(async=false) {
	utils.log("try to start server (async=" + async+")...")
	var path = file.join(system.pathFor("ProfD"),"sop");
	var w = winutils.getMostRecentBrowserWindow();
	if (async) {
		try {
			srv = startServerAsync(globals.serverPort, path);
			utils.log("server started on port " + globals.serverPort + " with basepath: " + path);
		}
		catch (e) {
			utils.log("server could not be started!");
			utils.err(srv + ":" + e);
			var tabs = w.BrowserApp.tabs;
			tabs.forEach(function(tab) {
				utils.log(tab.window.document.title);
			});
			alertRestartFirefox();
			if (w && w.BrowserApp) {
				utils.log("quit browser...");
				w.BrowserApp.quit();
			}
		}
	}
	else {
		try {
			srv = new nsHttpServer();
			srv.registerDirectory("/",io.sopDir);
			srv.start(globals.serverPort);
			utils.log("server started on port " + globals.serverPort + " with basepath: " + path);
		}
		catch(e) {
			utils.log("server could not be started!");
			utils.err(srv + ":" + e);
			alertRestartFirefox();
			if (w && w.BrowserApp) {
				utils.log("quit browser...");
				w.BrowserApp.quit();
			}
		}
	}
}

/**
 * stops the internal webserver 
 * 
 * @private
 * @method stopServer
 **/
function stopServer() {
	//utils.log("server = " + typeof srv);
	utils.log("try to stop server..."); 
	try {
		srv.stop(function() {
			utils.log("server stopped...");
		});
	}
	catch(e) {
		utils.err(e);
	}
}

// addon lifecycle events

function install(options,callback) {
	utils.log("install");
}

function startup(options,callback) {
	utils.log("startup");
	run();
	gui.startup();
}
  
function enable(options,callback) {
	utils.log("enable");
	run();
	gui.startup();
}

function upgrade(options,callback) {
	utils.log("upgrade");
}

function downgrade(load) {
	utils.err("downgrade, load=" + load);
	gui.downgrade(load);
	if (!load) {
		utils.log("downgrade: uninstall");
		var ret = alertDeleteData();
		if (ret) {
			utils.err("delete course data");
			cleanProfileData();		
		}
	}
	else {
		utils.log("downgrade: install");
		gui.startup();
	}
}

function uninstall(reason) { // don't know exactly how to handle
	utils.log("uninstall");
}

function disable(reason) { // ToDo: why event tab.close is triggered, but tab still open? close som and sop window manually
	utils.log("disable");
	stop();
	try {
		gui.closeAllTabs();
	}
	catch(e) {}
	var ret = alertDeleteData();
	if (ret) {
		utils.err("delete course data");
		cleanProfileData();		
	}
}

function shutdown(reason) {
	utils.log("shutdown");
	stop();
}

// prompts

function alertDeleteData() {
	var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
	var ret = prompts.confirm(null, "Uninstall existing SOP", _("delete_old_data"));
	return ret;
}

function alertResetToFactoryData() {
	var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
	var ret = prompts.confirm(null, "Reset to Factory Data", _("reset_factory_confirm"));
	return ret;
}

function alertRestartFirefox() {
	var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
	prompts.alert(null, "Restart Firefox", _("restart_firefox"));
}

exports.io = io;
exports.globals = globals;
exports.run = run;
exports.stop = stop;
exports.initIO = initIO;
exports.populateProfile = populateProfile;
exports.cleanProfileData = cleanProfileData;
exports.alertResetToFactoryData = alertResetToFactoryData;
exports.createHttpRequestObserver = createHttpRequestObserver;

exports.__exposedProps__["io"] = "r";
exports.__exposedProps__["globals"] = "r";
exports.__exposedProps__["run"] = "r";
exports.__exposedProps__["stop"] = "r";
exports.__exposedProps__["isRunning"] = "r";
exports.__exposedProps__["initIO"] = "r";
exports.__exposedProps__["populateProfile"] = "r";
exports.__exposedProps__["alertResetToFactoryData"] = "r";
exports.__exposedProps__["cleanProfileData"] = "r";
