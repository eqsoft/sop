
var timeout = 5000;
var sopFound = false;
var counter = 0;
var importContentUrl = "http://192.168.0.94/ilias/trunk/importLm.php";


function checkSopVersion(v) {
	var metas = document.getElementsByTagName('meta');  
	for (var i=0; i<metas.length; i++) {
		if (metas[i].getAttribute("name") == "require-sop-version") {
			var reqV =  metas[i].getAttribute("content");
			//alert(v + reqV);
		} 
	}
}

var timer = setInterval(function() { 
	counter+=100;
	try {
		if (sopConnector) {
			sopFound = true;
			checkSopVersion(sopConnector.getSopVersion());
			//alert(sopConnector.getSopVersion());
		}
	}
	catch(e) {}
	finally {
		if (sopFound || counter > timeout) {
			clearInterval(timer);
		}
	}
} , 100);

function getOfflineUrl(id) {
	if (!sopFound) {
		alert("no sopConnector found!");
		return;
	}
	var url = sopConnector.getOfflineUrl(id);
	return url;
}

function openLm(id) {
	var url = getOfflineUrl(id);
	open(url,"SCORM Offline Player");
}

function importLm(id) { // url: network address for binary and async zip download
	var url = sopConnector.atoB(importContentUrl + '?id='+id);
	function handler(success) {
		alert(success);
	}
	sopConnector.importLm(id, url, handler);
	
}




