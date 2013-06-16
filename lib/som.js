/**
 * SCORM-Offline-Manager class
 * 
 * Provides functions for managing and importing Learning-Modules
 *  
 * @class som
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

var db = require("./db");
//var env = require("./env"); // needed?
var gui = require("./gui");
var utils = require("./utils");

var lms = {};
  
/**
 * @event allLmChanged
 **/   
/**
 * gets all imported Learning-Modules (SCORM-Courses) from db
 * 
 * @public
 * @method getAllLm
 * @return {Object} lms
 **/ 
function getAllLm() { 
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

/**
 * @event lmChanged
 **/ 
/**
 * gets a Learning-Module by id from db or a row param
 * 
 * @public
 * @method getLmById
 * @param {String} id client_{obj_id}
 * @param {Object} row=false param only available when called from getAllLm
 * @return {Object} lm
 **/
function getLmById(id,row=false) {
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

/**
 * returns the Learning-Modules Object
 * 
 * @public
 * @method getLmsObj
 * @return {Object} lms
 **/

function getLmsObj() {
	return lms;
}

//env.on("run", function() { getAllLm }); needed??
db.on("lmUserDataChanged", function(id) {
	utils.log("lmUserDataChanged: " + id);
	getLmById(id);
});

exports.getAllLm = getAllLm;
exports.getLmById = getLmById;
exports.getLmsObj = getLmsObj;
exports.__exposedProps__["getAllLm"] = "r";
exports.__exposedProps__["getLmById"] = "r";
exports.__exposedProps__["getLmsObj"] = "r";


