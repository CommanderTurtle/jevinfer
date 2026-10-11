// Opt-in, closed-loop synthetic driving. Reports behavior, not guaranteed policy quality.
import {Client} from '../src/core.js';
import {modeQuestions,decodeControls} from '../src/vehicle-controls.js';
import {createWorld,stepWorld,drivingState,drivingQuestions} from '../src/race-physics.js';
import {createCourse,stepCourse,courseState} from '../src/race-course.js';
import {createBoat,stepBoat,boatState,boatQuestions,decodeBoat} from '../src/boat-physics.js';
const url=process.env.JEV_ENDPOINT;
if(!url)throw Error('Set JEV_ENDPOINT to the local NInfer origin.');
const steps=Number(process.env.JEV_DRIVE_STEPS||60);
if(!Number.isInteger(steps)||steps<1||steps>1000)throw Error('JEV_DRIVE_STEPS must be 1–1000.');
const fixed=process.env.JEV_DRIVE_FIXED_STEP==='1',seconds=Number(process.env.JEV_DRIVE_SECONDS||60);
if(!Number.isFinite(seconds)||seconds<=0||seconds>600)throw Error('JEV_DRIVE_SECONDS must be >0 and <=600.');
const client=new Client({url,key:process.env.JEV_API_KEY,protocol:process.env.JEV_PROTOCOL||'systemone',timeout:15});
const all=['low','medium','high','parking','slalom','kart','city','pirate'];
const selected=process.env.JEV_DRIVE_CASES?.split(',')||all;
if(selected.some(x=>!all.includes(x)))throw Error('Unknown driving case.');
for(const scenario of selected){
 const boat=scenario==='pirate',road=['low','medium','high'].includes(scenario),w=boat?createBoat():road?createWorld('traffic',160,scenario):createCourse(scenario,'medium',160),latencies=[];
 if(boat)w.time=5;
 let command=boat?{sail:0}:road?{lane:1,throttle:'COAST'}:{throttle:0,brake:0,steer:0};
 const started=performance.now();let last=started;
 function advance(dt){
  if(boat)stepBoat(w,dt,command);
  else if(road)while(dt>0){const d=Math.min(dt,1/120);stepWorld(w,d,command.lane,command.throttle);dt-=d;}
  else stepCourse(w,dt,command);
 }
 // Real-time is the default: the previous actuators remain applied while HTTP
 // is pending. Fixed-step mode is only for reproducible policy diagnostics.
 const timer=fixed?null:setInterval(()=>{const now=performance.now();advance((now-last)/1000);last=now;},8);
 try{
  for(let i=0;i<steps&&!w.finished&&(fixed||performance.now()-started<seconds*1000);i++){
   const state=boat?boatState(w):road?drivingState(w):courseState(w);state.steering_control=boat?'rudder':road?'lane_change':'direct_wheel';
   const r=await client.infer(state,boat?boatQuestions:road?drivingQuestions:modeQuestions(scenario));latencies.push(r.ms);
   command=boat?decodeBoat(r.answers):road?{lane:['LEFT','CENTER','RIGHT'].indexOf(r.answers.lane.choice),throttle:r.answers.throttle.choice}:decodeControls(r.answers);
   w.reactionSeconds=fixed?.2:r.ms/1000;
   if(fixed)advance(.2);
   w.recentControls=[...(w.recentControls||[]),{at:+w.time.toFixed(2),command,speed_kmh:Math.round(w.speed*3.6),contacts:w.hits}].slice(-2);
   if(process.env.JEV_DRIVE_TRACE==='1'&&i%10===0)console.log(JSON.stringify({scenario,step:i,speed:w.speed,position:[w.x,w.z],target:state.target,controls:boat||road?r.answers:decodeControls(r.answers)}));

  }
  const sorted=[...latencies].sort((a,b)=>a-b);
  console.log(JSON.stringify({scenario,ok:true,timing:fixed?'fixed-step':'real-time',wall_seconds:+((performance.now()-started)/1000).toFixed(1),decisions:latencies.length,simulated_seconds:+w.time.toFixed(1),distance_m:+w.distance.toFixed(1),collisions:w.hits,finished:w.finished,gates:w.gate,missed:w.missed,lap:w.lap,violations:w.violations,hull:w.hull,disabled:w.disabled,shots:w.shots,items:w.itemCount,items_used:w.itemsUsed,recovery_assists:w.recovery?.assists,median_ms:Math.round(sorted[Math.floor(sorted.length/2)]),p95_ms:Math.round(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))])}));
 }catch(e){console.error(JSON.stringify({scenario,ok:false,completed:latencies.length,error:e.message}));process.exitCode=1;break;}finally{clearInterval(timer);}
}
