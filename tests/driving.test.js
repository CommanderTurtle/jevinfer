import {test,expect} from 'bun:test';
import {createWorld,stepWorld,drivingState} from '../src/race-physics.js';
import {createCourse,stepCourse,parkingFit,bodyOverlap,recoverCourse,pathPoint,projectPath,courseState,courseQuestions,signalAt} from '../src/race-course.js';
import {validQuestions} from '../src/core.js';
import {drivingQueries,applyRisk} from '../src/race-policy.js';

test('Traffic density changes actual obstacle spacing and population',()=>{
 const worlds=['low','medium','high'].map(d=>createWorld('traffic',160,d));
 expect(worlds[0].cars.length).toBeLessThan(worlds[1].cars.length);expect(worlds[1].cars.length).toBeLessThan(worlds[2].cars.length);
 for(const w of worlds){for(let i=0;i<10000;i++)stepWorld(w,1/120,0,'ACCELERATE');expect(w.cars.length).toBeGreaterThan(0);expect(w.cars.length).toBeLessThan(40);}
});
test('Road speed control reaches 300 km/h on a clear road',()=>{
 const w=createWorld('traffic',300);for(let i=0;i<1800;i++){w.cars=[];stepWorld(w,1/120,0,'ACCELERATE');}expect(w.speed*3.6).toBeCloseTo(300,5);
});
test('Road perception does not leak distant cars and includes rear closing speed',()=>{
 const w=createWorld();w.sensorRange=40;w.speed=20;w.cars=[{lane:0,z:41,speed:0},{lane:1,z:-12,speed:30},{lane:2,z:25,speed:5}];
 const s=drivingState(w);expect(s.lanes[0].obstacle).toBeNull();expect(s.lanes[0].clearance_m).toBe(40);expect(s.lanes[1].rear_gap_m).toBe(12);expect(s.lanes[1].rear_closing_kmh).toBe(36);expect(s.lanes[2].closing_kmh).toBe(54);
});
test('Free steering bends trajectory; reverse changes steering direction',()=>{
 const w=createCourse('parking');w.objects=[];w.x=0;w.z=15;
 stepCourse(w,1,{steer:.5,pedal:'FORWARD'});expect(w.heading).toBeGreaterThan(0);expect(w.x).toBeGreaterThan(0);expect(w.z).toBeLessThan(15);
 const r=createCourse('parking');r.objects=[];stepCourse(r,1,{steer:.5,pedal:'REVERSE'});expect(r.speed).toBeLessThan(0);expect(r.heading).toBeLessThan(0);expect(r.z).toBeGreaterThan(15);
});
test('Parking requires the whole aligned vehicle at rest for one second',()=>{
 const w=createCourse('parking');w.x=w.bay.x;w.z=w.bay.z;w.heading=0;w.speed=0;
 expect(parkingFit(w)).toBe(true);w.heading=.5;expect(parkingFit(w)).toBe(false);w.heading=0;w.x+=1;expect(parkingFit(w)).toBe(false);w.x=w.bay.x;w.speed=1;expect(parkingFit(w)).toBe(false);w.speed=0;
 stepCourse(w,.5,{pedal:'BRAKE'});expect(w.finished).toBe(false);stepCourse(w,.6,{pedal:'BRAKE'});expect(w.finished).toBe(true);
});
test('High-speed collision cannot cross a parked vehicle; reverse can recover',()=>{
 const w=createCourse('slalom');w.x=0;w.z=15;w.speed=70;w.objects=[{id:'test',x:0,z:0,width:1.8,length:4.2,heading:0,kind:'car'}];
 stepCourse(w,.4,{steer:0,pedal:'FORWARD'});expect(w.hits).toBe(1);expect(w.z).toBeGreaterThan(3.9);expect(bodyOverlap(w,w.objects[0])).toBe(false);
 const z=w.z;stepCourse(w,.7,{steer:0,pedal:'REVERSE'});expect(w.z).toBeGreaterThan(z);expect(w.hits).toBe(1);
});
test('Pushing against one cone does not count hundreds of separate crashes',()=>{
 const w=createCourse('slalom');w.objects=[{id:'cone',kind:'cone',x:0,z:0,width:.65,length:.65}];w.x=0;w.z=4;stepCourse(w,10,{pedal:'FORWARD',steer:0});expect(w.hits).toBe(1);expect(w.z).toBeGreaterThan(2);
});
test('Cone contacts are physical, gates distinguish a pass from a miss',()=>{
 const w=createCourse('slalom');w.x=-4;w.z=2;w.speed=8;stepCourse(w,.5,{pedal:'COAST'});expect(w.gate).toBe(1);expect(w.missed).toBe(0);
 const bad=createCourse('slalom');bad.x=10;bad.z=2;bad.speed=8;stepCourse(bad,.5,{pedal:'COAST'});expect(bad.gate).toBe(1);expect(bad.missed).toBe(1);
});
test('Kart boost consumes and recovers energy without infinite acceleration',()=>{
 const w=createCourse('kart','low',160);w.objects=[];w.halfWidth=1000;w.bounds={x:1000,z:1000};w.speed=10;
 stepCourse(w,1,{pedal:'BOOST'});expect(w.boost).toBeCloseTo(68,3);expect(w.speed).toBeGreaterThan(20);stepCourse(w,1,{pedal:'BRAKE'});expect(w.boost).toBeCloseTo(76,3);
});
test('Rounded circuits close continuously and cannot increment laps by reversing',()=>{
 for(const course of ['kart','city']){const w=createCourse(course),a=pathPoint(w.path,0),b=pathPoint(w.path,w.path.length);expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeLessThan(.001);
 for(let s=0;s<w.path.length;s+=1){const p=pathPoint(w.path,s),q=projectPath(w.path,p);expect(q.distance).toBeLessThan(.001);}
 w.objects=[];stepCourse(w,1,{pedal:'REVERSE'});expect(w.lap).toBe(1);expect(w.progress).toBeLessThan(w.startS);}
});
test('City signals cycle, pedestrians cross only on the pedestrian phase',()=>{
 const w=createCourse('city'),c=w.crossings[0];expect(signalAt(w,c)).toBe('green');w.time=15;expect(signalAt(w,c)).toBe('amber');w.time=20;expect(signalAt(w,c)).toBe('red');
 stepCourse(w,.01,{pedal:'BRAKE'});const p=w.objects.find(o=>o.id==='ped0/0');expect(Math.abs(p.x-c.x)).toBeLessThan(3);
});
test('Recover resets dynamics without erasing penalties; snapshots stay bounded and finite',()=>{
 for(const course of ['parking','slalom','kart','city']){
  const w=createCourse(course,'high',300);w.hits=3;stepCourse(w,.5,{pedal:'FORWARD',steer:.2});recoverCourse(w);expect(w.speed).toBe(0);expect(w.hits).toBe(3);expect(w.x).toBe(w.checkpoint.x);
  const state=courseState(w);expect(JSON.stringify(state).length).toBeLessThan(2500);expect(state.free_space_rays.length).toBe(5);expect(Number.isFinite(state.target.bearing_degrees)).toBe(true);expect(validQuestions(courseQuestions)).toBe(courseQuestions);
 }
});
test('Course sensors have bounded front/rear horizons and advise slowing before bends',()=>{
 const w=createCourse('kart');w.sensorRange=40;const s=courseState(w);expect(s.sensor_horizon_m).toBe(40);expect(s.free_space_rays.every(r=>r.clearance_m<=40)).toBe(true);expect(s.rear_clearance_m).toBeLessThanOrEqual(12);expect(s.recommended_speed_kmh).toBeLessThanOrEqual(100);
});
test('Noul risk gate is a probability threshold, not a severity or steering scale',()=>{
 expect(applyRisk('FORWARD',.9,10)).toBe('BRAKE');expect(applyRisk('FORWARD',.6,10)).toBe('COAST');expect(applyRisk('FORWARD',.1,10)).toBe('FORWARD');expect(applyRisk('REVERSE',.9,2)).toBe('REVERSE');expect(applyRisk('FORWARD',undefined,10)).toBe('FORWARD');expect(applyRisk('FORWARD',.9,0)).toBe('FORWARD');expect(drivingQueries(courseQuestions,false)).toBe(courseQuestions);expect(drivingQueries(courseQuestions).imminent_collision.type).toBe('noul');
});
test('Slight steering retains useful grip at speed without exceeding lateral limit',()=>{
 const w=createCourse('kart');w.objects=[];w.bounds={x:1000,z:1000};w.halfWidth=1000;w.speed=12;
 stepCourse(w,.5,{pedal:'COAST',steer:.32});expect(w.heading-w.checkpoint.heading).toBeGreaterThan(.2);
});

test('Route actuator follows complete circuits without changing the chosen pedal',()=>{
 for(const course of ['kart','city']){
  const w=createCourse(course);w.objects=[];
  for(let i=0;i<4500&&!w.finished;i++){const s=courseState(w);stepCourse(w,.05,{line:0,pedal:w.speed*3.6<s.recommended_speed_kmh?'FORWARD':'BRAKE'});}
  expect(w.finished).toBe(true);expect(w.hits).toBe(0);expect(w.lap).toBe(4);
 }
 const idle=createCourse('kart');stepCourse(idle,1,{line:1,pedal:'BRAKE'});expect(idle.distance).toBe(0);
},15000);
test('Route actuator traverses every slalom gate without cutting through cones',()=>{
 const w=createCourse('slalom');
 for(let i=0;i<1200&&!w.finished;i++){const s=courseState(w);stepCourse(w,.05,{line:0,pedal:w.speed*3.6<s.recommended_speed_kmh?'FORWARD':'BRAKE'});}
 expect(w.finished).toBe(true);expect(w.gate).toBe(10);expect(w.missed).toBe(0);expect(w.hits).toBe(0);
});
