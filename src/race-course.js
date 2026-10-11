import {clamp,choice} from './core.js';

export const freeCourses=new Set(['parking','slalom','kart','city']);
export const steeringValues={LEFT:-1,SLIGHT_LEFT:-.32,STRAIGHT:0,SLIGHT_RIGHT:.32,RIGHT:1};
export const courseQuestions={
 steering:choice('Steer toward the route target: negative bearing is LEFT, positive bearing is RIGHT. STRAIGHT only when aligned (within about 3 degrees). SLIGHT steering for 3–12 degrees; stronger steering for larger angles. Avoid blocked space. Reverse flips steering effect.',Object.keys(steeringValues)),
 pedal:choice('Choose longitudinal control NOW. FORWARD accelerates from rest when the target is ahead and space is clear. COAST near recommended speed; BRAKE when above it or inside the final parking bay. BRAKE for a red/amber crossing or pedestrian. When stopped against an obstacle, steering alone cannot move the car: REVERSE if the rear is clear, then turn and drive forward. Also reverse if a nearby parking/slalom target is behind. BOOST only on a clear kart straight.',['FORWARD','COAST','BRAKE','REVERSE','BOOST'])
};
export const routeQuestions={...courseQuestions,steering:choice('Choose the driving line for the route tracker: CENTER normally, LEFT or RIGHT to pass an obstacle only when that line has more clearance. Stay on a clear current line instead of weaving. Follow the GPS route; these are lateral offsets from it, NOT steering-wheel directions. Prefer CENTER through cone gates.',['LEFT','CENTER','RIGHT'])};
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
  for(let i=0;i<count;i++)w.objects.push({id:'rival'+i,kind:'car',s:65+i*w.path.length/count,speed:course==='city'?8+i%3:13+i%5,offset:((i%3)-1)*3,width:1.7,length:course==='kart'?2.6:4.2,color:['#ecba60','#cb73ba','#63cbb5'][i%3],x:0,z:0,heading:0});
  if(course==='city'){
   w.crossings=[{x:-80,z:0,axis:'x',phase:0},{x:0,z:-80,axis:'z',phase:5},{x:80,z:0,axis:'x',phase:10},{x:0,z:80,axis:'z',phase:15}];
   for(let i=0;i<4;i++)for(let j=0;j<3;j++)w.objects.push({id:`ped${i}/${j}`,kind:'pedestrian',crossing:i,offset:j*.9,width:.5,length:.5,heading:0,x:0,z:0});
  }
 }
 w.checkpoint={x:w.x,z:w.z,heading:w.heading,...(w.path.closed?{pathS:w.pathS,progress:w.progress}: {})};updateActors(w,0);return w;
}
export function signalAt(w,c){const t=(w.time+c.phase)%24;return t<14?'green':t<17?'amber':'red';}
export function updateActors(w,dt){
 for(const o of w.objects){
  const old={x:o.x,z:o.z};
  if(o.s!==undefined){
   let speed=o.speed;
   if(w.crossings){const p=pathPoint(w.path,o.s),f=forward(p.heading);if(w.crossings.some(c=>signalAt(w,c)!=='green'&&(c.x-p.x)*f.x+(c.z-p.z)*f.z>0&&distance(p,c)<18))speed=0;}
   const nextS=o.s+speed*dt,p=pathPoint(w.path,nextS);o.x=p.x+Math.cos(p.heading)*o.offset;o.z=p.z+Math.sin(p.heading)*o.offset;o.heading=p.heading;
   if(dt&&bodyOverlap(w,o)){o.x=old.x;o.z=old.z;o.actualSpeed=0;}else{o.s=nextS;o.actualSpeed=speed;}
  }else if(o.kind==='pedestrian'){
   const c=w.crossings[o.crossing],t=(w.time+c.phase)%24,walk=t>=17?clamp((t-17)/7*21-10.5,-10.5,10.5):-10.5;
   o.x=c.x+(c.axis==='x'?walk:o.offset);o.z=c.z+(c.axis==='z'?walk:o.offset);o.heading=c.axis==='x'?Math.PI/2:Math.PI;
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
export function recoverCourse(w){Object.assign(w,w.checkpoint,{speed:0,steer:0,flash:0,lineOffset:0});w.contacts.clear();w.parkHold=0;if(w.course==='parking')w.parkPhase=0;}
export function stepCourse(w,dt,command={steer:0,pedal:'COAST'}){
 if(w.finished)return;
 while(dt>1e-8){const step=Math.min(dt,1/120);integrate(w,step,command);dt-=step;if(w.finished)break;}
}
function integrate(w,dt,cmd){
 w.time+=dt;w.flash=Math.max(0,w.flash-dt);updateActors(w,dt);
 const old={x:w.x,z:w.z,heading:w.heading},oldSpeed=w.speed;
 if(cmd.line!==undefined){const desired=cmd.line*(w.course==='slalom'?.55:2.5);w.lineOffset=(w.lineOffset||0)+clamp(desired-(w.lineOffset||0),-2*dt,2*dt);}
 const requested=cmd.line===undefined?cmd.steer||0:trackSteering(w,w.lineOffset||0);
 w.steer+=clamp(clamp(requested,-1,1)-w.steer,-3*dt,3*dt);
 w.boosting=w.course==='kart'&&cmd.pedal==='BOOST'&&w.boost>0&&w.speed>=0;
 w.boost=clamp(w.boost+(w.boosting?-32:8)*dt,0,100);
 const cap=Math.min(w.limit,w.course==='parking'?6:w.course==='city'?22:w.course==='slalom'?28:60)*(w.boosting?1.35:1);
 const acceleration=w.boosting?18:w.course==='parking'?3:9;
 if(cmd.pedal==='BRAKE')w.speed=Math.sign(w.speed)*Math.max(0,Math.abs(w.speed)-20*dt);
 else if(cmd.pedal==='REVERSE')w.speed=clamp(w.speed-(w.speed>0?20:3)*dt,-4,cap);
 else if(cmd.pedal==='FORWARD'||cmd.pedal==='BOOST')w.speed=clamp(w.speed+(w.speed<0?20:acceleration)*dt,-4,cap);
 else w.speed=Math.sign(w.speed)*Math.max(0,Math.abs(w.speed)-(1.2+Math.abs(w.speed)*.025)*dt);
 if(w.speed>cap)w.speed=Math.max(cap,w.speed-12*dt);
 // Apply grip after converting the rack input, not before. Multiplying the
 // grip-limited angle by "slight" steering made cornering needlessly weak.
 const v=(oldSpeed+w.speed)/2,maxAngle=Math.min(.62,Math.atan(9*2.5/Math.max(1,v*v))),steerAngle=clamp(w.steer*.62,-maxAngle,maxAngle);
 w.heading=angleWrap(w.heading+v/2.5*Math.tan(steerAngle)*dt);const f=forward(w.heading);w.x+=f.x*v*dt;w.z+=f.z*v*dt;
 const overlaps=w.objects.filter(o=>bodyOverlap(w,o));
 const edge=Math.abs(w.x)>w.bounds.x-1||Math.abs(w.z)>w.bounds.z-1||(w.halfWidth&&projectPath(w.path,w).distance>w.halfWidth-.7);
 const contacts=new Set(overlaps.map(o=>o.id));if(edge)contacts.add('edge');
 if(contacts.size){
  // Let an already-touching body move out, but never deeper into the obstacle.
  const escaped=!edge&&overlaps.every(o=>w.contacts.has(o.id)&&distance(w,o)>distance(old,o)+1e-7);
  if(!escaped){Object.assign(w,old);w.speed=0;}
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
export function trackSteering(w,offset=0){
 const p=projectPath(w.path,w),lookahead=w.course==='slalom'?Math.max(3,Math.abs(w.speed)*.5):Math.max(5,Math.abs(w.speed)*.8),target=pathPoint(w.path,p.s+lookahead),heading=target.heading;
 const x=target.x+Math.cos(heading)*offset,z=target.z+Math.sin(heading)*offset,bearing=angleWrap(Math.atan2(x-w.x,w.z-z)-w.heading),d=Math.max(2,Math.hypot(x-w.x,z-w.z));
 return clamp(Math.atan2(5*Math.sin(bearing),d)/.62,-1,1);
}
export function courseState(w){
 const target=courseTarget(w),bearing=angleWrap(Math.atan2(target.x-w.x,w.z-target.z)-w.heading),f=forward(w.heading);
 const signals=(w.crossings||[]).map(c=>({distance_m:distance(w,c),ahead:(c.x-w.x)*f.x+(c.z-w.z)*f.z,status:signalAt(w,c)})).filter(c=>c.ahead>0&&c.distance_m<50);
 const horizon=Math.min(60,w.sensorRange||60);
 function ray(a,range){const d=forward(w.heading+a);let free=range,kind=null;for(let t=1;t<range;t++){const p={x:w.x+d.x*t,z:w.z+d.z*t},o=w.objects.find(o=>Math.hypot(p.x-o.x,p.z-o.z)<(o.kind==='car'?2.3:1.1));if(o||Math.abs(p.x)>w.bounds.x-1||Math.abs(p.z)>w.bounds.z-1||(w.halfWidth&&projectPath(w.path,p).distance>w.halfWidth-.8)){free=t;kind=o?.kind||'road_edge';break;}}return {angle_degrees:Math.round(a*180/Math.PI),clearance_m:free,obstacle:kind};}
 const rays=[-.8,-.4,0,.4,.8].map(a=>ray(a,horizon)),rear=ray(Math.PI,12);
 const dist=distance(w,target);let recommended=w.course==='parking'?Math.min(12,dist*3):w.course==='slalom'?28:w.course==='city'?45:100;
 if(w.path.closed){const p=projectPath(w.path,w);let curvature=0;for(let s=0;s<Math.max(25,Math.abs(w.speed)*2);s+=5){const a=pathPoint(w.path,p.s+s),b=pathPoint(w.path,p.s+s+5);curvature=Math.max(curvature,Math.abs(angleWrap(b.heading-a.heading))/5);}recommended=Math.min(recommended,Math.sqrt(6/Math.max(.001,curvature))*3.6);}
 const route=projectPath(w.path,w),lines=[-1,0,1].map((side,i)=>{
  let gap=horizon,nearest=null;
  for(const o of w.objects){if(distance(w,o)>horizon)continue;const p=projectPath(w.path,o);let ahead=p.s-route.s;if(w.path.closed&&ahead< -w.path.length/2)ahead+=w.path.length;const lateral=(o.x-p.x)*Math.cos(p.heading)+(o.z-p.z)*Math.sin(p.heading),clearance=Math.max(0,ahead-3);
   if(ahead>=-3&&Math.abs(lateral-side*(w.course==='slalom'?.55:2.5))<1.8&&clearance<gap){gap=clearance;nearest=o;}
  }
  const closing=w.speed-(nearest?.actualSpeed||0);
  return {line:['LEFT','CENTER','RIGHT'][i],clearance_m:Math.round(gap),obstacle:nearest?.kind||null,closing_kmh:nearest?Math.round(closing*3.6):0,time_to_contact_seconds:nearest&&closing>0?+(gap/closing).toFixed(1):null};
 });
 return {task:w.course==='parking'?'Drive to the route target to enter the parking bay. Only after fully inside and aligned, stop.':'Drive forward along the route through every gate or lap without collisions.',course:w.course,speed_kmh:Math.round(w.speed*3.6),current_steering:+w.steer.toFixed(2),current_line:(w.lineOffset||0)<-1?'LEFT':(w.lineOffset||0)>1?'RIGHT':'CENTER',route_lines:lines,recommended_speed_kmh:Math.round(Math.min(w.limit*3.6,recommended)),target:{distance_m:+dist.toFixed(1),bearing_degrees:+(bearing*180/Math.PI).toFixed(1),side:bearing>.05?'right':bearing<-.05?'left':'ahead',alignment_degrees:+(angleWrap((target.heading||0)-w.heading)*180/Math.PI).toFixed(1)},sensor_horizon_m:horizon,free_space_rays:rays,rear_clearance_m:rear.clearance_m,touching_obstacle:w.contacts.size>0,traffic_signals:signals.map(s=>({distance_m:Math.round(s.distance_m),status:s.status})),nearby_pedestrians:w.objects.filter(o=>o.kind==='pedestrian'&&distance(w,o)<15).length,parking:w.bay?{inside_and_aligned:parkingFit({...w,speed:0}),distance_to_bay_m:+distance(w,w.bay).toFixed(1)}:null,boost_available:w.course==='kart'&&w.boost>10,collision:w.flash>0};
}
