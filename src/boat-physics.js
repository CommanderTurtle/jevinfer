import {clamp,choice} from './core.js';

export const seaWaves=[[.52,.055,.027,1.1],[.25,-.09,.06,1.7],[.12,.18,.12,2.4]];
export function seaHeight(x,z,t){return seaWaves.reduce((v,[a,kx,kz,s])=>v+a*Math.sin(x*kx+z*kz-t*s),0);}
export function waterHeight(w,x,z){const scale=1+w.waves.reduce((n,p)=>n+Math.max(0,1-Math.hypot(x-p.x,z-p.z)/p.radius)**2*3,0);return seaHeight(x,z,w.time)*scale;}
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const round=x=>Math.round(x*10)/10;
export function createBoat(density='medium',limit=160){
 const count={low:2,medium:4,high:6}[density]||4;
 return {course:'pirate',density,limit:limit/3.6,x:0,z:0,heading:0,yaw:0,speed:0,time:0,distance:0,hits:0,flash:0,passed:0,finished:false,failed:false,hull:100,escape:1600,shots:0,disabled:0,fireAt:-10,fireSide:0,cooldown:0,contacts:new Set(),balls:[],bursts:[],trail:[],trailAt:0,police:Array.from({length:count},(_,i)=>({id:i,x:(i%2?1:-1)*(45+i*12),z:-12-i*14,heading:0,speed:8,hull:3,variant:i%3})),waves:Array.from({length:18},(_,i)=>({x:Math.sin(i*2.1)*75,z:-110-i*85,radius:12+i%3*3})),sensorRange:160};
}
export const boatQuestions={
 rudder:choice('Steer toward the escape heading while avoiding nearby boats and steep wave patches. A positive escape_bearing_deg needs RIGHT, a negative value LEFT. CENTER releases the turn when aligned within 10 degrees; anticipate existing turn_rate_deg_per_second to avoid overshoot. Avoid turning in circles or zigzags.',['LEFT','CENTER','RIGHT']),
 sail:choice('FULL for clear water; REEF slows for a steep wave or collision risk; COAST reduces speed. This is a sailing game; the goal is to escape north, not to stop indefinitely.',['FULL','REEF','COAST']),
 cannons:choice('Fire at a nearby police boat on the port (LEFT) or starboard (RIGHT) broadside only if a target is in its firing arc and reload is ready. Otherwise HOLD.',['LEFT','HOLD','RIGHT'])
};
export function boatState(w){
 const local=o=>{const dx=o.x-w.x,dz=o.z-w.z;return {forward_m:round(dx*Math.sin(w.heading)-dz*Math.cos(w.heading)),right_m:round(dx*Math.cos(w.heading)+dz*Math.sin(w.heading)),range_m:round(Math.hypot(dx,dz)),bearing_deg:round(wrap(Math.atan2(dx,-dz)-w.heading)*180/Math.PI)};};
 const visible=w.police.filter(p=>p.hull>0&&Math.hypot(p.x-w.x,p.z-w.z)<Math.min(180,w.sensorRange||160));
 return {task:'Sail to the northern escape line, avoid collisions and steep waves, and disable pursuing police boats with broadside cannons. Fictional game.',speed_kmh:round(w.speed*3.6),speed_limit_kmh:round(Math.min(w.limit,22)*3.6),hull_percent:round(w.hull),escape_remaining_m:round(Math.max(0,w.escape+w.z)),escape_bearing_deg:round(wrap(-w.heading)*180/Math.PI),heading_deg:round(w.heading*180/Math.PI),turn_rate_deg_per_second:round(w.yaw*180/Math.PI),rudder_response_seconds:1.3,control_period_seconds:w.reactionSeconds||.3,sensor_range_m:Math.min(180,w.sensorRange||160),reload_seconds:round(w.cooldown),broadside_range_m:110,broadside_arc:'45 to 135 degrees right, -45 to -135 degrees left',boats:visible.map(p=>({...local(p),speed_kmh:round(p.speed*3.6),hits_remaining:p.hull})),steep_waves:w.waves.filter(p=>Math.hypot(p.x-w.x,p.z-w.z)<Math.min(180,w.sensorRange||160)).map(p=>({...local(p),radius_m:p.radius,safe_speed_kmh:30})),instructions:'State is a finite-range local observation, not vision. Ordinary waves cause buoyancy; marked steep patches damage the hull above 30 km/h. Cannons reload together in 3 seconds. Use the escape bearing as a compass.'};
}
function burst(w,x,z,type='water'){w.bursts.push({x,z,at:w.time,type});if(w.bursts.length>32)w.bursts.shift();}
export function fireBroadside(w,side){
 if(w.cooldown>0||!side||w.time<5||w.finished)return false;
 w.cooldown=3;w.fireAt=w.time;w.fireSide=side;w.shots++;
 const bearing=w.heading+side*Math.PI/2,targets=w.police.filter(p=>p.hull>0&&Math.hypot(p.x-w.x,p.z-w.z)<110&&Math.abs(wrap(Math.atan2(p.x-w.x,-(p.z-w.z))-bearing))<Math.PI/4).sort((a,b)=>Math.hypot(a.x-w.x,a.z-w.z)-Math.hypot(b.x-w.x,b.z-w.z));
 const target=targets[0],angle=target?Math.atan2(target.x-w.x,-(target.z-w.z)):bearing;
 for(const offset of [-2.5,0,2.5])w.balls.push({x:w.x+Math.cos(w.heading)*side*2.4+Math.sin(w.heading)*offset,z:w.z+Math.sin(w.heading)*side*2.4-Math.cos(w.heading)*offset,y:2,vx:Math.sin(angle)*65+w.speed*Math.sin(w.heading),vz:-Math.cos(angle)*65-w.speed*Math.cos(w.heading),vy:8,age:0});
 return true;
}
export function stepBoat(w,dt,command={}){
 if(w.finished||!Number.isFinite(dt)||dt<=0)return;
 dt=Math.min(dt,1);
 while(dt>1e-8&&!w.finished){const d=Math.min(dt,1/120);dt-=d;w.time+=d;w.flash=Math.max(0,w.flash-d);w.cooldown=Math.max(0,w.cooldown-d);
  if(w.time<5)continue;
  const steer=clamp(Number(command.steer)||0,-1,1),power=command.pedal==='FULL'?1:command.pedal==='REEF'?.35:0;
  w.speed=clamp(w.speed+(power*3.6-.065*w.speed-.006*w.speed*w.speed)*d,0,Math.min(22,w.limit));
  const targetYaw=steer*.48*Math.min(1,w.speed/5);w.yaw+=(targetYaw-w.yaw)*Math.min(1,d*2);w.heading=wrap(w.heading+w.yaw*d);
  w.x+=Math.sin(w.heading)*w.speed*d;w.z-=Math.cos(w.heading)*w.speed*d;w.distance+=w.speed*d;
  if(command.fire)fireBroadside(w,command.fire);
  const active=new Set();
  for(const p of w.police){if(p.hull<=0)continue;const dx=w.x-p.x,dz=w.z-p.z,range=Math.hypot(dx,dz),side=p.id%2?1:-1;
   // Pursuers seek a flanking station and slow near the hull instead of repeatedly ramming it.
   const desired=Math.atan2(dx+Math.cos(w.heading)*side*14,-(dz+Math.sin(w.heading)*side*14));p.heading=wrap(p.heading+clamp(wrap(desired-p.heading),-.4*d,.4*d));const pace=range<16?Math.max(2,w.speed*.7):Math.min(24,Math.max(7,w.speed+1.6));p.speed+=(pace-p.speed)*d*(range<16?2:.4);p.x+=Math.sin(p.heading)*p.speed*d;p.z-=Math.cos(p.heading)*p.speed*d;
   if(range<7){active.add(p.id);if(!w.contacts.has(p.id)&&w.time-(p.contactAt??-10)>2){p.contactAt=w.time;w.hits++;w.hull-=12;w.flash=.8;w.speed*=.6;burst(w,p.x,p.z);}p.x-=dx/(range||1)*(7-range);p.z-=dz/(range||1)*(7-range);}
  }
  w.contacts=active;
  for(const wave of w.waves)if(Math.hypot(w.x-wave.x,w.z-wave.z)<wave.radius&&w.speed>30/3.6){w.hull-=d*(w.speed-30/3.6)*.4;w.flash=Math.max(w.flash,.12);}
  for(const b of w.balls){b.age+=d;const x=b.x,z=b.z;b.x+=b.vx*d;b.z+=b.vz*d;b.y+=b.vy*d;b.vy-=9.81*d;
   for(const p of w.police){if(p.hull<=0)continue;const vx=b.x-x,vz=b.z-z,t=clamp(((p.x-x)*vx+(p.z-z)*vz)/(vx*vx+vz*vz||1),0,1);if(Math.hypot(x+vx*t-p.x,z+vz*t-p.z)<3.2&&b.y>-1){p.hull--;b.age=10;burst(w,p.x,p.z,'fire');if(p.hull<=0)w.disabled++;break;}}
   if(b.age<5&&b.y<waterHeight(w,b.x,b.z)){b.age=10;burst(w,b.x,b.z);}
  }
  w.balls=w.balls.filter(b=>b.age<5);w.bursts=w.bursts.filter(b=>w.time-b.at<3);
  if(w.time-w.trailAt>.12){w.trail.push({x:w.x,z:w.z,heading:w.heading,at:w.time});w.trailAt=w.time;}w.trail=w.trail.filter(p=>w.time-p.at<6);
  if(w.hull<=0||w.z<=-w.escape){w.hull=Math.max(0,w.hull);w.failed=w.hull<=0;w.finished=true;w.speed=0;}
 }
}
