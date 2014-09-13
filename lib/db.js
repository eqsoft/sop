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

var data = require("sdk/self").data;
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
function getData(statement, params, asJSONObject, asRecordObject=true) { //check UK: =true
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
	if (params != null && params !="") {
		for (var i=0; i<params.length; i++) {
			if (typeof params[i] == "object" || typeof params[i] == "array") {
				if (statement!="setCMIData") params[i] = JSON.stringify(params[i]);
			}
		}
	}
	switch (statement) { // ToDo: define propper views and params in sqlite and get data with getView(view,params)
		case "lmGetAll" : 
			ret = dbHandler.manipulateF("SELECT lm.client, lm.obj_id, "
				+"lm.title, lm.description, lm.scorm_version, lm.active, lm.learning_progress_enabled, lm.certificate_enabled, lm.offline_zip_created, "
				+"lm.max_attempt, sahs_user.package_attempts, sahs_user.first_access, sahs_user.last_access, sahs_user.total_time_sec, "
				+"sahs_user.sco_total_time_sec, sahs_user.status, sahs_user.percentage_completed "
				+"from lm,sahs_user "
				+"WHERE lm.client=sahs_user.client AND lm.obj_id=sahs_user.obj_id AND lm.active=1");
			break;
		case "lmGetAllByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT lm.client, lm.obj_id, "
				+"lm.title, lm.description, lm.scorm_version, lm.active, lm.learning_progress_enabled, lm.certificate_enabled, lm.offline_zip_created, "
				+"lm.max_attempt, sahs_user.package_attempts, sahs_user.first_access, sahs_user.last_access, sahs_user.total_time_sec, "
				+"sahs_user.sco_total_time_sec, sahs_user.status, sahs_user.percentage_completed "
				+"from lm,sahs_user "
				+"WHERE lm.client=sahs_user.client AND lm.obj_id=sahs_user.obj_id AND lm.client=%s AND lm.obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmGetScormVersion" :
			ret = dbHandler.manipulateF(
				"SELECT scorm_version FROM lm WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmGetAllByClientAndObjIdAtInitOfPlayer" :
			ret = dbHandler.manipulateF(
				"SELECT package_attempts,first_access,status FROM sahs_user WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			var recs=dbHandler.getRecords();
			var package_attempts=1;
			if (recs[0][0]!=null) package_attempts=parseInt(recs[0])+1;
			var first_access=recs[0][1];
			if (first_access==null) {
				var d_now = new Date();
				first_access = d_now.getTime();
			}
			var status=recs[0][2];
			if (status==null) status = 1;
			ret = dbHandler.manipulateF(
				"UPDATE sahs_user set package_attempts=%s, first_access=%s, status=%s WHERE client=%s AND obj_id=%s",
				new Array("integer","integer","integer","text","integer"),
				new Array(package_attempts,first_access,status,params[0],params[1])
				);
			ret = dbHandler.manipulateF(
				"SELECT init_data, resources, scorm_tree, sahs_user.module_version, user_data, last_visited, sahs_user.status, adlact_data FROM lm, sahs_user "
				+"WHERE lm.client=sahs_user.client AND lm.obj_id=sahs_user.obj_id AND lm.client=%s AND lm.obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmSetUser_dataAndLastVisitedAndStatusByClientAndObjId" ://SCORM 1.2?
			ret = dbHandler.manipulateF(
				"UPDATE sahs_user set status=%s, user_data=%s, last_visited=%s WHERE client=%s AND obj_id=%s",
				new Array("integer","text","text","text","integer"),
				new Array(params[4],params[2],params[3],params[0],params[1])
				);
				emit(exports, "lmUserDataChanged", params[0]+"_"+params[1]);
			break;
		case "lmSetStatusByClientAndObjId" :
/*
			//TODO first_access at start of lm; last_vistied at end
			var lp_mode = params[6];
			var d_now = new Date();
			var last_access = d_now.getTime();
			var percentage_completed = null;
			if (lp_mode == 6 && typeof params[4] == "number") percentage_completed = Math.round(params[4]);
			var sco_total_time_sec = null;
			if (typeof params[5] == "number") sco_total_time_sec = Math.round(params[5]/100);
			if (params[2] != params[3]) {
				var last_status_change = d_now.getTime();
				ret = dbHandler.manipulateF(
					"UPDATE sahs_user set last_access=%s, last_status_change=%s, sco_total_time_sec=%s, status=%s, percentage_completed=%s WHERE client=%s AND obj_id=%s",
					new Array("integer","integer","integer","integer","integer","text","integer"),
					new Array(last_access,last_status_change,sco_total_time_sec,params[2],percentage_completed,params[0],params[1])
					);
			} else {
				ret = dbHandler.manipulateF(
					"UPDATE sahs_user set last_access=%s, sco_total_time_sec=%s, status=%s, percentage_completed=%s WHERE client=%s AND obj_id=%s",
					new Array("integer","integer","integer","integer","text","integer"),
					new Array(last_access,sco_total_time_sec,params[2],percentage_completed,params[0],params[1])
					);
			}
			emit(exports, "lmUserDataChanged", params[0]+"_"+params[1]);
*/
			break;
		case "lmGetUser_dataByClientAndObjId" :
			ret = dbHandler.manipulateF(
				"SELECT user_data FROM sahs_user WHERE client=%s AND obj_id=%s",
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
		case "sop2ilNode" :
			ret = dbHandler.manipulateF(
				"SELECT accesscount,accessduration,accessed,activityabsduration,activityattemptcount,activityexpduration,activityprogstatus,attemptabsduration,attemptcomplamount,attemptcomplstatus,attemptexpduration,attemptprogstatus,audio_captioning,audio_level,availablechildren,cmi_node_id,completion,completion_status,completion_threshold,cp_node_id,created,credit,delivery_speed,c_entry,c_exit,c_language,launch_data,learner_name,location,c_max,c_min,c_mode,modified,progress_measure,c_raw,scaled,scaled_passing_score,session_time,success_status,suspend_data,total_time,user_id  FROM cmi_node WHERE client=%s AND obj_id=%s AND cmi_node_id=%s",
				new Array("text","integer","integer"),
				new Array(params[0],params[1],params[2])
				);
			break;
		case "sop2ilComment" :
			ret = dbHandler.manipulateF(
				"SELECT cmi_comment_id, cmi_node_id, c_comment, c_timestamp, location, sourceislms FROM cmi_comment"
				+" WHERE client=%s AND obj_id=%s AND cmi_node_id=%s ORDER BY cmi_comment_id",
				new Array("text","integer","integer"),
				new Array(params[0],params[1],params[2])
				);
			break;
		case "sop2ilCorrectResponse" :
			ret = dbHandler.manipulateF(
				"SELECT cmi_correct_resp_id,cmi_interaction_id,pattern FROM cmi_correct_response"
				+" WHERE client=%s AND obj_id=%s AND cmi_interaction_id IN (SELECT cmi_interaction.cmi_interaction_id FROM cmi_interaction WHERE cmi_interaction.cmi_node_id = %s)"
				+" ORDER BY cmi_correct_resp_id",
				new Array("text","integer","integer"),
				new Array(params[0],params[1],params[2])
				);
			break;
		case "sop2ilInteraction" :
			ret = dbHandler.manipulateF(
				"SELECT cmi_interaction_id, cmi_node_id, description, id, latency, learner_response, result, c_timestamp, c_type, weighting FROM cmi_interaction"
				+" WHERE client=%s AND obj_id=%s AND cmi_node_id=%s ORDER BY cmi_interaction_id",
				new Array("text","integer","integer"),
				new Array(params[0],params[1],params[2])
				);
			break;
		case "sop2ilObjective" :
			ret = dbHandler.manipulateF(
				"SELECT cmi_interaction_id, cmi_node_id, cmi_objective_id, completion_status, description, id, c_max, c_min, c_raw, scaled, progress_measure, success_status, scope FROM cmi_objective"
				+" WHERE client=%s AND obj_id=%s AND cmi_node_id=%s ORDER BY cmi_objective_id",
				new Array("text","integer","integer"),
				new Array(params[0],params[1],params[2])
				);
			break;
		case "sop2ilSahsUser" :
			ret = dbHandler.manipulateF(
				"SELECT package_attempts, module_version, last_visited, first_access, last_access, last_status_change, sco_total_time_sec, status, percentage_completed"
				+" FROM sahs_user WHERE client=%s AND obj_id=%s",
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
//				"SELECT cmi_node_id,cmi_correct_resp_id,cmi_interaction_id,pattern "
//				+"FROM cmi_correct_response WHERE client=%s AND obj_id=%s ORDER BY cmi_node_id,cmi_correct_resp_id",
			ret = dbHandler.manipulateF(
				"SELECT cmi_correct_resp_id,cmi_interaction_id,pattern "
				+"FROM cmi_correct_response WHERE client=%s AND obj_id=%s ORDER BY cmi_correct_resp_id",
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
				);//TODO
			break;
		case "lmSetAllCmiNodeByClientAndObjId" :
/*			for(var i=2;i<45;i++) {if(params[i]=="") {params[i]=null;}}
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
			}*/
			break;
		case "scormPlayerUnload" :
			var d_now = new Date();
			var last_access = d_now.getTime();
			ret = dbHandler.manipulateF(
				"UPDATE sahs_user set last_access=%s, last_visited=%s WHERE client=%s AND obj_id=%s",
				new Array("integer","text","text","integer"),
				new Array(last_access,params[2],params[0],params[1])
				);
			utils.log("scormPlayerUnload last_visited: "+params[2]);
			break;
		case "setCMIData" :
			var client=params[0], obj_id=params[1], $packageId=params[1], $userId=params[2], $data=params[3];
			var $getComments=true, $getInteractions=true, $getObjectives=true;
			
			var $result = {};
			if (!$data) return;
			var $i_check=$data.i_check;
			var $i_set=$data.i_set;
			var $b_node_update=false;
			var $cmi_node_id=null;
			var $a_map_cmi_interaction_id=[];
			var $tables = ['node', 'comment', 'interaction', 'objective', 'correct_response'];
			var $table,$row,tableData,$q,$cmi_interaction_id,a_ids,$i,$new_global_status,$saved_global_status;
			for (var tablecounter=0; tablecounter<$tables.length; tablecounter++) {
				$table=$tables[tablecounter];
				if (typeof $data[$table] == "undefined" || $data[$table] == []) {
					break;
				}
				tableData=$data[$table];
utils.log("setCMIData, table: "+$table+", tableData: "+tableData);
				for (var rowcounter=0; rowcounter<tableData.length; rowcounter++) {
					$row=tableData[rowcounter];
					switch($table)
					{
					case 'node': //is always first and has only 1 row
//utils.log('SELECT cmi_node_id FROM cmi_node WHERE cp_node_id = '+$row[19]+' and user_id = '+$userId+' and client = '+client+' and obj_id = '+obj_id);
						ret = dbHandler.manipulateF(
							'SELECT cmi_node_id FROM cmi_node WHERE cp_node_id = %s and user_id = %s and client = %s and obj_id = %s',
							new Array('INTEGER','INTEGER','TEXT','INTEGER'),
							new Array($row[19],$userId,client,obj_id)
						);
						$cmi_node_id=parseInt(dbHandler.getRecords());
						if (!isNaN($cmi_node_id)) $b_node_update=true;
						else {
							$cmi_node_id = dbHandler.nextId('cmi_node');
							$b_node_update=false;
						}
						if($b_node_update==false) {
							ret = dbHandler.manipulateF(
								"INSERT INTO cmi_node (client, obj_id, accesscount,accessduration,accessed,activityabsduration,activityattemptcount,activityexpduration,activityprogstatus,attemptabsduration,attemptcomplamount,attemptcomplstatus,attemptexpduration,attemptprogstatus,audio_captioning,audio_level,availablechildren,cmi_node_id,completion,completion_status,completion_threshold,cp_node_id,created,credit,delivery_speed,c_entry,c_exit,c_language,launch_data,learner_name,location,c_max,c_min,c_mode,modified,progress_measure,c_raw,scaled,scaled_passing_score,session_time,success_status,suspend_data,total_time,user_id,c_timestamp,additional_tables) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
							new Array("TEXT","INTEGER","INTEGER","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER","TEXT","REAL","INTEGER","TEXT","INTEGER","INTEGER","REAL","TEXT","INTEGER","REAL","TEXT","TEXT","INTEGER","TEXT","TEXT","REAL","TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","REAL","REAL","TEXT","TEXT","REAL","REAL","REAL","REAL","TEXT","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER"),
							new Array(client,obj_id,$row[0],$row[1],$row[2],$row[3],$row[4],$row[5],$row[6],$row[7],$row[8],$row[9],$row[10],$row[11],$row[12],$row[13],$row[14],$cmi_node_id,$row[16],$row[17],$row[18],$row[19],$row[20],$row[21],$row[22],$row[23],$row[24],$row[25],$row[26],$row[27],$row[28],$row[29],$row[30],$row[31],$row[32],$row[33],$row[34],$row[35],$row[36],$row[37],$row[38],$row[39],$row[40],$userId,'',$i_check)
							);
							utils.log("setCMIData, cmi_node: "+ $cmi_node_id+ ", insert: "+ret);
						} else {
							ret = dbHandler.manipulateF(
								"UPDATE cmi_node set accesscount=%s, accessduration=%s, accessed=%s, activityabsduration=%s, activityattemptcount=%s, activityexpduration=%s, activityprogstatus=%s, attemptabsduration=%s, attemptcomplamount=%s, attemptcomplstatus=%s, attemptexpduration=%s, attemptprogstatus=%s, audio_captioning=%s, audio_level=%s, availablechildren=%s, completion=%s, completion_status=%s, completion_threshold=%s, cp_node_id=%s, created=%s, credit=%s, delivery_speed=%s, c_entry=%s, c_exit=%s, c_language=%s, launch_data=%s, learner_name=%s, location=%s, c_max=%s, c_min=%s, c_mode=%s, modified=%s, progress_measure=%s, c_raw=%s, scaled=%s, scaled_passing_score=%s, session_time=%s, success_status=%s, suspend_data=%s, total_time=%s, user_id=%s, c_timestamp=%s, additional_tables=%s "
								+"WHERE client=%s AND obj_id=%s AND cmi_node_id=%s",
							new Array("INTEGER","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER","TEXT","REAL","INTEGER","TEXT","INTEGER","INTEGER","REAL","TEXT","REAL","TEXT","TEXT","INTEGER","TEXT","TEXT","REAL","TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","REAL","REAL","TEXT","TEXT","REAL","REAL","REAL","REAL","TEXT","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER","TEXT","INTEGER","INTEGER"),
							new Array($row[0],$row[1],$row[2],$row[3],$row[4],$row[5],$row[6],$row[7],$row[8],$row[9],$row[10],$row[11],$row[12],$row[13],$row[14],$row[16],$row[17],$row[18],$row[19],$row[20],$row[21],$row[22],$row[23],$row[24],$row[25],$row[26],$row[27],$row[28],$row[29],$row[30],$row[31],$row[32],$row[33],$row[34],$row[35],$row[36],$row[37],$row[38],$row[39],$row[40],$userId,'',$i_check,client,obj_id,$cmi_node_id)
							);
							utils.log("setCMIData, cmi_node: "+ $cmi_node_id+ ", update: "+ret);
						}
//check
ret = dbHandler.getRowCount("cmi_comment","WHERE cmi_node_id = "+$cmi_node_id);
utils.log("setCMIData, cmi_node: "+ $cmi_node_id+ ", cmi_comment returns count: "+dbHandler.getRecords())

						if($b_node_update==true) {
							//remove
							if ($i_set>7) {
								$i_set-=8;
								if ($getComments) {
									$q = 'DELETE FROM cmi_comment WHERE client=%s AND obj_id=%s AND cmi_node_id = %s';
									ret = dbHandler.manipulateF($q, new Array("TEXT","INTEGER","INTEGER"), new Array(client,obj_id,$cmi_node_id));
									utils.log("setCMIData, cmi_node: "+ $cmi_node_id+ ", DELETE FROM cmi_comment returns: "+ret);
								}
							}
							if ($i_set>3) {
								$i_set-=4;
//								if ($getInteractions) {
								if ($getInteractions && $i_set>1) { //no changes if ineractions are not changed - check main.js
									$q = 'DELETE FROM cmi_correct_response WHERE client=%s AND obj_id=%s AND cmi_interaction_id IN (SELECT cmi_interaction.cmi_interaction_id FROM cmi_interaction WHERE cmi_interaction.cmi_node_id = %s)';
									ret = dbHandler.manipulateF($q, new Array("TEXT","INTEGER","INTEGER"), new Array(client,obj_id,$cmi_node_id));
									utils.log("setCMIData, cmi_node: "+ $cmi_node_id+ ", DELETE FROM cmi_correct_response returns: "+ret);
								}
							}
							if ($i_set>1) {
								$i_set-=2;
								if ($getInteractions) {
//								utils.log('DELETE FROM cmi_interaction WHERE cmi_node_id = '+$cmi_node_id);
									$q = 'DELETE FROM cmi_interaction WHERE client=%s AND obj_id=%s AND cmi_node_id = %s';
									ret = dbHandler.manipulateF($q, new Array("TEXT","INTEGER","INTEGER"), new Array(client,obj_id,$cmi_node_id));
									utils.log("setCMIData, cmi_node: "+ $cmi_node_id+ ", DELETE FROM cmi_interaction returns: "+ret);
								}
							}
							if ($i_set>0) {
								$i_set=0;
								if ($getObjectives) { 
									$q = 'DELETE FROM cmi_objective WHERE client=%s AND obj_id=%s AND cmi_node_id = %s';
									ret = dbHandler.manipulateF($q, new Array("TEXT","INTEGER","INTEGER"), new Array(client,obj_id,$cmi_node_id));
									utils.log("setCMIData, cmi_node: "+ $cmi_node_id+ ", DELETE FROM cmi_objective returns: "+ret);
								}
							}
							//end remove
						}
//check
ret = dbHandler.getRowCount("cmi_comment","WHERE cmi_node_id = "+$cmi_node_id);
utils.log("setCMIData, cmi_node: "+ $cmi_node_id+ ", cmi_comment returns count: "+dbHandler.getRecords())
						//to send to client
						$result[$row[19].toString()]=new Object;
						$result[$row[19].toString()] = $cmi_node_id.toString();
						break;

						case 'comment':
							$row[0] = dbHandler.nextId('cmi_comment');
							ret = dbHandler.manipulateF(
								"INSERT INTO cmi_comment (client, obj_id, cmi_comment_id, cmi_node_id, c_comment, c_timestamp, location, sourceislms) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
								new Array("TEXT","INTEGER","INTEGER","INTEGER","TEXT","TEXT","TEXT","INTEGER"),
								new Array(client, obj_id, $row[0], $cmi_node_id, $row[2], $row[3], $row[4], $row[5])
							);
							utils.log("setCMIData, cmi_node: "+$cmi_node_id+", INSERT INTO cmi_comment returns: "+ret+" for cmi_comment_id: "+$row[0]);
//check
ret = dbHandler.getRowCount("cmi_comment","WHERE cmi_node_id = "+$cmi_node_id);
utils.log("setCMIData, cmi_node: "+ $cmi_node_id+ ", cmi_comment returns count: "+dbHandler.getRecords())
						break;

						case 'interaction':
							$cmi_interaction_id = dbHandler.nextId('cmi_interaction');
							$a_map_cmi_interaction_id[$a_map_cmi_interaction_id.length]=""+$row[0]+"="+$cmi_interaction_id;
							ret = dbHandler.manipulateF(
								"INSERT INTO cmi_interaction (client, obj_id, cmi_interaction_id, cmi_node_id, description, id, latency, learner_response, result, c_timestamp, c_type, weighting) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
								new Array("TEXT","INTEGER","INTEGER","INTEGER","TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","REAL"),
								new Array(client, obj_id, $cmi_interaction_id, $cmi_node_id, $row[2], $row[3], $row[4], $row[5], $row[6], $row[7], $row[8], $row[9])
							);
							utils.log("setCMIData, cmi_node: "+$cmi_node_id+", INSERT INTO cmi_interaction returns: "+ret+" for cmi_interaction_id: "+$cmi_interaction_id+", old id: "+$row[0]);
						break;

						case 'objective':
							$row[2] = dbHandler.nextId('cmi_objective');
							$cmi_interaction_id = null;
							if ($row[0] != null) {
								for(var $i=0;$i<$a_map_cmi_interaction_id.length;$i++) {
									a_ids=$a_map_cmi_interaction_id[$i].split("=");
									if ($row[0] == a_ids[0]) $cmi_interaction_id=a_ids[1];
								}
							}
							ret = dbHandler.manipulateF(
								"INSERT INTO cmi_objective (cmi_interaction_id, cmi_node_id, cmi_objective_id, completion_status, description, id, c_max, c_min, c_raw, scaled, progress_measure, success_status, scope, client, obj_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
								new Array("INTEGER","INTEGER","INTEGER","TEXT","TEXT","TEXT","REAL","REAL","REAL","REAL","REAL","TEXT","TEXT","TEXT","INTEGER"),
								new Array($cmi_interaction_id,$cmi_node_id,$row[2],$row[3],$row[4],$row[5],$row[6],$row[7],$row[8],$row[9],$row[10],$row[11],$row[12],client,obj_id)
							);
							utils.log("setCMIData, cmi_node: "+$cmi_node_id+", INSERT INTO cmi_objective returns: "+ret+" for cmi_objective_id: "+$row[2]);
						break;


						case 'correct_response':
							$cmi_interaction_id = null;
							if ($row[1] != null) {
								for($i=0;$i<$a_map_cmi_interaction_id.length;$i++) {
									a_ids=$a_map_cmi_interaction_id[$i].split("=");
									if ($row[1] == a_ids[0]) $cmi_interaction_id=a_ids[1];
								}
							}
							if ($cmi_interaction_id != null) {
								$row[0] = dbHandler.nextId('cmi_correct_response');
								ret = dbHandler.manipulateF(
									"INSERT INTO cmi_correct_response (cmi_correct_resp_id, cmi_interaction_id, pattern, client, obj_id) VALUES (%s,%s,%s,%s,%s)",
									new Array("INTEGER","INTEGER","TEXT","TEXT","INTEGER"),
									new Array($row[0],$cmi_interaction_id,$row[2],client,obj_id)
								);
								utils.log("setCMIData, cmi_node: "+$cmi_node_id+", INSERT INTO cmi_correct_response returns: "+ret+" for cmi_interation_id: "+$cmi_interaction_id+" and cmi_correct_resp_id: "+$row[0]);
							}
						break;
					}
				}
			}

//removed because sequwncing is not supported in SOP
		// $changed_seq_utilities=$data->changed_seq_utilities;
		// $ilLog->write("SCORM2004 adl_seq_utilities changed: ".$changed_seq_utilities);
// //		if ($changed_seq_utilities == 1) {
			// $returnAr=ilSCORM2004StoreData::writeGObjective($data->adl_seq_utilities, $userId, $packageId);
// //		}
		// $completed=$returnAr[0];
		// $satisfied=$returnAr[1];
		// $measure=$returnAr[2];

		$new_global_status = $data.now_global_status;
//		utils.log("new_global_status="+$new_global_status);
		$saved_global_status=$data.saved_global_status;
//		utils.log("saved_global_status="+$saved_global_status);
		$result["new_global_status"]=new Object();
		$result["new_global_status"]=$new_global_status;
			//TODO first_access at start of lm; last_vistied at end
			//var lp_mode = $data.lp_mode;
			var d_now = new Date();
			var last_access = d_now.getTime();
			var percentage_completed = null;
			if (typeof $data.percentageCompleted == "number") percentage_completed = Math.round($data.percentageCompleted);
			var sco_total_time_sec = null;
			if (typeof $data.totalTimeCentisec == "number") sco_total_time_sec = Math.round($data.totalTimeCentisec/100);
			if ($data.now_global_status != $data.saved_global_status) {
				var last_status_change = d_now.getTime();
				ret = dbHandler.manipulateF(
					"UPDATE sahs_user set last_access=%s, last_status_change=%s, sco_total_time_sec=%s, status=%s, percentage_completed=%s WHERE client=%s AND obj_id=%s",
					new Array("integer","integer","integer","integer","integer","text","integer"),
					new Array(last_access,last_status_change,sco_total_time_sec,$data.now_global_status,percentage_completed,client,obj_id)
					);
			} else {
				ret = dbHandler.manipulateF(
					"UPDATE sahs_user set last_access=%s, sco_total_time_sec=%s, status=%s, percentage_completed=%s WHERE client=%s AND obj_id=%s",
					new Array("integer","integer","integer","integer","text","integer"),
					new Array(last_access,sco_total_time_sec,$data.now_global_status,percentage_completed,client,obj_id)
					);
			}
			emit(exports, "lmUserDataChanged", client+"_"+obj_id);

			ret=JSON.stringify($result);
			break;
		case "setSCORM12data" :
			var client=params[0], obj_id=params[1], $data=JSON.parse(params[2]), a_d=[], sco_id;
			for(var i=0; i<$data.cmi.length; i++) {
				a_d=$data.cmi[i];
				ret = dbHandler.manipulateF(
					'SELECT sco_id FROM scorm_tracking WHERE client = %s AND obj_id = %s AND sco_id = %s AND lvalue = %s',
					new Array('TEXT','INTEGER','INTEGER','TEXT'),
					new Array(client,obj_id,a_d[0],a_d[1])
				);
				sco_id=parseInt(dbHandler.getRecords());
				if (!isNaN(sco_id)) {
					ret = dbHandler.manipulateF(
						'UPDATE scorm_tracking set rvalue=%s WHERE client = %s AND obj_id = %s AND sco_id = %s AND lvalue = %s',
						new Array('TEXT','TEXT','INTEGER','INTEGER','TEXT'),
						new Array(a_d[2],client,obj_id,a_d[0],a_d[1])
					);
				} else {
					ret = dbHandler.manipulateF(
						'INSERT INTO scorm_tracking (client, obj_id, sco_id, lvalue, rvalue) VALUES (%s,%s,%s,%s,%s)',
						new Array('TEXT','INTEGER','INTEGER','TEXT','TEXT'),
						new Array(client,obj_id,a_d[0],a_d[1],a_d[2])
					);
				}
			}
			var d_now = new Date();
			var last_access = d_now.getTime();
			var percentage_completed = null;
			if (typeof $data.percentageCompleted == "number") percentage_completed = Math.round($data.percentageCompleted);
			var sco_total_time_sec = null;
			if (typeof $data.totalTimeCentisec == "number") sco_total_time_sec = Math.round($data.totalTimeCentisec/100);
			if ($data.now_global_status != $data.saved_global_status) {
				var last_status_change = d_now.getTime();
				ret = dbHandler.manipulateF(
					"UPDATE sahs_user set last_access=%s, last_status_change=%s, sco_total_time_sec=%s, status=%s, percentage_completed=%s WHERE client=%s AND obj_id=%s",
					new Array("integer","integer","integer","integer","integer","text","integer"),
					new Array(last_access,last_status_change,sco_total_time_sec,$data.now_global_status,percentage_completed,client,obj_id)
					);
			} else {
				ret = dbHandler.manipulateF(
					"UPDATE sahs_user set last_access=%s, sco_total_time_sec=%s, status=%s, percentage_completed=%s WHERE client=%s AND obj_id=%s",
					new Array("integer","integer","integer","integer","text","integer"),
					new Array(last_access,sco_total_time_sec,$data.now_global_status,percentage_completed,client,obj_id)
					);
			}
			ret="ok";
			emit(exports, "lmUserDataChanged", client+"_"+obj_id);
			break;
		case "il2sopClientData" :
			ret = dbHandler.manipulateF(
				"SELECT count(*) FROM client_data WHERE client=%s",
				new Array("text"),
				new Array(params[params.length-1])
				);
			var counter = parseInt(dbHandler.getRecords());
			if(counter==0) {
				ret = dbHandler.manipulateF(
					"INSERT INTO client_data (support_mail, client) VALUES (%s, %s) ",
					new Array("TEXT","TEXT"), params);
			} else {
				ret = dbHandler.manipulateF(
					"UPDATE client_data SET support_mail=%s WHERE client=%s",
					new Array("TEXT","TEXT"), params);
			}
			break;
		case "il2sopUserData" :
			ret = dbHandler.manipulateF(
				"SELECT count(*) FROM user_data WHERE user_id = %s AND client=%s",
				new Array("integer","text"),
				new Array(params[params.length-2],params[params.length-1])
				);
			var counter = parseInt(dbHandler.getRecords());
			if(counter==0) {
				ret = dbHandler.manipulateF(
					"INSERT INTO user_data (login, passwd, firstname, lastname, title, gender, user_id, client) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ",
					new Array("TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","INTEGER","TEXT"), params);
			} else {
				ret = dbHandler.manipulateF(
					"UPDATE user_data SET login=%s, passwd=%s, firstname=%s, lastname=%s, title=%s, gender=%s WHERE user_id=%s AND client=%s",
					new Array("TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","INTEGER","TEXT"), params);
			}
			break;
		case "il2sopLm" :
			for(var i=0;i<params.length;i++) {if(params[i]=="") {params[i]=null;}}
			ret = dbHandler.manipulateF(
				"SELECT count(*) FROM lm WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[params.length-2],params[params.length-1])
				);
			var counter = parseInt(dbHandler.getRecords());
			if(counter==0) {
				ret = dbHandler.manipulateF(
					"INSERT INTO lm (title, description, scorm_version, active, init_data, resources, scorm_tree, module_version, offline_zip_created, learning_progress_enabled, certificate_enabled, max_attempt, adlact_data, ilias_version, client, obj_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ",
					new Array("TEXT","TEXT","TEXT","INTEGER","TEXT","TEXT","TEXT","INTEGER","INTEGER","INTEGER","INTEGER","INTEGER","TEXT","TEXT","TEXT","INTEGER"), params);
			} else {
				ret = dbHandler.manipulateF(
					"UPDATE lm SET title=%s, description=%s, scorm_version=%s, active=%s, init_data=%s, resources=%s, scorm_tree=%s, module_version=%s, offline_zip_created=%s, learning_progress_enabled=%s, certificate_enabled=%s, max_attempt=%s, adlact_data=%s, ilias_version=%s WHERE client=%s AND obj_id=%s",
					new Array("TEXT","TEXT","TEXT","INTEGER","TEXT","TEXT","TEXT","INTEGER","INTEGER","INTEGER","INTEGER","INTEGER","TEXT","TEXT","TEXT","INTEGER"), params);
			}
			break;
		case "il2sopSahsUser" :
			for(var i=0;i<params.length;i++) {if(params[i]=="" || params[i]=="null") {params[i]=null;}}
			ret = dbHandler.manipulateF(
				"SELECT count(*) FROM sahs_user WHERE client=%s AND obj_id=%s AND user_id=%s",
				new Array("text","integer","integer"),
				new Array(params[params.length-3],params[params.length-2],params[params.length-1])
				);
			var counter = parseInt(dbHandler.getRecords());
			if(counter==0) {
				ret = dbHandler.manipulateF(
					"INSERT INTO sahs_user (package_attempts, module_version, last_visited, first_access, last_access, last_status_change, total_time_sec, sco_total_time_sec, status, percentage_completed, user_data, client, obj_id, user_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ",
					new Array("INTEGER","INTEGER","TEXT","INTEGER","INTEGER","INTEGER","INTEGER","INTEGER","INTEGER","INTEGER","TEXT","TEXT","INTEGER","INTEGER"), params);
			} else {
				ret = dbHandler.manipulateF(
					"UPDATE sahs_user SET package_attempts=%s, module_version=%s, last_visited=%s, first_access=%s, last_access=%s, last_status_change=%s, total_time_sec=%s, sco_total_time_sec=%s, status=%s, percentage_completed=%s, user_data=%s WHERE client=%s AND obj_id=%s AND user_id=%s",
					new Array("INTEGER","INTEGER","TEXT","INTEGER","INTEGER","INTEGER","INTEGER","INTEGER","INTEGER","INTEGER","TEXT","TEXT","INTEGER","INTEGER"), params);
			}
			break;
		case "il2sopCmiDelete" :
			//for(var i=0;i<params.length;i++) {if(params[i]=="") {params[i]=null;}}
			ret = dbHandler.manipulateF("DELETE FROM cmi_node WHERE client=%s AND obj_id=%s",new Array("text","integer"),new Array(params[0],params[1]));
			ret = dbHandler.manipulateF("DELETE FROM cmi_comment WHERE client=%s AND obj_id=%s",new Array("text","integer"),new Array(params[0],params[1]));
			ret = dbHandler.manipulateF("DELETE FROM cmi_correct_response WHERE client=%s AND obj_id=%s",new Array("text","integer"),new Array(params[0],params[1]));
			ret = dbHandler.manipulateF("DELETE FROM cmi_gobjective WHERE client=%s AND obj_id=%s",new Array("text","integer"),new Array(params[0],params[1]));
			ret = dbHandler.manipulateF("DELETE FROM cmi_interaction WHERE client=%s AND obj_id=%s",new Array("text","integer"),new Array(params[0],params[1]));
			ret = dbHandler.manipulateF("DELETE FROM cmi_objective WHERE client=%s AND obj_id=%s",new Array("text","integer"),new Array(params[0],params[1]));
			break;
		case "il2sopCmiNode" :
			for(var i=0;i<params.length;i++) {if(params[i]=="null") {params[i]=null;}}
			ret = dbHandler.manipulateF(
				"INSERT INTO cmi_node ( accesscount,accessduration,accessed,activityabsduration,activityattemptcount,activityexpduration,activityprogstatus,attemptabsduration,attemptcomplamount,attemptcomplstatus,attemptexpduration,attemptprogstatus,audio_captioning,audio_level,availablechildren,cmi_node_id,completion,completion_status,completion_threshold,cp_node_id,created,credit,delivery_speed,c_entry,c_exit,c_language,launch_data,learner_name,location,c_max,c_min,c_mode,modified,progress_measure,c_raw,scaled,scaled_passing_score,session_time,success_status,suspend_data,total_time,user_id,c_timestamp,additional_tables,client, obj_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
				new Array("INTEGER","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER","TEXT","REAL","INTEGER","TEXT","INTEGER","INTEGER","REAL","TEXT","INTEGER","REAL","TEXT","TEXT","INTEGER","TEXT","TEXT","REAL","TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","REAL","REAL","TEXT","TEXT","REAL","REAL","REAL","REAL","TEXT","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER","TEXT","INTEGER"),
				new Array(params[0],params[1],params[2],params[3],params[4],params[5],params[6],params[7],params[8],params[9],params[10],params[11],params[12],params[13],params[14],params[15],params[16],params[17],params[18],params[19],params[20],params[21],params[22],params[23],params[24],params[25],params[26],params[27],params[28],params[29],params[30],params[31],params[32],params[33],params[34],params[35],params[36],params[37],params[38],params[39],params[40],params[41],params[42],params[43],params[44],params[45])
			);
			break;
		case "il2sopCmiComment" :
			for(var i=0;i<params.length;i++) {if(params[i]=="null") {params[i]=null;}}
			ret = dbHandler.manipulateF(
				"INSERT INTO cmi_comment (cmi_comment_id, cmi_node_id, c_comment, c_timestamp, location, sourceislms, client, obj_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
				new Array("INTEGER","INTEGER","TEXT","TEXT","TEXT","INTEGER","TEXT","INTEGER"),
				new Array(params[0],params[1],params[2],params[3],params[4],params[5],params[6],params[7])
			);
			break;
		case "il2sopCmiCorrectResponse" :
			for(var i=0;i<params.length;i++) {if(params[i]=="null") {params[i]=null;}}
			//without cmi_node_id! 
			ret = dbHandler.manipulateF(
				"INSERT INTO cmi_correct_response (cmi_correct_resp_id, cmi_interaction_id, pattern, client, obj_id) VALUES (%s,%s,%s,%s,%s)",
				new Array("INTEGER","INTEGER","TEXT","TEXT","INTEGER"),
				new Array(params[0],params[1],params[2],params[3],params[4])
			);
			break;
		case "il2sopCmiInteraction" :
			for(var i=0;i<params.length;i++) {if(params[i]=="null") {params[i]=null;}}
			ret = dbHandler.manipulateF(
				"INSERT INTO cmi_interaction (cmi_interaction_id, cmi_node_id, description, id, latency, learner_response, result, c_timestamp, c_type, weighting, client, obj_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
				new Array("INTEGER","INTEGER","TEXT","TEXT","TEXT","TEXT","TEXT","TEXT","REAL","TEXT","TEXT","INTEGER"),
 				new Array(params[0],params[1],params[2],params[3],params[4],params[5],params[6],params[7],params[8],params[9],params[10],params[11])
			);
			break;
		case "il2sopCmiObjective" :
			for(var i=0;i<params.length;i++) {if(params[i]=="null") {params[i]=null;}}
			ret = dbHandler.manipulateF(
				"INSERT INTO cmi_objective (cmi_interaction_id, cmi_node_id, cmi_objective_id, completion_status, description, id, c_max, c_min, c_raw, scaled, progress_measure, success_status, scope, client, obj_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
				new Array("INTEGER","INTEGER","INTEGER","TEXT","TEXT","TEXT","REAL","REAL","REAL","REAL","REAL","TEXT","TEXT","TEXT","INTEGER"),
				new Array(params[0],params[1],params[2],params[3],params[4],params[5],params[6],params[7],params[8],params[9],params[10],params[11],params[12],params[13],params[14])
			);
			break;
		case "il2sopScormTrackingDelete" :
			ret = dbHandler.manipulateF("DELETE FROM scorm_tracking WHERE client=%s AND obj_id=%s",new Array("text","integer"),new Array(params[0],params[1]));
			break;
		case "il2sopScormTracking" :
			for(var i=0;i<params.length;i++) {if(params[i]=="null") {params[i]=null;}}
			ret = dbHandler.manipulateF(
				"INSERT INTO scorm_tracking (sco_id, lvalue, rvalue, client, obj_id) VALUES (%s,%s,%s,%s,%s)",
				new Array("integer","text","text","text","integer"),
				new Array(params[0],params[1],params[2],params[3],params[4])
			);
			break;

		case "sop2ilGetNodes" :
			ret = dbHandler.manipulateF(
				"SELECT cmi_node_id FROM cmi_node WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "getScormTracking" :
			ret = dbHandler.manipulateF(
				"SELECT sco_id, lvalue, rvalue FROM scorm_tracking WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmDelete" :
			var p1 = new Array("text","integer");
			var p2 = new Array(params[0],params[1]);
			ret = dbHandler.manipulateF("DELETE FROM cmi_node WHERE client=%s AND obj_id=%s",p1,p2);
			ret = dbHandler.manipulateF("DELETE FROM cmi_comment WHERE client=%s AND obj_id=%s",p1,p2);
			ret = dbHandler.manipulateF("DELETE FROM cmi_correct_response WHERE client=%s AND obj_id=%s",p1,p2);
			ret = dbHandler.manipulateF("DELETE FROM cmi_gobjective WHERE client=%s AND obj_id=%s",p1,p2);
			ret = dbHandler.manipulateF("DELETE FROM cmi_interaction WHERE client=%s AND obj_id=%s",p1,p2);
			ret = dbHandler.manipulateF("DELETE FROM cmi_objective WHERE client=%s AND obj_id=%s",p1,p2);
			ret = dbHandler.manipulateF("DELETE FROM lm WHERE client=%s AND obj_id=%s",p1,p2);
			ret = dbHandler.manipulateF("DELETE FROM sahs_user WHERE client=%s AND obj_id=%s",p1,p2);
			ret = dbHandler.manipulateF("DELETE FROM scorm_tracking WHERE client=%s AND obj_id=%s",p1,p2);
			break;
		case "lmInactive" :
			ret = dbHandler.manipulateF(
				"UPDATE lm SET active=0 WHERE client=%s AND obj_id=%s",
				new Array("text","integer"),
				new Array(params[0],params[1])
				);
			break;
		case "lmactive" :
			ret = dbHandler.manipulateF(
				"UPDATE lm SET active=1 WHERE client=%s AND obj_id=%s",
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
exports.openDb = openDb;
exports.closeDb = closeDb;
exports.getData = getData;
exports.setData = setData;

exports.__exposedProps__["openDb"] = "r";
exports.__exposedProps__["closeDb"] = "r";
exports.__exposedProps__["getData"] = "r";
exports.__exposedProps__["setData"] = "r";

