'use strict';

module.metadata = {
  "stability": "unstable"
};

var { emit, on, once, off } = require("sdk/event/core");
exports.on = on.bind(null, exports); // early binding of "on" and "removeListener" event handler
exports.removeListener = function removeListener(type, listener) {
	off(exports, type, listener);
};

exports.__exposedProps__ = { // early exposing of "on" and "removeListener" event handler
	on 		: "rw",
	removeListener	: "rw"
};

var env = require("./env");
var som = require("./som");
var gui = require("./gui");
var db = require("./db");

require("sdk/system/unload").when(unload);
	
function main (options, callback) {
	if (options && options.loadReason) {
		emit(exports,options.loadReason);
	} 
}

function unload(reason) {
	if (reason) {
		emit(exports,reason);
	}
}

exports.main = main;
exports.on = on.bind(null, exports);
exports.removeListener = function removeListener(type, listener) {
	off(exports, type, listener);
};



