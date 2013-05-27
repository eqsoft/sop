'use strict';
const {Cc, Ci, Cu, Cr, Cm} = require("chrome");

const system = require("sdk/system");
Cu.import("resource://gre/modules/FileUtils.jsm");
module.metadata = {
  "stability": "unstable"
};

function log(msg) {
	console.log(msg);
	if (system.name == "Fennec") {
		console.error("log: "  + msg);
	}
}

function err(msg) {
	if (system.name == "Fennec") {
		console.error("error: "  + msg);
	}
	else {
		console.error(msg);
	}
}

function contains(a, obj) {
    for (var i = 0; i < a.length; i++) {
        if (a[i] === obj) {
            return i;
        }
    }
    return -1;
}

function isMobile() {
	return (system.name == "Fennec");
}

/**
 * zip functions
 */ 

/**
 * @description unzip package to directory
 * @param aZipFile nsILocalFile source zip file
 * @param aDir nsIFile target directory
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
		/*
		parent.append(name);
		var extractDir= uniqueFile(parent);
		*/ 
		//var extractDir = Components.classes["@mozilla.org/file/directory_service;1"]
		//				.getService(Components.interfaces.nsIProperties).get("Desk", Components.interfaces.nsIFile);
		//extractDir.append(name);
		//log(extractDir.path);                
		extractFiles(file,parent);
	}
}

function uniqueFile (aLocalFile) {
	var collisionCount = 0;
	while (aLocalFile.exists()) {
		collisionCount++;
		if (collisionCount == 1) {
			// Append "(2)" before the last dot in (or at the end of) the filename
			// special case .ext.gz etc files so we don't wind up with .tar(2).gz
			if (aLocalFile.leafName.match(/\.[^\.]{1,3}\.(gz|bz2|Z)$/i)) {
				aLocalFile.leafName = aLocalFile.leafName.replace(/\.[^\.]{1,3}\.(gz|bz2|Z)$/i, "(2)$&");
			}
			else {
				aLocalFile.leafName = aLocalFile.leafName.replace(/(\.[^\.]*)?$/, "(2)$&");
			}
		}
		else {
			// replace the last (n) in the filename with (n+1)
			aLocalFile.leafName = aLocalFile.leafName.replace(/^(.*\()\d+\)/, "$1" + (collisionCount + 1) + ")");
		}
	}
	return aLocalFile;
}

function addExposedProps(obj) {
	var key, i;
	if (typeof(obj) === 'undefined' || obj === null) {
		return;
	}
	// Note that this code path is for Objects and Arrays
	if (typeof(obj) === 'object') {
		if (!('__exposedProps__' in obj)) {
			obj['__exposedProps__'] = {};
		}
		// WARNING: I don’t actually use this if-block in my code, since it doesn’t work.
		// But for interest’s sake…
		/*
		if (Array.isArray(obj)) {
			obj['__exposedProps__']['length'] = 'rw';
		}
		*/ 
		for (key in obj) {
			if (key === '__exposedProps__') {
			continue;
		}
		obj['__exposedProps__'][key] = 'rw';
		addExposedProps(obj[key]);
		}
	}
}
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
exports.addExposedProps = addExposedProps;
exports.findIn = findIn;

exports.__exposedProps__ = {
	log 		: "r",
	err		: "r",
	findIn		: "r"
};
