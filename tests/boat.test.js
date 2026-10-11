import {test,expect} from 'bun:test';
import {createBoat,stepBoat,boatState,fireBroadside,seaHeight,seaWaves,waterHeight,boatQuestions,boatContract,decodeBoat} from '../src/boat-physics.js';
import {validQuestions} from '../src/core.js';
import {panicAvailable,panicContract,firePanic,boardingSeconds,panicCooldownSeconds} from '../src/boat-physics.js';
const advance=(w,seconds,command={pedal:'FULL',steer:0})=>{for(let t=0;t<seconds;t+=1/60)stepBoat(w,1/60,command);};
test('Last stand exists only in the final boarding second and revalidates before firing',()=>{
 const w=createBoat();w.time=6;w.waves=[];const p={id:0,x:8,z:0,heading:0,speed:8,hull:3,boarding:1};w.police=[p];w.speed=8;
 expect(panicContract(w)).toBeNull();expect(firePanic(w)).toBe(false);
 p.boarding=boardingSeconds-.8;const contract=panicContract(w);expect(Object.keys(validQuestions(contract.questions))).toEqual(['panic_fire']);
 expect(w.balls.length).toBe(0);expect(firePanic(w)).toBe(true);expect(w.balls.length).toBe(32);expect(firePanic(w)).toBe(false);expect(contract.valid(w)).toBe(false);
 advance(w,.2,{sail:.5});expect(w.finished).toBe(false);expect(p.boarding).toBe(0);expect(w.disabled).toBe(1);
 p.hull=3;p.boarding=3;p.x=w.x+8;p.z=w.z;w.time=w.panicReadyAt-.01;expect(panicAvailable(w)).toBe(false);w.time+=.02;expect(panicAvailable(w)).toBe(true);expect(panicCooldownSeconds).toBe(90);
 p.boarding=0;expect(firePanic(w)).toBe(false);
});
test('Cannon questions appear only with a loaded bank and target in its arc',()=>{
 const w=createBoat();w.time=5;w.police=[{id:0,x:25,z:0,heading:0,speed:0,hull:3}];
 expect(Object.keys(boatContract(w).questions)).toEqual(['rudder','sail','starboard_fire']);
 expect(boatContract(w).state.phase).toBe('repel boarding');expect(boatContract(w).state.island).toBeUndefined();
 w.reloads.right=2;expect(Object.keys(boatContract(w).questions)).toEqual(['rudder','sail']);
 expect(decodeBoat({rudder:{choice:'CENTER'},sail:{choice:'FULL'}})).toEqual({steer:0,sail:1,port:false,starboard:false});
 w.police[0].x=150;expect(boatContract(w).state.phase).toBe('voyage');expect(boatContract(w).state.island.range_m).toBe(12000);
});
test('Boat boarding precedes motion; density and finite horizon are independent of model sequences',()=>{
 const w=createBoat('high');advance(w,4);expect(w.distance).toBe(0);advance(w,3);expect(w.distance).toBeGreaterThan(0);expect(w.police.length).toBe(6);
 w.police.push({id:50,x:9999,z:9999,hull:3,speed:12});expect(boatState(w).boats.length).toBeLessThan(7);expect(Object.keys(validQuestions(boatQuestions))).toEqual(['rudder','sail','port_fire','starboard_fire']);
});
test('Boat integrates consistently under different frame cadences and respects speed cap',()=>{
 const a=createBoat('low',60),b=createBoat('low',60);a.police=[];b.police=[];a.waves=[];b.waves=[];
 for(let i=0;i<600;i++)stepBoat(a,1/60,{pedal:'FULL',steer:.1});for(let i=0;i<100;i++)stepBoat(b,.1,{pedal:'FULL',steer:.1});
 expect(Math.abs(a.x-b.x)).toBeLessThan(.1);expect(a.speed).toBeLessThanOrEqual(60/3.6);expect(a.heading).toBeGreaterThan(0);
});
test('Broadside reload is bounded and projectiles disable a boat',()=>{
 const w=createBoat();w.time=5;w.police=[{id:0,x:25,z:0,heading:0,speed:0,hull:3,variant:0}];w.waves=[];
 expect(fireBroadside(w,1)).toBe(true);expect(fireBroadside(w,1)).toBe(false);expect(w.balls.length).toBe(3);advance(w,1,{pedal:'COAST'});
 expect(w.disabled).toBe(1);expect(w.police[0].hull).toBe(0);expect(w.shots).toBe(1);expect(w.bursts.some(b=>b.type==='fire')).toBe(true);
});
test('Collision, steep wave damage and sinking remain real; distance does not end pursuit',()=>{
 const w=createBoat();w.time=5;w.police=[{id:0,x:2,z:1,heading:0,speed:0,hull:3}];stepBoat(w,.02);expect(w.hits).toBe(1);expect(w.hull).toBeLessThan(100);
 w.police=[];w.waves=[{x:w.x,z:w.z,radius:100}];w.speed=18;const before=w.hull;advance(w,1);expect(w.hull).toBeLessThan(before);
 w.hull=.001;stepBoat(w,.1,{pedal:'FULL'});expect(w.finished).toBe(true);expect(w.failed).toBe(true);
 const safe=createBoat();safe.time=5;safe.z=-2000;stepBoat(safe,.1);expect(safe.finished).toBe(false);expect(safe.failed).toBe(false);
});
test('Destroyed pursuers return staggered, reusing bounded fleet slots',()=>{
 const w=createBoat('high');w.time=5;w.waves=[];
 for(const p of w.police){p.hull=0;p.destroyedAt=5;}
 advance(w,8,{sail:0});expect(w.reinforcements).toBe(1);expect(w.police.filter(p=>p.hull>0).length).toBe(1);
 advance(w,3,{sail:0});expect(w.reinforcements).toBe(1);
 advance(w,2,{sail:0});expect(w.reinforcements).toBe(2);expect(w.police.length).toBe(6);
 expect(new Set(w.police.map(p=>p.id)).size).toBe(6);
});
test('The distant island is the destination; heading toward it alone is not victory',()=>{
 const w=createBoat();w.time=5;w.police=[];w.waves=[];
 expect(boatState(w).island.range_m).toBe(12000);expect(boatState(w).island.bearing_deg).toBe(0);
 stepBoat(w,.1,{sail:1});expect(w.finished).toBe(false);
 w.z=w.island.z+w.island.radius+1;w.speed=5;stepBoat(w,.5,{sail:1});expect(w.finished).toBe(true);expect(w.failed).toBe(false);expect(w.endReason).toBe('LANDED');
});
test('Endless travel keeps waves nearby and fleets bounded without removing losses',()=>{
 const w=createBoat('high');w.time=5;
 for(let i=0;i<100;i++){w.x+=1000;w.z-=1000;stepBoat(w,.2,{sail:0});}
 expect(w.finished).toBe(false);expect(w.police.length).toBe(6);expect(w.waves.length).toBe(18);expect(w.reinforcements).toBeGreaterThan(0);
 stepBoat(w,1,{sail:0});expect(w.waves.every(p=>Math.hypot(p.x-w.x,p.z-w.z)<400)).toBe(true);
 w.hull=0;stepBoat(w,.01);expect(w.finished).toBe(true);expect(w.endReason).toBe('SUNK');
});
test('Water stays finite; disabled pursuers and finite effects are bounded',()=>{
 expect(Math.abs(seaHeight(125,-451,12))).toBeLessThanOrEqual(seaWaves.reduce((v,w)=>v+w[0],0));
 const w=createBoat();w.time=5;w.police=[];w.waves=[];advance(w,120,{pedal:'FULL',fire:1});expect(w.balls.length).toBeLessThanOrEqual(6);expect(w.bursts.length).toBeLessThanOrEqual(32);expect(w.trail.length).toBeLessThanOrEqual(52);
});
test('Repeated contact jitter cannot drain the hull every frame; steep patches share the wave field',()=>{
 const w=createBoat();w.time=5;w.waves=[];w.police=[{id:0,x:2,z:1,heading:0,speed:0,hull:3}];
 for(let i=0;i<15;i++){w.police[0].x=w.x+2;w.police[0].z=w.z+1;w.contacts.clear();stepBoat(w,.1,{pedal:'COAST'});}
 expect(w.hits).toBe(1);expect(w.hull).toBe(88);
 w.waves=[{x:3,z:-70,radius:12}];expect(waterHeight(w,3,-70)).toBeCloseTo(seaHeight(3,-70,w.time)*4,10);
});
