import {clamp} from './core.js';

// Fictional game units and mechanics, shared by the scene and model observations.
export const sweepSeconds=22;
export const sprintMultiplier=1.35;
export const yard={minX:-13.4,maxX:13.4,minZ:-18.6,maxZ:65.5,startZ:64,doorX:6,doorZ:-18.5};
export const cameraRange=100;
export const cameraMount={x:0,y:7.6,z:-19};
export const silo={x:-6,z:0,radius:2.6,height:3.8};
export const cover=[
 {x:8,z:6,w:5,d:6,h:4.5,kind:'shed'},
 {x:-6,z:12,w:3.8,d:2,h:1.8,kind:'logs'},
 {x:4,z:-8,w:2.7,d:1.6,h:2,kind:'bins'},
 {x:-10,z:-11,w:2.5,d:3,h:2.6,kind:'tank'},
 {x:-8,z:52,w:4,d:3,h:2.1,kind:'logs'},
 {x:8,z:38,w:3.5,d:5,h:3.2,kind:'shed'},
 {x:-5,z:28,w:3,d:2,h:1.8,kind:'bins'}
];
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const degrees=x=>x*180/Math.PI;
const round=x=>Math.round(x*100)/100;
const yawTurns={LEFT_LARGE:-45,LEFT:-15,LEFT_SMALL:-5,LEFT_FINE:-1,HOLD:0,RIGHT_FINE:1,RIGHT_SMALL:5,RIGHT:15,RIGHT_LARGE:45};
const pitchTurns={DOWN_LARGE:-12,DOWN:-4,DOWN_FINE:-1,HOLD:0,UP_FINE:1,UP:4,UP_LARGE:12};

export function createGreenWorld(){
 return {time:0,player:{x:1.5,z:yard.startZ,y:1.65,yaw:0,pitch:0,vx:0,vz:0,moving:false},cameraYaw:.1,cameraTurns:0,
  sweepPeriod:6.5,sweepTarget:6.5,cameraPeriod:6.5,variableSweep:false,nextSweepChange:Infinity,
  turret:{lift:0,raised:false,yaw:Math.PI,pitch:-.12,yawGoal:Math.PI,pitchGoal:-.12,turning:false,lastUse:0,lastUseTurn:0,cooldown:0,yawRate:0,pitchRate:0,until:0},
  observation:null,track:0,inView:false,projectiles:[],tracers:[],events:[],steps:0,shotCount:0,shotResult:'none',result:null};
}

