import {silo} from './green-light-world.js';

export const greenAudioFiles=['rain','thunder','motor','hydraulic','lock','shot','step-0','step-1'];

// All samples ship with the page. See assets/green-light/README.md for CC0 sources.
export function createGreenAudio(){
 const Audio=window.AudioContext||window.webkitAudioContext;
 let ctx,master,loadPromise,ready=false,error='',muted=false,closed=false,foot=0;
 let motor,motorGain,motorPan;
 const buffers=new Map(),shots=new Set();
 function init(){
  if(ctx||!Audio||closed)return;
  ctx=new Audio();master=ctx.createGain();master.gain.value=muted?0:.7;
  const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-10;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.18;
  master.connect(limiter).connect(ctx.destination);
 }
 function voice(name,gain=1,{loop=false,rate=1,pan=0}={}){
  const source=ctx.createBufferSource(),amp=ctx.createGain(),position=ctx.createStereoPanner();
  source.buffer=buffers.get(name);source.loop=loop;source.playbackRate.value=rate;amp.gain.value=gain;position.pan.value=pan;
  source.connect(amp).connect(position).connect(master);
  source.onended=()=>{shots.delete(source);source.disconnect();amp.disconnect();position.disconnect();};
  source.start();if(!loop)shots.add(source);return {source,amp,position};
 }
 async function prepare(){
  init();if(!ctx)return false;if(ready)return true;if(loadPromise)return loadPromise;
  const context=ctx;error='';
  loadPromise=Promise.all(greenAudioFiles.map(async name=>{
   const response=await fetch(new URL('../assets/green-light/'+name+'.wav',import.meta.url),{credentials:'omit'});
   if(!response.ok)throw Error(name+'.wav: HTTP '+response.status);
   const buffer=await context.decodeAudioData(await response.arrayBuffer());
   if(!buffer.length)throw Error(name+'.wav: empty audio');
   return [name,buffer];
  })).then(entries=>{
   if(closed)return false;
   for(const [name,buffer] of entries)buffers.set(name,buffer);
   voice('rain',.22,{loop:true});
   const machinery=voice('motor',0,{loop:true});motor=machinery.source;motorGain=machinery.amp;motorPan=machinery.position;
   ready=true;return true;
  }).catch(e=>{error='Sound assets unavailable: '+e.message;loadPromise=null;return false;});
  return loadPromise;
 }
 async function resume(){
  try{init();if(!ctx)return false;await ctx.resume();return await prepare();}
  catch(e){error=e.message;return false;}
 }
 function play(event){
  if(!ready||ctx?.state!=='running')return;
  if(event==='step')voice('step-'+(foot++%2),.65,{rate:.94+Math.random()*.12,pan:foot%2?.15:-.15});
  if(event==='shot')voice('shot',1);
  if(event==='thunder')voice('thunder',1.05,{pan:Math.random()*.8-.4});
  if(event==='piston')voice('hydraulic',.65,{rate:.8});
  if(event==='piston-stop')voice('lock',.4,{rate:.75});
  if(event==='lock')voice('lock',.9);
  if(event==='impact'||event==='door')voice('lock',.4,{rate:.6});
  if(event==='hit')voice('step-0',.8,{rate:.5});
 }
 function update(w){
  if(!ready||ctx?.state!=='running')return;
  const p=w.player,at=ctx.currentTime,moving=Math.abs(w.motor||0)>.005;
  const turning=!!(w.observation&&w.turret.lift>=1&&(w.turret.yawRate||w.turret.pitchRate));
  const distance=Math.hypot(p.x-silo.x,p.z-silo.z),presence=Math.max(.65,1/(1+distance/70));
  const bearing=Math.atan2(silo.x-p.x,-(silo.z-p.z))-p.yaw;
  motorPan.pan.setTargetAtTime(Math.sin(bearing)*.7,at,.08);
  motorGain.gain.setTargetAtTime((moving?.85:turning?.22:0)*presence,at,.025);
  motor.playbackRate.setTargetAtTime(moving?(w.motor<0?.62:.82):1.2,at,.12);
 }
 function mute(value){muted=value;if(master)master.gain.setTargetAtTime(value?0:.7,ctx.currentTime,.04);}
 function suspend(){
  if(!ctx)return;
  // Drop old one-shots rather than resuming a stale gunshot after a pause.
  for(const source of shots){try{source.stop();}catch{}}shots.clear();
  if(motorGain)motorGain.gain.value=0;void ctx.suspend().catch(()=>{});
 }
 function close(){closed=true;if(ctx)void ctx.close().catch(()=>{});ctx=null;buffers.clear();shots.clear();}
 return {prepare,resume,update,play,mute,suspend,close,get active(){return ctx?.state==='running';},get ready(){return ready;},get error(){return error;},get muted(){return muted;},get supported(){return !!Audio;}};
}
