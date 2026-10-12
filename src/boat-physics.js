import {clamp,choice} from './core.js';

export const boardingSeconds=3.5;
export const hullStrength=1.3;
export const panicCooldownSeconds=80;
export function panicAvailable(w){return !w.finished&&w.time>=5&&w.time>=(w.panicReadyAt||0)&&w.police.some(p=>p.hull>0&&p.boarding>=boardingSeconds-1&&p.boarding<boardingSeconds&&Math.hypot(p.x-w.x,p.z-w.z)<10);}
export function panicContract(w){
 if(!panicAvailable(w))return null;
 const remaining=boardingSeconds-Math.max(...w.police.filter(p=>p.hull>0).map(p=>p.boarding||0)),at=w.time;
 return {state:{event:'Final-second boarding emergency',seconds_to_defeat:+remaining.toFixed(3),action:'Fire a radial cannon volley to interrupt boarding. Physical projectiles, no invulnerability.',cooldown_seconds:panicCooldownSeconds},
  questions:{panic_fire:{type:'noul',instructions:`Fire the available emergency all-direction cannon volley NOW to interrupt imminent boarding defeat? It is available only during this final second and then has an ${panicCooldownSeconds}-second cooldown.`}},
  valid:current=>current.time-at<1&&panicAvailable(current)};
}
export const seaWaves=[[.52,.055,.027,1.1],[.25,-.09,.06,1.7],[.12,.18,.12,2.4]];
export function seaHeight(x,z,t){return seaWaves.reduce((v,[a,kx,kz,s])=>v+a*Math.sin(x*kx+z*kz-t*s),0);}
export function waterHeight(w,x,z){const scale=1+w.waves.reduce((n,p)=>n+Math.max(0,1-Math.hypot(x-p.x,z-p.z)/p.radius)**2*3,0);return seaHeight(x,z,w.time)*scale;}
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const round=x=>Math.round(x*10)/10;
export function createBoat(density='medium',limit=160){
 const count={low:2,medium:4,high:6}[density]||4;
 return {course:'pirate',density,limit:limit/3.6,x:0,z:0,heading:0,yaw:0,speed:0,time:0,distance:0,hits:0,flash:0,passed:0,finished:false,failed:false,hull:100,lastCombatAt:0,repairAt:4,island:{x:0,z:-12000,radius:350},reinforcements:0,reinforcementAt:0,seaUpdateAt:0,shots:0,disabled:0,fireAt:-10,fireSide:0,cooldown:0,reloads:{left:0,right:0},boarding:0,contacts:new Set(),balls:[],bursts:[],trail:[],trailAt:0,police:Array.from({length:count},(_,i)=>({id:i,x:(i%2?1:-1)*(45+i*12),z:-12-i*14,heading:0,speed:8,hull:3,variant:i%3})),waves:Array.from({length:18},(_,i)=>({x:Math.sin(i*2.1)*75,z:-110-i*85,radius:12+i%3*3})),sensorRange:160};
}
export const rudderValues={HARD_LEFT:-1,LEFT:-.5,TRIM_LEFT:-.15,CENTER:0,TRIM_RIGHT:.15,RIGHT:.5,HARD_RIGHT:1};
export const sailValues={FURL:0,QUARTER:.25,HALF:.5,FULL:1};
export const boatQuestions={
 rudder:{type:'choice',instructions:'Steer toward the distant island while evading police, exposing broadsides and avoiding steep waves. Use island.bearing_deg, turn_rate_deg_per_second and nearby boats. Positive bearing is starboard/right. The ship has turn inertia; resume island progress after an evasive turn.',criteria:Object.fromEntries(Object.entries(rudderValues).map(([k,v])=>[k,v===0?'Centre the rudder; stop adding turn.':`${Math.abs(v)===1?'Full':Math.abs(v)===.5?'Half':'Slight'} rudder to ${v<0?'port/left':'starboard/right'}.`]))},
 sail:{type:'choice',instructions:'How much sail should be set now? Judge current speed, pursuers and approaching steep waves. Escape requires forward progress; furling increases drag but cannot stop instantly.',criteria:{FURL:'Furl sails; slow rapidly.',QUARTER:'Quarter sail; careful slow passage.',HALF:'Half sail; moderate acceleration.',FULL:'Full sail; maximum acceleration and escape speed.'}},
 port_fire:{type:'noul',instructions:'Should the port cannons fire NOW at police boats in the LEFT firing arc? Read port_reload_seconds and each boat.in_port_arc; conserve fire without a target.'},
 starboard_fire:{type:'noul',instructions:'Should the starboard cannons fire NOW at police boats in the RIGHT firing arc? Read starboard_reload_seconds and each boat.in_starboard_arc; conserve fire without a target.'}
};
export function decodeBoat(answers){return {steer:rudderValues[answers.rudder.choice],sail:sailValues[answers.sail.choice],port:answers.port_fire?.noul>.5,starboard:answers.starboard_fire?.noul>.5};}
export function boatContract(w){
 const state=boatState(w),questions={rudder:boatQuestions.rudder,sail:boatQuestions.sail};
 const threatened=state.boats.some(b=>b.range_m<35||b.boarding_seconds>0);
 state.phase=threatened?'repel boarding':'voyage';
 if(threatened){
  delete state.island;
  state.task='Repel the nearby pursuers now: break boarding contact, evade collisions, and expose a loaded broadside. Resume the island voyage once the immediate danger clears.';
  questions.rudder={...boatQuestions.rudder,instructions:'Choose the rudder to break boarding contact and expose broadsides. Turn away from close pursuers instead of holding a straight course alongside them. Use nearby boats and turn inertia; positive bearing is starboard/right.'};
 }
 if(w.reloads.left<=0&&state.boats.some(b=>b.in_port_arc))questions.port_fire=boatQuestions.port_fire;
 if(w.reloads.right<=0&&state.boats.some(b=>b.in_starboard_arc))questions.starboard_fire=boatQuestions.starboard_fire;
 return {state,questions};
}
export function boatState(w){
 const local=o=>{const dx=o.x-w.x,dz=o.z-w.z;return {forward_m:round(dx*Math.sin(w.heading)-dz*Math.cos(w.heading)),right_m:round(dx*Math.cos(w.heading)+dz*Math.sin(w.heading)),range_m:round(Math.hypot(dx,dz)),bearing_deg:round(wrap(Math.atan2(dx,-dz)-w.heading)*180/Math.PI)};};
 const visible=w.police.filter(p=>p.hull>0&&Math.hypot(p.x-w.x,p.z-w.z)<180);
 return {task:'Reach the distant island to win. Evade boarding, avoid collisions and steep waves, and sink pursuers with broadside cannons. Police reinforcements keep arriving at staggered intervals until arrival. Fictional game.',island:{...local(w.island),arrival_radius_m:w.island.radius},survival_seconds:round(Math.max(0,w.time-5)),distance_m:round(w.distance),reinforcements:w.reinforcements,speed_kmh:round(w.speed*3.6),speed_limit_kmh:round(Math.min(w.limit,22)*3.6),hull_percent:round(w.hull),repair_in_seconds:w.hull<80?round(Math.max(0,(w.repairAt??4)-w.time)):null,panic_cooldown_seconds:round(Math.max(0,(w.panicReadyAt||0)-w.time)),heading_deg:round(w.heading*180/Math.PI),turn_rate_deg_per_second:round(w.yaw*180/Math.PI),rudder_response_seconds:1.3,control_period_seconds:w.reactionSeconds||.3,sensor_range_m:180,port_reload_seconds:round(w.reloads.left),starboard_reload_seconds:round(w.reloads.right),boarding_percent:round(w.boarding*100),broadside_range_m:110,broadside_arc:'45 to 135 degrees right, -45 to -135 degrees left',boats:visible.map(p=>{const o=local(p);return {id:p.id,...o,speed_kmh:round(p.speed*3.6),relative_heading_deg:round(wrap(p.heading-w.heading)*180/Math.PI),hits_remaining:1,boarding_seconds:round(p.boarding||0),in_port_arc:o.range_m<110&&o.bearing_deg< -45&&o.bearing_deg> -135,in_starboard_arc:o.range_m<110&&o.bearing_deg>45&&o.bearing_deg<135};}),steep_waves:w.waves.filter(p=>Math.hypot(p.x-w.x,p.z-w.z)<180).map(p=>({...local(p),radius_m:p.radius,safe_speed_kmh:30})),mechanics:`Ramming slows and damages the ship but cannot sink it. Steep patches can sink the ship above 30 km/h. Hull repairs +4% after four quiet seconds, then every two seconds up to 80%. One cannon hit sinks a pursuer; each broadside reloads in 3 seconds. Police board after holding within 10m alongside for ${boardingSeconds} seconds at similar heading and speed; separation or a hit breaks boarding. No automatic firing.`,previous_controls:w.recentControls||[]};
}
function replenishSea(w){
 if(w.time>=w.reinforcementAt){
  const p=w.police.find(p=>p.hull<=0?w.time-(p.destroyedAt??w.time)>=8:Math.hypot(p.x-w.x,p.z-w.z)>420);
  if(p){
   // Reuse the actor/render slot only after its sinking animation. Spawn beyond
   // firing range, stagger arrivals, and never teleport a nearby live pursuer.
   const generation=(p.generation||0)+1,side=(p.id+generation)%2?1:-1,h=w.heading+Math.PI+side*.65,r=140+(p.id%3)*15;
   Object.assign(p,{x:w.x+Math.sin(h)*r,z:w.z-Math.cos(h)*r,heading:w.heading,speed:17,hull:3,boarding:0,destroyedAt:undefined,contactAt:undefined,generation});
   w.contacts.delete(p.id);w.reinforcements++;w.reinforcementAt=w.time+4;
  }
 }
 if(w.time>=w.seaUpdateAt){
  w.seaUpdateAt=w.time+1;
  w.waves.forEach((p,i)=>{if(Math.hypot(p.x-w.x,p.z-w.z)<360)return;
   const h=w.heading+(i%9-4)*.28,r=240+Math.floor(i/9)*65;
   p.x=w.x+Math.sin(h)*r;p.z=w.z-Math.cos(h)*r;
  });
 }
}
function burst(w,x,z,type='water'){w.bursts.push({x,z,at:w.time,type});if(w.bursts.length>32)w.bursts.shift();}
function combat(w){w.lastCombatAt=w.time;w.repairAt=w.time+4;}
export function fireBroadside(w,side){
 const bank=side<0?'left':'right';if(w.reloads[bank]>0||!side||w.time<5||w.finished)return false;
 combat(w);
 w.reloads[bank]=3;w.cooldown=3;w.fireAt=w.time;w.fireSide=side;w.shots++;
 const bearing=w.heading+side*Math.PI/2,targets=w.police.filter(p=>p.hull>0&&Math.hypot(p.x-w.x,p.z-w.z)<110&&Math.abs(wrap(Math.atan2(p.x-w.x,-(p.z-w.z))-bearing))<Math.PI/4).sort((a,b)=>Math.hypot(a.x-w.x,a.z-w.z)-Math.hypot(b.x-w.x,b.z-w.z));
 const target=targets[0],flight=target?Math.hypot(target.x-w.x,target.z-w.z)/65:0,angle=target?Math.atan2(target.x+Math.sin(target.heading)*target.speed*flight-w.x,-(target.z-Math.cos(target.heading)*target.speed*flight-w.z)):bearing;
 for(const offset of [-2.5,0,2.5])w.balls.push({x:w.x+Math.cos(w.heading)*side*2.4+Math.sin(w.heading)*offset,z:w.z+Math.sin(w.heading)*side*2.4-Math.cos(w.heading)*offset,y:2,vx:Math.sin(angle)*65+w.speed*Math.sin(w.heading),vz:-Math.cos(angle)*65-w.speed*Math.cos(w.heading),vy:8,age:0});
 return true;
}
export function firePanic(w){
 if(!panicAvailable(w))return false;
 combat(w);
 w.panicReadyAt=w.time+panicCooldownSeconds;w.panicUses=(w.panicUses||0)+1;w.fireAt=w.time;w.fireSide=0;w.shots++;
 for(let i=0;i<32;i++){const angle=w.heading+i*Math.PI/16;w.balls.push({x:w.x+Math.sin(angle)*2.4,z:w.z-Math.cos(angle)*2.4,y:2,vx:Math.sin(angle)*75+w.speed*Math.sin(w.heading),vz:-Math.cos(angle)*75-w.speed*Math.cos(w.heading),vy:2,age:0});}
 burst(w,w.x,w.z,'fire');return true;
}
export function stepBoat(w,dt,command={}){
 if(w.finished||!Number.isFinite(dt)||dt<=0)return;
 dt=Math.min(dt,1);
 while(dt>1e-8&&!w.finished){const d=Math.min(dt,1/120);dt-=d;w.time+=d;w.flash=Math.max(0,w.flash-d);w.reloads.left=Math.max(0,w.reloads.left-d);w.reloads.right=Math.max(0,w.reloads.right-d);w.cooldown=Math.max(w.reloads.left,w.reloads.right);
  if(w.time<5)continue;
  replenishSea(w);
  if(command.panic)firePanic(w);
  const steer=clamp(Number(command.steer)||0,-1,1),power=clamp(command.sail??(command.pedal==='FULL'?1:command.pedal==='REEF'?.25:0),0,1);w.controls={steer,sail:power,port:!!command.port,starboard:!!command.starboard};
  w.speed=clamp(w.speed+(power*3.6-.065*w.speed-.006*w.speed*w.speed-(1-power)*1.4)*d,0,Math.min(22,w.limit));
  const targetYaw=steer*.48*Math.min(1,w.speed/5);w.yaw+=(targetYaw-w.yaw)*Math.min(1,d*2);w.heading=wrap(w.heading+w.yaw*d);
  w.x+=Math.sin(w.heading)*w.speed*d;w.z-=Math.cos(w.heading)*w.speed*d;w.distance+=w.speed*d;
  if(command.fire)fireBroadside(w,command.fire);if(command.port)fireBroadside(w,-1);if(command.starboard)fireBroadside(w,1);
  const active=new Set();
  for(const p of w.police){if(p.hull<=0)continue;const dx=w.x-p.x,dz=w.z-p.z,range=Math.hypot(dx,dz),side=p.id%2?1:-1;
   if(range<35)combat(w);
   // Intercept ahead, close quickly, then flank. Visible heading and speed follow the same physics.
   const lead=Math.min(1.5,range/30),flank=range<35?7.5:5;
   const desired=Math.atan2(dx+Math.sin(w.heading)*w.speed*lead+Math.cos(w.heading)*side*flank,-(dz-Math.cos(w.heading)*w.speed*lead+Math.sin(w.heading)*side*flank));p.heading=wrap(p.heading+clamp(wrap(desired-p.heading),-1.1*d,1.1*d));
   const turn=Math.abs(wrap(desired-p.heading)),pace=(range<13?Math.max(4,w.speed):Math.min(29,Math.max(17,w.speed+7)))*Math.max(.4,1-turn/Math.PI);p.speed+=clamp(pace-p.speed,-12*d,6*d);p.x+=Math.sin(p.heading)*p.speed*d;p.z-=Math.cos(p.heading)*p.speed*d;
   if(range<7){active.add(p.id);if(!w.contacts.has(p.id)&&w.time-(p.contactAt??-10)>2){p.contactAt=w.time;w.hits++;w.hull=Math.max(1,w.hull-12/hullStrength);w.flash=.8;w.speed*=.6;burst(w,p.x,p.z);}p.x-=dx/(range||1)*(7-range);p.z-=dz/(range||1)*(7-range);}
  }
  w.contacts=active;
  for(const p of w.police){const close=p.hull>0&&Math.hypot(p.x-w.x,p.z-w.z)<10&&Math.abs(wrap(p.heading-w.heading))<.7&&Math.abs(p.speed-w.speed)<6;p.boarding=close?(p.boarding||0)+d:Math.max(0,(p.boarding||0)-d*2);}
  for(const wave of w.waves)if(Math.hypot(w.x-wave.x,w.z-wave.z)<wave.radius&&w.speed>30/3.6){combat(w);w.hull-=d*(w.speed-30/3.6)*.4/hullStrength;w.flash=Math.max(w.flash,.12);}
  for(const b of w.balls){b.age+=d;const x=b.x,z=b.z;b.x+=b.vx*d;b.z+=b.vz*d;b.y+=b.vy*d;b.vy-=9.81*d;
   for(const p of w.police){if(p.hull<=0)continue;const vx=b.x-x,vz=b.z-z,t=clamp(((p.x-x)*vx+(p.z-z)*vz)/(vx*vx+vz*vz||1),0,1);if(Math.hypot(x+vx*t-p.x,z+vz*t-p.z)<3.2&&b.y>-1){combat(w);p.hull=0;p.boarding=0;b.age=10;burst(w,p.x,p.z,'fire');if(p.hull<=0){w.disabled++;p.destroyedAt=w.time;p.speed=0;burst(w,p.x,p.z,'wreck');}break;}}
   if(b.age<5&&b.y<waterHeight(w,b.x,b.z)){b.age=10;burst(w,b.x,b.z);}
  }
  w.boarding=Math.min(1,Math.max(0,...w.police.filter(p=>p.hull>0).map(p=>(p.boarding||0)/boardingSeconds)));
  w.balls=w.balls.filter(b=>b.age<5);w.bursts=w.bursts.filter(b=>w.time-b.at<3);
  if(w.time-w.trailAt>.12){w.trail.push({x:w.x,z:w.z,heading:w.heading,at:w.time});w.trailAt=w.time;}w.trail=w.trail.filter(p=>w.time-p.at<6);
  if(w.hull<=0||w.boarding>=1){w.hull=Math.max(0,w.hull);w.failed=true;w.endReason=w.boarding>=1?'BOARDED':'SUNK';w.finished=true;w.speed=0;}
  else if(Math.hypot(w.x-w.island.x,w.z-w.island.z)<=w.island.radius){w.finished=true;w.failed=false;w.endReason='LANDED';w.speed=0;}
  if(!w.finished&&w.hull<80&&w.time+1e-8>=(w.repairAt??4)){w.hull=Math.min(80,w.hull+4);w.repairAt=w.time+2;}
 }
}
