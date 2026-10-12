import {test,expect} from 'bun:test';
import {Client,validQuestions} from '../src/core.js';
import {createWorld,drivingState,drivingQuestions} from '../src/race-physics.js';
import {createCourse,courseState} from '../src/race-course.js';
import {drivingContract,inferDriving,pedalPressure,slalomRisk} from '../src/driving-policy.js';
import {vehicleStep,surroundings} from '../src/vehicle-controls.js';
import {createArcadeKart,arcadeKartState,kartQuestions} from '../src/arcade-kart.js';
import {createBoat,boatContract} from '../src/boat-physics.js';
import {createGreenWorld,greenContract,applyGreenDecision} from '../src/green-light-world.js';
import {buildRequests} from '../src/pigment/jev.mjs';
import {presets,makeQuestions} from '../src/chat-engine.js';
import {createGame} from '../src/pacman/sim.js';
import {Scheduler} from '../src/pacman/scheduler.js';

function answers(qs){return Object.fromEntries(Object.entries(qs).map(([id,q])=>{if(q.type==='noul')return [id,{type:'noul',noul:.1}];const keys=q.type==='score'?q.criteria.map((_,i)=>String(i)):Object.keys(q.criteria);return [id,{type:q.type,choice:keys[0],score:0,probabilities:Object.fromEntries(keys.map((k,i)=>[k,i===0?1:0])),confidence:1}];}));}
function contracts(){const green=createGreenWorld();green.observation={x:0,y:1,z:10,vx:0,vz:1};return [
 ...['low','medium','high'].flatMap(density=>['traffic','race'].map(mode=>({state:drivingState(createWorld(mode,160,density)),questions:drivingQuestions}))),
 ...['parking','slalom','city'].map(mode=>drivingContract(createCourse(mode))),
 {state:arcadeKartState(createArcadeKart()),questions:kartQuestions},boatContract(createBoat()),greenContract(green),...buildRequests('A green tree','silhouette',10),
 {state:{message:'Hello'},questions:makeQuestions(presets.signal.instructions,presets.signal.criteria)},
 {state:{price:2},questions:{classification:{type:'choice',criteria:{RISING:null,FALLING:null}}}}
 ];}
for(const protocol of ['systemone','decision'])test(`${protocol}: every mode uses validated real transport shapes at configurable capacity`,async()=>{
 const old=fetch;let active=0,peak=0;globalThis.fetch=async(url,init)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;const body=JSON.parse(init.body);return Response.json(body.questions?{answers:answers(body.questions)}:{results:[{fields:Object.fromEntries(Object.entries(body.schema).map(([id,s])=>[id,{value:s.type==='boolean'?false:s.choices[0],probability:1}]))}]});};
 try{for(const capacity of [1,8,40]){const client=new Client({url:'http://localhost:8000',protocol,concurrency:capacity,timeout:5});const work=contracts();const results=await Promise.all(work.map(c=>{validQuestions(c.questions);return client.infer(c.state,c.questions);}));expect(results).toHaveLength(work.length);expect(results.every((r,i)=>Object.keys(r.answers).length===Object.keys(work[i].questions).length)).toBe(true);expect(client.budget.active).toBe(0);}expect(peak).toBeGreaterThan(8);}finally{globalThis.fetch=old;}
});
test('cone acceleration is gentle, pressure is continuous and risk does not invent a route',()=>{
 const w=createCourse('slalom'),car=createCourse('city');for(let i=0;i<120;i++){w.time+=1/120;car.time+=1/120;vehicleStep(w,1/120,{throttle:1});vehicleStep(car,1/120,{throttle:1});}
 expect(w.speed).toBeLessThan(1);expect(car.speed).toBeGreaterThan(6);expect(courseState(w).vehicle.maximum_acceleration_m_s2).toBe(2.4);
 const p=pedalPressure({choice:'FULL',probabilities:{FULL:.5,FEATHER:.5}});expect(p).toBeCloseTo(.56);
 const command={gear:'DRIVE',throttle:1,brake:0,steer:.2};expect(slalomRisk(command,.5,4)).toEqual({...command,throttle:.5,brake:.125});expect(slalomRisk(command,.9,4).throttle).toBeLessThan(.11);
 const contract=drivingContract(w);expect(contract.questions.imminent_collision.type).toBe('noul');expect(contract.state.vehicle).toBeDefined();
});
test('Pac-Man independent actors start together; stale/reset work is aborted, never reused',async()=>{
 let limit=1,now=0;const pending=[],events=[];
 const scheduler=new Scheduler({maxInFlight:()=>limit,now:()=>now,timeoutMs:1000,actors:()=>['pacman','blinky','pinky','inky','clyde'],onEvent:e=>events.push(e),transport:(body,signal)=>new Promise(resolve=>pending.push({body,signal,resolve}))});
 const state=createGame({ghostsByAI:true});for(const g of Object.values(state.ghosts)){g.state='normal';g.tile={x:6,y:5};g.dir='right';g.waiting=true;}
 limit=10;scheduler.update(state);expect(pending.length).toBeGreaterThan(3);expect(pending.every(p=>Object.keys(p.body.questions).length===1)).toBe(true);
 scheduler.reset();expect(pending.every(p=>p.signal.aborted)).toBe(true);pending.forEach(p=>p.resolve({answers:answers(p.body.questions),latencyMs:1}));await new Promise(r=>setTimeout(r,0));expect(scheduler.ready.size).toBe(0);expect(scheduler.slots.inFlight).toBe(0);
});
test('Green Light refuses old tracking replies instead of granting aim through latency',()=>{
 const w=createGreenWorld();w.observation={x:0,y:1,z:10};const track=w.track;w.track++;expect(applyGreenDecision(w,{mount:{choice:'RAISE'}},track,0)).toBe(false);expect(w.turret.raised).toBe(false);
});

test('a contact during inference cannot install stale recovery policy',async()=>{
 const w=createCourse('slalom');Object.assign(w,{x:15.99,z:-15,heading:Math.PI/2});w.contacts.add('edge');
 const result=await inferDriving({infer:async()=>{w.hits++;return {answers:{action:{choice:'reverse'}}};}},w);
 expect(result.stale).toBe(true);expect(result.command.brake).toBe(1);
 w.x-=.5;w.contacts.clear();expect(drivingContract(w).phase).not.toBe('clearance');
});

test('physical sensor horizon includes every visible actor, not only forty',()=>{
 const w=createCourse('slalom'),cones=Array.from({length:65},(_,i)=>({id:i,kind:'cone',x:0,z:-i-2}));
 expect(surroundings(w,cones).objects).toHaveLength(65);
 expect(surroundings(w,[{id:'far',x:0,z:-1000}]).objects).toHaveLength(0);
});

test('Pac-Man rebuilds queued criteria from the state at dispatch',()=>{
 const state=createGame(),calls=[],slots={inFlight:1};
 const scheduler=new Scheduler({slots,maxInFlight:1,actors:['pacman'],now:()=>0,onEvent:()=>{},transport:body=>{calls.push(body);return new Promise(()=>{});}});
 scheduler.update(state);expect(calls).toHaveLength(0);
 for(const p of scheduler.pending.values())p.q.features=[];
 state.score=999;slots.inFlight=0;scheduler.update(state);
 expect(calls).toHaveLength(1);expect(calls[0].state.score).toBe(999);
 expect(Object.values(calls[0].questions).every(q=>Object.keys(q.criteria).length>0)).toBe(true);scheduler.reset();
});
