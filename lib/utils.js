/**
 * Utilities class
 *  
 * @class utils
 **/ 
'use strict';
const {Cc, Ci, Cu, Cr, Cm} = require("chrome");

var system = require("sdk/system");
var windows = require("sdk/windows").browserWindows;
var winutils = require('sdk/window/utils');

Cu.import("resource://gre/modules/FileUtils.jsm");
module.metadata = {
  "stability": "unstable"
};
/**
 * log message to console
 * 
 * @public
 * @method log
 * @param {String} msg
 **/
function log(msg) {
	console.log(msg);
	if (system.name == "Fennec") {
		console.error("log: "  + msg);
	}
}

/**
 * log error to console
 * 
 * @public
 * @method err
 * @param {String} msg
 **/
function err(msg) {
	if (isMobile()) {  // bug in fennec: no normal messages are displayed only errors
		console.error("error: "  + msg);
	}
	else {
		console.error(msg);
	}
}

/**
 * return true if obj contains a
 * 
 * @public
 * @method contains
 * @param {Object} a to search for 
 * @param {Object} obj to search in
 * @return {Boolean} true if obj contains a
 **/
function contains(a, obj) {
    for (var i = 0; i < a.length; i++) {
        if (a[i] === obj) {
            return i;
        }
    }
    return -1;
}

/**
 * return true if sop is running on a mobile device (Browser: Fennec)
 * 
 * @public
 * @method isMobile
 * @return {Boolean} true if sop is running on a mobile device (Browser: Fennec)
 **/
function isMobile() {
	return (system.name == "Fennec");
}

// zip functions 

/**
 * unzip package to directory
 * 
 * @public
 * @method extractFiles
 * @param {nsILocalFile} aZipFile  source zip file
 * @param {nsIFile} aDir target directory
 */ 
function extractFiles (aZipFile, aDir) {
	function getTargetFile(aDir, entry) {
		
		let target = aDir.clone();
		entry.split("/").forEach(function(aPart) {
			target.append(aPart);
		});
		return target;
	}

	let zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
  
	try {
		zipReader.open(aZipFile);
	}
	catch (e) {
		var msg = "File:" + aZipFile.path + "\n\n is either broken or not a ZIP file.";
		err(msg);
		//var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
		//prompts.alert(null, "Unzip", "File:" + aZipFile.path + "\n\n is either broken or not a ZIP file.");
		return;
  	 }
  	  
	try { 	// create directories first
		let entries = zipReader.findEntries("*/");
		while (entries.hasMore()) {
			var entryName = entries.getNext();
			let target = getTargetFile(aDir, entryName);
			if (!target.exists()) {
				try {
					target.create(Ci.nsIFile.DIRECTORY_TYPE,
					FileUtils.PERMS_DIRECTORY);
				}
				catch (e) {
					err(e);         
					err("extractFiles: failed to create target directory for " +
						"extraction file = " + target.path);
				}
			}
		}

		entries = zipReader.findEntries(null);
		while (entries.hasMore()) {
			let entryName = entries.getNext();
			let target = getTargetFile(aDir, entryName);
			//log("target:" + target.path);
			//log("entry:" + entryName);
			if (target.exists()) {
				continue;
			}
			try {
				zipReader.extract(entryName, target);
				target.permissions |= FileUtils.PERMS_FILE;
			}
			catch (e) {
				err(e);
				//err("Failed to set permissions " + aPermissions.toString(8) + " on " + target.path);
			}
		}
	}
	finally {
		zipReader.close();
		/*
		var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService); // Fehlermeldung
		var result = prompts.confirm(null, "Open Directory", "Do you want to open the new unzipped directory?");    
		if(result) {
			aDir.reveal();
		}
		*/ 
	}
}


/**
 * shows FilePicker and extract zip to a folder (not used) 
 * 
 * @method showPicker
 **/ 
function showPicker() {
	var nsIFilePicker = Ci.nsIFilePicker;
	var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	//var selectStr = document.getElementById("unzip-properties").getString("unzip.select");
	var selectStr = "select";
	var win = winutils.getMostRecentBrowserWindow();
	fp.init( win, selectStr, nsIFilePicker.modeOpen);
	var rv = fp.show();
	if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
		var file = fp.file;
		var uri = Services.io.newFileURI(file);
		// url is a nsIURI; 
		var url = uri.QueryInterface(Ci.nsIURL);
		var name=url.fileBaseName;
		var parent = file.parent;             
		extractFiles(file,parent);
	}
}

/**
 * returns true if a key exists in an object
 * 
 * @public
 * @method findIn
 * @param {Object} obj
 * @param {String|Integer} key
 * @return true if a key exists in an object
 **/ 
function findIn(obj,key) {
	return key.findIn(obj);
}

String.prototype.findIn = function (multi) {
    multi = multi || '';
    var val = this.valueOf();
    if(typeof multi == 'object' || typeof multi == 'array')
    {
        if(val in multi)
        {
            return multi[val];
        }
        else
        {
            for(var x in multi)
            {
                var found = this.findIn(multi[x]);
                if(found != false)
                {
                    return found;
                }
            }
        }
    }
    return false;
};

exports.log = log;
exports.err = err;
exports.contains = contains;
exports.isMobile = isMobile;
exports.extractFiles = extractFiles;
exports.findIn = findIn;

exports.__exposedProps__ = {
	log 		: "r",
	err		: "r",
	contains	: "r",
	isMobile	: "r",
	extractFiles	: "r",
	findIn		: "r"
};
