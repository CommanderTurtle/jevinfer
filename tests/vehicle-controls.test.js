import {test,expect} from 'bun:test';
import {vehicleStep,recoverySteering,resetRecovery,surroundings,decodeControls,wheelEffects,manoeuvrePreview} from '../src/vehicle-controls.js';
import {createCourse,stepCourse,pathPoint,courseState} from '../src/race-course.js';
import {stepItems,useItem} from '../src/kart-items.js';
const body=()=>({x:0,z:0,time:0,speed:0,heading:0,steer:0,course:'parking',contacts:new Set()});
const advance=(w,n,c)=>{for(let i=0;i<n*120;i++){w.time+=1/120;vehicleStep(w,1/120,c);}};

test('Cone car turns twice as effectively at low speed and at the grip limit, including reverse',()=>{
 for(const speed of [4,16,-4]){
  const normal={...body(),speed,steer:.55},cone={...body(),course:'slalom',speed,steer:.55};
  const command={steer:.55,gear:speed<0?'REVERSE':'DRIVE'};
  advance(normal,.4,command);advance(cone,.4,command);
  expect(cone.heading).toBeCloseTo(normal.heading*2,8);expect(cone.yaw).toBeCloseTo(normal.yaw*2,8);
  expect(cone.speed).toBeCloseTo(normal.speed,8);
 }
});

