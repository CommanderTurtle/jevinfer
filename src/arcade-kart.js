import {clamp,choice} from './core.js';
import {createCourse,pathPoint,updateActors,projectPath} from './race-course.js';
import {sweptContact} from './race-physics.js';
import {stepItems,itemState} from './kart-items.js';

const lanes=['LEFT','CENTER','RIGHT'];
export const kartQuestions={
 lane:choice('Choose an absolute track lane. Avoid occupied lanes and crossing an occupied middle lane. Seek available item boxes and overtake rivals when clear. The arcade track curves automatically for every racer; you choose lateral movement, not a steering angle.',lanes),
 throttle:choice('Accelerate to overtake on a clear line. Coast or brake when a rival blocks the line and there is no safe adjacent lane. Weapons are controlled independently.',['ACCELERATE','COAST','BRAKE'])
};
export const trackGap=(w,s)=>{let d=(s-w.progress)%w.path.length;if(d>w.path.length/2)d-=w.path.length;if(d< -w.path.length/2)d+=w.path.length;return d;};
function position(w){const p=pathPoint(w.path,w.progress);w.x=p.x+Math.cos(p.heading)*w.laneOffset;w.z=p.z+Math.sin(p.heading)*w.laneOffset;w.heading=p.heading;w.pathS=p.s;}
export function createArcadeKart(density='medium'){
 const w=createCourse('kart',density);Object.assign(w,{arcade:true,laneOffset:0,lane:1,limit:32});position(w);return w;
}
export function arcadeKartState(w){
 const relative=o=>({id:o.id,gap:trackGap(w,o.s),offset:o.offset,speed:o.actualSpeed??o.speed});
 const rivals=w.objects.map(relative).filter(o=>o.gap>=-30&&o.gap<=160);
 return {task:'Win the three-lap arcade kart race. Collect and use items, overtake, and avoid contact.',control:'Three track-relative lanes plus accelerator/coast/brake. All racers follow the circuit; there is no free-wheel steering in this mode.',
  current_lane:lanes[Math.round(w.laneOffset/3+1)],lateral_position:w.laneOffset/3+1,speed_kmh:Math.round(w.speed*3.6),lane_change_seconds:.5,
  control_period_seconds:w.reactionSeconds||.3,sensor_range_m:160,rear_sensor_range_m:30,
  lanes:lanes.map((lane,i)=>{const offset=(i-1)*3,cars=rivals.filter(o=>Math.abs(o.offset-offset)<1.7),next=cars.filter(o=>o.gap>=0).sort((a,b)=>a.gap-b.gap)[0],rear=cars.filter(o=>o.gap<0).sort((a,b)=>b.gap-a.gap)[0];return {lane,clearance_m:next?+next.gap.toFixed(1):160,alongside:cars.some(o=>Math.abs(o.gap)<3),rear_gap_m:rear?+(-rear.gap).toFixed(1):null,rear_closing_m_s:rear?+(rear.speed-w.speed).toFixed(1):null,time_to_contact_seconds:next&&w.speed>next.speed?+Math.max(0,(next.gap-2.6)/(w.speed-next.speed)).toFixed(2):null};}),
  kart:itemState(w),item_boxes:w.pickups.filter(p=>p.readyAt<=w.time).map(p=>{const t=projectPath(w.path,p);return {gap_m:+trackGap(w,t.s).toFixed(1),lane:'CENTER'};}).filter(p=>p.gap_m>=0&&p.gap_m<100)};
}
export function stepArcadeKart(w,elapsed,target=1,throttle='COAST',weapon={}){
 if(w.finished||!Number.isFinite(elapsed)||elapsed<=0)return;
 let remaining=Math.min(elapsed,1),item=!!weapon.item;
 while(remaining>1e-8&&!w.finished){
  const dt=Math.min(remaining,1/120);remaining-=dt;w.time+=dt;w.flash=Math.max(0,w.flash-dt);
  const oldOffset=w.laneOffset,oldProgress=w.progress,oldSpeed=w.speed;
  const rivals=w.objects.map(o=>({o,gap:trackGap(w,o.s)}));updateActors(w,dt);
  const boost=w.time<(w.boostUntil||0),stunned=w.time<(w.stunUntil||0);
  w.speed=clamp(w.speed+(stunned?-12:throttle==='ACCELERATE'?boost?13:8:throttle==='BRAKE'?-15:-2)*dt,0,boost?42:32);
  let offset=clamp(oldOffset+clamp((clamp(target,0,2)-1)*3-oldOffset,-6*dt,6*dt),-3,3),travel=(oldSpeed+w.speed)*dt*.5;
  let first=null;const touching=new Set();
  for(const {o,gap} of rivals){const end=gap+(o.actualSpeed??o.speed)*dt-travel,hit=sweptContact(oldOffset-o.offset,-gap,offset-o.offset,-end,1.7,2.6);if(hit!==null&&(!first||hit<first.hit))first={o,gap,hit};if(w.contacts.has(o.id)&&Math.abs(offset-o.offset)<1.85&&Math.abs(end)<2.9)touching.add(o.id);}
  if(first){const {o,gap,hit}=first;
   const x=oldOffset+(offset-oldOffset)*hit-o.offset,z=gap+((o.actualSpeed??o.speed)*dt-travel)*hit;
   if(Math.abs(Math.abs(z)-2.6)<Math.abs(Math.abs(x)-1.7)){travel*=Math.max(0,hit-.001);w.speed=Math.min(w.speed,o.actualSpeed??o.speed)*.8;}
   else offset=oldOffset+(offset-oldOffset)*Math.max(0,hit-.001);
   touching.add(o.id);if(!w.contacts.has(o.id)){w.hits++;w.flash=.4;}
  }
  w.contacts=touching;w.laneOffset=offset;w.lane=offset/3+1;w.progress=oldProgress+travel;w.distance+=travel;position(w);
  stepItems(w,dt,{item,itemTarget:weapon.target});item=false;
  w.lap=Math.floor((w.progress-w.startS)/w.path.length)+1;
  if(w.lap>w.laps){w.finished=true;w.speed=0;}
 }
}
