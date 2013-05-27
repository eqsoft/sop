@echo off
echo function iliasApi() { > SOP12API.js
echo var SOP=true; >> SOP12API.js
echo // ====== start basisAPI.js ========== >> SOP12API.js
type basisAPI.js  >> SOP12API.js
echo // ====== end basisAPI.js ========== >> SOP12API.js
echo // ====== start SCORM1_2standard.js ========== >> SOP12API.js
type SCORM1_2standard.js >> SOP12API.js
echo // ====== end SCORM1_2standard.js ========== >> SOP12API.js
echo // ====== start SopAddendum.js ========== >> SOP12API.js
type SopAddendum.js >> SOP12API.js
echo // ====== end SopAddendum.js ========== >> SOP12API.js
echo } >> SOP12API.js
