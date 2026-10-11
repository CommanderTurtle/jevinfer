import {itemState} from './kart-items.js';
import {courseState} from './race-course.js';
// Weapon work never owns steering, pedals, or the recovery state machine.
export function combatContract(w){
 if(w.course!=='kart'||!w.item||w.finished)return null;
 const s=Math.sin(w.heading),c=Math.cos(w.heading),type=w.item,inventory=w.itemCount||0,at=w.time;
 const targets=w.objects.filter(o=>o.kind==='car').map(o=>{
  const x=o.x-w.x,z=o.z-w.z;return {id:o.id,ahead_m:+(x*s-z*c).toFixed(1),right_m:+(x*c+z*s).toFixed(1),range_m:+Math.hypot(x,z).toFixed(1),relative_speed_m_s:+((o.actualSpeed??o.speed)-w.speed).toFixed(1),shielded:w.time<(o.shieldUntil||0)};
 }).filter(o=>o.range_m<60);
 const effects={SHELL:'Straight projectile: hits rivals directly ahead; does not turn.',RED_SHELL:'Homing projectile: follows the selected rival with finite speed and turning rate.',OIL:'Leaves a slippery patch behind for pursuing rivals.',BOOST:'Accelerates the kart for 2.8 seconds.',SHIELD:'Blocks incoming attacks for 5 seconds.'};
 const instructions={SHELL:'Is a rival directly ahead within 40m in the straight projectile path? Fire to hit it; otherwise conserve the shell.',RED_SHELL:'Is there an unshielded rival ahead within 60m for this homing shell to pursue? If so, fire the shell; it can turn toward that rival.',OIL:'Is a rival closely pursuing behind where an oil slick would slow them?',BOOST:'Is the road ahead clear and straight enough to benefit from 2.8 seconds of boost without hitting a wall or losing the corner?',SHIELD:'Is an incoming hostile projectile close enough to threaten us? Activate the shield if it would block the attack.'};
 const eligible=targets.filter(t=>t.ahead_m>0),hazards=itemState(w).hazards;
 if(type==='RED_SHELL'&&!eligible.length)return null;
 if(type==='SHELL'&&!eligible.some(t=>t.ahead_m<40&&Math.abs(t.right_m)<6))return null;
 if(type==='OIL'&&!targets.some(t=>t.ahead_m<0&&t.range_m<25))return null;
 if(type==='SHIELD'&&!hazards.some(h=>h.owner!=='player'))return null;
 const questions={fire:{type:'noul',instructions:instructions[type]}};
 if(type==='RED_SHELL'&&eligible.length)questions.target={type:'choice',instructions:'Select the rival this homing shell should pursue. Prefer a nearby unshielded opponent ahead.',criteria:Object.fromEntries(eligible.map(t=>[t.id,`${t.range_m}m away; shield ${t.shielded}.`]))};
 const nav=courseState(w);
 return {state:{held_item:type,effect:effects[type],targets,speed_kmh:Math.round(w.speed*3.6),hazards,road_position:nav.observations.road_position,front_clearance_m:nav.observations.bumper_clearance_m.front,target_bearing_degrees:nav.target.bearing_degrees},questions,
 decode(a){return {item:a.fire.noul>.5&&!(type==='RED_SHELL'&&!eligible.length),target:a.target?.choice};},
 valid:current=>!current.finished&&current.time-at<=1.5&&current.item===type&&(current.itemCount||0)===inventory};
}
export function createCombatPilot(client,world,signal,fire,onError=()=>{}){
 let pending=false,nextAt=0;
 return {tick(){
  if(pending||signal.aborted||performance.now()<nextAt)return;
  nextAt=performance.now()+300;
  const w=world(),contract=combatContract(w);if(!contract)return;
  pending=true;
  client.infer(contract.state,contract.questions,signal).then(r=>{
   if(signal.aborted||world()!==w||!contract.valid(w))return;
   const action=contract.decode(r.answers);
   const target=action.target?w.objects.find(o=>o.id===action.target):null;
   const reachable=target&&Math.hypot(target.x-w.x,target.z-w.z)<60&&(target.x-w.x)*Math.sin(w.heading)-(target.z-w.z)*Math.cos(w.heading)>0;
   if(action.item&&(!action.target||reachable))fire(action,r);
  }).catch(e=>{if(!signal.aborted){nextAt=performance.now()+1000;onError(e);}}).finally(()=>{pending=false;});
 }};
}
