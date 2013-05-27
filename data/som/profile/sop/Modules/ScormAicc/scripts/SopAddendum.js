function toJSONString (v, tab) {	tab = tab ? tab : "";	var nl = tab ? "\n" : "";	function fmt(n) {		return (n < 10 ? '0' : '') + n;	}	function esc(s) {		var c = {'\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"' : '\\"', '\\': '\\\\'};		return '"' + s.replace(/[\x00-\x1f\\"]/g, function (m) {			var r = c[m];			if (r) {				return r;			} else {				r = m.charAt(0);				return "\\u00" + (r < 16 ? '0' : '') + r.toString(16);			}		}) + '"';	}	switch (typeof v) {	case 'string':		return esc(v);	case 'number':		return isFinite(v) ? String(v) : 'null';	case 'boolean':		return String(v);	case 'object':		if (v===null) {			return 'null';		} else if (v instanceof Date) {			return '"' + v.getValue(v) + '"'; // msec not ISO		} else if (v instanceof Array) {			var ra = new Array();			for (var i=0, ni=v.length; i<ni; i+=1) {				ra.push(v[i]===undefined ? 'null' : toJSONString(v[i], tab.charAt(0) + tab));			}			return '[' + nl + tab + ra.join(',' + nl + tab) + nl + tab + ']';		} else {			var ro = new Array();			for (var k in v) {					if (v.hasOwnProperty && v.hasOwnProperty(k)) {					ro.push(esc(String(k)) + ':' + toJSONString(v[k], tab.charAt(0) + tab));				}			}			return '{' + nl + tab + ro.join(',' + nl + tab) + nl + tab + '}';		}	}}IliasCommit = function() {//	document.cookie="data2="+toJSONString(data);	var last_visited="", lmStatus="trac_in_progress", scoStatus="";	if (iv.b_autoLastVisited==true) last_visited=iv.launchId;	//compute overall status to be done 	if(ir.length==1) {		scoStatus=getValueIntern(iv.launchId,'cmi.core.lesson_status');	}	if (scoStatus=="completed" || scoStatus=="passed") lmStatus="trac_completed";	else if (scoStatus=="failed") lmStatus="trac_failed";	document.getElementById("lmStatus").innerHTML=lmStatus;	var dbResult = gui.setData("lmSetUser_dataAndLastVisitedAndStatusByClientAndObjId",[params.client,params.obj_id,toJSONString(data),last_visited,lmStatus]);	return dbResult;}