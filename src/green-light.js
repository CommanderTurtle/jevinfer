import {$,Run} from './core.js';
import {createGreenWorld,greenContract,applyGreenDecision,stepGreenWorld} from './green-light-world.js';
import {createGreenScene} from './green-light-scene.js';
import {createGreenAudio} from './green-light-audio.js';

export function initGreenLight(client,toast){
 const stage=$('#green-stage'),canvas=$('#green-canvas'),overlay=$('#green-overlay'),title=$('#green-story-title'),line=$('#green-story-line'),action=$('#green-action');
 const sound=createGreenAudio(),keys=new Set();
 const whisper=document.createElement('p');whisper.className='green-whisper';whisper.hidden=true;whisper.textContent='you may now sprint [shift]';whisper.setAttribute('role','status');stage.append(whisper);
 let world=createGreenWorld(),view=null,visible=false,phase='new',resumePhase='playing',run=null,flight=null;
 let raf=0,lastFrame=0,weather=0,storyTime=0,storyIndex=-1,nextRequest=0,failures=0,decisions=0,lastHud=0,whisperUntil=0;
 let bolt=-10,nextBolt=3.5,thunderAt=Infinity,drag=null,wasLocked=false,lastMotor=false,lastReply='—',shiftHeld=false;
 const story=[['Green Light',''],['','The neighbor installed a motion camera.'],['','Break in.'],['','Be careful.']];
 const storyBeat=3.8;
 $('#green-flashes').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function clearInput(){keys.clear();shiftHeld=false;for(const b of stage.querySelectorAll('[data-green-key]'))b.setAttribute('aria-pressed','false');}
 function releasePointer(){if(document.pointerLockElement===canvas)document.exitPointerLock();}
 function abort(){run?.stop();run=null;}
 function screen(heading,body,button){
  overlay.hidden=false;overlay.classList.remove('story-change');title.textContent=heading;line.textContent=body;action.textContent=button||'';action.hidden=!button;
 }
 function pause(){
  if(!['playing','intro'].includes(phase))return;
  resumePhase=phase;phase='paused';abort();clearInput();releasePointer();sound.suspend();stage.classList.remove('cinematic');screen('Paused','','Resume');
 }
 function finish(){
  phase=world.result;abort();clearInput();releasePointer();stage.classList.add('ended');
  $('#green-inspection').textContent=JSON.stringify({result:world.result,last_shot:world.shotResult,shots:world.shotCount,decisions},null,2);
  screen(phase==='dead'?'You Died':'You got in.','', 'Try again');
  overlay.classList.add('ending');sound.update({...world,motor:0,observation:null});
 }
 function begin(){
  const arriving=phase==='intro';
  phase='playing';stage.classList.remove('cinematic','ended');overlay.classList.remove('ending');overlay.hidden=true;clearInput();
  stage.classList.toggle('arriving',arriving);
  run=new Run();nextRequest=weather;failures=0;lastReply='—';canvas.focus({preventScroll:true});void sound.resume();
 }
 function retry(){abort();world=createGreenWorld();decisions=0;whisperUntil=0;whisper.hidden=true;$('#green-inspection').textContent='';begin();}
 function intro(){
  phase='intro';storyTime=0;storyIndex=-1;stage.classList.remove('arriving','ready');stage.classList.add('cinematic');stage.style.setProperty('--story-duration',`${storyBeat}s`);screen('','','');$('#green-exit-intro').hidden=false;void sound.resume();
 }
 function commandLoop(){
  if(phase!=='playing'||!run||run.signal.aborted||flight||world.turret.turning||weather<nextRequest)return;
  const contract=greenContract(world);if(!contract)return;
  const current=run,track=world.track,sentAt=world.time;
  $('#green-inspection').textContent=JSON.stringify(contract.state,null,2);
  const pending={};flight=pending;
  client.infer(contract.state,contract.questions,current.signal).then(result=>{
   if(run!==current||current.signal.aborted)return;
   const accepted=applyGreenDecision(world,result.answers,track,sentAt);decisions++;failures=0;nextRequest=weather+.075;
   lastReply=`${Math.round(result.ms)} ms${accepted?'':' · expired'}`;
   $('#green-inspection').textContent=JSON.stringify({state:contract.state,answers:result.answers,applied:accepted},null,2);
  }).catch(error=>{
   if(run!==current||current.signal.aborted)return;
   failures++;lastReply='Endpoint unavailable';nextRequest=weather+Math.min(8,2**failures);
   // Do not silently turn an unavailable model into a harmless scripted sentry.
   pause();screen('Signal lost',String(error.message).slice(0,240),'Reconnect');
  }).finally(()=>{if(flight===pending)flight=null;});
 }
 function frame(now){
  raf=0;if(!visible||document.hidden)return;
  const elapsed=Math.max(0,(now-(lastFrame||now))/1000),dt=Math.min(.05,Math.max(.001,elapsed));lastFrame=now;
  if(phase==='intro'||phase==='playing'){
   weather+=dt;
   if(weather>=nextBolt){bolt=weather;nextBolt=weather+12+Math.random()*13;thunderAt=weather+.7+Math.random()*1.4;}
   if(weather>=thunderAt){sound.play('thunder');thunderAt=Infinity;}
  }
  if(phase==='intro'){
   // A deep link has no autoplay permission: don't run a silent intro past the user.
   if(sound.supported&&!sound.active&&!sound.muted){action.hidden=false;action.textContent='Enable sound';}
   else{
    action.hidden=true;storyTime+=elapsed;const index=Math.min(story.length-1,Math.floor(storyTime/storyBeat));
    if(index!==storyIndex){storyIndex=index;title.textContent=story[index][0];line.textContent=story[index][1];overlay.classList.remove('story-change');void overlay.offsetWidth;overlay.classList.add('story-change');}
    if(storyTime>=story.length*storyBeat)begin();
   }
  }
  if(phase==='playing'){
   world.player.yaw+=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*.9;
   const forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
   const wasVariable=world.variableSweep;
   stepGreenWorld(world,dt,{forward,side,sprint:shiftHeld});
   if(!wasVariable&&world.variableSweep){whisperUntil=world.time+3.2;whisper.hidden=false;}
   for(const e of world.events)sound.play(e);world.events.length=0;
   const motor=Math.abs(world.motor||0)>.005;if(lastMotor!==motor)sound.play(motor?'piston':'piston-stop');lastMotor=motor;sound.update(world);
   if(world.result)finish();else commandLoop();
  }
  const age=weather-bolt,flash=age<.8?Math.max(0,1-age/.8)*1.8:0;
  if(phase!=='playing'||world.time>=whisperUntil)whisper.hidden=true;
  if(phase==='playing')view?.render(world,weather,flash,$('#green-flashes').checked);
  if(now-lastHud>150){
   lastHud=now;$('#green-status').textContent=phase==='playing'?(world.player.sprinting?'SPRINTING':world.player.moving?'MOVING':'STILL'):phase.toUpperCase();
   $('#green-network').textContent=`${decisions} decisions · ${lastReply}`;
   $('#green-sound').textContent=sound.active?(sound.muted?'Sound off':'Sound on'):'Enable sound';
  }
  raf=requestAnimationFrame(frame);
 }
 function loop(){if(!raf&&visible&&!document.hidden){lastFrame=0;raf=requestAnimationFrame(frame);}}
 function setVisible(value){
  visible=value;
  if(!value){pause();cancelAnimationFrame(raf);raf=0;clearInput();releasePointer();sound.suspend();return;}
  if(!view){try{view=createGreenScene(canvas);}catch(error){phase='error';screen('Renderer unavailable',error.message,'');toast('Green Light needs WebGL2.');return;}}
  if(phase==='new'){phase='ready';stage.classList.add('cinematic','ready');screen('','','Start');$('#green-exit-intro').hidden=true;}
  loop();
 }
 action.onclick=()=>{void sound.resume();if(phase==='ready')intro();else if(phase==='paused'){if(resumePhase==='intro')intro();else begin();}else if(['dead','escaped'].includes(phase))retry();};
 $('#green-pause').onclick=()=>pause();
 $('#green-restart').onclick=()=>retry();
 $('#green-fullscreen').onclick=()=>{if(document.fullscreenElement)void document.exitFullscreen();else stage.requestFullscreen?.().catch(()=>{});};
 $('#green-sound').onclick=()=>{
  const button=$('#green-sound');const muted=sound.active?!sound.muted:false;
  button.setAttribute('aria-pressed',String(muted));sound.mute(muted);void sound.resume();
 };
 $('#green-exit-intro').onclick=()=>{if(phase==='intro')begin();else pause();};
 document.addEventListener('keydown',e=>{
  if(!visible||e.target.closest('input,textarea,select,dialog')||e.ctrlKey||e.metaKey||e.altKey)return;
  shiftHeld=e.shiftKey;
  if(e.code==='Escape'){pause();return;}
  if(phase==='playing'&&['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){keys.add(e.code);e.preventDefault();}
 });
 document.addEventListener('keyup',e=>{keys.delete(e.code);shiftHeld=e.shiftKey;});window.addEventListener('blur',clearInput);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else loop();});
 document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;if(wasLocked&&!locked&&phase==='playing')pause();wasLocked=locked;});
 function lookBy(dx,dy){world.player.yaw+=dx*.002;world.player.pitch=Math.max(-1.05,Math.min(.9,world.player.pitch-dy*.002));}
 document.addEventListener('mousemove',e=>{if(phase==='playing'&&document.pointerLockElement===canvas)lookBy(e.movementX,e.movementY);});
 canvas.addEventListener('pointerdown',e=>{
  if(phase!=='playing')return;shiftHeld=e.shiftKey;void sound.resume();canvas.focus({preventScroll:true});
  drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
  if(e.pointerType==='mouse'&&document.pointerLockElement!==canvas){try{canvas.requestPointerLock?.()?.catch?.(()=>{});}catch{}}
 });
 canvas.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId&&phase==='playing'&&document.pointerLockElement!==canvas){lookBy(e.clientX-drag.x,e.clientY-drag.y);drag.x=e.clientX;drag.y=e.clientY;}});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
 for(const button of stage.querySelectorAll('[data-green-key]')){
  button.addEventListener('pointerdown',e=>{if(phase!=='playing')return;e.preventDefault();keys.add(button.dataset.greenKey);button.setAttribute('aria-pressed','true');button.setPointerCapture(e.pointerId);void sound.resume();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{keys.delete(button.dataset.greenKey);button.setAttribute('aria-pressed','false');});
 }
 window.addEventListener('pagehide',()=>{abort();cancelAnimationFrame(raf);sound.close();view?.dispose();view=null;});
 return {setVisible,stop:pause};
}
