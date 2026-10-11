import {test,expect} from 'bun:test';
import {createGreenWorld,stepGreenWorld,advanceGreenWorld,greenContract,applyGreenDecision,sweepSeconds,yard,cameraMount,cameraRange} from '../src/green-light-world.js';

const advance=(w,seconds,input={})=>{for(let i=0;i<Math.round(seconds*60);i++)stepGreenWorld(w,1/60,input);};
test('Long yard remains traversable with a visible, reachable objective',()=>{
 const w=createGreenWorld();expect(w.player.z-yard.doorZ).toBeGreaterThan(80);
 expect(Math.hypot(w.player.x-cameraMount.x,w.player.z-cameraMount.z)).toBeLessThan(cameraRange);
 advance(w,90,{forward:1});expect(w.player.z).toBeGreaterThanOrEqual(yard.minZ);expect(w.player.z).toBeLessThan(-18);
 w.player.x=yard.doorX;stepGreenWorld(w,1/60,{});expect(w.result).toBe('escaped');
});
test('Camera returns quickly from the start and lingers over the yard',()=>{
 const back=createGreenWorld(),front=createGreenWorld();front.cameraYaw=Math.PI;
 stepGreenWorld(back,1/60,{});stepGreenWorld(front,1/60,{});
 expect(back.cameraPeriod).toBe(6.5);expect(front.cameraPeriod).toBe(sweepSeconds);
 expect(back.cameraTurns/front.cameraTurns).toBeCloseTo(22/6.5,4);expect(back.variableSweep).toBe(false);
});
test('Halfway progress or elapsed time enables repeated, smooth speed changes',()=>{
 for(const elapsed of [false,true]){
  const w=createGreenWorld();if(elapsed)w.time=45;else w.player.z=(yard.startZ+yard.doorZ)/2;
  stepGreenWorld(w,1/60,{});expect(w.variableSweep).toBe(true);expect(w.sweepTarget).toBeGreaterThanOrEqual(2.2);expect(w.sweepTarget).toBeLessThanOrEqual(8);
  expect(Math.abs(w.sweepPeriod-6.5)).toBeLessThan(.21);expect(w.nextSweepChange-w.time).toBeGreaterThanOrEqual(2);expect(w.nextSweepChange-w.time).toBeLessThanOrEqual(4);
  const next=w.nextSweepChange;advance(w,4.1);expect(w.nextSweepChange).toBeGreaterThan(next);
  expect(w.sweepPeriod).toBeGreaterThanOrEqual(2.2);expect(w.sweepPeriod).toBeLessThanOrEqual(8);
 }
});
test('Fast return ends only twelve degrees before the yard enters view',()=>{
 const period=degrees=>{const w=createGreenWorld();w.cameraYaw=degrees*Math.PI/180;stepGreenWorld(w,1/120,{});return w.cameraPeriod;};
 expect(period(90)).toBe(6.5);expect(period(129)).toBe(6.5);
 expect(period(136)).toBeGreaterThan(6.5);expect(period(136)).toBeLessThan(22);
 expect(period(142)).toBeCloseTo(22,5);expect(period(218)).toBeCloseTo(22,5);
 expect(period(231)).toBe(6.5);
});
test('Two actual unused camera passes retract the mount, regardless of speed',()=>{
 const w=createGreenWorld();w.turret.raised=true;w.turret.lift=1;w.cameraTurns=1.99;
 stepGreenWorld(w,1/60,{});expect(w.turret.raised).toBe(true);
 w.cameraTurns=2.01;stepGreenWorld(w,1/60,{});expect(w.turret.raised).toBe(false);expect(w.turret.lift).toBeLessThan(1);
});
test('Long-range observation still requires movement; stopped or stale answers cannot act',()=>{
 const w=createGreenWorld();w.cameraYaw=Math.atan2(w.player.x-cameraMount.x,-(w.player.z-cameraMount.z));
 stepGreenWorld(w,1/60,{forward:1});expect(w.observation).not.toBeNull();expect(greenContract(w).state.camera.sweep_seconds).toBe(22);
 const track=w.track;expect(applyGreenDecision(w,{mount:{choice:'RAISE'}},track,w.time)).toBe(true);
 expect(w.turret.lastUseTurn).toBe(w.cameraTurns);
 stepGreenWorld(w,1/60,{});expect(greenContract(w)).toBeNull();expect(applyGreenDecision(w,{action:{choice:'SHOOT'}},track,w.time)).toBe(false);
 expect(w.projectiles.length).toBe(0);
});
test('Sprint unlocks only at the difficulty change and moves at 1.35x speed',()=>{
 const a=createGreenWorld(),b=createGreenWorld();advance(a,1,{forward:1});advance(b,1,{forward:1,sprint:true});expect(a.player.z).toBeCloseTo(b.player.z,6);expect(b.player.sprinting).toBe(false);
 a.variableSweep=b.variableSweep=true;const az=a.player.z,bz=b.player.z;
 advance(a,1,{forward:1});advance(b,1,{forward:1,sprint:true});expect((bz-b.player.z)/(az-a.player.z)).toBeCloseTo(1.35,5);expect(b.player.sprinting).toBe(true);
 stepGreenWorld(b,1/60,{});expect(b.player.sprinting).toBe(false);
});
test('Difficulty lingers over the yard but not the return, independent of player position',()=>{
 const yardView=createGreenWorld(),returnView=createGreenWorld();
 for(const w of [yardView,returnView]){w.variableSweep=true;w.sweepPeriod=w.sweepTarget=3;}
 yardView.cameraYaw=Math.PI;returnView.cameraYaw=0;
 stepGreenWorld(yardView,1/60,{});stepGreenWorld(returnView,1/60,{});
 expect(yardView.cameraPeriod).toBeCloseTo(28,4);expect(returnView.cameraPeriod).toBeCloseTo(3,4);
 expect(yardView.observation).toBeNull();expect(returnView.observation).toBeNull();
});

