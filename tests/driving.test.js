import {test,expect} from 'bun:test';
import {createWorld,stepWorld,drivingState} from '../src/race-physics.js';
import {createCourse,stepCourse,parkingFit,bodyOverlap,recoverCourse,pathPoint,projectPath,courseState,courseQuestions,signalAt} from '../src/race-course.js';
import {validQuestions} from '../src/core.js';
import {drivingQueries,applyRisk} from '../src/race-policy.js';

test('Traffic density changes actual obstacle spacing and population',()=>{
 const worlds=['low','medium','high'].map(d=>createWorld('traffic',160,d));
 expect(worlds[0].cars.length).toBeLessThan(worlds[1].cars.length);expect(worlds[1].cars.length).toBeLessThan(worlds[2].cars.length);
 for(const w of worlds){for(let i=0;i<10000;i++)stepWorld(w,1/120,1,'ACCELERATE');expect(w.cars.length).toBeGreaterThan(0);expect(w.cars.length).toBeLessThan(40);}
});
test('Mechanical maximum is independent of user speed-limit settings',()=>{
 const a=createCourse('slalom','low',20),b=createCourse('slalom','low',300);for(const w of [a,b]){w.objects=[];w.bounds={x:10000,z:10000};w.gates=[];w.course='parking';}
 for(let i=0;i<3000;i++){stepCourse(a,1/120,{throttle:1});stepCourse(b,1/120,{throttle:1});}
 expect(a.speed).toBeCloseTo(b.speed,6);expect(a.speed*3.6).toBeGreaterThan(160);
});
test('Road perception includes front, side and rear motion, but no distant omniscience',()=>{
 const w=createWorld();w.speed=20;w.cars=[{id:0,lane:0,z:200,speed:0},{id:1,lane:0,z:0,speed:30},{id:2,lane:2,z:-25,speed:5}];
 const s=drivingState(w);expect(s.lanes[0].alongside).toBe(true);expect(s.lanes[0].clearance_m).toBe(0);expect(s.lanes[0].closing_kmh).toBe(-36);expect(s.lanes[2].rear_gap_m).toBe(25);expect(s.sensor_range_m).toBe(160);
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
test('Kart boost comes from a finite pickup, not an infinitely regenerating button',()=>{
 const w=createCourse('kart');w.objects=[];w.halfWidth=1000;w.bounds={x:1000,z:1000};w.speed=10;w.item='BOOST';
 stepCourse(w,1,{throttle:1,item:true});expect(w.item).toBeNull();expect(w.itemsUsed).toBe(1);expect(w.boosting).toBe(true);
 stepCourse(w,3,{brake:1});expect(w.boosting).toBe(false);
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
  const state=courseState(w);expect(JSON.stringify(state).length).toBeLessThan(7000);expect(state.observations.objects.length).toBeLessThanOrEqual(40);expect(Number.isFinite(state.target.bearing_degrees)).toBe(true);expect(validQuestions(courseQuestions)).toBe(courseQuestions);
 }
});
test('Course state exposes cones beside and behind the car without a user sensor dial',()=>{
 const w=createCourse('slalom');w.objects=[{id:'left',kind:'cone',x:-2,z:w.z,width:.65,length:.65},{id:'back',kind:'cone',x:0,z:w.z+3,width:.65,length:.65}];w.sensorRange=1;
 const s=courseState(w);expect(s.observations.objects.map(o=>o.id)).toEqual(['left','back']);expect(s.observations.range_m.rear).toBe(40);expect(s.manoeuvres.arcs.length).toBe(6);expect(s.next_gates.length).toBe(3);
});
test('Noul risk gate is a probability threshold, not a severity or steering scale',()=>{
 expect(applyRisk('FORWARD',.9,10)).toBe('BRAKE');expect(applyRisk('FORWARD',.6,10)).toBe('COAST');expect(applyRisk('FORWARD',.1,10)).toBe('FORWARD');expect(applyRisk('REVERSE',.9,2)).toBe('REVERSE');expect(applyRisk('FORWARD',undefined,10)).toBe('FORWARD');expect(applyRisk('FORWARD',.9,0)).toBe('FORWARD');expect(drivingQueries(courseQuestions,false)).toBe(courseQuestions);expect(drivingQueries(courseQuestions).imminent_collision.type).toBe('noul');
});
test('Slight steering retains useful grip at speed without exceeding lateral limit',()=>{
 const w=createCourse('kart');w.objects=[];w.bounds={x:1000,z:1000};w.halfWidth=1000;w.speed=12;
 stepCourse(w,.5,{pedal:'COAST',steer:.32});expect(w.heading-w.checkpoint.heading).toBeGreaterThan(.2);
});

test('A line command cannot steer the car; only actual wheel input changes yaw',()=>{
 for(const course of ['kart','city','slalom']){const w=createCourse(course);w.objects=[];w.halfWidth=1000;w.bounds={x:1000,z:1000};const h=w.heading;stepCourse(w,1,{line:1,throttle:1});expect(w.heading).toBeCloseTo(h,8);stepCourse(w,.5,{steer:.3,throttle:.2});expect(w.heading).not.toBeCloseTo(h,4);}
});
test('Direct controls pair gear with pedals, never route-line choices',()=>{
 expect(Object.keys(courseQuestions)).toEqual(['steering','motion','handbrake']);expect(Object.keys(courseQuestions.steering.criteria)).toContain('TRIM_LEFT');expect(Object.keys(courseQuestions.motion.criteria)).toContain('REVERSE_FEATHER');
});