function boxHit(a,b,min,max){
 let lo=0,hi=1;
 for(const axis of ['x','y','z']){
  const v=b[axis]-a[axis];
  if(Math.abs(v)<1e-8){if(a[axis]<min[axis]||a[axis]>max[axis])return Infinity;continue;}
  const u=(min[axis]-a[axis])/v,t=(max[axis]-a[axis])/v;
  lo=Math.max(lo,Math.min(u,t));hi=Math.min(hi,Math.max(u,t));if(lo>hi)return Infinity;
 }
 return lo;
}
function siloHit(a,b){
 const dx=b.x-a.x,dz=b.z-a.z,x=a.x-silo.x,z=a.z-silo.z,A=dx*dx+dz*dz,B=2*(x*dx+z*dz),C=x*x+z*z-silo.radius**2;
 let lo=0,hi=1;
 if(A<1e-9){if(C>0)return Infinity;}
 else{const disc=B*B-4*A*C;if(disc<0)return Infinity;const root=Math.sqrt(disc);lo=Math.max(lo,(-B-root)/(2*A));hi=Math.min(hi,(-B+root)/(2*A));}
 const dy=b.y-a.y;
 if(Math.abs(dy)<1e-8){if(a.y<0||a.y>silo.height)return Infinity;}
 else{const u=-a.y/dy,v=(silo.height-a.y)/dy;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}
 return lo<=hi?lo:Infinity;
}
export function obstruction(a,b){
 let first=siloHit(a,b);
 for(const o of cover)first=Math.min(first,boxHit(a,b,{x:o.x-o.w/2,y:0,z:o.z-o.d/2},{x:o.x+o.w/2,y:o.h,z:o.z+o.d/2}));
 return first;
}
function walkable(x,z){
 if(x<yard.minX||x>yard.maxX||z<yard.minZ||z>yard.maxZ||Math.hypot(x-silo.x,z-silo.z)<silo.radius+.3)return false;
 return !cover.some(o=>Math.abs(x-o.x)<o.w/2+.3&&Math.abs(z-o.z)<o.d/2+.3);
}
export function turretOrigin(w){return {x:silo.x,y:3.25+w.turret.lift*2,z:silo.z};}
function observe(w){
 const p=w.player,dx=p.x-cameraMount.x,dz=p.z-cameraMount.z;
 const angle=wrap(Math.atan2(dx,-dz)-w.cameraYaw);
 w.inView=Math.abs(angle)<Math.PI*38/180&&Math.hypot(dx,dz)<cameraRange&&obstruction(cameraMount,p)===Infinity;
 const detected=w.inView&&p.moving;
 if(!detected&&w.observation)w.track++;
 w.observation=detected?{x:p.x,y:1,z:p.z,vx:p.vx,vz:p.vz}:null;
}
export function greenContract(w){
 if(!w.observation)return null;
 const o=w.observation,t=w.turret,origin=turretOrigin(w),dx=o.x-origin.x,dz=o.z-origin.z;
 const horizontal=Math.hypot(dx,dz),yaw=Math.atan2(dx,-dz),pitch=Math.atan2(o.y-origin.y,horizontal);
 const state={game:'Green Light / fictional stealth minigame',motion_visible:true,
  camera:{sweep_seconds:round(w.cameraPeriod),variable_speed:w.variableSweep,view_remaining_seconds:round((Math.PI*38/180+wrap(Math.atan2(o.x-cameraMount.x,-(o.z-cameraMount.z))-w.cameraYaw))/(2*Math.PI/w.cameraPeriod))},
  mount:{raised_percent:round(t.lift*100),fully_raised:t.lift>=1,unused_retraction_seconds:round(Math.max(0,2-(w.cameraTurns-t.lastUseTurn))*w.cameraPeriod)},
  target:{bearing_deg:round(degrees(yaw)),elevation_deg:round(degrees(pitch)),bearing_error_deg:round(degrees(wrap(yaw-t.yaw))),elevation_error_deg:round(degrees(pitch-t.pitch)),distance:round(horizontal),
   lateral_velocity:round(o.vx*Math.cos(yaw)+o.vz*Math.sin(yaw)),clear_line:obstruction(origin,o)===Infinity},
  weapon:{reload_seconds:round(t.cooldown),yaw_deg:round(degrees(t.yaw)),pitch_deg:round(degrees(t.pitch)),yaw_speed_deg_per_second:42,pitch_speed_deg_per_second:20,last_shot:w.shotResult},
  rules:'Game only. The sensor reports motion in the current CCTV view. Control is revoked as soon as motion stops or view is lost. Raise first; motors only work fully raised. Positive bearing error means turn RIGHT; negative means LEFT. Positive elevation error means UP. Choose a finite angle correction close to each signed error; HOLD once aligned. Motors stop after that correction, then you observe again. A shot travels physically and can miss or hit cover; no automatic aim. Only fire when both angular errors are small (approximately 1 degree) and line is clear.'};
 const aligned=Math.abs(state.target.bearing_error_deg)<1.3&&Math.abs(state.target.elevation_error_deg)<1.3&&state.target.clear_line;
 state.phase=t.lift<1?'raise':aligned?'aligned':'re-aim';
 const questions=t.lift<1?{
  mount:{type:'choice',instructions:'A moving intruder is in the current camera view. Should the game sentry raise its mount to aim?',criteria:{RAISE:'Raise or continue raising the mount.',WAIT:'Leave the mount idle.'}}
 }:aligned?{
  action:{type:'choice',instructions:'The barrel is closely aligned with visible motion. SHOOT one game projectile, or INFER to refresh the observation. A shot is not a guaranteed hit; inspect last_shot on the next decision.',criteria:t.cooldown<=0?{SHOOT:'Fire one projectile along the current barrel direction.',INFER:'Hold and observe again.'}:{INFER:'Reloading; observe again.'}}
 }:{
  yaw:{type:'choice',instructions:'Choose a finite horizontal angle correction close to the signed bearing error. The motor executes only this angle, then returns a fresh observation. Do not turn farther than needed.',criteria:Object.fromEntries(Object.entries(yawTurns).map(([k,v])=>[k,`${v} degrees; negative left, positive right.`]))},
  pitch:{type:'choice',instructions:'Choose a finite barrel elevation correction close to the signed elevation error. Positive is up; negative is down. HOLD once aligned.',criteria:Object.fromEntries(Object.entries(pitchTurns).map(([k,v])=>[k,`${v} degrees; negative down, positive up.`]))}
 };
 return {state,questions};
}

