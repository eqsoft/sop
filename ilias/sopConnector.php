<?php
//header('Access-Control-Allow-Origin: *');
//header('Access-Control-Allow-Credentials: true');
//header('Access-Control-Allow-Methods: POST, GET, OPTIONS');

echo "<!DOCTYPE html>
<html>
	<head>
		<meta name=\"require-sop-version\" content=\">0.1\" />
		<script src=\"sopConnector.js\"></script>
		<title>CORS Test</title>
	</head>
	<body>
		<h3>CORS Test</h3>
		<div><input type=\"button\" value=\"open client0_205\" onclick=\"openLm('client0_205')\"/></div><br />
		<div><input type=\"button\" value=\"open client0_206\" onclick=\"openLm('client0_206')\"/></div><br />
		<div><input type=\"button\" value=\"import client0_205\" onclick=\"importLm('client0_205')\"/></div><br />
		<div><input type=\"button\" value=\"import client0_206\" onclick=\"importLm('client0_206')\"/></div><br />
		<div id=\"out\"></div>
	</body>
</html>"; 
exit;
 
?>