test('A 10fps renderer retains elapsed time, unlock timing and the 1.35x sprint',()=>{
 const slow=createGreenWorld(),fast=createGreenWorld();
 for(let i=0;i<451;i++)advanceGreenWorld(slow,.1,{});
 for(let i=0;i<2706;i++)advanceGreenWorld(fast,1/60,{});
 expect(slow.time).toBeCloseTo(fast.time,5);expect(slow.variableSweep).toBe(true);
 const walk=createGreenWorld();walk.variableSweep=true;
 const z=slow.player.z,wz=walk.player.z;
 for(let i=0;i<10;i++){advanceGreenWorld(slow,.1,{forward:1,sprint:true});advanceGreenWorld(walk,.1,{forward:1});}
 expect((z-slow.player.z)/(wz-walk.player.z)).toBeCloseTo(1.35,5);
});

test('Without model answers the visible player never causes a raise, aim or shot',()=>{
 const w=createGreenWorld();advance(w,60,{forward:1});
 expect(w.turret.raised).toBe(false);expect(w.turret.lift).toBe(0);expect(w.shotCount).toBe(0);expect(w.turret.yaw).toBe(Math.PI);
});

test('Only accepted RAISE and SHOOT answers actuate the mount and projectile',()=>{
 const w=createGreenWorld();w.cameraYaw=Math.atan2(w.player.x-cameraMount.x,-(w.player.z-cameraMount.z));
 stepGreenWorld(w,1/60,{forward:1});
 applyGreenDecision(w,{mount:{choice:'WAIT'}},w.track,w.time);stepGreenWorld(w,.1,{forward:1});expect(w.turret.lift).toBe(0);
 applyGreenDecision(w,{mount:{choice:'RAISE'}},w.track,w.time);stepGreenWorld(w,.1,{forward:1});expect(w.turret.lift).toBeGreaterThan(0);
 w.turret.lift=1;applyGreenDecision(w,{action:{choice:'INFER'}},w.track,w.time);expect(w.shotCount).toBe(0);
 applyGreenDecision(w,{action:{choice:'SHOOT'}},w.track,w.time);expect(w.shotCount).toBe(1);expect(w.events).toContain('shot');
 stepGreenWorld(w,.01,{});expect(applyGreenDecision(w,{action:{choice:'SHOOT'}},w.track,w.time)).toBe(false);
});
test('Beginning a sprint forces a fresh draw and shortens the randomized interval',()=>{
 const w=createGreenWorld();w.variableSweep=true;w.nextSweepChange=Infinity;
 stepGreenWorld(w,1/60,{forward:1,sprint:true});expect(w.player.sprinting).toBe(true);
 expect(w.nextSweepChange-w.time).toBeGreaterThanOrEqual(.9);expect(w.nextSweepChange-w.time).toBeLessThanOrEqual(2.2);
});
test('Full lift emits one lock click and lowering keeps its negative motor drive',()=>{
 const w=createGreenWorld();w.cameraYaw=Math.atan2(w.player.x-cameraMount.x,-(w.player.z-cameraMount.z));w.turret.raised=true;w.turret.lift=.999;w.turret.until=1;
 stepGreenWorld(w,1/60,{forward:1});expect(w.events.filter(e=>e==='lock')).toHaveLength(1);
 stepGreenWorld(w,1/60,{forward:1});expect(w.events.filter(e=>e==='lock')).toHaveLength(1);
 w.turret.raised=false;stepGreenWorld(w,1/60,{});expect(w.motor).toBeLessThan(0);
});