export function applyGreenDecision(w,answers,track,sentAt){
 if(w.result||!w.observation||track!==w.track||w.time-sentAt>1)return false;
 const t=w.turret;
 if(answers.mount?.choice==='RAISE'){t.raised=true;t.lastUse=w.time;t.lastUseTurn=w.cameraTurns;t.until=w.time+2.8;}
 if(answers.mount?.choice==='WAIT')t.until=w.time;
 if(t.lift>=1){
  const yaw=yawTurns[answers.yaw?.choice]||0,pitch=pitchTurns[answers.pitch?.choice]||0;
  t.yawGoal=wrap(t.yaw+yaw*Math.PI/180);t.pitchGoal=clamp(t.pitch+pitch*Math.PI/180,-1.4,.25);t.until=w.time+1.2;t.turning=!!(yaw||pitch);
  if(t.turning){t.lastUse=w.time;t.lastUseTurn=w.cameraTurns;}
  if(answers.action?.choice==='SHOOT'&&t.cooldown<=0){
   // Use the barrel's current orientation, never the target's coordinates.
   const a=turretOrigin(w),dir={x:Math.sin(t.yaw)*Math.cos(t.pitch),y:Math.sin(t.pitch),z:-Math.cos(t.yaw)*Math.cos(t.pitch)};
   w.projectiles.push({...a,vx:dir.x*240,vy:dir.y*240,vz:dir.z*240,age:0});
   t.cooldown=2.8;t.lastUse=w.time;t.lastUseTurn=w.cameraTurns;w.shotCount++;w.shotResult='in flight';w.events.push('shot');
  }
 }
 return true;
}

