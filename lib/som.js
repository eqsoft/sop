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
var prefs = require('sdk/simple-prefs').prefs;
var system = require("sdk/system");
var windows = require("sdk/windows").browserWindows;
var tabs = require("sdk/tabs");
var data = require('self').data;
var winutils = require('sdk/window/utils');
var file = require("sdk/io/file");

var main = require("./main");
var utils = require("./utils");
main.on("install", startup );
main.on("startup", startup );
main.on("enable", enable );
main.on("disable", disable );

/**
 *  on-the-fly installation p.e. with auto-installer will trigger
 * 1. downgrade
 * 2. downgrad (if version is not newer) or upgrade (if it is a newer version) 
 */ 
main.on("downgrade", downgrade );
main.on("upgrade", upgrade );
main.on("shutdown", shutdown );

/**
 * generic XPCOM JS Modules and sqlite module  
 */
Cu.import("resource://gre/modules/FileUtils.jsm");
 
/** 
 * custom modules and variables
 */
var db = require("./db");
var env = require("./env");
var gui = require("./gui");

var lms = {};

var started; // ToDo....
/**
 * LM
 */
  
function getAllLm() { // ToDo: copy or merge extended attributes of lm's
	lms = {}; // delete all
	var d = db.getData("lmGetAll",null,true,true);
	for each (var row in d) {
		// Workaround: copy runtime_status if exists
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
 * addon lifecycle events
 */

function install(options,callback) {
	utils.log("som install");
}

function startup(options,callback) {
	utils.log("som startup");
}
  
function enable(options,callback) {
	utils.log("som enable");
}

function upgrade(options,callback) {
	utils.log("som upgrade");
}
function downgrade() { 
	utils.log("som downgrade");
}

function uninstall(reason) {
	utils.log("uninstall");
}

function disable(reason) { // ToDo: why event tab.close is triggered, but tab still open? close som an so window manually
	utils.log("disable");
}

function shutdown(reason) {
	utils.log("shutdown");
	env.rte.stop();
}

env.on("run", function() { getAllLm });
db.on("lmUserDataChanged", function(id) {
	utils.log("lmUserDataChanged: " + id);
	getLmById(id);
});

exports.getAllLm = getAllLm;
exports.getLmsObj = getLmsObj;
exports.__exposedProps__["getAllLm"] = "r";
exports.__exposedProps__["getLmsObj"] = "r";

