import {test,expect} from 'bun:test';
import {createArcadeKart,stepArcadeKart,arcadeKartState,kartQuestions} from '../src/arcade-kart.js';
import {manualInput} from '../src/manual-controls.js';
import {pathPoint} from '../src/race-course.js';
import {combatContract} from '../src/combat-policy.js';
import {validQuestions} from '../src/core.js';

test('Arcade kart uses the original lane/pedal contract and has a visible item control',()=>{
 expect(Object.keys(validQuestions(kartQuestions))).toEqual(['lane','throttle']);
 expect(manualInput('kart-arcade',{},new Set(['d','w','Shift']))).toEqual({lane:2,throttle:'ACCELERATE',item:true});
 const w=createArcadeKart();stepArcadeKart(w,.5,2,'ACCELERATE');expect(w.laneOffset).toBeCloseTo(3,5);expect(w.speed).toBeGreaterThan(0);expect(w.heading).toBe(pathPoint(w.path,w.progress).heading);
});
test('Arcade rivals, side/rear clearance, pickups and weapons remain real',()=>{
 const w=createArcadeKart();w.objects[0].s=w.progress;w.objects[0].offset=-3;
 let state=arcadeKartState(w);expect(state.lanes[0].alongside).toBe(true);expect(state.item_boxes.length).toBeGreaterThan(0);
 w.objects=[];w.pickups=[{id:0,x:w.x,z:w.z,readyAt:0}];stepArcadeKart(w,.01,1,'COAST');expect(w.item).toBe('SHELL');
 stepArcadeKart(w,.01,1,'COAST',{item:true});expect(w.itemsUsed).toBe(1);expect(w.projectiles.length).toBe(1);
 w.item='BOOST';expect(combatContract(w).state.control).toContain('Three track-relative lanes');
});
test('Crossing an occupied kart lane is blocked with one contact, not teleportation',()=>{
 const w=createArcadeKart();const o=w.objects[0];w.objects=[o];Object.assign(o,{s:w.progress,offset:0,speed:0});w.laneOffset=-3;
 for(let i=0;i<30;i++)stepArcadeKart(w,.1,2,'COAST');expect(w.laneOffset).toBeLessThan(-1.69);expect(w.hits).toBe(1);
 stepArcadeKart(w,.5,0,'COAST');expect(w.laneOffset).toBeCloseTo(-3,4);
});
test('Frame cadence preserves travel; three complete laps finish the race',()=>{
 const a=createArcadeKart(),b=createArcadeKart();a.objects=[];b.objects=[];
 for(let i=0;i<600;i++)stepArcadeKart(a,1/60,1,'ACCELERATE');for(let i=0;i<100;i++)stepArcadeKart(b,.1,1,'ACCELERATE');
 expect(a.distance).toBeCloseTo(b.distance,5);
 a.progress=a.startS+3*a.path.length-.01;a.speed=20;stepArcadeKart(a,.1,1,'ACCELERATE');expect(a.finished).toBe(true);expect(a.lap).toBe(4);
});
