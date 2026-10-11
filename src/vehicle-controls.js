import {clamp} from './core.js';

export const steeringValues={HARD_LEFT:-1,LEFT:-.55,SLIGHT_LEFT:-.2,TRIM_LEFT:-.07,STRAIGHT:0,TRIM_RIGHT:.07,SLIGHT_RIGHT:.2,RIGHT:.55,HARD_RIGHT:1};
const pedalValues={OFF:0,FEATHER:.12,LIGHT:.3,MEDIUM:.6,FULL:1};
const choose=(instructions,criteria)=>({type:'choice',instructions,criteria});
const yes=(instructions)=>({type:'noul',instructions});
const wheel=Object.fromEntries(Object.entries(steeringValues).map(([label,value])=>[label,value===0?'Front wheels straight.':`Turn the front wheels ${value<0?'left':'right'}: ${Math.abs(value)<.1?'tiny trim':Math.abs(value)<.3?'slight':Math.abs(value)<.8?'moderate':'full lock'}.`]));
const gas={OFF:'Release accelerator; coast or remain stopped.',FEATHER:'Barely press accelerator; creep.',LIGHT:'Light accelerator pressure; pull away gently.',MEDIUM:'Firm accelerator pressure; gain speed.',FULL:'Floor the accelerator; maximum acceleration.'};
const brake={OFF:'Release service brake.',FEATHER:'Barely press brake; trim speed.',LIGHT:'Light braking; slow smoothly.',MEDIUM:'Firm braking; slow quickly.',FULL:'Maximum braking; stop as quickly as tyres allow.'};
export const motionValues={COAST:{throttle:0,brake:0,gear:'KEEP'}};
const motions={COAST:'Release both pedals; retain gear. Does not move a stopped car.'};
for(const [label,value]of Object.entries(pedalValues)){
 if(label==='OFF')continue;
 motionValues['FORWARD_'+label]={throttle:value,brake:0,gear:'DRIVE'};motions['FORWARD_'+label]='Drive forward. '+gas[label];
 motionValues['REVERSE_'+label]={throttle:value,brake:0,gear:'REVERSE'};motions['REVERSE_'+label]='Reverse away from a blockage. '+gas[label];
 motionValues['BRAKE_'+label]={throttle:0,brake:value,gear:'KEEP'};motions['BRAKE_'+label]=brake[label];
}
function questionsFor(goal,steering,throttle,braking){
 return {
  steering:choose(`For ${goal}, which front-wheel position is appropriate now? ${steering} Target bearing: negative LEFT, positive RIGHT. vehicle.wheel_effects estimates each choice's heading change over the next control period. Use small corrections before yaw overshoots, not full lock for every turn. Wheels stay set until the next decision. Reversing turns the nose opposite the wheels.`,wheel),
  motion:choose(`For ${goal}, choose ONE longitudinal action for the next control period. ${throttle} ${braking} Use target.direction, contacts and clearance. Drive toward an ahead target. When stopped against a blockage, reposition using a clear reverse manoeuvre instead of repeatedly driving into it. Reverse needs accelerator; coasting does not move a stopped vehicle.`,motions),
  handbrake:choose('Should the rear-wheel brake be released, briefly pulsed, or held now?',{RELEASE:'Rear wheels roll freely: normal acceleration and cornering.',PULSE:'Brief rear lock to start a drift or rotate a tight turn.',HOLD:'Keep rear wheels locked to hold parking or sustain a drift.'})
 };
}
export const parkingQuestions=questionsFor('precise parking','Aim for the approach point, then align the whole vehicle with the bay.','Use creep and small corrections near the bay.','Stop fully once inside and aligned.');
export const slalomQuestions=questionsFor('a fast cone slalom','Aim through the next gate, preparing for the following gate.','Gain speed between gates, feather through changes of direction.','Brake before a gate when tyre grip cannot make the required turn.');
export const cityQuestions=questionsFor('city driving','Follow the street around blocks; account for beside/rear vehicles and pedestrians.','Make progress when the intersection and lane are clear.','Yield to crossing pedestrians, red signals and blocking vehicles.');
export const kartQuestions={...questionsFor('winning a combat kart race','Choose the racing trajectory through the next bend while overtaking rivals and reaching pickups.','Race at competitive pace; accelerate hard on usable straights and after turns. This is not a city street.','Brake for track boundaries and sharp corners; ordinary rival contact is a bump, not a mandatory stop.'),item:yes('Would activating the currently held item NOW improve the race? Use kart.held, nearby rivals and hazards: shell hits forward, oil hits followers, shield blocks attacks, boost accelerates. No held item means no.')};
export const vehicleQuestions=parkingQuestions;
export const modeQuestions=course=>({parking:parkingQuestions,slalom:slalomQuestions,city:cityQuestions,kart:kartQuestions}[course]||parkingQuestions);
export function decodeControls(answers){return {steer:steeringValues[answers.steering.choice],...motionValues[answers.motion.choice],handbrake:answers.handbrake.choice,item:answers.item?.noul>.5};}
// Legacy callers may still use pedal commands; the UI/model contract is always direct.
export function normalizeControls(c={},currentGear='DRIVE'){
 const p=c.pedal;
 return {steer:clamp(c.steer||0,-1,1),throttle:clamp(c.throttle??(['FORWARD','ACCELERATE','REVERSE','BOOST'].includes(p)?1:0),0,1),brake:clamp(c.brake??(p==='BRAKE'?1:0),0,1),gear:c.gear==='KEEP'?currentGear:c.gear??(p==='REVERSE'?'REVERSE':'DRIVE'),handbrake:c.handbrake||'RELEASE',item:!!c.item};
}
export function resetRecovery(w){w.recovery={attempts:0,reversing:false,lock:0,lockUntil:0,used:false,origin:null,forward:0,assists:0};}
export function recoverySteering(w,c,dt){
 if(!w.recovery)resetRecovery(w);const r=w.recovery,pos={x:w.course==='traffic'||w.course==='race'?(w.x-1)*3.5:w.x,z:w.z??-w.distance},reverse=c.gear==='REVERSE'&&c.throttle>0;
 const touching=(w.contacts?.size||0)>0;
 if(reverse&&!r.reversing){
  if(r.origin){const moved=Math.hypot(pos.x-r.origin.x,pos.z-r.origin.z);if(moved<5||touching)r.attempts++;else r.attempts=0;}
  r.origin=pos;r.forward=0;
  if(w.recoveryAssist&&r.attempts>=5&&!r.used){r.lock=-(Math.sign(w.steer)||Math.sign(c.steer)||1);r.lockUntil=w.time+1.4;r.used=true;r.assists++;}
 }
 r.reversing=reverse;
 if(!reverse||!w.recoveryAssist)r.lock=0;
 if(r.lock&&w.time>=r.lockUntil)r.lock=0;
 if(!reverse&&!touching&&w.speed>1){r.forward+=w.speed*dt;if(r.forward>8){r.attempts=0;r.origin=null;r.used=false;}}
 return r.lock||c.steer;
}
export function vehicleStep(w,dt,command){
 const c=normalizeControls(command,w.controls?.gear),requested=recoverySteering(w,c,dt),oldSpeed=w.speed;
 w.steer=(w.steer||0)+clamp(requested-(w.steer||0),-2.6*dt,2.6*dt);
 if(c.handbrake==='PULSE'&&w.lastHandbrake!=='PULSE')w.handbrakeUntil=w.time+.18;
 w.lastHandbrake=c.handbrake;const hb=c.handbrake==='HOLD'||w.time<(w.handbrakeUntil||0);
 const kart=w.course==='kart',direction=c.gear==='REVERSE'?-1:1,changing=direction*w.speed<-.25,drag=.25+.0009*w.speed*w.speed;
 const boost=w.course==='kart'&&w.time<(w.boostUntil||0);
 const braking=c.brake*(kart?15:11)+(hb?6:0)+(changing?10:0);
 const propulsion=!changing&&!hb?c.throttle*(direction<0?3.5:boost?18:kart?10:7):0;
 const movingSign=Math.sign(w.speed)||direction;
 w.speed=movingSign*Math.max(0,Math.abs(w.speed)+(propulsion*direction*movingSign-drag-braking)*dt);
 w.speed=clamp(w.speed,-7,boost?54:kart?44:52); // mechanical drivetrain limits, never a user success setting
 const v=(oldSpeed+w.speed)/2,wheel=w.steer*.62,desiredYaw=v/(kart?1.7:2.5)*Math.tan(wheel),gripYaw=(kart?16:10)/Math.max(1,Math.abs(v));
 // Bicycle yaw with finite tyre grip. Rear lock adds oversteer instead of instant rotation.
 const targetYaw=clamp(desiredYaw,-gripYaw,gripYaw)*(hb?1.3:1);
 w.yaw=(w.yaw||0)+(targetYaw-(w.yaw||0))*Math.min(1,dt*(hb?5:12));
 if(Math.abs(v)<.1)w.yaw=0;
 w.heading=Math.atan2(Math.sin((w.heading||0)+w.yaw*dt),Math.cos((w.heading||0)+w.yaw*dt));
 w.slip=(w.slip||0)+((hb?clamp(w.yaw*v*.035,-.28,.28):0)-(w.slip||0))*Math.min(1,dt*5);
 w.controls={...c,appliedSteer:w.steer,handbrakeActive:hb};w.boosting=boost;
 return {dx:Math.sin(w.heading-w.slip)*v*dt,dz:-Math.cos(w.heading-w.slip)*v*dt};
}
const round=x=>Math.round(x*10)/10;
export function wheelEffects(w){
 const period=clamp(w.reactionSeconds||.4,.1,2),kart=w.course==='kart',grip=(kart?16:10)/Math.max(1,Math.abs(w.speed));
 return {period_seconds:round(period),assumption:'Current speed, normal grip, steady steering; not a recommended action.',heading_change_deg:Object.fromEntries(Object.entries(steeringValues).map(([key,value])=>[key,round(clamp(w.speed/(kart?1.7:2.5)*Math.tan(value*.62),-grip,grip)*period*180/Math.PI)]))};
}
export function vehicleState(w){return {speed_kmh:round(w.speed*3.6),wheel:round(w.steer||0),yaw_deg_s:round((w.yaw||0)*180/Math.PI),gear:w.controls?.gear||'DRIVE',throttle:w.controls?.throttle||0,brake:w.controls?.brake||0,handbrake:!!w.controls?.handbrakeActive,stopping_distance_m:round(w.speed*w.speed/22+Math.abs(w.speed)*(w.reactionSeconds||.4)),dimensions_m:[1.8,w.course==='kart'?2.6:4.2],wheelbase_m:w.course==='kart'?1.7:2.5,wheel_effects:wheelEffects(w)};}
// Compact, labelled 360-degree observations, including every nearby cone and side car.
export function surroundings(car,objects,front=100,rear=40,side=45){
 const s=Math.sin(car.heading||0),c=Math.cos(car.heading||0),out=[];
 for(const o of objects){const dx=o.x-car.x,dz=o.z-car.z,f=dx*s-dz*c,r=dx*c+dz*s;if(f < -rear||f>front||Math.abs(r)>side)continue;
  const v=o.actualSpeed??o.speed??0,h=o.heading||0;
  out.push([o.id,o.kind,round(f),round(r),round(o.width||1.8),round(o.length||4.2),round(v*Math.cos(h-(car.heading||0))-car.speed),round(v*Math.sin(h-(car.heading||0))),round((h-(car.heading||0))*180/Math.PI)]);
 }
 out.sort((a,b)=>Math.hypot(a[2],a[3])-Math.hypot(b[2],b[3]));
 const half=car.course==='kart'?1.3:2.1,frontObjects=out.filter(o=>o[2]>=0&&Math.abs(o[3])<o[4]/2+.95),rearObjects=out.filter(o=>o[2]<0&&Math.abs(o[3])<o[4]/2+.95);
 const frontGap=Math.min(front,...frontObjects.map(o=>Math.max(0,o[2]-o[5]/2-half))),rearGap=Math.min(rear,...rearObjects.map(o=>Math.max(0,-o[2]-o[5]/2-half)));
 const names=['id','kind','forward_m','right_m','width_m','length_m','relative_forward_m_s','relative_right_m_s','heading_deg'];
 return {bumper_clearance_m:{front:round(frontGap),rear:round(rearGap)},range_m:{front,rear,side},objects:out.slice(0,40).map(row=>Object.fromEntries(names.map((name,i)=>[name,row[i]]))),truncated:out.length>40};
}
export function manoeuvrePreview(w,objects,edge){
 const out=[];
 for(const gear of [-1,1])for(const steer of [-.7,0,.7]){
  let x=w.x,z=w.z,h=w.heading||0,clear=0;
  for(let i=0;i<12;i++){h+=gear*.5/2.5*Math.tan(steer*.62);x+=Math.sin(h)*gear*.5;z-=Math.cos(h)*gear*.5;
   if(edge?.({x,z})||objects.some(o=>Math.hypot(x-o.x,z-o.z)<(o.kind==='cone'?1.45:Math.max(o.width||1.8,o.length||4.2)/2+1)))break;clear+=.5;
  }
  out.push([gear<0?'reverse':'drive',steer,clear,round(x-w.x),round(z-w.z)]);
 }
 return {columns:['gear','wheel','clear_m','end_dx','end_dz'],arcs:out};
}
