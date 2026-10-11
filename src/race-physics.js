import {clamp,choice} from './core.js';
export const drivingQuestions={
 lane:choice('Select the safest absolute lane using clearance and time to contact. If an obstacle blocks the current lane, choose a clear neighboring lane to pass it. Stay in the current lane only when it is safe. Changing lanes crosses intervening lanes and takes time; avoid vehicles alongside.',['LEFT','CENTER','RIGHT']),
 throttle:choice('Accelerate toward the speed limit when clear. Brake before blocked lanes or imminent collision. Coast approaching slower traffic.',['ACCELERATE','COAST','BRAKE'])
};
export function drivingState(w){return {
 task:w.course==='race'?'Finish the 2 km race quickly without collisions.':'Navigate without collisions.',
 course:w.course,current_lane:['LEFT','CENTER','RIGHT'][Math.round(w.x)],lateral_position:w.x,
 speed_kmh:Math.round(w.speed*3.6),speed_limit_kmh:(w.limit||45)*3.6,lane_change_seconds:.65,
 lanes:['LEFT','CENTER','RIGHT'].map((lane,i)=>{
  const cars=w.cars.filter(c=>c.lane===i&&c.z>-8).sort((a,b)=>a.z-b.z),next=cars.find(c=>c.z>=0);
  return {lane,clearance_m:next?Math.round(next.z):300,alongside:cars.some(c=>Math.abs(c.z)<7),blocked:!!next&&next.z<8,obstacle:next?.kind||null,obstacle_speed_kmh:next?Math.round(next.speed*3.6):null,time_to_contact_seconds:next&&w.speed>next.speed?Math.max(0,next.z/(w.speed-next.speed)):null};
 })
};}
export function sweptContact(x0,z0,x1,z1,halfX=.53,halfZ=4.4){
 // A touching car may steer away; only motion into the overlap is blocked.
 if(Math.abs(x0)<=halfX+1e-6&&Math.abs(z0)<=halfZ+1e-6&&
    (Math.abs(x1)>Math.abs(x0)+1e-9||Math.abs(z1)>Math.abs(z0)+1e-9)&&
    (Math.abs(x1)>=halfX||Math.abs(z1)>=halfZ))return null;
 let enter=0,exit=1;
 for(const [a,b,h]of [[x0,x1,halfX],[z0,z1,halfZ]]){
  const d=b-a;if(Math.abs(d)<1e-9){if(Math.abs(a)>h)return null;continue;}
  let lo=(-h-a)/d,hi=(h-a)/d;if(lo>hi)[lo,hi]=[hi,lo];enter=Math.max(enter,lo);exit=Math.min(exit,hi);if(enter>exit)return null;
 }return enter;
}
export function createWorld(course='traffic',limit=160){
 const w={course,limit:limit/3.6,x:1,speed:0,distance:0,hits:0,time:0,finished:false,cars:[],nextId:0,flash:0,passed:0};
 for(let i=0;i<12;i++)spawnObstacle(w,85+i*38,i);return w;
}
export function spawnObstacle(w,z,index=w.nextId){
 w.cars.push({id:w.nextId++,lane:(index*7+1)%3,z,speed:w.course==='obstacles'?0:w.course==='race'?18+(index%4)*3:12+(index%5)*3,
 color:['#64cddb','#d8ae60','#987cde','#74cba3'][index%4],kind:w.course==='obstacles'?(index%2?'barrier':'cone'):'car'});
}
export function stepWorld(w,dt,target,throttle){
 if(w.finished)return;
 w.time+=dt;w.flash=Math.max(0,w.flash-dt);
 const oldX=w.x,oldSpeed=w.speed;
 let newX=clamp(oldX+clamp(target-oldX,-1.6*dt,1.6*dt),0,2);
 w.speed=clamp(w.speed+(throttle==='BRAKE'?-26:throttle==='ACCELERATE'?11:-2)*dt,0,w.limit);
 const travel=(oldSpeed+w.speed)*.5*dt;let first=null;
 for(const c of w.cars){
  const nextZ=c.z+c.speed*dt-travel,hit=sweptContact(oldX-c.lane,-c.z,newX-c.lane,-nextZ);
  if(hit!==null&&(!first||hit<first.t))first={c,t:hit};
 }
 let movement=travel;
 if(first){
  const {c,t}=first,atX=oldX+(newX-oldX)*t-c.lane,atZ=c.z+(c.speed*dt-travel)*t;
  const front=Math.abs(Math.abs(atZ)-4.4)<Math.abs(Math.abs(atX)-.53);
  // Resolve the contact normal independently so the car can slide away.
  if(front){
   movement=travel*Math.max(0,t-.01);
   if(Math.abs(newX-c.lane)<Math.abs(oldX-c.lane))newX=oldX+(newX-oldX)*Math.max(0,t-.01);
   w.speed=Math.min(w.speed,c.speed)*.45;
  }else newX=oldX+(newX-oldX)*Math.max(0,t-.01);
  if(!c.contact){c.contact=true;w.hits++;w.flash=.5;}
 }
 w.x=newX;w.distance+=movement;
 for(const c of w.cars){c.z+=c.speed*dt-movement;if(Math.abs(w.x-c.lane)>.58||Math.abs(c.z)>5)c.contact=false;}
 w.passed+=w.cars.filter(c=>c.z < -15).length;w.cars=w.cars.filter(c=>c.z>=-15&&c.z<650);
 if(!w.cars.length||Math.max(...w.cars.map(c=>c.z))<460)spawnObstacle(w,500);
 if(w.course==='race'&&w.distance>=2000){w.finished=true;w.speed=0;}
}
