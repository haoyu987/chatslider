/*
 * spa.js
 * Root namespace module
 */

var spa = (function () {
	'use strict';
	var initModule = function ( $container ) {
		spa.data.initModule();
		spa.model.initModule();
		spa.shell.initModule( $container );
	};
	
	return { initModule: initModule };
}());