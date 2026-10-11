import {test,expect} from 'bun:test';
import {manualInput} from '../src/manual-controls.js';
import {modeQuestions,decodeControls,vehicleStep,recoverySteering,motionValues,wheelEffects} from '../src/vehicle-controls.js';
import {createCourse,stepCourse,courseState} from '../src/race-course.js';
import {createBoat,stepBoat,boatState,decodeBoat,fireBroadside} from '../src/boat-physics.js';
import {validQuestions} from '../src/core.js';
import {batchBoxes} from '../src/render-batch.js';
import * as THREE from '../vendor/three.js';

test('Each course has a distinct policy; kart combat is a Noul, never a probability-as-strength',()=>{
 for(const mode of ['parking','slalom','city','kart'])validQuestions(modeQuestions(mode));
 expect(new Set(['parking','slalom','city','kart'].map(m=>modeQuestions(m).motion.instructions)).size).toBe(4);
 const a={steering:{choice:'TRIM_RIGHT'},motion:{choice:'FORWARD_FEATHER'},handbrake:{choice:'PULSE'},item:{noul:.51}};
 expect(decodeControls(a)).toEqual({steer:.07,throttle:.12,brake:0,gear:'DRIVE',handbrake:'PULSE',item:true});
 a.item.noul=.49;expect(decodeControls(a).item).toBe(false);
});
test('Visible and keyboard controls map to the same actuator contract, mode by mode',()=>{
 const k=new Set();
 expect(manualInput('traffic',{lane:2,throttle:1},k)).toEqual({lane:2,throttle:'ACCELERATE'});
 expect(manualInput('parking',{steer:.12,throttle:.3,brake:.1,gear:'REVERSE'},k)).toMatchObject({steer:.12,throttle:.3,brake:.1,gear:'REVERSE'});
 expect(manualInput('kart',{},new Set(['w','Shift',' ']))).toMatchObject({throttle:1,item:true,handbrake:'HOLD'});
 expect(manualInput('city',{},new Set(['Shift']))).toMatchObject({item:false});
 expect(manualInput('pirate',{steer:.25,throttle:.5},new Set(['q','e']))).toEqual({steer:.25,sail:.5,port:true,starboard:true});
 expect(manualInput('pirate',{throttle:1},new Set([' ']))).toMatchObject({sail:0});
});
test('A held brake prevents creep even with accelerator down; kart handling differs physically',()=>{
 const a=createCourse('parking');vehicleStep(a,.1,{throttle:1,brake:1});expect(a.speed).toBe(0);
 const b=createCourse('kart');a.speed=b.speed=10;a.heading=b.heading=0;
 vehicleStep(a,.1,{steer:.5});vehicleStep(b,.1,{steer:.5});expect(b.heading).toBeGreaterThan(a.heading);
});
test('Unassisted runs never silently replace wheel commands',()=>{
 const w=createCourse('parking');w.steer=.7;w.contacts.add('edge');
 for(let i=0;i<20;i++){expect(recoverySteering(w,{gear:'REVERSE',throttle:.3,steer:.7},.1)).toBe(.7);recoverySteering(w,{gear:'DRIVE',steer:.7},.1);}
 expect(w.recovery.assists).toBe(0);
});
test('Longitudinal choices cannot request reverse without propulsion or press both pedals',()=>{
 for(const [name,c]of Object.entries(motionValues)){expect(c.throttle*c.brake).toBe(0);if(name.startsWith('REVERSE_')){expect(c.gear).toBe('REVERSE');expect(c.throttle).toBeGreaterThan(0);}}
 const w=createCourse('parking');w.controls={gear:'REVERSE'};w.speed=-2;
 vehicleStep(w,.1,motionValues.BRAKE_FEATHER);expect(w.controls.gear).toBe('REVERSE');expect(w.speed).toBeLessThan(-1.5);
});
test('Mode states contain actual nearby actors and only relevant domain objects',()=>{
 const kart=courseState(createCourse('kart')),city=courseState(createCourse('city')),cones=courseState(createCourse('slalom'));
 expect(kart.task).toContain('combat');expect(kart.kart.racers).toBe(6);expect(kart.kart.position).toBe(6);expect(kart.traffic_signals).toEqual([]);
 expect(city.kart).toBeUndefined();expect(cones.next_gates.length).toBe(3);
 expect(cones.observations.objects.every(o=>typeof o.forward_m==='number'&&o.kind==='cone')).toBe(true);
});
test('Boat has independent cannon banks and moving boarding, not an instant contact loss',()=>{
 const w=createBoat();w.time=5;w.waves=[];w.police=[];w.speed=8;
 expect(fireBroadside(w,-1)).toBe(true);expect(fireBroadside(w,1)).toBe(true);expect(w.shots).toBe(2);
 expect(decodeBoat({rudder:{choice:'TRIM_LEFT'},sail:{choice:'HALF'},port_fire:{noul:.9},starboard_fire:{noul:.1}})).toEqual({steer:-.15,sail:.5,port:true,starboard:false});
 w.balls=[];const p={id:0,x:w.x+8,z:w.z,heading:w.heading,speed:8,hull:3};w.police=[p];
 stepBoat(w,.05,{sail:.5});expect(w.finished).toBe(false);expect(w.boarding).toBeGreaterThan(0);
 for(let i=0;i<400&&!w.finished;i++){p.x=w.x+8;p.z=w.z;p.speed=w.speed;p.heading=w.heading;stepBoat(w,.01,{sail:.5});}
 expect(w.endReason).toBe('BOARDED');expect(w.time).toBeGreaterThan(8);
 const safe=createBoat();safe.time=5;safe.police[0].boarding=2;safe.police[0].x=100;stepBoat(safe,.1);expect(safe.police[0].boarding).toBeLessThan(2);
});
test('Police close distance and destruction records an actual sinking time',()=>{
 const w=createBoat('low');w.time=5;w.waves=[];w.police=[{id:0,x:20,z:100,heading:0,speed:12,hull:3}];w.speed=16;
 const before=Math.hypot(w.police[0].x-w.x,w.police[0].z-w.z);
 for(let i=0;i<300;i++)stepBoat(w,1/60,{sail:1});
 expect(Math.hypot(w.police[0].x-w.x,w.police[0].z-w.z)).toBeLessThan(before-15);
 const shot=createBoat();shot.time=5;shot.waves=[];shot.police=[{id:0,x:25,z:0,heading:0,speed:0,hull:3}];fireBroadside(shot,1);
 for(let i=0;i<120;i++)stepBoat(shot,1/120);
 expect(shot.police[0].destroyedAt).toBeGreaterThan(5);expect(boatState(shot).boats).toEqual([]);
});
test('A last-moment cannon hit interrupts boarding in the same physics step',()=>{
 const w=createBoat();w.time=5;w.waves=[];w.speed=8;
 const p={id:0,x:8,z:0,heading:0,speed:8,hull:1,boarding:2.999};w.police=[p];
 w.balls=[{x:8,z:0,y:2,vx:0,vz:0,vy:0,age:0}];stepBoat(w,1/120,{sail:.5});
 expect(w.disabled).toBe(1);expect(w.boarding).toBe(0);expect(w.finished).toBe(false);
});
test('Wheel-effect measurements preserve signs, reverse and unchanged command ownership',()=>{
 const w=createCourse('slalom');w.speed=10;w.reactionSeconds=.5;
 const forward=wheelEffects(w);expect(forward.heading_change_deg.TRIM_LEFT).toBeLessThan(0);expect(forward.heading_change_deg.RIGHT).toBeGreaterThan(forward.heading_change_deg.TRIM_RIGHT);
 w.speed=-3;expect(wheelEffects(w).heading_change_deg.RIGHT).toBeLessThan(0);expect(w.steer).toBe(0);
});
test('Static instancing reduces boxes without moving world geometry or dynamic exclusions',()=>{
 const root=new THREE.Group(),material=new THREE.MeshBasicMaterial(),dynamic=new THREE.Group();root.add(dynamic);
 const box=new THREE.Mesh(new THREE.BoxGeometry(2,3,4),material);box.position.set(2,1,5);root.add(box);
 const other=box.clone();other.geometry=box.geometry.clone();other.position.x=7;root.add(other);
 const third=box.clone();third.geometry=box.geometry.clone();third.position.x=12;root.add(third);
 dynamic.add(new THREE.Mesh(new THREE.BoxGeometry(),material));batchBoxes(root,new Set([dynamic]));
 const instances=root.children.find(x=>x.isInstancedMesh);expect(instances.count).toBe(3);expect(dynamic.children.length).toBe(1);
 const matrix=new THREE.Matrix4();instances.getMatrixAt(0,matrix);expect(matrix.elements[12]).toBe(2);expect(matrix.elements[0]).toBe(2);
});
