import {vehicleStep} from './vehicle-controls.js';
import {courseState} from './race-course.js';
const recoveries=new WeakMap();
export function drivingContract(w,s=courseState(w)){
 const o=s.observations,v=s.vehicle,g=o.bumper_clearance_m;
 let t=s.target;
 if(Math.abs(w.speed)>1&&!w.contacts.size){
  const p={...w,recovery:{...w.recovery},controls:{...w.controls}},dt=Math.min(.8,w.reactionSeconds||.3);
  for(let elapsed=0;elapsed<dt;elapsed+=1/60){p.time+=1/60;const d=vehicleStep(p,Math.min(1/60,dt-elapsed),w.controls||{});p.x+=d.dx;p.z+=d.dz;}
  if(w.course==='slalom'&&w.gates[w.gate]&&p.z<w.gates[w.gate].z)p.gate++;
  t=courseState(p).target;
 }
 const wall=o.road_position,edgeRisk=Math.min(wall.left_clearance_m,wall.right_clearance_m)<1.5||(wall.seconds_to_edge!==null&&wall.seconds_to_edge<1.5);
 const trim=edgeRisk?(Math.abs(w.speed)>8?.2:.55):Math.abs(t.bearing_degrees)<6?.025:Math.abs(t.bearing_degrees)<12?.07:Math.abs(w.speed)>8?.2:.55;
 const wheels={left:-trim,straight:0,right:trim};
 const lateral=w.speed*w.speed*2*Math.abs(t.right_m)/Math.max(1,t.distance_m*t.distance_m),grip=w.course==='kart'?16:10;
 const recovery=recoveries.get(w);
 if(recovery){
  const moved=Math.hypot(w.x-recovery.x,w.z-recovery.z),gap=recovery.gear==='REVERSE'?g.rear:g.front;
  if((moved>=2.5&&!w.contacts.size)||gap<.2||w.time-recovery.at>6)recoveries.delete(w);
  else return {phase:'clearance',state:`Continue the chosen ${recovery.gear==='REVERSE'?'backing':'forward'} manoeuvre: travelled ${moved.toFixed(1)}m of 2.5m clearance. ${gap.toFixed(1)}m of free space remains in that direction. The goal is clearance before turning back toward the route.`,questions:{wheel:{type:'choice',instructions:'Keep clearing the obstruction without changing gear. Select front wheels. Straight usually provides clearance fastest; use a small turn only to avoid side contact.',criteria:{left:'Small left wheel input.',straight:'Wheels straight.',right:'Small right wheel input.'}}},decode:a=>({steer:{left:-.2,straight:0,right:.2}[a.wheel.choice],gear:recovery.gear,throttle:.3,brake:0,handbrake:'RELEASE'})};
 }
 if(Math.abs(w.speed)<2&&(w.contacts.size||g.front<.4||g.rear<.4)){
  return {phase:'recovery',state:`The car is ${Math.abs(w.speed)<.3?'stopped':`rolling ${w.speed<0?'backward':'forward'} slowly`}. ${g.front<.4?'Its nose is touching a wall.':'The space ahead is clear.'} ${g.rear<.4?'Its rear bumper is touching a wall.':'The space behind it is clear.'}`,questions:{action:{type:'choice',instructions:'Choose the safe car control.',criteria:{forward:'Drive forwards.',reverse:'Back up.',brake:'Stop.'}}},decode:a=>{const gear=a.action.choice==='reverse'?'REVERSE':a.action.choice==='forward'?'DRIVE':'KEEP';if(gear!=='KEEP')recoveries.set(w,{gear,x:w.x,z:w.z,at:w.time});return {steer:0,throttle:gear==='KEEP'?0:.3,brake:gear==='KEEP'?1:0,gear,handbrake:'RELEASE'};}};
 }
 const facts=[s.parking&&!s.parking.inside_and_aligned?`The car is NOT parked. ${w.parkPhase?'Manoeuvre into the parking bay.':'Drive to the approach point first; parking alignment comes afterward.'}`:s.task,Math.abs(w.speed)<.3?'The car is stopped.':`The car is moving ${w.speed<0?'backward':'forward'} at ${Math.abs(v.speed_kmh)} km/h.`,g.front<.4?'Its nose is touching an obstruction.':`The space ahead is clear for ${g.front} metres.`,g.rear<.4?'Its rear bumper is touching an obstruction.':`The space behind it is clear for ${g.rear} metres.`,
 `The ${t.description} is ${t.direction}, ${t.distance_m} metres away, bearing ${t.bearing_degrees} degrees (negative means left). ${w.course==='parking'&&!w.parkPhase?'Reach the approach point before aligning with the bay.':`Alignment error is ${t.alignment_degrees} degrees.`}`,
 edgeRisk?`WALL RISK: road position ${wall.position} on -100 left to +100 right scale. Drifting ${wall.drifting}; ${wall.seconds_to_edge===null?'parallel to wall':wall.seconds_to_edge+' seconds to the edge at current motion'}. Avoid the wall before pursuing the next target.`:'',
 `Stopping distance including response time is ${v.stopping_distance_m} metres.`,t.distance_m<v.stopping_distance_m?'The target is inside stopping distance.':'',`The turn requires ${lateral.toFixed(1)} m/s² lateral acceleration; tyres provide ${grip} m/s². ${lateral>grip?'Current speed is TOO HIGH to make this turn: the tyres cannot provide the required grip.':'The turn is within available tyre grip.'}`,s.parking?.inside_and_aligned?'The whole car is already correctly aligned inside the parking bay.':'',
 `The wheel is at ${v.wheel}; yaw is ${v.yaw_deg_s} degrees/second; positive means right. Current gear: ${v.gear}.`].filter(Boolean).join(' ');
 const corner=Math.abs(t.bearing_degrees)>25&&Math.abs(w.speed)>5;
 return {phase:edgeRisk?'wall avoidance':s.parking?'parking':lateral>grip||t.distance_m<v.stopping_distance_m?'braking':corner?'cornering':'driving',state:{situation:facts,road_position:wall,target_prediction_seconds:Math.abs(w.speed)>1&&!w.contacts.size?Math.min(.8,w.reactionSeconds||.3):0,nearby:o.objects.map(p=>`${p.kind}: ${p.forward_m}m ahead, ${p.right_m}m right, relative speed ${p.relative_forward_m_s}m/s`),boundary_clearance:o.boundary_clearance_m,next_gates:s.next_gates,signals:s.traffic_signals,kart:s.kart?{position:s.kart.position,lap:s.kart.lap,pickups:s.kart.pickups,hazards:s.kart.hazards}:undefined},questions:{
 steering:{type:'choice',instructions:'Set the front wheels. Aim toward the target while anticipating yaw. Centre the wheel before overshooting the target bearing. In reverse, wheels turn the nose oppositely.',criteria:Object.fromEntries(Object.entries(wheels).map(([k,n])=>[k,`Wheel ${n}: ${k}.`]))},
 motion:{type:'choice',instructions:'Choose the safe motion. When stopped but not parked, use accelerator to move toward the target; releasing pedals cannot move a stopped car. Brake for imminent wall/obstacle collision, excessive turn speed, or when properly parked.',criteria:{forward:'Accelerate forwards.',...(w.course==='parking'&&t.forward_m<0?{reverse:'Accelerate backwards.'}:{}),brake:'Apply service brakes.',coast:'Release both pedals; retain gear and roll freely. This cannot move a stopped car.'}},
 power:{type:'choice',instructions:'How much pedal pressure is appropriate? Match stopping distance, turn tightness and the task. Parking needs precision; racing needs pace.',criteria:{FEATHER:'12%: creep.',LIGHT:'30%: gentle.',MEDIUM:'60%: firm.',FULL:'100%: maximum.'}},
 ...(w.course==='kart'&&corner?{handbrake:{type:'choice',instructions:'Does this racing corner benefit from a brief drift, or normal tyre grip?',criteria:{RELEASE:'Normal grip.',PULSE:'Briefly lock rear wheels to initiate a drift.'}}}:s.parking?.inside_and_aligned?{handbrake:{type:'choice',instructions:'Secure the parked car or keep adjusting?',criteria:{RELEASE:'Allow movement.',HOLD:'Hold the parked car stationary.'}}}:{})},decode(a){return {steer:wheels[a.steering.choice],gear:a.motion.choice==='reverse'?'REVERSE':a.motion.choice==='forward'?'DRIVE':'KEEP',throttle:['forward','reverse'].includes(a.motion.choice)?{FEATHER:.12,LIGHT:.3,MEDIUM:.6,FULL:1}[a.power.choice]:0,brake:a.motion.choice==='brake'?{FEATHER:.12,LIGHT:.3,MEDIUM:.6,FULL:1}[a.power.choice]:0,handbrake:a.handbrake?.choice||'RELEASE'};}};
}
export function resetDrivingPolicy(w){recoveries.delete(w);}
export async function inferDriving(client,w,signal){const contract=drivingContract(w),r=await client.infer(contract.state,contract.questions,signal);if(signal?.aborted)throw signal.reason;return {...r,command:contract.decode(r.answers),phase:contract.phase};}
