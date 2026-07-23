import http from 'k6/http';
import {check,sleep} from 'k6';
import {Rate} from 'k6/metrics';
const failures=new Rate('vyra_failures');
export const options={scenarios:{public_api:{executor:'ramping-vus',startVUs:0,stages:[{duration:'30s',target:50},{duration:'1m',target:200},{duration:'1m',target:500},{duration:'30s',target:0}],gracefulRampDown:'15s'}},thresholds:{http_req_duration:['p(95)<300','p(99)<800'],http_req_failed:['rate<0.01'],vyra_failures:['rate<0.01']}};
const base=__ENV.VYRA_BASE_URL||'http://127.0.0.1:8088';
export default function(){const live=http.get(`${base}/health/live`,{tags:{name:'health-live'}}),ok=check(live,{'liveness 200':r=>r.status===200,'JSON response':r=>r.json('status')==='live'});failures.add(!ok);sleep(.2+Math.random()*.8)}

