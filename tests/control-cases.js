import {createCourse} from '../src/race-course.js';
export function controlCases(){
 const cases=[],add=(id,world,expectation,check)=>cases.push({id,world,expectation,check});
 let start=createCourse('parking');add('parking-start',start,'Move toward the approach point; the car is not parked yet.',c=>c.gear==='DRIVE'&&c.throttle>0);
 start=createCourse('parking');Object.assign(start,{x:4.523,z:1.426,heading:39.8*Math.PI/180,parkPhase:1,controls:{gear:'REVERSE'}});
 add('parking-after-recovery',start,'Resume forward movement toward the bay instead of indefinitely coasting at rest.',c=>c.gear==='DRIVE'&&c.throttle>0);
 for(const side of [-1,1]){const w=createCourse('slalom');Object.assign(w,{x:side*14,z:15,speed:15,heading:side*.35});add(side<0?'left-wall-approach':'right-wall-approach',w,'Steer away from the approaching wall before contact.',c=>c.steer*side<0);}
 let w=createCourse('slalom');w.speed=5;
 add('gate-left',w,'Turn toward a gate ahead-left, not right.',c=>c.steer<0&&c.gear!=='REVERSE');
 w=createCourse('slalom');w.z=-12;w.gate=1;w.speed=5;
 add('gate-right',w,'Turn toward a gate ahead-right, not left.',c=>c.steer>0&&c.gear!=='REVERSE');
 w=createCourse('parking');w.x=0;w.z=0;w.heading=0;w.objects=[{id:'block',kind:'car',x:0,z:-3.5,width:1.8,length:4.2,heading:0}];w.contacts.add('block');
 add('blocked-front',w,'Back away from the touching front car; rear is clear.',c=>c.gear==='REVERSE'&&c.throttle>0);
 w=createCourse('slalom');w.x=15.99;w.z=-15;w.heading=Math.PI/2;w.contacts.add('edge');
 add('blocked-boundary',w,'Back away from the side boundary instead of repeatedly driving into it.',c=>c.gear==='REVERSE'&&c.throttle>0);
 w=createCourse('slalom');w.x=15.99;w.z=-15;w.heading=-Math.PI/2;w.contacts.add('edge');w.controls={gear:'REVERSE',throttle:.3};
 add('blocked-rear',w,'The wall is behind: drive forward into clear space, do not reverse into it.',c=>c.gear==='DRIVE'&&c.throttle>0);
 w=createCourse('slalom');w.x=-3;w.z=4;w.speed=14;w.heading=-.5;w.steer=-.2;w.reactionSeconds=.7;
 add('fast-gate',w,'Brake before the imminent gate and cone, rather than accelerate through it.',c=>c.brake>0&&c.throttle===0);
 w=createCourse('parking');w.x=w.bay.x;w.z=w.bay.z;w.heading=0;w.parkPhase=1;w.speed=.1;
 add('park-hold',w,'Hold the correctly aligned car in its parking bay.',c=>c.throttle===0);
 w=createCourse('city');const f={x:Math.sin(w.heading),z:-Math.cos(w.heading)};
 w.speed=12;w.objects=[{id:'crossing-person',kind:'pedestrian',x:w.x+f.x*6,z:w.z+f.z*6,width:.6,length:.6,heading:w.heading+Math.PI/2,speed:0,actualSpeed:0}];
 add('pedestrian-stop',w,'Brake for the pedestrian immediately in the path.',c=>c.brake>=.3&&c.throttle===0);
 w=createCourse('kart');w.item='SHELL';w.speed=12;const p={x:w.x+Math.sin(w.heading)*9,z:w.z-Math.cos(w.heading)*9};
 w.objects=[{id:'opponent',kind:'car',x:p.x,z:p.z,heading:w.heading,width:1.7,length:2.6,speed:10,s:w.pathS+9,offset:0}];
 add('kart-fire',w,'Use the held shell against a close rival ahead.',c=>c.item);
 w=createCourse('kart');w.item='RED_SHELL';w.speed=12;
 w.objects=[{id:'target',kind:'car',x:w.x+Math.sin(w.heading)*12,z:w.z-Math.cos(w.heading)*12,heading:w.heading,width:1.7,length:2.6,speed:10}, {id:'behind',kind:'car',x:w.x-Math.sin(w.heading)*12,z:w.z+Math.cos(w.heading)*12,heading:w.heading,width:1.7,length:2.6,speed:10}];
 add('kart-red-target',w,'Fire the red shell at the actual rival ahead, not the rival behind.',c=>c.item&&c.target==='target');
 w=createCourse('kart');w.item=null;
 add('kart-empty',w,'Do not fire an empty inventory.',c=>!c.item);
 return cases;
}
