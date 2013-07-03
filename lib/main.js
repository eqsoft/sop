/**
 * Mandatory addon main class
 *  
 * The main class receives and emits all load and unload events like "startup, install, uninstall..." for all other classes
 * Therefore all other classes (env, som, gui, db, utils) needs to be included inside main.js after early binding of the events. 
 * 
 * See also: <a href="https://addons.mozilla.org/en-US/developers/docs/sdk/latest/dev-guide/tutorials/load-and-unload.html" target="_new">https://addons.mozilla.org/en-US/developers/docs/sdk/latest/dev-guide/tutorials/load-and-unload.html</a> 
 *   
 * @class main
 **/
'use strict';

module.metadata = {
  "stability": "unstable"
};

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

var	env 	= require("./env"),
	som 	= require("./som"),
	gui 	= require("./gui"),
	db 	= require("./db"),
	utils 	= require("./utils");

utils.log("main lib");
env.createHttpRequestObserver();
/**
 * @event install
 **/
/**
 * @event enable
 **/
/**
 * @event startup
 **/
 /**
 * @event uninstall
 **/
/**
 * @event disable
 **/
/**
 * @event shutdown
 **/
/**
 * The event may be fired on loading and unloading the addon. 
 * Therefore a load=true|false argument is added added on event emitting.
 * @event upgrade 
 **/
/**
 * The event may be fired on loading and unloading the addon. 
 * Therefore a load=true|false argument is added on event emitting.
 * @event downgrade 
 **/    
/**
 * The main function is executed after all required classes and all the other main.js code evaluation.
 * The option.loadReason events are emitted for other classes adding listeners like main.on("startup") or main.on("install").
 *
 * see also: <a href="https://addons.mozilla.org/en-US/developers/docs/sdk/latest/dev-guide/tutorials/load-and-unload.html" target="_new">https://addons.mozilla.org/en-US/developers/docs/sdk/latest/dev-guide/tutorials/load-and-unload.html</a>
 * 
 * @method main
 * @example main.on("startup", function(){ //do something }; )
 * @example main.on("downgrade", function(load){ if (load === true) { //do something }; })
 * @param {Object} options  
 * @param {Object} callbacks
 * 
 **/
function main (options, callbacks) {
	if (options && options.loadReason) {
		emit(exports,options.loadReason,true);
	}
}
require("sdk/system/unload").when(unload);
/**
 * The unload function is executed on unloading the addon.
 * All event reasons are emitted for other modules to add listeners like main.on("shutdown") or main.on("uninstall"))  
 * 
 * see also: <a href="https://addons.mozilla.org/en-US/developers/docs/sdk/latest/dev-guide/tutorials/load-and-unload.html" target="_new">https://addons.mozilla.org/en-US/developers/docs/sdk/latest/dev-guide/tutorials/load-and-unload.html</a>
 * 
 * @method unload
 * @example main.on("shutdown", function(){ //do something }; )
 * @example main.on("downgrade", function(load){ if (load === false) { //do something }; })
 * @param {String} reason  
 **/
function unload(reason) {
	if (reason) {
		emit(exports,reason,false);
	}
}

exports.main = main;
