// Opt-in, closed-loop synthetic driving. Reports behavior, not guaranteed policy quality.
import {Client} from '../src/core.js';
import {drivingQueries,applyRisk} from '../src/race-policy.js';
import {createWorld,stepWorld,drivingState,drivingQuestions} from '../src/race-physics.js';
import {createCourse,stepCourse,courseState,courseQuestions,routeQuestions,steeringValues} from '../src/race-course.js';
import {createBoat,stepBoat,boatState,boatQuestions} from '../src/boat-physics.js';
const url=process.env.JEV_ENDPOINT;
if(!url)throw Error('Set JEV_ENDPOINT to the local NInfer origin.');
const steps=Number(process.env.JEV_DRIVE_STEPS||60);
if(!Number.isInteger(steps)||steps<1||steps>1000)throw Error('JEV_DRIVE_STEPS must be 1–1000.');
const client=new Client({url,key:process.env.JEV_API_KEY,protocol:process.env.JEV_PROTOCOL||'systemone',timeout:15});
const all=['low','medium','high','parking','slalom','kart','city','pirate'];
const selected=process.env.JEV_DRIVE_CASES?.split(',')||all;
if(selected.some(x=>!all.includes(x)))throw Error('Unknown driving case.');
for(const scenario of selected){
 const boat=scenario==='pirate',road=['low','medium','high'].includes(scenario),tracking=!boat&&!road&&scenario!=='parking'&&process.env.JEV_DRIVE_STEERING!=='direct',w=boat?createBoat():road?createWorld('traffic',160,scenario):createCourse(scenario,'medium',160),latencies=[];
 if(boat)w.time=5;
 try{
  for(let i=0;i<steps&&!w.finished;i++){
   const state=boat?boatState(w):road?drivingState(w):courseState(w);state.steering_control=boat?'rudder':tracking?'route_tracker':road?'lane_change':'direct_wheel';
   const r=await client.infer(state,boat?boatQuestions:drivingQueries(road?drivingQuestions:tracking?routeQuestions:courseQuestions,process.env.JEV_DRIVE_RISK!=='0'));latencies.push(r.ms);
   // 200 ms simulated control step, matching the default UI target; wall latency
   // is reported separately. This is not a browser/rendering speed benchmark.
   if(boat)stepBoat(w,.2,{steer:['LEFT','CENTER','RIGHT'].indexOf(r.answers.rudder.choice)-1,pedal:r.answers.sail.choice,fire:['LEFT','HOLD','RIGHT'].indexOf(r.answers.cannons.choice)-1});
   else if(road){const pedal=applyRisk(r.answers.throttle.choice,r.answers.imminent_collision?.noul,w.speed);for(let k=0;k<24;k++)stepWorld(w,1/120,['LEFT','CENTER','RIGHT'].indexOf(r.answers.lane.choice),pedal);}
   else stepCourse(w,.2,{...(tracking?{line:['LEFT','CENTER','RIGHT'].indexOf(r.answers.steering.choice)-1}:{steer:steeringValues[r.answers.steering.choice]}),pedal:applyRisk(r.answers.pedal.choice,r.answers.imminent_collision?.noul,w.speed)});
  }
  const sorted=[...latencies].sort((a,b)=>a-b);
  console.log(JSON.stringify({scenario,ok:true,decisions:latencies.length,simulated_seconds:+w.time.toFixed(1),distance_m:+w.distance.toFixed(1),collisions:w.hits,finished:w.finished,gates:w.gate,missed:w.missed,lap:w.lap,violations:w.violations,hull:w.hull,disabled:w.disabled,shots:w.shots,median_ms:Math.round(sorted[Math.floor(sorted.length/2)]),p95_ms:Math.round(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))])}));
 }catch(e){console.error(JSON.stringify({scenario,ok:false,completed:latencies.length,error:e.message}));process.exitCode=1;break;}
}
