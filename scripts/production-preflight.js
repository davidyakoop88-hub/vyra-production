#!/usr/bin/env node
'use strict';
try{const result=require('../server/production-config').validateProductionEnv(process.env);console.log(JSON.stringify({ok:true,event:'production_preflight_passed',origin:result.origin,at:new Date().toISOString()}))}
catch(error){console.error(error.message);process.exit(1)}
