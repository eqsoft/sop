/**
 * Database class
 *  
 * @class db
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

var data = require('self').data;
Cu.import("resource://gre/modules/FileUtils.jsm");
 
var utils = require("./utils");
var sqlite = require('./sqlite');
var dbHandler = null;
var db = null;

/**
 * opens the sqlite database sop.sqlite in the profile folder
 * 
 * @public
 * @method openDb
 **/
function openDb() {
	utils.log("open db");
	if (dbHandler === null) {
		dbHandler = new sqlite.SQLiteHandler();
	}
	if (dbHandler.isConnected()) {
		utils.log("db already connected");
		return;
	}
	dbHandler.openDatabase(FileUtils.getFile("ProfD",["sop.sqlite"]));
	utils.log("db connected: " + dbHandler.isConnected() + " (sqlite version " + dbHandler.sqliteVersion + ")");	
}

/**
 * closes the sqlite database sop.sqlite in the profile folder
 * 
 * @public
 * @method closeDb
 **/
function closeDb() {
	utils.log("close db");
	if (dbHandler != null && dbHandler.isConnected()) {
		dbHandler.closeConnection();
	}
}

/**
 * gets data from db
 * 
 * @public
 * @method getData
 * @param {String} statement the name of the statement
 * @param {Array} params
 * @param {Boolean} asJSONObject
 * @param {Boolean} asRecordObject=true
 * @return {Object||String} data 
 **/
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

/**
 * @event lmUserDataChanged
 **/ 
