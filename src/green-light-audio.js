// All effects are synthesized locally; no sample downloads or microphone access.
export function createGreenAudio(){
 let ctx,master,rain,motor,motorGain,servo,servoGain,muted=false;
 const sources=new Set();
 function noise(duration,filterType,frequency,gain,decay=true){
  if(!ctx||ctx.state!=='running')return;
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),amp=ctx.createGain();
  source.buffer=rain;filter.type=filterType;filter.frequency.value=frequency;
  source.connect(filter).connect(amp).connect(master);amp.gain.setValueAtTime(.0001,ctx.currentTime);amp.gain.exponentialRampToValueAtTime(gain,ctx.currentTime+.025);
  if(decay)amp.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
  source.loop=true;source.start();source.stop(ctx.currentTime+duration);sources.add(source);
  source.onended=()=>{sources.delete(source);source.disconnect();filter.disconnect();amp.disconnect();};
 }
 function init(){
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;
  ctx=new Audio();master=ctx.createGain();master.gain.value=muted?0:.48;
  const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.ratio.value=6;master.connect(limiter).connect(ctx.destination);
  rain=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);const data=rain.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  const shower=ctx.createBufferSource(),high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter(),rainGain=ctx.createGain();
  shower.buffer=rain;shower.loop=true;high.type='highpass';high.frequency.value=850;low.type='lowpass';low.frequency.value=6500;rainGain.gain.value=.22;
  shower.connect(high).connect(low).connect(rainGain).connect(master);shower.start();
  motor=ctx.createOscillator();motor.type='sawtooth';motor.frequency.value=53;motorGain=ctx.createGain();motorGain.gain.value=0;
  const muffler=ctx.createBiquadFilter();muffler.type='lowpass';muffler.frequency.value=420;motor.connect(muffler).connect(motorGain).connect(master);motor.start();
  servo=ctx.createOscillator();servo.type='triangle';servo.frequency.value=190;servoGain=ctx.createGain();servoGain.gain.value=0;servo.connect(servoGain).connect(master);servo.start();
  return true;
 }
 async function resume(){try{if(!ctx&&!init())return false;await ctx.resume();return ctx.state==='running';}catch{return false;}}
 function update(w){
  if(!ctx||ctx.state!=='running')return;
  const moving=Math.abs(w.motor||0)>.005;
  motorGain.gain.setTargetAtTime(moving?.08:0,ctx.currentTime,.09);motor.frequency.setTargetAtTime(w.motor<0?42:61,ctx.currentTime,.1);
  const turning=w.observation&&w.turret.lift>=1&&(w.turret.yawRate||w.turret.pitchRate);
  servoGain.gain.setTargetAtTime(turning?.015:0,ctx.currentTime,.05);
 }
 function play(event){
  if(event==='step'){noise(.16,'lowpass',600,.24);noise(.1,'highpass',2200,.06);}
  if(event==='shot'){noise(.25,'lowpass',3600,.75);noise(.8,'lowpass',170,.35);}
  if(event==='thunder'){noise(3.6,'lowpass',220,.6);noise(1.4,'lowpass',750,.12);}
  if(event==='impact')noise(.12,'bandpass',1300,.2);
  if(event==='hit')noise(.22,'lowpass',350,.45);
  if(event==='piston')noise(.5,'bandpass',1150,.1);
  if(event==='door')noise(.6,'lowpass',250,.23);
 }
 function mute(value){muted=value;if(master)master.gain.setTargetAtTime(value?0:.48,ctx.currentTime,.08);}
 function suspend(){if(ctx)void ctx.suspend().catch(()=>{});}
 function close(){if(ctx){void ctx.close().catch(()=>{});ctx=null;}}
 return {resume,update,play,mute,suspend,close,get active(){return ctx?.state==='running';}};
}
