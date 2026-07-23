import http from 'k6/http';
import {check,sleep} from 'k6';
import {Counter,Rate} from 'k6/metrics';

const rejected=new Rate('vyra_ingest_rejected');
const accepted=new Counter('vyra_events_accepted');
export const options={
  scenarios:{
    live_events:{executor:'ramping-arrival-rate',startRate:10,timeUnit:'1s',preAllocatedVUs:50,maxVUs:500,stages:[
      {duration:'30s',target:100},{duration:'2m',target:500},{duration:'1m',target:1000},{duration:'30s',target:0}
    ]}
  },
  thresholds:{http_req_duration:['p(95)<250','p(99)<750'],http_req_failed:['rate<0.01'],vyra_ingest_rejected:['rate<0.01']}
};
const base=__ENV.VYRA_BASE_URL||'http://127.0.0.1:8088';
const workspace=__ENV.VYRA_WORKSPACE_ID;
const token=__ENV.VYRA_INGEST_TOKEN;
export function setup(){if(!workspace||!token)throw new Error('VYRA_WORKSPACE_ID och VYRA_INGEST_TOKEN krävs')}
export default function(){
  const id=`load-${__VU}-${__ITER}-${Date.now()}`,payload=JSON.stringify({id,type:'like',userId:`u-${__VU}`,username:`Load${__VU}`,count:1,at:Date.now()});
  const response=http.post(`${base}/api/events/tiktok/${workspace}`,payload,{headers:{'content-type':'application/json',authorization:`Bearer ${token}`},tags:{name:'tiktok-ingest'}});
  const ok=check(response,{'event accepted':r=>r.status===202||r.status===200});rejected.add(!ok);if(ok)accepted.add(1);sleep(.01);
}
