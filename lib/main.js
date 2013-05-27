'use strict';

module.metadata = {
  "stability": "unstable"
};
const windows = require("sdk/windows").browserWindows;
const tabs = require("sdk/tabs");
const som = require("./som");
const utils = require("./utils");

windows.on('open', som.onWinOpen );
windows.on('close', som.onWinClose );
windows.on('activate', som.onWinActivate );
windows.on('deactivate', som.onWinDectivate );
tabs.on('ready', som.onTabReady );
tabs.on('close', som.onTabClose );
tabs.on('activate', som.onTabActivate );
tabs.on('deactivate', som.onTabDectivate );

var loadReasons = {
	install : som.install,
	enable : som.enable,
	startup : som.startup,
	upgrade : som.upgrade,
	downgrade : som.downgrade
}

var unloadReasons = {
	uninstall : som.uninstall,
	disable : som.disable,
	shutdown : som.shutdown,
	upgrade : som.upgrade,
	downgrade : som.downgrade
}

require("sdk/system/unload").when(unload);
	
function main (options, callback) {
	try {
		if (options && options.loadReason) {
			loadReasons[options.loadReason].call(null, options, callback);
		} 
	}
	catch (e) {
		utils.err(e);
	}
}

function unload(reason) {
	try {
		unloadReasons[reason].call(null, reason); 
	}
	catch (e) {
		utils.err(e);
	}
}

exports.main = main;