/**
 * gets data from db
 * 
 * @private
 * @method dbData
 * @param {String} statement the name of the statement
 * @param {Array} params
 * @return {Boolean} success 
 **/
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
		case "lmSetStatusByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"UPDATE lm set status=%s WHERE client=%s AND obj_id=%s",
				new Array("text","text","integer"),
				new Array(params[2],params[0],params[1])
				);
				emit(exports, "lmUserDataChanged", params[0]+"_"+params[1]);
			break;
		case "lmGetUser_dataByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT user_data FROM lmUser WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmGetAllCmiNodeByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT accesscount,accessduration,accessed,activityabsduration,activityattemptcount,activityexpduration,activityprogstatus,attemptabsduration,attemptcomplamount,attemptcomplstatus,attemptexpduration,attemptprogstatus,audio_captioning,audio_level,availablechildren,cmi_node_id,completion,completion_status,completion_threshold,cp_node_id,created,credit,delivery_speed,c_entry,c_exit,c_language,launch_data,learner_name,location,c_max,c_min,c_mode,modified,progress_measure,c_raw,scaled,scaled_passing_score,session_time,success_status,suspend_data,total_time,user_id  FROM cmi_node WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmGetAllCmiCommentByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT cmi_comment_id, cmi_node_id, c_comment, c_timestamp, location, sourceislms "
				+"FROM cmi_comment WHERE client=%s AND obj_id=%s ORDER BY cmi_comment_id",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmGetAllCmiCorrectResponseByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT cmi_node_id,cmi_correct_resp_id,cmi_interaction_id,pattern "
				+"FROM cmi_correct_response WHERE client=%s AND obj_id=%s ORDER BY cmi_node_id,cmi_correct_resp_id",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmGetAllCmiInteractionByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT cmi_interaction_id, cmi_node_id, description, id, latency, learner_response, result, c_timestamp, c_type, weighting "
				+"FROM cmi_interaction WHERE client=%s AND obj_id=%s ORDER BY cmi_interaction_id",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmGetAllCmiObjectiveByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT cmi_interaction_id, cmi_node_id, cmi_objective_id, completion_status, description, id, c_max, c_min, c_raw, scaled, progress_measure, success_status, scope "
				+"FROM cmi_objective WHERE client=%s AND obj_id=%s ORDER BY cmi_objective_id",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmGetAllCmiPackageByClientAndObjId" :
			ret = dbHandler.manipulateF(
				'SELECT user_id, learner_name, slm_id, default_lesson_mode "mode", credit '
				+"FROM cp_package WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmSetAllCmiNodeByClientAndObjId" :
			for(var i=2;i<45;i++) {if(params[i]=="") {params[i]=null;}}
			ret = dbHandler.manipulateF(
				"SELECT count(*) FROM cmi_node WHERE client=%s AND obj_id=%s AND cmi_node_id=%s",
				new Array("text","integer","integer"),
				new Array(params[0],params[1],params[17])
				);
			var counter = parseInt(dbHandler.getRecords());
			if(counter==0) {
				ret = dbHandler.manipulateF(
					"INSERT INTO cmi_node (client, obj_id, accesscount,accessduration,accessed,activityabsduration,activityattemptcount,activityexpduration,activityprogstatus,attemptabsduration,attemptcomplamount,attemptcomplstatus,attemptexpduration,attemptprogstatus,audio_captioning,audio_level,availablechildren,cmi_node_id,completion,completion_status,completion_threshold,cp_node_id,created,credit,delivery_speed,c_entry,c_exit,c_language,launch_data,learner_name,location,c_max,c_min,c_mode,modified,progress_measure,c_raw,scaled,scaled_passing_score,session_time,success_status,suspend_data,total_time,user_id,c_timestamp,additional_tables) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
				new Array("TEXT","INTEGER","INTEGER","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER","TEXT","REAL","INTEGER","TEXT","INTEGER","INTEGER","REAL","TEXT","INTEGER","REAL","TEXT","TEXT","INTEGER","TEXT","TEXT","REAL","TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","REAL","REAL","TEXT","TEXT","REAL","REAL","REAL","REAL","TEXT","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER"),
				new Array(params[0],params[1],params[2],params[3],params[4],params[5],params[6],params[7],params[8],params[9],params[10],params[11],params[12],params[13],params[14],params[15],params[16],params[17],params[18],params[19],params[20],params[21],params[22],params[23],params[24],params[25],params[26],params[27],params[28],params[29],params[30],params[31],params[32],params[33],params[34],params[35],params[36],params[37],params[38],params[39],params[40],params[41],params[42],params[43],params[44],params[45])
				);
			} else {
				ret = dbHandler.manipulateF(
					"UPDATE cmi_node set accesscount=%s, accessduration=%s, accessed=%s, activityabsduration=%s, activityattemptcount=%s, activityexpduration=%s, activityprogstatus=%s, attemptabsduration=%s, attemptcomplamount=%s, attemptcomplstatus=%s, attemptexpduration=%s, attemptprogstatus=%s, audio_captioning=%s, audio_level=%s, availablechildren=%s, completion=%s, completion_status=%s, completion_threshold=%s, cp_node_id=%s, created=%s, credit=%s, delivery_speed=%s, c_entry=%s, c_exit=%s, c_language=%s, launch_data=%s, learner_name=%s, location=%s, c_max=%s, c_min=%s, c_mode=%s, modified=%s, progress_measure=%s, c_raw=%s, scaled=%s, scaled_passing_score=%s, session_time=%s, success_status=%s, suspend_data=%s, total_time=%s, user_id=%s, c_timestamp=%s, additional_tables=%s "
					+"WHERE client=%s AND obj_id=%s AND cmi_node_id=%s",
				new Array("INTEGER","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER","TEXT","REAL","INTEGER","TEXT","INTEGER","INTEGER","REAL","TEXT","REAL","TEXT","TEXT","INTEGER","TEXT","TEXT","REAL","TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","REAL","REAL","TEXT","TEXT","REAL","REAL","REAL","REAL","TEXT","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER","TEXT","INTEGER","INTEGER"),
				new Array(params[2],params[3],params[4],params[5],params[6],params[7],params[8],params[9],params[10],params[11],params[12],params[13],params[14],params[15],params[16],params[18],params[19],params[20],params[21],params[22],params[23],params[24],params[25],params[26],params[27],params[28],params[29],params[30],params[31],params[32],params[33],params[34],params[35],params[36],params[37],params[38],params[39],params[40],params[41],params[42],params[43],params[44],params[45],params[0],params[1],params[17])
				);
			}
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
exports.openDb = openDb;
exports.closeDb = closeDb;
exports.getData = getData;
exports.setData = setData;

exports.__exposedProps__["openDb"] = "r";
exports.__exposedProps__["closeDb"] = "r";
exports.__exposedProps__["getData"] = "r";
exports.__exposedProps__["setData"] = "r";

