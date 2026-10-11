import {$,el,Run,delay} from './core.js';
import {createWorld,stepWorld,drivingQuestions,drivingState} from './race-physics.js';
import {freeCourses,createCourse,stepCourse,courseState,courseQuestions,routeQuestions,steeringValues,recoverCourse} from './race-course.js';
import {createRaceScene} from './race-scene.js';
import {drivingQueries,applyRisk} from './race-policy.js';
export {drivingQuestions,drivingState} from './race-physics.js';

export function initRace(client,toast){
 const canvas=$('#race-canvas'),keys=new Set();
 let view=null,world,mode='parked',run=null,visible=false,raf=0,last=0,target=1,throttle='COAST',command={steer:0,pedal:'COAST'},decisions=0,lastDecision=0,lastHud=0,peak=0;
 const isFree=()=>freeCourses.has(world.course);
 const tracking=()=>isFree()&&world.course!=='parking'&&$('#race-steering').value==='track';
 function init3D(){if(view)return true;try{view=createRaceScene(canvas,$('#race-map'));view.setWorld(world);return true;}catch(e){toast('WebGL2 unavailable: '+e.message);return false;}}
 function snapshot(){const state=isFree()?courseState(world):drivingState(world);state.control_period_seconds=world.reactionSeconds||.3;state.steering_control=tracking()?'route_tracker':isFree()?'direct_wheel':'lane_change';return state;}
 function reset(){
  const course=$('#race-course').value,density=$('#race-density').value,limit=Number($('#race-limit').value);
  world=freeCourses.has(course)?createCourse(course,density,limit):createWorld(course,limit,density);
  world.sensorRange=Number($('#race-range').value);
  target=1;throttle='COAST';command={steer:0,pedal:'COAST'};decisions=0;peak=0;
  $('#race-log').replaceChildren();$('#race-command').textContent='Ready';$('#race-latency').textContent='—';$('#race-risk-value').textContent='—';view?.setWorld(world);hud();
 }
 function hud(){
  $('#race-mode').textContent=world.finished?'FINISH':mode==='parked'?(world.time?'PAUSED':'READY'):mode.toUpperCase();$('#race-speed').textContent=Math.round(world.speed*3.6);$('#race-distance').textContent=Math.round(world.distance);
  $('#race-hits').textContent=world.hits;$('#race-decisions').textContent=decisions;$('#race-clock').textContent=world.time.toFixed(1)+' s';
  let progress=world.passed+' passed';
  if(world.course==='race')progress=Math.min(100,world.distance/20).toFixed(0)+'% · 2 km';
  else if(world.course==='parking')progress=world.finished?'Parked ✓':world.parkHold>0?'Hold · '+world.parkHold.toFixed(1)+' s':world.parkPhase?'Align & stop':'Approach bay';
  else if(world.course==='slalom')progress=world.gate+'/'+world.gates.length+' gates · '+world.missed+' missed';
  else if(world.course==='kart'||world.course==='city')progress='Lap '+Math.min(world.lap,world.laps)+'/'+world.laps+' · '+Math.max(0,(world.progress-world.startS)%world.path.length).toFixed(0)+' m';
  $('#race-position').textContent=progress;$('#race-detail').textContent=world.course==='kart'?'Boost '+Math.round(world.boost)+'%':world.course==='city'?world.violations+' signal violations':'Peak '+Math.round(peak*3.6)+' km/h';
  canvas.parentElement.classList.toggle('collision',world.flash>0);$('#race-recover').disabled=!isFree();
  if($('#race-sensor-panel').open)$('#race-sensors').textContent=JSON.stringify(snapshot(),null,2);
 }
 function stop(){run?.stop();run=null;mode='parked';keys.clear();$('#race-cruise').checked=false;$('#race-stop').disabled=true;$('#race-start').disabled=false;$('#race-demo').disabled=false;hud();}
 function log(text){$('#race-log').prepend(el('div',{},text));while($('#race-log').children.length>5)$('#race-log').lastChild.remove();}
 async function start(){
  stop();if(!init3D())return;if(world.finished)reset();const current=new Run();run=current;mode='jev';lastDecision=performance.now();throttle='COAST';command={steer:0,pedal:'COAST'};
  $('#race-start').disabled=true;$('#race-demo').disabled=true;$('#race-stop').disabled=false;let retry=0;
  try{while(!current.signal.aborted&&!world.finished){
   const started=performance.now();let result;
   const usesTracking=tracking();
   try{result=await client.infer(snapshot(),drivingQueries(isFree()?(usesTracking?routeQuestions:courseQuestions):drivingQuestions,$('#race-risk').checked),current.signal);retry=0;}
   catch(e){if(!current.signal.aborted&&/^HTTP 429:/.test(e.message)&&retry<4){retry++;command.pedal='BRAKE';throttle='BRAKE';$('#race-command').textContent='Endpoint busy · braking';log('Retry '+retry+'/4');await delay(500*2**(retry-1),current.signal);continue;}throw e;}
   if(current.signal.aborted)break;const age=performance.now()-started;decisions++;world.reactionSeconds=+(Math.max(age,Number($('#race-interval').value))/1000*Number($('#race-timescale').value)).toFixed(2);
   if(age*Number($('#race-timescale').value)>1500){throttle='BRAKE';command.pedal='BRAKE';log('Stale command · brake');}
   else{
    const risk=result.answers.imminent_collision?.noul;$('#race-risk-value').textContent=risk===undefined?'—':Math.round(risk*100)+'%';
    if(isFree()){command={...(usesTracking?{line:['LEFT','CENTER','RIGHT'].indexOf(result.answers.steering.choice)-1}:{steer:steeringValues[result.answers.steering.choice]}),pedal:applyRisk(result.answers.pedal.choice,risk,world.speed)};$('#race-command').textContent=(usesTracking?'LINE ':'')+result.answers.steering.choice+' / '+command.pedal;}
    else{target=['LEFT','CENTER','RIGHT'].indexOf(result.answers.lane.choice);throttle=applyRisk(result.answers.throttle.choice,risk,world.speed);$('#race-command').textContent=result.answers.lane.choice+' / '+throttle;}
    lastDecision=performance.now();log('#'+decisions+' · '+$('#race-command').textContent);
   }
   $('#race-latency').textContent=Math.round(result.ms)+' ms';await delay(Math.max(0,Number($('#race-interval').value)-age),current.signal);
  }}catch(e){if(!current.signal.aborted){toast(e.message);log(e.message);}}finally{if(run===current)stop();}
 }
 function manualCommand(){
  const left=keys.has('ArrowLeft')||keys.has('a'),right=keys.has('ArrowRight')||keys.has('d'),up=keys.has('ArrowUp')||keys.has('w')||$('#race-cruise').checked,down=keys.has('ArrowDown')||keys.has('s')||keys.has(' ');
  if(isFree())command={steer:Number(right)-Number(left),pedal:keys.has('r')?'REVERSE':down?'BRAKE':keys.has('Shift')?'BOOST':up?'FORWARD':'COAST'};
  else{target=left?0:right?2:world.x;throttle=down?'BRAKE':up?'ACCELERATE':'COAST';}
 }
 function tick(now){
  if(!visible)return;let dt=Math.min(.08,(now-last)/1000)||0;last=now;
  if(mode!=='parked'){
   dt*=Number($('#race-timescale').value);const stale=mode==='jev'&&(now-lastDecision)*Number($('#race-timescale').value)>1500;
   if(mode==='manual')manualCommand();const hits=world.hits;
   if(isFree())stepCourse(world,dt,stale?{steer:0,pedal:'BRAKE'}:command);
   else while(dt>0){const step=Math.min(dt,1/120);stepWorld(world,step,target,stale?'BRAKE':throttle);dt-=step;}
   peak=Math.max(peak,Math.abs(world.speed));if(world.hits>hits)log('Contact · '+world.hits);if(world.finished)stop();
  }
  if(now-lastHud>100){hud();lastHud=now;}
  view?.render(world,{realistic:$('#race-realism').checked,view:$('#race-camera').value});raf=requestAnimationFrame(tick);
 }
 $('#race-start').onclick=start;$('#race-stop').onclick=stop;$('#race-reset').onclick=()=>{stop();reset();};
 for(const id of ['#race-course','#race-density'])$(id).onchange=()=>{stop();reset();};
 $('#race-steering').onchange=stop;
 $('#race-limit').oninput=()=>{world.limit=Number($('#race-limit').value)/3.6;$('#race-limit-value').textContent=$('#race-limit').value+' km/h';};
 $('#race-range').onchange=()=>{world.sensorRange=Number($('#race-range').value);hud();};
 $('#race-demo').onclick=()=>{stop();if(!init3D())return;if(world.finished)reset();mode='manual';$('#race-stop').disabled=false;$('#race-command').textContent='Manual';canvas.focus();};
 $('#race-recover').onclick=()=>{if(isFree()){stop();recoverCourse(world);command={steer:0,pedal:'BRAKE'};log('Recovered to checkpoint');hud();}};
 $('#race-sensor-panel').ontoggle=hud;
 canvas.tabIndex=0;
 const normalized=k=>k.length===1?k.toLowerCase():k;
 window.addEventListener('keydown',e=>{if(visible&&mode==='manual'&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','d','w','s','r',' ','Shift'].includes(normalized(e.key))){e.preventDefault();keys.add(normalized(e.key));}});
 window.addEventListener('keyup',e=>keys.delete(normalized(e.key)));window.addEventListener('blur',()=>{keys.clear();$('#race-cruise').checked=false;});
 for(const b of document.querySelectorAll('[data-drive-key]')){
  b.onpointerdown=e=>{if(mode!=='manual')return;e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.driveKey);};
  b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>keys.delete(b.dataset.driveKey);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 reset();return {stop,setVisible(value){visible=value;cancelAnimationFrame(raf);if(!value)stop();else if(init3D()){view.resize();last=performance.now();raf=requestAnimationFrame(tick);}}};
}
