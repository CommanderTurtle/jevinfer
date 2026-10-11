// Opt-in, closed-loop synthetic driving. Reports behavior, not guaranteed policy quality.
import {Client} from '../src/core.js';
import {drivingQueries,applyRisk} from '../src/race-policy.js';
import {createWorld,stepWorld,drivingState,drivingQuestions} from '../src/race-physics.js';
import {createCourse,stepCourse,courseState,courseQuestions,routeQuestions,steeringValues} from '../src/race-course.js';
const url=process.env.JEV_ENDPOINT;
if(!url)throw Error('Set JEV_ENDPOINT to the local NInfer origin.');
const steps=Number(process.env.JEV_DRIVE_STEPS||60);
if(!Number.isInteger(steps)||steps<1||steps>1000)throw Error('JEV_DRIVE_STEPS must be 1–1000.');
const client=new Client({url,key:process.env.JEV_API_KEY,protocol:process.env.JEV_PROTOCOL||'systemone',timeout:15});
const all=['low','medium','high','parking','slalom','kart','city'];
const selected=process.env.JEV_DRIVE_CASES?.split(',')||all;
if(selected.some(x=>!all.includes(x)))throw Error('Unknown driving case.');
for(const scenario of selected){
 const road=['low','medium','high'].includes(scenario),tracking=!road&&scenario!=='parking'&&process.env.JEV_DRIVE_STEERING!=='direct',w=road?createWorld('traffic',160,scenario):createCourse(scenario,'medium',160),latencies=[];
 try{
  for(let i=0;i<steps&&!w.finished;i++){
   const state=road?drivingState(w):courseState(w);state.steering_control=tracking?'route_tracker':road?'lane_change':'direct_wheel';
   const r=await client.infer(state,drivingQueries(road?drivingQuestions:tracking?routeQuestions:courseQuestions,process.env.JEV_DRIVE_RISK!=='0'));latencies.push(r.ms);
   // 200 ms simulated control step, matching the default UI target; wall latency
   // is reported separately. This is not a browser/rendering speed benchmark.
   if(road){const pedal=applyRisk(r.answers.throttle.choice,r.answers.imminent_collision?.noul,w.speed);for(let k=0;k<24;k++)stepWorld(w,1/120,['LEFT','CENTER','RIGHT'].indexOf(r.answers.lane.choice),pedal);}
   else stepCourse(w,.2,{...(tracking?{line:['LEFT','CENTER','RIGHT'].indexOf(r.answers.steering.choice)-1}:{steer:steeringValues[r.answers.steering.choice]}),pedal:applyRisk(r.answers.pedal.choice,r.answers.imminent_collision?.noul,w.speed)});
  }
  const sorted=[...latencies].sort((a,b)=>a-b);
  console.log(JSON.stringify({scenario,ok:true,decisions:latencies.length,simulated_seconds:+w.time.toFixed(1),distance_m:+w.distance.toFixed(1),collisions:w.hits,finished:w.finished,gates:w.gate,missed:w.missed,lap:w.lap,violations:w.violations,median_ms:Math.round(sorted[Math.floor(sorted.length/2)]),p95_ms:Math.round(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))])}));
 }catch(e){console.error(JSON.stringify({scenario,ok:false,completed:latencies.length,error:e.message}));process.exitCode=1;break;}
}
