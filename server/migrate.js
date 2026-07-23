'use strict';
const fs=require('fs'),path=require('path'),{pool}=require('./db');
(async()=>{try{const sql=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');await pool.query(sql);console.log(JSON.stringify({level:'info',event:'migration_complete',at:new Date().toISOString()}))}catch(error){console.error(JSON.stringify({level:'error',event:'migration_failed',message:error.message,at:new Date().toISOString()}));process.exitCode=1}finally{await pool.end()}})();
