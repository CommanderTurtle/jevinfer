import {clamp} from './core.js';
const types=['SHELL','OIL','BOOST','SHIELD','RED_SHELL'];
export function initItems(w,pathPoint){
 w.item=null;w.itemCount=0;w.itemsUsed=0;w.itemHits=0;w.effects=[];w.projectiles=[];w.itemId=0;w.lastItem=false;
 w.pickups=Array.from({length:12},(_,i)=>{const p=pathPoint(w.path,38+i*w.path.length/12);return {id:i,x:p.x,z:p.z,readyAt:0};});
}
const effect=(w,x,z,color)=>{w.effects.push({id:w.itemId++,x,z,at:w.time,color});w.effects=w.effects.slice(-24);};
export function useItem(w,actor=w,targetId){
 if(!actor.item)return false;const type=actor.item;actor.item=null;actor.itemsUsed=(actor.itemsUsed||0)+1;
 if(type==='BOOST'){actor.boostUntil=w.time+2.8;effect(w,actor.x,actor.z,'#58dfff');}
 else if(type==='SHIELD'){actor.shieldUntil=w.time+5;effect(w,actor.x,actor.z,'#ab8bff');}
 else{const reverse=type==='OIL',h=actor.heading+(reverse?Math.PI:0),distance=reverse?4:3;
  const targets=[w,...w.objects.filter(o=>o.kind==='car')].filter(o=>o!==actor&&Math.hypot(o.x-actor.x,o.z-actor.z)<60&&(o.x-actor.x)*Math.sin(h)-(o.z-actor.z)*Math.cos(h)>0).sort((a,b)=>Math.hypot(a.x-actor.x,a.z-actor.z)-Math.hypot(b.x-actor.x,b.z-actor.z));
  const target=targets.find(o=>(o===w?'player':o.id)===targetId)||targets[0];
  w.projectiles.push({id:w.itemId++,kind:type,owner:actor===w?'player':actor.id,target:type==='RED_SHELL'&&target?(target===w?'player':target.id):null,x:actor.x+Math.sin(h)*distance,z:actor.z-Math.cos(h)*distance,vx:reverse?0:Math.sin(h)*38,vz:reverse?0:-Math.cos(h)*38,expires:w.time+(reverse?9:4)});
 }
 w.projectiles=w.projectiles.slice(-32);return true;
}
export function stepItems(w,dt,command){
 const actors=[w,...w.objects.filter(o=>o.kind==='car')];
 for(const a of actors){
  if(a!==w){a.itemCooldown??=w.time+3+a.id.length%3;if(a.item&&w.time>a.itemCooldown){useItem(w,a);a.itemCooldown=w.time+4;}}
  if(!a.item)for(const p of w.pickups)if(p.readyAt<=w.time&&Math.hypot(p.x-a.x,p.z-a.z)<2.4){a.item=types[(p.id+(a.itemCount||0))%types.length];a.itemCount=(a.itemCount||0)+1;p.readyAt=w.time+4;effect(w,p.x,p.z,'#ffe76b');break;}
 }
 if(command.item&&!w.lastItem)useItem(w,w,command.itemTarget);w.lastItem=!!command.item;
 for(const b of w.projectiles){const x=b.x,z=b.z;
  if(b.kind==='RED_SHELL'&&b.target){const target=actors.find(a=>(a===w?'player':a.id)===b.target);if(target){const h=Math.atan2(b.vx,-b.vz),aim=Math.atan2(target.x-b.x,b.z-target.z),delta=Math.atan2(Math.sin(aim-h),Math.cos(aim-h)),angle=h+clamp(delta,-2*dt,2*dt);b.vx=Math.sin(angle)*38;b.vz=-Math.cos(angle)*38;}}
  b.x+=b.vx*dt;b.z+=b.vz*dt;
  for(const a of actors){if((a===w?'player':a.id)===b.owner)continue;const dx=b.x-x,dz=b.z-z,t=clamp(((a.x-x)*dx+(a.z-z)*dz)/(dx*dx+dz*dz||1),0,1);
   if(Math.hypot(x+dx*t-a.x,z+dz*t-a.z)<1.6){b.expires=0;if(w.time>(a.shieldUntil||0)){a.stunUntil=w.time+1.2;a.speed*=.3;if(a===w)w.itemHits++;}effect(w,a.x,a.z,b.kind==='OIL'?'#ffcc5a':'#fb7aba');break;}
  }
 }
 w.projectiles=w.projectiles.filter(b=>b.expires>w.time);w.effects=w.effects.filter(e=>w.time-e.at<.8);
}
export function kartStandings(w){return [{id:'player',distance:w.progress-w.startS},...w.objects.filter(o=>o.kind==='car').map(o=>({id:o.id,distance:o.s-w.startS}))].sort((a,b)=>b.distance-a.distance).map((r,i)=>({...r,place:i+1}));}
export function itemState(w){const local=p=>{const dx=p.x-w.x,dz=p.z-w.z;return {forward_m:+(dx*Math.sin(w.heading)-dz*Math.cos(w.heading)).toFixed(1),right_m:+(dx*Math.cos(w.heading)+dz*Math.sin(w.heading)).toFixed(1)};};return {position:kartStandings(w).find(r=>r.id==='player').place,racers:w.objects.filter(o=>o.kind==='car').length+1,lap:w.lap,laps:w.laps,held:w.item,attacks_received:w.itemHits,pickups:w.pickups.filter(p=>p.readyAt<=w.time&&Math.hypot(p.x-w.x,p.z-w.z)<60).map(p=>({id:p.id,...local(p)})),shield_seconds:Math.max(0,(w.shieldUntil||0)-w.time),boost_seconds:Math.max(0,(w.boostUntil||0)-w.time),hazards:w.projectiles.filter(b=>Math.hypot(b.x-w.x,b.z-w.z)<60).map(b=>({kind:b.kind,owner:b.owner,...local(b),velocity_forward_m_s:+(b.vx*Math.sin(w.heading)-b.vz*Math.cos(w.heading)).toFixed(1),velocity_right_m_s:+(b.vx*Math.cos(w.heading)+b.vz*Math.sin(w.heading)).toFixed(1)}))};}