export function stepGreenWorld(w,dt,input){
 if(w.result)return;
 const p=w.player,oldX=p.x,oldZ=p.z,wasSprinting=p.sprinting;
 p.yaw+=(input.turn||0)*dt*.9;
 const length=Math.hypot(input.forward||0,input.side||0)||1,sprint=w.variableSweep&&input.sprint?sprintMultiplier:1,speed=.95*sprint;
 const dx=((input.forward||0)*Math.sin(p.yaw)+(input.side||0)*Math.cos(p.yaw))/length*speed*dt;
 const dz=(-(input.forward||0)*Math.cos(p.yaw)+(input.side||0)*Math.sin(p.yaw))/length*speed*dt;
 if(walkable(p.x+dx,p.z))p.x+=dx;if(walkable(p.x,p.z+dz))p.z+=dz;
 p.vx=(p.x-oldX)/dt;p.vz=(p.z-oldZ)/dt;p.moving=Math.hypot(p.vx,p.vz)>.02;p.sprinting=sprint>1&&p.moving;
 w.time+=dt;
 const progress=(yard.startZ-p.z)/(yard.startZ-yard.doorZ);
 if(!w.variableSweep&&(progress>=.5||w.time>=45)){w.variableSweep=true;w.nextSweepChange=w.time;}
 if(p.sprinting&&!wasSprinting)w.nextSweepChange=w.time;
 // Independent speed and timing draws prevent a predictable slow/fast rhythm.
 if(w.time>=w.nextSweepChange){w.sweepTarget=Math.random()<.25?2.2+Math.random()*1.8:4+Math.sqrt(Math.random())*4;w.nextSweepChange=w.time+(p.sprinting?.9+Math.random()*1.3:2+Math.random()*2);}
 w.sweepPeriod+=(w.sweepTarget-w.sweepPeriod)*(1-Math.exp(-dt/.35));
 // Linger over the yard, not over a tracked person. Stationary players stay invisible.
 // Ease into the slow pass only in the 12 degrees before the central yard
 // enters the 38-degree half-FOV; do not grant a whole sideways slow sweep.
 const fromYard=Math.abs(wrap(w.cameraYaw-Math.PI))*180/Math.PI;
 const facing=clamp((50-fromYard)/12,0,1),linger=facing*facing*(3-2*facing);
 w.cameraPeriod=w.sweepPeriod+((w.variableSweep?28:sweepSeconds)-w.sweepPeriod)*linger;
 const turn=dt/w.cameraPeriod;w.cameraTurns+=turn;w.cameraYaw=wrap(w.cameraYaw+turn*2*Math.PI);observe(w);
 if(p.moving){w.steps+=dt;if(w.steps>.72/sprint){w.steps=0;w.events.push('step');}}
 const t=w.turret,previousLift=t.lift;
 if(w.cameraTurns-t.lastUseTurn>=2)t.raised=false;
 // A lift may finish only while the motion camera currently observes movement.
 if(!t.raised)t.lift=Math.max(0,t.lift-dt/3.5);
 else if(w.observation&&w.time<t.until)t.lift=Math.min(1,t.lift+dt/2.8);
 if(previousLift<1&&t.lift===1)w.events.push('lock');
 if(w.observation&&t.lift>=1&&w.time<t.until){
  const yawStep=clamp(wrap(t.yawGoal-t.yaw),-42*dt*Math.PI/180,42*dt*Math.PI/180),pitchStep=clamp(t.pitchGoal-t.pitch,-20*dt*Math.PI/180,20*dt*Math.PI/180);
  t.yaw=wrap(t.yaw+yawStep);t.pitch+=pitchStep;t.yawRate=yawStep/dt;t.pitchRate=pitchStep/dt;
  t.turning=Math.abs(wrap(t.yawGoal-t.yaw))>1e-5||Math.abs(t.pitchGoal-t.pitch)>1e-5;
 }else{t.yawRate=0;t.pitchRate=0;t.turning=false;t.yawGoal=t.yaw;t.pitchGoal=t.pitch;}
 w.motor=(t.lift-previousLift)/dt;t.cooldown=Math.max(0,t.cooldown-dt);
 for(const b of w.projectiles){
  const a={x:b.x,y:b.y,z:b.z},end={x:b.x+b.vx*dt,y:b.y+b.vy*dt,z:b.z+b.vz*dt};
  const wall=obstruction(a,end),hit=boxHit(a,end,{x:p.x-.27,y:.1,z:p.z-.27},{x:p.x+.27,y:1.85,z:p.z+.27});
  const f=Math.min(1,wall,hit);b.x=a.x+(end.x-a.x)*f;b.y=a.y+(end.y-a.y)*f;b.z=a.z+(end.z-a.z)*f;
  w.tracers.push({a,b:{x:b.x,y:b.y,z:b.z},until:w.time+.07});
  if(hit<=1&&hit<wall){w.result='dead';w.shotResult='success';w.events.push('hit');}
  if(wall<=1){w.events.push('impact');b.age=10;}
  b.age+=dt;if(b.y<0)b.age=10;if(b.age>=.8&&!w.result)w.shotResult='re-aim';
 }
 w.projectiles=w.projectiles.filter(b=>b.age<.8);w.tracers=w.tracers.filter(b=>b.until>w.time).slice(-16);
 if(!w.result&&Math.hypot(p.x-yard.doorX,p.z-yard.doorZ)<1.2){w.result='escaped';w.events.push('door');}
}

// Preserve real-time movement/difficulty on slower renderers. Small physics steps
// retain swept collision and input gating; a long suspended frame is not replayed.
export function advanceGreenWorld(w,elapsed,input){
 let remaining=Math.min(.5,Math.max(0,elapsed));
 while(remaining>1e-8&&!w.result){const dt=Math.min(1/120,remaining);stepGreenWorld(w,dt,input);remaining-=dt;}
}
