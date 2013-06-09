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

var data = require('self').data;
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import(data.url("som/modules/sqlite.js")); 

var utils = require("./utils");
var dbHandler = null;
var db = null;

function initDb() {
	utils.log("init db");
	dbHandler.dbConn.createTable("init","init INTEGER PRIMARY KEY AUTOINCREMENT");
}

function openDb() {
	utils.log("open db");
	if (dbHandler === null) {
		dbHandler = new SQLiteHandler();
	}
	if (dbHandler.isConnected()) {
		utils.log("db already connected");
		return;
	}
	dbHandler.openDatabase(FileUtils.getFile("ProfD",["sop.sqlite"]));
	utils.log("db connected: " + dbHandler.isConnected() + " (sqlite version " + dbHandler.sqliteVersion + ")");	
}

function closeDb() {
	utils.log("close db");
	if (dbHandler != null && dbHandler.isConnected()) {
		dbHandler.closeConnection();
	}
}

function getData(statement, params, asJSONObject, asRecordObject=true) { 
	function getRecordObject(columns,data) {
		var obj = [];
		for each (var row in data) {
			var rowObj = {};
			for (var i=0;i<columns.length;i++) {
				rowObj[columns[i][0]] = row[i];
			}
			obj.push(rowObj);
		}
		return obj;
	}

	var ret = false, rec = null;
	ret = dbData(statement, params);
	if (ret) {
		if (asRecordObject) {
			rec = getRecordObject(dbHandler.getColumns(), dbHandler.getRecords());
		}
		else {
			rec = dbHandler.getRecords();
		}
		return (asJSONObject) ? rec : JSON.stringify(rec);
	}
	utils.err("db error: " + dbHandler.getLastErrorId() + ": " + dbHandler.getLastError()); // ToDo: get db error
	return false;
}

function dbData(statement, params) {
	utils.log("manager dbData: "+statement);
	var ret = false;
	switch (statement) { // ToDo: define propper views and params in sqlite and get data with getView(view,params)
		case "lmGetAll" : 
			ret = dbHandler.manipulateF("SELECT * from lm");
			break;
		case "lmGetAllByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT * from lm WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmGetAllByClientAndObjIdAtInitOfPlayer" :
			ret = dbHandler.manipulateF(
				"SELECT package_attempts FROM lmUser WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			var package_attempts = parseInt(dbHandler.getRecords())+1;
			ret = dbHandler.manipulateF(
				"UPDATE lmUser set package_attempts=%s WHERE client=%s AND obj_id=%s",
				new Array("integer","text","integer"),
				new Array(package_attempts,params[0],params[1])
				);
			ret = dbHandler.manipulateF(
				"SELECT init_data, resources, scorm_tree, module_version, user_data, last_visited FROM lmData, lmUser "
				+"WHERE lmData.client=lmUser.client AND lmData.obj_id=lmUser.obj_id AND lmData.client=%s AND lmData.obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmSetUser_dataAndLastVisitedAndStatusByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"UPDATE lmUser set user_data=%s, last_visited=%s WHERE client=%s AND obj_id=%s",
				new Array("text","text","text","integer"),
				new Array(params[2],params[3],params[0],params[1])
				);
				emit(exports, "lmUserDataChanged", params[0]+"_"+params[1]);
			ret = dbHandler.manipulateF(
				"UPDATE lm set status=%s WHERE client=%s AND obj_id=%s",
				new Array("text","text","integer"),
				new Array(params[4],params[0],params[1])
				);
			break;
		case "lmGetUser_dataByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT user_data FROM lmUser WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		default :
		//nothing
	}
	return ret;
}

function setData(statement, params) {
	return dbData(statement, params);
}

/* late binding of exports and exposed props */
exports.initDb = initDb;
exports.openDb = openDb;
exports.closeDb = closeDb;
exports.getData = getData;
exports.setData = setData;

exports.__exposedProps__["getData"] = "r";
exports.__exposedProps__["setData"] = "r";

