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
 * imports a Learning Module Content Zip
 * @public
 * @method importLm 
 * @param {String} url
 **/
function importLm(id, burl,callback) { //
	try {
		var url = base64.decode(burl);
		var params = id.split("_");
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
		file.append(id + ".zip");
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
				if (typeof callback == "function") {
					callback.call(null,true);
				}
				// start som if trackingdata 
			});
		});
	}
	catch(e) {
		utils.err(e);
	}
	return;
}

function importTracking() {
	var url = "http://www.internetlehrer.de/trunk/ilias.php?baseClass=ilSAHSPresentationGUI&cmd=cmi&ref_id=50"; // only check
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
			if (typeof o == "object" && typeof o.schema == "object") {
				utils.log("valid tracking data recieved");
			}
			else {
				utils.err("tracking data not valid!");
			}
		}
		catch(e) {
			utils.err("tracking data not valid: " + e + "\n" + data);
		}
	});
}

function getOfflineUrl(id) {
	env.run();
	var lm = getLmById(id,false);
	if (!lm) {
		if (!lm) {
			utils.err("no lm with id: " + id);
			return false;
		}
		
	}
	var player = (lm.scorm_version == "1.2") ? env.globals.player12 : env.globals.player2004;
	var url = env.globals.serverProtocol + "://" + env.globals.serverName + ":" + env.globals.serverPort + "/" + player + "?" + "client=" + lm.client + "&obj_id=" + lm.obj_id;
	return url;
}

function atoB(txt) {
	return base64.encode(txt);
}

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
	__exposedProps__ : {
		getOfflineUrl 	: "r",
		atoB		: "r",
		btoA		: "r",
		importLm	: "r",
		importTracking	: "r"
	}
}

exports.getAllLm = getAllLm;
exports.getLmById = getLmById;
exports.getLmsObj = getLmsObj;
exports.getLmsObj = getLmsObj;
exports.isImportRequest = isImportRequest;
exports.getOfflineUrl = getOfflineUrl;
exports.importTracking = importTracking;
exports.connectorFuncs = connectorFuncs;
exports.__exposedProps__["getAllLm"] = "r";
exports.__exposedProps__["getLmById"] = "r";
exports.__exposedProps__["getLmsObj"] = "r";
exports.__exposedProps__["isImportRequest"] = "r";
exports.__exposedProps__["importTracking"] = "r";
exports.__exposedProps__["connectorFuncs"] = "r";




