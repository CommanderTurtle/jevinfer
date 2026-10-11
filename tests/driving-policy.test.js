import {test,expect} from 'bun:test';
import {createCourse,roadPosition} from '../src/race-course.js';
import {drivingContract,inferDriving,resetDrivingPolicy} from '../src/driving-policy.js';
import {combatContract,createCombatPilot} from '../src/combat-policy.js';
import {stepItems,useItem} from '../src/kart-items.js';
import {validQuestions} from '../src/core.js';

const boundary=()=>{const w=createCourse('slalom');Object.assign(w,{x:15.99,z:-15,heading:Math.PI/2});w.contacts.add('edge');return w;};
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('Simple wall scale and closing time distinguish approach from parallel travel',()=>{
 const w=createCourse('slalom');w.x=0;expect(roadPosition(w).position).toBe(0);
 Object.assign(w,{x:14,speed:15,heading:.35});let s=roadPosition(w);expect(s.position).toBe(88);expect(s.right_clearance_m).toBe(2);expect(s.drifting).toBe('right');expect(s.seconds_to_edge).toBeLessThan(.4);expect(drivingContract(w).phase).toBe('wall avoidance');
 w.x=-14;w.heading=-.35;s=roadPosition(w);expect(s.position).toBe(-87);expect(s.drifting).toBe('left');
 w.heading=0;expect(roadPosition(w).seconds_to_edge).toBeNull();
});

test('Driving questions adapt to recovery, cornering and parked state',()=>{
 const w=boundary();expect(Object.keys(validQuestions(drivingContract(w).questions))).toEqual(['action']);
 const k=createCourse('kart');k.speed=15;k.heading+=Math.PI/2;expect(drivingContract(k).questions.handbrake).toBeDefined();
 const p=createCourse('parking');p.x=p.bay.x;p.z=p.bay.z;p.parkPhase=1;expect(drivingContract(p).questions.handbrake).toBeDefined();
 const s=createCourse('slalom');expect(drivingContract(s).questions.handbrake).toBeUndefined();expect(drivingContract(k).questions.item).toBeUndefined();
});

test('Model-selected recovery gear persists for clearance, then expires or resets',()=>{
 const w=boundary();const choice=drivingContract(w).decode({action:{choice:'reverse'}});expect(choice.gear).toBe('REVERSE');
 w.x-=.5;w.contacts.clear();let c=drivingContract(w);expect(c.phase).toBe('clearance');expect(c.decode({wheel:{choice:'left'}})).toMatchObject({gear:'REVERSE',steer:-.2});
 w.x-=3;expect(drivingContract(w).phase).not.toBe('clearance');
 const b=boundary();drivingContract(b).decode({action:{choice:'reverse'}});b.x-=.5;b.contacts.clear();b.time+=7;expect(drivingContract(b).phase).not.toBe('clearance');
 const r=boundary();drivingContract(r).decode({action:{choice:'reverse'}});r.x-=.5;r.contacts.clear();resetDrivingPolicy(r);expect(drivingContract(r).phase).not.toBe('clearance');
});

test('Prediction never changes the current world or reuses model answers',async()=>{
 const w=createCourse('slalom');w.speed=7;w.controls={gear:'DRIVE',steer:.2,throttle:.3};
 const before=JSON.stringify(w);drivingContract(w);expect(JSON.stringify(w)).toBe(before);
 let calls=0;const client={infer:async()=>({answers:{steering:{choice:++calls===1?'left':'right'},motion:{choice:'forward'},power:{choice:'LIGHT'}}})};
 expect((await inferDriving(client,w)).command.steer).toBeLessThan(0);expect((await inferDriving(client,w)).command.steer).toBeGreaterThan(0);expect(calls).toBe(2);
});

test('Cancelled inference cannot install recovery state',async()=>{
 const w=boundary(),abort=new AbortController();const client={infer:async()=>{abort.abort(new Error('Stopped'));return {answers:{action:{choice:'reverse'}}};}};
 await expect(inferDriving(client,w,abort.signal)).rejects.toThrow('Stopped');w.x-=.5;w.contacts.clear();expect(drivingContract(w).phase).not.toBe('clearance');
});

function armed(){const w=createCourse('kart');Object.assign(w,{x:0,z:0,heading:0,item:'RED_SHELL'});w.pickups=[];w.objects=[{id:'front',kind:'car',x:5,z:-15,speed:10,heading:0},{id:'back',kind:'car',x:0,z:10,speed:10,heading:0}];return w;}

test('Weapon questions use actual inventory and eligible targets, independently of driving',()=>{
 const w=armed(),c=combatContract(w);expect(Object.keys(validQuestions(c.questions))).toEqual(['fire','target']);expect(Object.keys(c.questions.target.criteria)).toEqual(['front']);
 expect(c.decode({fire:{noul:.9},target:{choice:'front'}})).toEqual({item:true,target:'front'});
 expect(c.decode({fire:{noul:.2},target:{choice:'front'}}).item).toBe(false);
 w.itemCount++;expect(c.valid(w)).toBe(false);w.item=null;expect(combatContract(w)).toBeNull();
 w.item='RED_SHELL';w.objects=w.objects.filter(o=>o.id==='back');expect(combatContract(w)).toBeNull();
});

test('Combat limits in-flight work and drops stale inventory, old worlds and aborted replies',async()=>{
 for(const kind of ['inventory','world','abort','late','moved','valid']){
  let w=armed(),resolve,calls=0,fired=0;const ac=new AbortController(),client={infer:()=>{calls++;return new Promise(r=>{resolve=r;});}};
  const pilot=createCombatPilot(client,()=>w,ac.signal,()=>fired++);
  for(let i=0;i<20;i++)pilot.tick();expect(calls).toBe(1);
  if(kind==='inventory')w.itemCount++;if(kind==='world')w=armed();if(kind==='abort')ac.abort();
  if(kind==='late')w.time+=2;if(kind==='moved')w.objects[0].z=20;
  resolve({answers:{fire:{noul:.95},target:{choice:'front'}}});await settle();expect(fired).toBe(kind==='valid'?1:0);ac.abort();
 }
});

test('Red shells home within a finite turn rate and still obey collisions and shields',()=>{
 for(const shield of [false,true]){
  const w=armed();w.time=1;w.objects=w.objects.filter(o=>o.id==='front');const target=w.objects[0];target.shieldUntil=shield?20:0;
  useItem(w,w,'front');expect(w.projectiles[0].target).toBe('front');stepItems(w,.01,{});
  const shot=w.projectiles[0];expect(Math.abs(Math.atan2(shot.vx,-shot.vz))).toBeLessThanOrEqual(.02001);
  for(let i=0;i<200&&w.projectiles.length;i++){w.time+=.01;stepItems(w,.01,{});}
  expect(w.projectiles).toHaveLength(0);expect(!!target.stunUntil).toBe(!shield);
 }
});
