import {clamp} from './core.js';
import {vehicleQuestions,vehicleStep,vehicleState,surroundings,manoeuvrePreview,boundaryClearance,resetRecovery} from './vehicle-controls.js';
import {initItems,stepItems,itemState} from './kart-items.js';

export const freeCourses=new Set(['parking','slalom','kart','city']);
export {steeringValues} from './vehicle-controls.js';
export const courseQuestions=vehicleQuestions;
export const angleWrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const forward=h=>({x:Math.sin(h),z:-Math.cos(h)});
export function makePath(points,closed=false){
 const pts=points.map(p=>({x:p[0],z:p[1]}));if(closed)pts.push({...pts[0]});
 let length=0;const segments=[];
 for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],size=distance(a,b);segments.push({a,b,start:length,length:size});length+=size;}
 return {points:pts,segments,length,closed};
}
export function roundedPath(points,radius=18){
 const out=[];
 for(let i=0;i<points.length;i++){
  const p=points[i],before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length];
  const l1=Math.hypot(before[0]-p[0],before[1]-p[1]),l2=Math.hypot(after[0]-p[0],after[1]-p[1]),r=Math.min(radius,l1*.4,l2*.4);
  const a=[p[0]+(before[0]-p[0])*r/l1,p[1]+(before[1]-p[1])*r/l1],b=[p[0]+(after[0]-p[0])*r/l2,p[1]+(after[1]-p[1])*r/l2];
  for(let j=0;j<=12;j++){const t=j/12;out.push([(1-t)**2*a[0]+2*(1-t)*t*p[0]+t*t*b[0],(1-t)**2*a[1]+2*(1-t)*t*p[1]+t*t*b[1]]);}
 }
 return makePath(out,true);
}
export function pathPoint(path,s){
 s=path.closed?((s%path.length)+path.length)%path.length:clamp(s,0,path.length);
 const seg=path.segments.find(p=>s<=p.start+p.length)||path.segments.at(-1),t=clamp((s-seg.start)/seg.length,0,1);
 return {x:seg.a.x+(seg.b.x-seg.a.x)*t,z:seg.a.z+(seg.b.z-seg.a.z)*t,heading:Math.atan2(seg.b.x-seg.a.x,seg.a.z-seg.b.z),s};
}
export function projectPath(path,p){
 let best=null;
 for(const seg of path.segments){const dx=seg.b.x-seg.a.x,dz=seg.b.z-seg.a.z,t=clamp(((p.x-seg.a.x)*dx+(p.z-seg.a.z)*dz)/(seg.length**2),0,1),x=seg.a.x+dx*t,z=seg.a.z+dz*t,d=Math.hypot(p.x-x,p.z-z);if(!best||d<best.distance)best={x,z,s:seg.start+t*seg.length,distance:d,heading:Math.atan2(dx,-dz)};}
 return best;
}
export function createCourse(course='parking',density='medium',limit=160){
 const w={course,density,limit:limit/3.6,x:0,z:0,heading:0,speed:0,steer:0,distance:0,time:0,hits:0,flash:0,finished:false,objects:[],gates:[],gate:0,missed:0,lap:1,laps:3,progress:0,boost:100,boosting:false,parkHold:0,violations:0,contacts:new Set(),checkpoint:null};
 if(course==='parking'){
  w.x=-4;w.z=15;w.bay={x:3,z:-8,width:3.5,length:6.6,heading:0};
  w.path=makePath([[-4,15],[3,1],[3,-8]]);w.parkPhase=0;w.bounds={x:19,z:23};
  for(const x of [-11,-7,.0,6.5,10])w.objects.push({id:'park'+x,kind:'car',x,z:-8,heading:0,width:1.8,length:4.2,color:x===0?'#e6b958':'#7896ab'});
 }else if(course==='slalom'){
  w.x=0;w.z=15;w.bounds={x:17,z:330};
  const route=[[0,15]];for(let i=0;i<10;i++){const x=i%2?4:-4,z=-i*27;route.push([x,z]);w.gates.push({x,z,width:6});for(const side of [-1,1])w.objects.push({id:`cone${i}/${side}`,kind:'cone',x:x+side*3,z,width:.65,length:.65,heading:0});}
  route.push([4,-270]);w.path=makePath(route);
 }else{
  w.path=course==='city'?roundedPath([[-80,80],[-80,-80],[80,-80],[80,80]],24):roundedPath([[-55,80],[-75,-25],[-20,-90],[65,-65],[80,30],[30,80]],24);
  const start=pathPoint(w.path,22);Object.assign(w,{x:start.x,z:start.z,heading:start.heading,progress:22,pathS:22,startS:22});
  w.halfWidth=course==='city'?7.5:7;w.bounds={x:140,z:140};
  const count={low:2,medium:5,high:9}[density]||5;
  for(let i=0;i<count;i++)w.objects.push({id:'rival'+i,kind:'car',s:course==='kart'?28+i*7:65+i*w.path.length/count,startS:22,speed:course==='city'?8+i%3:19+i%5,offset:((i%3)-1)*3,width:1.7,length:course==='kart'?2.6:4.2,color:['#ecba60','#cb73ba','#63cbb5'][i%3],x:0,z:0,heading:0});
  if(course==='city'){
   w.crossings=[{x:-80,z:0,axis:'x',phase:0},{x:0,z:-80,axis:'z',phase:5},{x:80,z:0,axis:'x',phase:10},{x:0,z:80,axis:'z',phase:15}];
   for(let i=0;i<4;i++)for(let j=0;j<3;j++)w.objects.push({id:`ped${i}/${j}`,kind:'pedestrian',crossing:i,offset:j*.9,width:.5,length:.5,heading:0,x:0,z:0});
  }
 }
 if(course==='kart')initItems(w,pathPoint);
 w.checkpoint={x:w.x,z:w.z,heading:w.heading,...(w.path.closed?{pathS:w.pathS,progress:w.progress}: {})};updateActors(w,0);return w;
}
export function signalAt(w,c){const t=(w.time+c.phase)%24;return t<14?'green':t<17?'amber':'red';}
export function updateActors(w,dt){
 for(const o of w.objects){
  const old={x:o.x,z:o.z};
  if(o.s!==undefined){
   let speed=w.time<(o.stunUntil||0)?o.speed*.25:o.speed*(w.time<(o.boostUntil||0)?1.4:1);
   if(w.crossings){const p=pathPoint(w.path,o.s),f=forward(p.heading);if(w.crossings.some(c=>signalAt(w,c)!=='green'&&(c.x-p.x)*f.x+(c.z-p.z)*f.z>0&&distance(p,c)<18))speed=0;}
   const nextS=o.s+speed*dt,p=pathPoint(w.path,nextS);o.x=p.x+Math.cos(p.heading)*o.offset;o.z=p.z+Math.sin(p.heading)*o.offset;o.heading=p.heading;
   if(dt&&w.course!=='kart'&&bodyOverlap(w,o)){o.x=old.x;o.z=old.z;o.actualSpeed=0;}else{o.s=nextS;o.actualSpeed=speed;}
  }else if(o.kind==='pedestrian'){
   const c=w.crossings[o.crossing],t=(w.time+c.phase)%24,walk=t>=17?clamp((t-17)/7*21-10.5,-10.5,10.5):-10.5;
   o.x=c.x+(c.axis==='x'?walk:o.offset);o.z=c.z+(c.axis==='z'?walk:o.offset);o.heading=c.axis==='x'?Math.PI/2:Math.PI;o.actualSpeed=t>=17?3:0;
  }
 }
}
// Three body discs form a capsule. Small integration steps prevent high-speed
// tunnelling; obstacles are oriented rectangles, not lane-sized trigger boxes.
export function bodyOverlap(car,o,padding=0){
 const f=forward(car.heading),r=.82+padding,half=car.course==='kart'?.68:1.2;
 for(const d of [-half,0,half]){
  const dx=car.x+f.x*d-o.x,dz=car.z+f.z*d-o.z,h=o.heading||0;
  const lx=dx*Math.cos(h)+dz*Math.sin(h),lz=-dx*Math.sin(h)+dz*Math.cos(h);
  if(Math.hypot(Math.max(0,Math.abs(lx)-o.width/2),Math.max(0,Math.abs(lz)-o.length/2))<r)return true;
 }return false;
}
export function parkingFit(w){
 const b=w.bay;if(!b)return false;const a=angleWrap(w.heading-b.heading),dx=w.x-b.x,dz=w.z-b.z,c=Math.cos(b.heading),s=Math.sin(b.heading);
 const hx=Math.abs(Math.cos(a))*.9+Math.abs(Math.sin(a))*2.1,hz=Math.abs(Math.sin(a))*.9+Math.abs(Math.cos(a))*2.1;
 return Math.abs(dx*c+dz*s)+hx<=b.width/2&&Math.abs(-dx*s+dz*c)+hz<=b.length/2&&Math.abs(Math.sin(a))<.17&&Math.abs(w.speed)<.3;
}
export function recoverCourse(w){Object.assign(w,w.checkpoint,{speed:0,steer:0,flash:0,lineOffset:0});w.contacts.clear();w.yaw=0;w.slip=0;resetRecovery(w);w.parkHold=0;if(w.course==='parking')w.parkPhase=0;}
export function stepCourse(w,dt,command={steer:0,pedal:'COAST'}){
 if(w.finished)return;
 while(dt>1e-8){const step=Math.min(dt,1/120);integrate(w,step,command);dt-=step;if(w.finished)break;}
}
function integrate(w,dt,cmd){
 w.time+=dt;w.flash=Math.max(0,w.flash-dt);updateActors(w,dt);
 const old={x:w.x,z:w.z,heading:w.heading},oldSpeed=w.speed;
 const movement=vehicleStep(w,dt,w.time<(w.stunUntil||0)?{...cmd,throttle:0,brake:.5}:cmd);
 w.x+=movement.dx;w.z+=movement.dz;
 if(w.course==='kart')stepItems(w,dt,cmd);
 const overlaps=w.objects.filter(o=>bodyOverlap(w,o));
 const edge=Math.abs(w.x)>w.bounds.x-1||Math.abs(w.z)>w.bounds.z-1||(w.halfWidth&&projectPath(w.path,w).distance>w.halfWidth-.7);
 const contacts=new Set(overlaps.map(o=>o.id));if(edge)contacts.add('edge');
 if(contacts.size){
  // Let an already-touching body move out, but never deeper into the obstacle.
  const escaped=!edge&&overlaps.every(o=>w.contacts.has(o.id)&&distance(w,o)>distance(old,o)+1e-7);
  if(!escaped){
   Object.assign(w,old);
   if(w.course==='kart'&&!edge&&overlaps.every(o=>o.kind==='car')){
    // Contact transfers momentum and separates bodies; kart rivals are not immovable walls.
    for(const o of overlaps){const dx=w.x-o.x,dz=w.z-o.z,n=Math.hypot(dx,dz)||1;w.x+=dx/n*.04;w.z+=dz/n*.04;if(!w.contacts.has(o.id)){w.speed*=.8;o.stunUntil=Math.max(o.stunUntil||0,w.time+.2);}}
   }else{w.speed=0;w.yaw=0;}
  }
  for(const id of contacts)if(!w.contacts.has(id)){w.hits++;w.flash=.45;}
 }
 // Keep a contact latched until separation, not just until the rollback moves
 // us a millimetre outside its boundary. One scrape is one collision.
 for(const id of w.contacts){const o=w.objects.find(o=>o.id===id);if(o&&bodyOverlap(w,o,.25))contacts.add(id);else if(id==='edge'&&(Math.abs(w.x)>w.bounds.x-1.3||Math.abs(w.z)>w.bounds.z-1.3||(w.halfWidth&&projectPath(w.path,w).distance>w.halfWidth-1)))contacts.add(id);}
 w.contacts=contacts;w.distance+=Math.hypot(w.x-old.x,w.z-old.z);
 const p=projectPath(w.path,w);
 if(w.path.closed){
  let delta=p.s-w.pathS;if(delta>w.path.length/2)delta-=w.path.length;if(delta<-w.path.length/2)delta+=w.path.length;
  if(Math.abs(delta)<5)w.progress+=delta;w.pathS=p.s;
  w.lap=Math.max(1,Math.floor((w.progress-w.startS)/w.path.length)+1);
  if(w.lap>w.laps){w.finished=true;w.speed=0;}
  if(!contacts.size&&p.distance<2&&w.distance-(w.lastCheckpoint||0)>20){w.checkpoint={x:w.x,z:w.z,heading:p.heading,pathS:w.pathS,progress:w.progress};w.lastCheckpoint=w.distance;}
 }else if(w.course==='parking'){
  if(w.parkPhase===0&&Math.hypot(w.x-w.bay.x,w.z-1)<2)w.parkPhase=1;
  w.parkHold=parkingFit(w)?w.parkHold+dt:0;if(w.parkHold>=1){w.finished=true;w.speed=0;}
 }else if(w.gate<w.gates.length){
  const g=w.gates[w.gate];if(old.z>=g.z&&w.z<g.z){if(Math.abs(w.x-g.x)<g.width/2-.9)w.gate++;else{w.missed++;w.gate++;}w.checkpoint={x:w.x,z:w.z,heading:0};}
 }else if(w.z<-265){w.finished=true;w.speed=0;}
 if(w.crossings)for(const c of w.crossings){
  const oldSide=c.axis==='x'?old.z-c.z:old.x-c.x,newSide=c.axis==='x'?w.z-c.z:w.x-c.x;
  if(oldSide*newSide<0&&distance(w,c)<9&&signalAt(w,c)!=='green')w.violations++;
 }
}
export function courseTarget(w){
 if(w.course==='parking')return {x:w.bay.x,z:w.parkPhase? w.bay.z:1,heading:0};
 if(w.course==='slalom')return w.gates[w.gate]||{x:4,z:-270};
 const p=projectPath(w.path,w);return pathPoint(w.path,p.s+Math.max(8,Math.abs(w.speed)*.85));
}
export function roadPosition(w){
 const p=w.halfWidth?projectPath(w.path,w):{x:0,z:w.z,heading:0};
 const half=w.halfWidth?w.halfWidth-.7:w.bounds.x-1;
 const offset=(w.x-p.x)*Math.cos(p.heading)+(w.z-p.z)*Math.sin(p.heading);
 const lateral=w.speed*Math.sin(w.heading-(w.slip||0)-p.heading),left=Math.max(0,half+offset),right=Math.max(0,half-offset);
 return {scale:'Road-relative: -100 left wall, 0 centre, +100 right wall.',position:Math.round(clamp(offset/half,-1,1)*100),left_clearance_m:+left.toFixed(1),right_clearance_m:+right.toFixed(1),drifting:lateral<-.1?'left':lateral>.1?'right':'parallel',closing_m_s:+Math.abs(lateral).toFixed(1),seconds_to_edge:Math.abs(lateral)>.1?+((lateral<0?left:right)/Math.abs(lateral)).toFixed(2):null,heading_from_road_degrees:+(angleWrap(w.heading-p.heading)*180/Math.PI).toFixed(1)};
}
export function courseState(w){
 const target=courseTarget(w),bearing=angleWrap(Math.atan2(target.x-w.x,w.z-target.z)-w.heading),p=projectPath(w.path,w);
 const forward=Math.sin(w.heading),north=Math.cos(w.heading);
 const tf=(target.x-w.x)*forward-(target.z-w.z)*north,tr=(target.x-w.x)*north+(target.z-w.z)*forward;
 const targetState={description:w.course==='parking'?(w.parkPhase?'parking bay centre':'approach in front of the parking bay'):w.course==='slalom'?'centre of next cone gate':'next road waypoint',direction:(tf<0?'behind':'ahead')+(tr<-.5?' left':tr>.5?' right':''),forward_m:+tf.toFixed(1),right_m:+tr.toFixed(1),distance_m:+distance(w,target).toFixed(1),bearing_degrees:+(bearing*180/Math.PI).toFixed(1),alignment_degrees:+(angleWrap((target.heading||0)-w.heading)*180/Math.PI).toFixed(1)};
 const edge=q=>Math.abs(q.x)>w.bounds.x-1||Math.abs(q.z)>w.bounds.z-1||(w.halfWidth&&projectPath(w.path,q).distance>w.halfWidth-.7);
 const observations=surroundings(w,w.objects,w.course==='parking'?40:100,w.course==='parking'?30:40,w.course==='parking'?40:45);
 observations.boundary_clearance_m=boundaryClearance(w,edge);
 observations.road_position=roadPosition(w);
 for(const side of ['front','rear'])observations.bumper_clearance_m[side]=Math.min(observations.bumper_clearance_m[side],observations.boundary_clearance_m[side]);
 const navigation=[5,12,25,45].map(d=>{const q=pathPoint(w.path,p.s+d),dx=q.x-w.x,dz=q.z-w.z;return [d,+(dx*forward-dz*north).toFixed(1),+(dx*north+dz*forward).toFixed(1),+(angleWrap(q.heading-w.heading)*180/Math.PI).toFixed(1)];});
 return {task:({parking:'Park the entire car inside the marked bay, aligned and stopped.',slalom:'Finish the timed slalom quickly through every gate. Cone and boundary contacts are penalties.',city:'Drive the circuit efficiently. Yield to pedestrians and signals; avoid vehicle contact.',kart:'Win the three-lap combat race. Overtake rivals, collect pickups, attack with items, defend and drift. Rival bumps are legal; walls and attacks cost speed.'})[w.course],course:w.course,vehicle:vehicleState(w),target:targetState,navigation:{columns:['path_ahead_m','forward_m','right_m','heading_deg'],points:navigation},observations,manoeuvres:manoeuvrePreview(w,w.objects,edge),
 road:{half_width_m:w.halfWidth||w.bounds.x,lateral_error_m:+((w.x-p.x)*Math.cos(p.heading)+(w.z-p.z)*Math.sin(p.heading)).toFixed(1),heading_error_deg:+(angleWrap(p.heading-w.heading)*180/Math.PI).toFixed(1),bounds:{left:-w.bounds.x,right:w.bounds.x,north:-w.bounds.z,south:w.bounds.z}},
 touching_obstacle:!!w.contacts.size,contacts:[...w.contacts],previous_controls:w.recentControls||[],recovery_assist:w.recoveryAssist?{enabled:true,active_wheel:w.recovery?.lock||null}:undefined,traffic_signals:(w.crossings||[]).filter(c=>distance(w,c)<60).map(c=>({forward_m:+((c.x-w.x)*forward-(c.z-w.z)*north).toFixed(1),right_m:+((c.x-w.x)*north+(c.z-w.z)*forward).toFixed(1),status:signalAt(w,c)})),
 parking:w.bay?{...w.bay,inside_and_aligned:parkingFit({...w,speed:0})}:undefined,next_gates:w.gates.slice(w.gate,w.gate+3).map(g=>({forward_m:+((g.x-w.x)*forward-(g.z-w.z)*north).toFixed(1),right_m:+((g.x-w.x)*north+(g.z-w.z)*forward).toFixed(1),opening_width_m:g.width})),position:{x:+w.x.toFixed(1),z:+w.z.toFixed(1),heading_deg:+(w.heading*180/Math.PI).toFixed(1)},kart:w.course==='kart'?itemState(w):undefined,control_period_seconds:w.reactionSeconds||.4};
}
