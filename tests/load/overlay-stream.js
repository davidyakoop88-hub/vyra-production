import http from 'k6/http';
import {check,sleep} from 'k6';
export const options={scenarios:{overlay_readers:{executor:'ramping-vus',startVUs:0,stages:[{duration:'30s',target:100},{duration:'2m',target:500},{duration:'1m',target:1000},{duration:'30s',target:0}]}},thresholds:{http_req_duration:['p(95)<300'],http_req_failed:['rate<0.01']}};
const base=__ENV.VYRA_BASE_URL||'http://127.0.0.1:8088',token=__ENV.VYRA_OVERLAY_TOKEN;
export function setup(){if(!token)throw new Error('VYRA_OVERLAY_TOKEN krävs')}
export default function(){const response=http.get(`${base}/api/overlay-access/${token}`,{tags:{name:'overlay-state'}});check(response,{'overlay available':r=>r.status===200});sleep(1+Math.random()*2)}
