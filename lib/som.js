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

const {Cc, Ci, Cu, Cr, Cm, components} = require("chrome");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

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
var base64 = require("sdk/base64");
var Request = require("sdk/request").Request;
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
var env = require("./env");
var gui = require("./gui");
var utils = require("./utils");
var _ = require("sdk/l10n").get;

var lms = {};

var lmstatus = {
	0 : "not_attempted",
	1 : "in_progress",
	2 : "completed",
	3 : "failed"
}

function send(evt) {
	emit(exports,evt);
}   
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
function getAllLm(silent=false) { 
	lms = {}; // delete all
	var d = db.getData("lmGetAll",null,true,true);
	for each (var row in d) {
		var id = row.client + "_" + row.obj_id;
		var lm = getLmById(id,true,row);
		lms[id] = lm;
	}
	if (!silent) { 
		emit(exports, "allLmChanged");
	}
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
 * @param {Boolean} silent dont emit event
 * @param {Object} param row=false only available when called from getAllLm
 * @return {Object} lm
 **/
function getLmById(id,evt,row=false) {
	var idArr = id.split("_");
	var client = idArr[0];
	var obj_id = idArr[1];
	var lm;
	if (!row) { // not called from getAllLm
		var r = db.getData("lmGetAllByClientAndObjId",[client,obj_id],true,true);
		if (r.length > 0) {
			lm = validateLm(r[0]);
		}
		else {
			lm = undefined;		
			utils.log("lm not exists: " + id);
		}
	}
	else {
		lm = validateLm(row);
	} 
	
	if (!row && (undefined != lm)) { // update lm object in lms
		delete lms[id];
		lms[id] = lm;
		if (evt) {
			emit(exports, "lmChanged", id);
		}
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

/**
 * creates id from data.domain,data.client,data.obj_id
 * 
 * @public
 * @method getIdFromData();
 * @return {String} id as string
 **/
function getIdFromData(data) {
	return data.domain + "/" + data.client + "/" + data.obj_id;
}

/**
 * extract components from lm.id: domain,client,obj_id
 * 
 * @public
 * @method getIdAsObject();
 * @return {Array} id as object
 **/
function getIdAsObject(str) {
	var ret = /^(.*?)\/([^\/]+)\/([^\/]+)$/.test(str);
	if (ret) {
		return {domain:RegExp.$1,client:RegExp.$2,obj_id:RegExp.$3};
	}
	else {
		return false;
	}
 }
 
/**
 * returns the status text
 * 
 * @public
 * @method getLmStatusText
 * @param {Integer} id
 * @return {String} status
 **/
function getLmStatusText(id) {
	return lmstatus[id];
}
/** 
 * checks if outgoing localhost request is importRequest from host 
 * @public
 * @method isImportRequest
 * @param {String} url 
 **/  
function isImportRequest(url) {
	utils.log(url);
	var ret = /(localhost|127\.0\.0\.1).*?import\?.*/g.test(url);
	return ret;
}

/** 
 * validate all LM data
 * @private
 * @method validateLm
 * @param {Object} lm
 * @return {Object} lm 
 **/ 
function validateLm(lm) {
	//utils.log(JSON.stringify(lm));
	if (lm.status===null || undefined===lm.status || (lm.status > 3) || (lm.status < 0)) {
		//utils.log("invalid status: " + lm.status + ". Set to 0=not_attempted");
		lm.status = 0;
	}
	if (lm.description===null || undefined===lm.description || lm.description=="null") {
		//utils.log("invalid status: " + lm.status + ". Set to 0=not_attempted");
		lm.description = "";
	}
	if (lm.sco_total_time_sec===null || undefined===lm.sco_total_time_sec || lm.sco_total_time_sec=="null") {
		//utils.log("invalid status: " + lm.status + ". Set to 0=not_attempted");
		lm.sco_total_time_sec = 0;
	}
	if (lm.first_access===null || undefined===lm.first_access || lm.first_access=="null") {
		//utils.log("invalid status: " + lm.status + ". Set to 0=not_attempted");
		lm.first_access = "";
	}
	if (lm.last_access===null || undefined===lm.last_access || lm.last_access=="null") {
		//utils.log("invalid status: " + lm.status + ". Set to 0=not_attempted");
		lm.last_access = "";
	}
	if (lm.percentage_completed===null || undefined===lm.percentage_completed || lm.percentage_completed=="null") {
		//utils.log("invalid status: " + lm.status + ". Set to 0=not_attempted");
		lm.percentage_completed = 0;
	}
	return lm;
}

/** 
 * imports a Learning Module Content Zip
 * @public
 * @method importLm 
 * @param {String} url
 **/
function importLm(id, burl, callback) {
	try {
		var url = base64.decode(burl);
		var params = id.split('_');
		var client = params[0];
		var obj_id = params[1];
		var io = env.initIO();
		var trg = io.sopDir.clone();
		trg.append("data");
		trg.append(client);
		// new client?
		if (!trg.exists()) {
			trg.create(Ci.nsIFile.DIRECTORY_TYPE,FileUtils.PERMS_DIRECTORY);
		}
		trg.append("lm_data");
		if (!trg.exists()) {
			trg.create(Ci.nsIFile.DIRECTORY_TYPE,FileUtils.PERMS_DIRECTORY);
		}
		trg.append("lm_" + obj_id);
		if (trg.exists()) { // strange: it should not be possible to import any lm twice!
			trg.remove(true);
			utils.log("warn: lm with id " + id + " exists, it will be deleted!");
		}
		trg.create(Ci.nsIFile.DIRECTORY_TYPE,FileUtils.PERMS_DIRECTORY);
		var file = trg.clone();
		file.append('lm_' + obj_id + ".zip");
		file.create(Ci.nsIFile.NORMAL_FILE_TYPE,FileUtils.PERMS_FILE);
		
		let uri = NetUtil.newURI(url);
		let channel = NetUtil.newChannel(uri);
		channel.QueryInterface(Ci.nsIHttpChannel);
		channel.requestMethod = "GET";
		
		NetUtil.asyncFetch(channel, function(istream, status) {
			if (!components.isSuccessCode(status)) {
				if (typeof callback == "function") {
					callback.call(null,false);
				}
				utils.log("error fetching: " + url + "(status: " + status + ")");
				return;
			}
			var ostream = FileUtils.openSafeFileOutputStream(file);
			NetUtil.asyncCopy(istream, ostream, function(status) {
				if (!components.isSuccessCode(status)) {
					if (typeof callback == "function") {
						callback.call(null,false);
					}
					utils.log("error saving: " + url + " to " + file.path + " (status: " + status + ")");
					return;
				}
				utils.log("content zip copied!");
				utils.extractFiles(file,trg);
				file.remove(false);
				utils.log("lm extracted and zip removed.");
				utils.handle(callback,true);
				// start som if trackingdata 
			});
		});
		//ToDo: delete manifest file to save Content from robery
	}
	catch(e) {
		utils.err(e);
	}
	return;
}

/** 
 * removes local LM content folder
 * @public
 * @method removeLmContent 
 * @param {String} id
 **/
function removeLmContent(id) {
	var params = id.split('_');
	var client = params[0];
	var obj_id = params[1];
	var io = env.initIO();
	var trg = io.sopDir.clone();
	trg.append("data");
	trg.append(client);
	// new client?
	var errMsg = "error: lm with id " + id + " does not exists and can not be removed";
	if (!trg.exists()) {
		utils.err(errMsg);
		return false;
	}
	trg.append("lm_data");
	if (!trg.exists()) {
		utils.err(errMsg);
		return false;
	}
	trg.append("lm_" + obj_id);
	if (trg.exists()) { 
		trg.remove(true);
		utils.log("LM removed: " + trg.path);
		return true;
	}
	else {
		utils.err(errMsg);
		return false;
	}
}

/** 
 * imports tracking data
 * @public
 * @method importTracking 
 * @param {String} id
 * @param {String} base64 url
 * @param {Function} callback function
 **/
 
function importTracking(id, burl, callback) { // id must be given
	var params = id.split('_');
	var client = params[0];
	var obj_id = params[1];
	var url = base64.decode(burl);
	let uri = NetUtil.newURI(url);
	let channel = NetUtil.newChannel(uri);
	channel.QueryInterface(Ci.nsIHttpChannel);
	channel.requestMethod = "GET";	
	channel.setRequestHeader("Accept","text/javascript",false); 
	channel.setRequestHeader("Accept-Charset","UTF-8",false);
	NetUtil.asyncFetch(channel, function(istream, status) {
		if (!components.isSuccessCode(status)) {
			utils.log("error fetching: " + url + "(status: " + status + ")");
			return;
		}
		var data = NetUtil.readInputStreamToString(istream, istream.available());
		try {
			var o = JSON.parse(data);
			if (typeof o == "object") {// && typeof o.schema == "object") {
				var scorm_version = o.lm[2];
				utils.log(scorm_version);
				var user_id = o.user_data[6];
				utils.log(user_id);
				// var val = [client,obj_id];
				// for (var i=0; i<o.lm.length; i++) {
					// val[i+2] = o.lm[i];
					
					//insert into table cmi_node//MUSS VORHER WISSEN WELCHE SCORM-Version//checkExistLm
				o.client_data.push(client);
				var r = db.setData("il2sopClientData",o.client_data);
				if (r==true) {
					utils.log("valid tracking data recieved for client_data");
					o.user_data.push(client);
					r = db.setData("il2sopUserData",o.user_data);
				}
				if (r==true) {
					utils.log("valid tracking data recieved for user_data");
					o.lm.push(client);
					o.lm.push(obj_id);
					r = db.setData("il2sopLm",o.lm);
				}
				if (r==true) {
					utils.log("valid tracking data recieved for lm");
					o.sahs_user.push(client);
					o.sahs_user.push(obj_id);
					o.sahs_user.push(user_id);
					r = db.setData("il2sopSahsUser",o.sahs_user);
				}
				if (r==true) {
					utils.log("valid tracking data recieved for sahs_user");
					if (scorm_version=="2004") {
						r = db.setData("il2sopCmiDelete",[client,obj_id]);
						if (r==true) {
							utils.log("tracking data deleted for cmi-tables");
							for(var i=0; i<o.cmi.data.node.length; i++) {
								o.cmi.data.node[i].push(client);
								o.cmi.data.node[i].push(obj_id);
								if (r==true) r = db.setData("il2sopCmiNode",o.cmi.data.node[i]);
							}
						}
						if (r!=true) utils.log("problem with tracking data received for cmi_node");
						if (r==true) {
							for(var i=0; i<o.cmi.data.comment.length; i++) {
								o.cmi.data.comment[i].push(client);
								o.cmi.data.comment[i].push(obj_id);
								if (r==true) r = db.setData("il2sopCmiComment",o.cmi.data.comment[i]);
							}
						}
						if (r!=true) utils.log("problem with tracking data received for cmi_comment");
						if (r==true) {
							for(var i=0; i<o.cmi.data.correct_response.length; i++) {
								o.cmi.data.correct_response[i].push(client);
								o.cmi.data.correct_response[i].push(obj_id);
								if (r==true) r = db.setData("il2sopCmiCorrectResponse",o.cmi.data.correct_response[i]);
							}
						}
						if (r!=true) utils.log("problem with tracking data received for cmi_correct_response");
						if (r==true) {
							for(var i=0; i<o.cmi.data.interaction.length; i++) {
								o.cmi.data.interaction[i].push(client);
								o.cmi.data.interaction[i].push(obj_id);
								if (r==true) r = db.setData("il2sopCmiInteraction",o.cmi.data.interaction[i]);
							}
						}
						if (r!=true) utils.log("problem with tracking data received for cmi_interaction");
						if (r==true) {
							for(var i=0; i<o.cmi.data.objective.length; i++) {
								o.cmi.data.objective[i].push(client);
								o.cmi.data.objective[i].push(obj_id);
								if (r==true) r = db.setData("il2sopCmiObjective",o.cmi.data.objective[i]);
							}
						}
						if (r!=true) utils.log("problem with tracking data received for cmi_objective");
					} else { //SCORM 1.2
						r = db.setData("il2sopScormTrackingDelete",[client,obj_id]);
						if (r==true) {
							for(var i=0; i<o.cmi.length; i++) {
								o.cmi[i].push(client);
								o.cmi[i].push(obj_id);
								o.cmi[i][2]=decodeURIComponent(o.cmi[i][2]);
								if (r==true) r = db.setData("il2sopScormTracking",o.cmi[i]);
							}
						}
						if (r!=true) utils.log("problem with tracking data received for scorm_tracking");
					}
				}
				if (r==true) r = db.setData("lmactive",client,obj_id);
				utils.handle(callback,r);
				if (r==true) utils.log("valid tracking data recieved");
//				utils.log(data);
			}
			else {
				utils.handle(callback,false);
				utils.err("tracking data not valid!");
			}
		}
		catch(e) {
			utils.handle(callback,false);
			utils.err("tracking data not valid: " + e + "\n" + data);
		}
	});
}

/** 
 * pushes tracking data
 * @public
 * @method pushTracking 
 * @param {String} id
 * @param {String} base64 url
 * @param {Function} callback function
 **/
function pushTracking(id,burl,handler) {
	var params = id.split('_');
	var client = params[0];
	var obj_id = params[1];
	var url = base64.decode(burl);
	var sco;
	//var nodes = JSON.parse(db.getData("sop2ilGetNodes",[client,obj_id],false,false));
	var i_oncomplete=0;
	var sop2il_data = {
		"cmi":[],
		"adl_seq_utilities":{},
		"changed_seq_utilities":0,
		"saved_global_status":0,
		"now_global_status":1,
		"percentageCompleted":0,
		"lp_mode":6,
		"hash":0,
		"p":"",
		"totalTimeCentisec":0,
		"packageAttempts":1,
		"first_access":null,
		"last_access":null,
		"last_status_change":null,
		"last_visited":"",
		"total_time_sec":null,
		"module_version":1
	};
	var o_lm = db.getData("lmGetScormVersion",[client,obj_id],true,true)[0];
	var scorm_version=o_lm.scorm_version;
	if (scorm_version=="2004") {
		var nodes = JSON.parse(db.getData("sop2ilGetNodes",[client,obj_id],false,false));
		for(var i=0; i<nodes.length; i++) {
			sco=nodes[i][0];
			utils.log("save for sco with cmi_node_id: "+sco);
			var cmi_data={"node":[],"comment":[],"correct_response":[],"interaction":[],"objective":[],"i_check":15,"i_set":15};
			cmi_data.node = JSON.parse(db.getData("sop2ilNode",[client,obj_id,sco],false,false));
			cmi_data.comment = JSON.parse(db.getData("sop2ilComment",[client,obj_id,sco],false,false));
			cmi_data.correct_response = JSON.parse(db.getData("sop2ilCorrectResponse",[client,obj_id,sco],false,false));
			cmi_data.interaction = JSON.parse(db.getData("sop2ilInteraction",[client,obj_id,sco],false,false));
			cmi_data.objective = JSON.parse(db.getData("sop2ilObjective",[client,obj_id,sco],false,false));
	//		utils.log(JSON.stringify(cmi_data));
			sop2il_data.cmi.push(cmi_data);
		}
	}
	if (scorm_version=="1.2") {
		sop2il_data.cmi = JSON.parse(db.getData("getScormTracking",[client,obj_id],false,false));
	}
	var sahsTmp=db.getData("sop2ilSahsUser",[client,obj_id,sco],true,true);
	var sahsData=sahsTmp[0];
	//utils.log(JSON.stringify(sahsData));
	sop2il_data.now_global_status=sahsData.status;
	sop2il_data.percentageCompleted=sahsData.percentage_completed;
	sop2il_data.totalTimeCentisec=sahsData.sco_total_time_sec*100;
	sop2il_data.packageAttempts=sahsData.package_attempts;
	sop2il_data.first_access=sahsData.first_access;
	sop2il_data.last_access=sahsData.last_access;
	sop2il_data.last_status_change=sahsData.last_status_change;
	sop2il_data.last_visited=sahsData.last_visited;
	sop2il_data.module_version=sahsData.module_version;
	//utils.log(JSON.stringify(sop2il_data));
//	var r = db.getData("lmGetAllCmiNodeByClientAndObjId",[client,obj_id],true,true);
	var req = Request({
		url: url,
		content : JSON.stringify(sop2il_data),
		onComplete: function (response) {
			var ret = response.text;
			if (!ret || ret == "") {
				utils.err("no response from pushTracking request");
				utils.handle(handler,false);
				return false;
			}
			ret = JSON.parse(ret);
			if (typeof ret != 'object') {
				utils.err("invalid response from pushTracking request");
				utils.handle(handler,false);
				return false;
			}
			//utils.log(JSON.stringify(ret));
			//make inactive or delete
			
			// delete all data from DB instead of setting lmInactive 
			var r = db.setData("lmDelete",[client,obj_id]);
			if (r==true) {
				removeLmContent(id);
				getAllLm(false);
				gui.closePlayerTabs(id);
				utils.log("sop2il successful");
			}
			getAllLm(false);
			//delete  sahs_user,lm
			//r = db.setData("il2sopCmiDelete",[client,obj_id]);
			utils.handle(handler,true);
		}
	});
	req.post();
	
}

/**
 * get the offline url for LM
 * @public
 * @method getOfflineUrl
 * @param {String} id
 * @return url
 **/ 
function getOfflineUrl(id) {
	env.run();
	var lm = getLmById(id,false);
	if (!lm) {
		if (!lm) {
			utils.err("no lm with id: " + id);
			return false;
		}
		
	}
	//utils.log(JSON.stringify(lm));
	var player = (lm.scorm_version == "1.2") ? env.globals.player12 : env.globals.player2004;
	var url = env.globals.serverProtocol + "://" + env.globals.serverName + ":" + env.globals.serverPort + "/" + player + "?" + "client=" + lm.client + "&obj_id=" + lm.obj_id + "&domain=" + atoB(lm.domain);
	return url;
}

/**
 * get the msg url
 * @public
 * @method getMsgUrl
 * @param {String} id
 * @return url
 **/ 
function getMsgUrl(id) {
	//utils.log(JSON.stringify(lm));
	var url = env.globals.serverProtocol + "://" + env.globals.serverName + ":" + env.globals.serverPort + "/" + env.globals.msgPage + "?" + "msg=" + encodeURIComponent(_(id));
	return url;
}

/**
 * runs environment (db, webserver, io)
 * @public
 * @method runEnv
 **/
function runEnv() {
	env.run();
}

/**
 * opens SOM
 * @public
 * @method openSOM
 **/
function openSOM() {
	gui.openSomHome();
}

/**
 * check if lm exists
 * @public
 * @method lmExists
 * @param {base64} client
 * @param {String} obj_id
 * @return {Boolean} exists
 **/
 
 function lmExists(client,id) {
	 env.run();
	 var lm = getLmById(client+"_"+id,false);
	 var exists = (lm && (lm.active==1)) ? true : false;
	 return exists; 
 }
 
 function isPlayerOpen(id) {
	 return gui.isPlayerOpen(id);
 }
 
 function getLocStr(id) {
	 return _(id);
 }
/**
 * ASCII to Base64
 * @public
 * @method atoB
 * @param {String} txt
 * @return {String} base64
 **/ 
function atoB(txt) {
	return base64.encode(txt).replace(/\=/g,"");
}

/**
 * Base64 to ASCII 
 * @public
 * @method btoA
 * @param {String} txt
 * @return {String} ASCII
 **/ 
function btoA (txt) {
	return base64.decode(txt);
}

//env.on("run", function() { getAllLm }); needed??
db.on("lmUserDataChanged", function(id) {
	utils.log("lmUserDataChanged: " + id);
	getLmById(id,true);
});

var connectorFuncs = {
	getOfflineUrl	: getOfflineUrl,
	atoB 		: atoB,
	btoA 		: btoA, 
	importLm	: importLm,
	importTracking	: importTracking,
	pushTracking	: pushTracking,
	runEnv		: runEnv,
	getAllLm : getAllLm,
	openSOM		: openSOM,
	lmExists	: lmExists,
	isPlayerOpen: isPlayerOpen,
	getLocStr	: getLocStr,
	__exposedProps__ : {
		getOfflineUrl 	: "r",
		atoB		: "r",
		btoA		: "r",
		importLm	: "r",
		importTracking	: "r",
		pushTracking	: "r",
		runEnv		: "r",
		getAllLm : "r",
		openSOM		: "r",
		lmExists : "r",
		isPlayerOpen : "r",
		getLocStr	: "r"
	}
}

exports.getAllLm = getAllLm;
exports.getLmById = getLmById;
exports.getLmsObj = getLmsObj;
exports.getLmStatusText = getLmStatusText;
exports.isImportRequest = isImportRequest;
exports.getOfflineUrl = getOfflineUrl;
exports.getMsgUrl = getMsgUrl;
exports.importTracking = importTracking;
exports.pushTracking = importTracking;
exports.connectorFuncs = connectorFuncs;
exports.__exposedProps__["getAllLm"] = "r";
exports.__exposedProps__["getLmById"] = "r";
exports.__exposedProps__["getLmsObj"] = "r";
exports.__exposedProps__["isImportRequest"] = "r";
exports.__exposedProps__["importTracking"] = "r";
exports.__exposedProps__["connectorFuncs"] = "r";




