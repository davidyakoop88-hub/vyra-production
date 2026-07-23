'use strict';
const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:Number(process.env.DB_POOL_SIZE||20),idleTimeoutMillis:30000,connectionTimeoutMillis:5000,ssl:process.env.DATABASE_SSL==='require'?{rejectUnauthorized:true}:false});
async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const out=await fn(c);await c.query('COMMIT');return out}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
module.exports={pool,tx};
