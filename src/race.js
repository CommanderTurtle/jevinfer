import {$,el,Run,delay} from './core.js';
import {createWorld,stepWorld,drivingQuestions,drivingState} from './race-physics.js';
import {freeCourses,createCourse,stepCourse,courseState,recoverCourse} from './race-course.js';
import {createRaceScene} from './race-scene.js';
import {createArcadeScene} from './arcade-scene.js';
import {createArcadeKart,stepArcadeKart,arcadeKartState,kartQuestions} from './arcade-kart.js';
import {createBoat,stepBoat,boatState,boatContract,decodeBoat} from './boat-physics.js';
import {createBoatScene} from './boat-scene.js';
import {initManualControls} from './manual-controls.js';
import {kartStandings} from './kart-items.js';
import {inferDriving,resetDrivingPolicy} from './driving-policy.js';
import {createCombatPilot} from './combat-policy.js';
export {drivingQuestions,drivingState} from './race-physics.js';

export function initRace(client,toast){
 let canvas=$('#race-canvas');const keys=new Set();
 let roadView='chase';
 let view=null,world,mode='parked',run=null,visible=false,raf=0,last=0,target=1,throttle='COAST',command={steer:0,pedal:'COAST'},decisions=0,lastDecision=0,lastHud=0,peak=0;
 const manual=initManualControls($('#race-manual'),keys,()=>mode==='manual');
 $('#race-police-lights').checked=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 let combat=null,weapon=null;
 const isFree=()=>freeCourses.has(world.course)&&!world.arcade;
 const isBoat=()=>world.course==='pirate';
 const rendererKind=course=>course==='pirate'?'boat':['traffic','race','kart'].includes(course)?'arcade':'free';

 function init3D(){if(view)return true;try{view=(isBoat()?createBoatScene:rendererKind(world.course)==='arcade'?createArcadeScene:createRaceScene)(canvas,$('#race-map'));view.setWorld(world);return true;}catch(e){toast('Renderer unavailable: '+e.message);return false;}}
 function snapshot(){const state=isBoat()?boatState(world):world.arcade?arcadeKartState(world):isFree()?courseState(world):drivingState(world);state.control_period_seconds=world.reactionSeconds||.3;state.steering_control=isBoat()?'rudder':isFree()?'direct_wheel':'lane_change';return state;}
 function reset(){
  const course=$('#race-course').value,density=$('#race-density').value;
  const switchRenderer=!!world&&rendererKind(world.course)!==rendererKind(course);if(switchRenderer){view?.dispose();view=null;const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;}
  world=course==='pirate'?createBoat(density):course==='kart'?createArcadeKart(density):freeCourses.has(course)?createCourse(course,density):createWorld(course,160,density);
  if(switchRenderer){if(course==='pirate'){roadView=$('#race-camera').value;$('#race-camera').value='overhead';}else $('#race-camera').value=roadView;}

  world.recoveryAssist=$('#race-assist').checked;manual.reset(world.arcade?'kart-arcade':course);
  canvas.setAttribute('aria-label',rendererKind(course)==='arcade'?'Arcade driving simulator':'3D driving simulator');
  target=1;throttle='COAST';command={steer:0,pedal:'COAST'};decisions=0;peak=0;
  $('#race-log').replaceChildren();$('#race-command').textContent='Ready';$('#race-latency').textContent='—';view?.setWorld(world);if(switchRenderer&&visible)init3D();
  $('#race-assist').parentElement.hidden=!isFree();$('#race-camera').parentElement.hidden=rendererKind(course)==='arcade';$('#race-police-lights').parentElement.hidden=!isBoat();hud();
 }
 function hud(){
  $('#race-mode').textContent=world.finished?(world.endReason||(world.failed?'FAILED':'FINISH')):isBoat()&&world.time>0&&world.time<5?'EMBARKING':mode==='parked'?(world.time?'PAUSED':'READY'):mode.toUpperCase();$('#race-speed').textContent=Math.round(world.speed*3.6);$('#race-distance').textContent=Math.round(world.distance);
  $('#race-hits').textContent=world.hits;$('#race-decisions').textContent=decisions;$('#race-clock').textContent=world.time.toFixed(1)+' s';
  let progress=world.passed+' passed';
  if(isBoat())progress=(Math.max(0,Math.hypot(world.x-world.island.x,world.z-world.island.z)-world.island.radius)/1000).toFixed(1)+' km to island · '+world.reinforcements+' reinforcements';
  else if(world.course==='race')progress=Math.min(100,world.distance/20).toFixed(0)+'% · 2 km';
  else if(world.course==='parking')progress=world.finished?'Parked ✓':world.parkHold>0?'Hold · '+world.parkHold.toFixed(1)+' s':world.parkPhase?'Align & stop':'Approach bay';
  else if(world.course==='slalom')progress=world.gate+'/'+world.gates.length+' gates · '+world.missed+' missed';
  else if(world.course==='kart'||world.course==='city')progress='Lap '+Math.min(world.lap,world.laps)+'/'+world.laps+' · '+Math.max(0,(world.progress-world.startS)%world.path.length).toFixed(0)+' m';
  $('#race-position').textContent=progress;$('#race-detail').textContent=isBoat()?'Hull '+Math.round(world.hull)+'% · '+world.disabled+' sunk · boarding '+Math.round(world.boarding*100)+'%':world.course==='kart'?'P'+kartStandings(world).find(r=>r.id==='player').place+'/'+(world.objects.length+1)+' · '+(world.item||'No item')+' · '+world.itemsUsed+' used':world.course==='city'?world.violations+' signal violations':'Peak '+Math.round(peak*3.6)+' km/h';
  canvas.parentElement.classList.toggle('collision',world.flash>0);$('#race-recover').disabled=!isFree();
  const controls=world.controls;$('#race-actuators').textContent=isBoat()?'Rudder / sail':!isFree()?'Lane control':controls?`${controls.gear} · gas ${Math.round(controls.throttle*100)}% · brake ${Math.round(controls.brake*100)}% · wheel ${Math.round(controls.appliedSteer*100)}%${controls.handbrakeActive?' · E-BRAKE':''}${world.recovery?.lock?' · RECOVERY':''}`:'Direct controls';
  manual.draw(!isFree()&&!isBoat()?{lane:target,throttle}:command,world);
  if($('#race-sensor-panel').open)$('#race-sensors').textContent=JSON.stringify(snapshot(),null,2);
 }
 function stop(){run?.stop();run=null;combat=null;weapon=null;mode='parked';manual.clear();$('#race-stop').disabled=true;$('#race-start').disabled=false;$('#race-demo').disabled=false;hud();}
 function log(text){$('#race-log').prepend(el('div',{},text));while($('#race-log').children.length>5)$('#race-log').lastChild.remove();}
 async function start(){
  stop();if(!init3D())return;if(world.finished)reset();const current=new Run();run=current;mode='jev';lastDecision=performance.now();throttle='COAST';command={steer:0,pedal:'COAST'};
  resetDrivingPolicy(world);combat=createCombatPilot(client,()=>world,current.signal,a=>{weapon=a;log(a.panic?'Last stand':(world.item||'Item')+(a.target?' → '+a.target:''));},e=>log('Weapon · '+e.message));
  $('#race-start').disabled=true;$('#race-demo').disabled=true;$('#race-stop').disabled=false;
  try{while(!current.signal.aborted&&!world.finished){
   if(isBoat()&&world.time<5){lastDecision=performance.now();await delay(100,current.signal);continue;}
   const started=performance.now(),hitsAtRequest=world.hits;let result;

   const helm=isBoat()?boatContract(world):null;result=isFree()?await inferDriving(client,world,current.signal):await client.infer(helm?.state||snapshot(),helm?.questions||(world.arcade?kartQuestions:drivingQuestions),current.signal);
   if(current.signal.aborted)break;const age=performance.now()-started;decisions++;world.reactionSeconds=+(Math.max(age,Number($('#race-interval').value))/1000*Number($('#race-timescale').value)).toFixed(2);
   if(result.stale||age>(client.config.controlMaxAge||4000)||world.hits!==hitsAtRequest){command={brake:1,steer:0,pedal:'REEF'};throttle='BRAKE';log('Stale command · brake');}
   else{
    if(isBoat()){command=decodeBoat(result.answers);$('#race-command').textContent=result.answers.rudder.choice+' / '+result.answers.sail.choice+(command.port?' / PORT FIRE':'')+(command.starboard?' / STARBOARD FIRE':'');}
    else if(!isFree()){target=['LEFT','CENTER','RIGHT'].indexOf(result.answers.lane.choice);throttle=result.answers.throttle.choice;$('#race-command').textContent=result.answers.lane.choice+' / '+throttle;}
    else{command=result.command;$('#race-command').textContent=result.phase+' / '+command.gear+' / wheel '+Math.round(command.steer*100)+'%';}
    world.recentControls=[...(world.recentControls||[]),{at:+world.time.toFixed(2),command:{...command},speed_kmh:Math.round(world.speed*3.6),contacts:world.hits}].slice(-2);
    lastDecision=performance.now();log('#'+decisions+' · '+$('#race-command').textContent);
   }
   $('#race-latency').textContent=Math.round(result.ms)+' ms';const wait=Number($('#race-interval').value)-age;if(wait>0)await delay(wait,current.signal);
  }}catch(e){if(!current.signal.aborted){toast(e.message);log(e.message);}}finally{if(run===current)stop();}
 }
 function manualCommand(){const input=manual.read(world);if(!isBoat()&&!isFree()){target=input.lane;throttle=input.throttle;weapon=input.item?{item:true}:null;}else command=input;}

 function tick(now){
  if(!visible)return;const elapsed=now-last;let dt=Math.min(.25,elapsed/1000)||0;last=now;
  if(elapsed>0&&elapsed<500)canvas.dataset.frameMs=((Number(canvas.dataset.frameMs)||elapsed)*.95+elapsed*.05).toFixed(1);
  if(mode!=='parked'){
   dt*=Number($('#race-timescale').value);const stale=mode==='jev'&&(now-lastDecision)>(client.config.controlMaxAge||4000);
   if(mode==='manual')manualCommand();const hits=world.hits;
   if(isBoat()){stepBoat(world,dt,stale?{steer:0,pedal:'COAST',fire:0}:{...command,panic:mode==='jev'?!!weapon?.panic:command.panic});weapon=null;}
   else if(world.arcade){stepArcadeKart(world,dt,target,stale?'BRAKE':throttle,stale?{}:weapon||{});weapon=null;}
   else if(isFree()){stepCourse(world,dt,stale?{steer:0,brake:1}:mode==='jev'?{...command,item:!!weapon?.item,itemTarget:weapon?.target}:command);weapon=null;}
   else while(dt>0){const step=Math.min(dt,1/120);stepWorld(world,step,target,stale?'BRAKE':throttle);dt-=step;}
   peak=Math.max(peak,Math.abs(world.speed));if(world.hits>hits)log('Contact · '+world.hits);if(world.finished)stop();
   if(mode==='jev')combat?.tick();
  }
  if(now-lastHud>100){hud();lastHud=now;}
  view?.render(world,{realistic:false,view:rendererKind(world.course)==='arcade'?'chase':$('#race-camera').value,policeLights:$('#race-police-lights').checked});raf=requestAnimationFrame(tick);
 }
 $('#race-start').onclick=start;$('#race-stop').onclick=stop;$('#race-reset').onclick=()=>{stop();reset();};
 for(const id of ['#race-course','#race-density'])$(id).onchange=()=>{stop();reset();};
 $('#race-demo').onclick=()=>{stop();if(!init3D())return;if(world.finished)reset();mode='manual';$('#race-stop').disabled=false;$('#race-command').textContent='Manual';canvas.focus();};
 $('#race-recover').onclick=()=>{if(isFree()){stop();recoverCourse(world);command={steer:0,pedal:'BRAKE'};log('Recovered to checkpoint');hud();}};
 $('#race-sensor-panel').ontoggle=hud;$('#race-assist').onchange=()=>{world.recoveryAssist=$('#race-assist').checked;};
 canvas.tabIndex=0;
 const normalized=k=>k.length===1?k.toLowerCase():k;
 window.addEventListener('keydown',e=>{
  const range=e.target.matches?.('input[type="range"]'),editing=e.target.isContentEditable||['TEXTAREA','SELECT'].includes(e.target.tagName)||(e.target.tagName==='INPUT'&&!range);
  if(visible&&mode==='manual'&&!editing&&!(range&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','d','w','s','r','q','e','x',' ','Shift'].includes(normalized(e.key))){e.preventDefault();keys.add(normalized(e.key));}
 });
 window.addEventListener('keyup',e=>keys.delete(normalized(e.key)));window.addEventListener('blur',()=>manual.clear());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 reset();return {stop,setVisible(value){visible=value;cancelAnimationFrame(raf);if(!value)stop();else if(init3D()){view.resize();last=performance.now();raf=requestAnimationFrame(tick);}}};
}