test('Cone turn estimates and manoeuvre previews use the same tighter turning radius',()=>{
 const normal={...body(),speed:8},cone={...normal,course:'slalom'};
 const before=wheelEffects(normal).heading_change_deg,after=wheelEffects(cone).heading_change_deg;
 for(const key of Object.keys(before))expect(Math.abs(after[key]-2*before[key])).toBeLessThanOrEqual(.11);
 const arcs=manoeuvrePreview(cone,[],()=>false).arcs;
 for(const [gear,steer,clear,dx,dz]of arcs){
  const direction=gear==='reverse'?-1:1;let x=0,z=0,h=0;
  for(let i=0;i<12;i++){h+=2*direction*.5/2.5*Math.tan(steer*.62);x+=Math.sin(h)*direction*.5;z-=Math.cos(h)*direction*.5;}
  expect(clear).toBe(6);expect(dx).toBe(Math.round(x*10)/10);expect(dz).toBe(Math.round(z*10)/10);
 }
 expect(wheelEffects({...normal,course:'city'})).toEqual(wheelEffects(normal));
});
test('Wall clearance is body-relative and agrees with physical reverse escape',()=>{
 const w=createCourse('slalom');w.x=15.99;w.z=-15;w.heading=Math.PI/2;w.contacts.add('edge');
 const s=courseState(w);expect(s.observations.boundary_clearance_m.front).toBe(0);expect(s.observations.bumper_clearance_m.front).toBe(0);expect(s.observations.boundary_clearance_m.rear).toBeGreaterThan(25);
 stepCourse(w,2,{gear:'REVERSE',throttle:.3,steer:0});expect(w.x).toBeLessThan(15);expect(w.contacts.size).toBe(0);
});
test('Pedal feathering yields different acceleration; brakes do not switch gear',()=>{
 const a=body(),b=body();advance(a,2,{throttle:.12});advance(b,2,{throttle:1});expect(a.speed).toBeGreaterThan(0);expect(a.speed).toBeLessThan(b.speed/2);
 advance(b,2,{brake:1});expect(b.speed).toBe(0);advance(b,1,{brake:1});expect(b.speed).toBe(0);
});
test('Handbrake can be pulsed, releases automatically, and can be pumped again',()=>{
 const w=body();w.speed=10;advance(w,.1,{handbrake:'PULSE',steer:.4});expect(w.controls.handbrakeActive).toBe(true);advance(w,.3,{handbrake:'PULSE'});expect(w.controls.handbrakeActive).toBe(false);advance(w,.01,{handbrake:'RELEASE'});advance(w,.01,{handbrake:'PULSE'});expect(w.controls.handbrakeActive).toBe(true);
});
test('Sixth failed backup locks opposite steering for one bounded attempt',()=>{
 const w=body();w.recoveryAssist=true;w.steer=.7;w.contacts.add('edge');resetRecovery(w);const c={gear:'REVERSE',throttle:.3,steer:.7};
 for(let i=0;i<5;i++){expect(recoverySteering(w,c,.01)).toBe(.7);recoverySteering(w,{gear:'DRIVE',throttle:.3,steer:.7},.01);w.time+=1;}
 expect(recoverySteering(w,c,.01)).toBe(-1);expect(recoverySteering(w,{...c,steer:1},.01)).toBe(-1);expect(w.recovery.assists).toBe(1);
 w.time+=1.5;expect(recoverySteering(w,c,.01)).toBe(.7);recoverySteering(w,{gear:'DRIVE',throttle:.3,steer:0},.01);expect(recoverySteering(w,c,.01)).toBe(.7);
 w.contacts.clear();w.speed=4;for(let i=0;i<3;i++)recoverySteering(w,{gear:'DRIVE',throttle:.2,steer:0},1);expect(w.recovery.attempts).toBe(0);expect(w.recovery.used).toBe(false);
});
test('Successful backing is not counted as a repeated failed attempt',()=>{
 const w=body();resetRecovery(w);for(let i=0;i<8;i++){recoverySteering(w,{gear:'REVERSE',throttle:.3,steer:.2},.1);w.z+=8;recoverySteering(w,{gear:'DRIVE',throttle:.3,steer:0},.1);}expect(w.recovery.assists).toBe(0);
});
test('All course collision bounds and reverse semantics survive direct commands',()=>{
 for(const mode of ['parking','slalom','kart','city']){const w=createCourse(mode);w.objects=[];w.halfWidth=1000;w.bounds={x:1000,z:1000};const h=w.heading;stepCourse(w,1,{gear:'REVERSE',throttle:.5,steer:.6});expect(w.heading).toBeLessThan(h);expect(w.speed).toBeLessThan(0);}
});
test('Kart pickup grants inventory, use consumes it, shell hits rival, shield blocks stun',()=>{
 const w=createCourse('kart');w.objects=[];const p=w.pickups[0];w.x=p.x;w.z=p.z;stepItems(w,.01,{});expect(w.item).toBe('SHELL');expect(w.itemCount).toBe(1);expect(p.readyAt).toBeGreaterThan(w.time);
 w.heading=0;w.objects=[{id:'rival',kind:'car',x:w.x,z:w.z-10,heading:0,speed:0}];expect(useItem(w)).toBe(true);expect(w.item).toBeNull();expect(useItem(w)).toBe(false);
 for(let i=0;i<40;i++){w.time+=.01;stepItems(w,.01,{});}expect(w.objects[0].stunUntil).toBeGreaterThan(w.time);expect(w.projectiles.length).toBe(0);
 w.objects[0].stunUntil=0;w.objects[0].shieldUntil=w.time+5;w.item='SHELL';useItem(w);for(let i=0;i<40;i++){w.time+=.01;stepItems(w,.01,{});}expect(w.objects[0].stunUntil).toBe(0);
});
test('Rivals collect and use items and all effects have finite lifetimes',()=>{
 const w=createCourse('kart'),r=w.objects[0],p=w.pickups[1];w.x=999;w.z=999;r.x=p.x;r.z=p.z;stepItems(w,.01,{});expect(r.item).toBe('OIL');w.time=10;stepItems(w,.01,{});expect(w.projectiles.length).toBe(1);expect(r.itemsUsed).toBe(1);w.time=25;stepItems(w,.01,{});expect(w.projectiles.every(p=>p.expires>w.time)).toBe(true);expect(w.effects.length).toBeLessThanOrEqual(24);
});
