import {silo} from './green-light-world.js';

// Stereo weather and machinery synthesized locally; no samples or microphone.
export function createGreenAudio(){
 let ctx,master,white,brown,reverb,motor,motorSub,motorGain,motorFilter,grindGain,servo,servoGain,machinePan,muted=false,foot=0;
 const sources=new Set();
 const Audio=window.AudioContext||window.webkitAudioContext;
 function makeNoise(seconds,low=false){
  const buffer=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate);
  for(let channel=0;channel<2;channel++){
   const data=buffer.getChannelData(channel);let value=0;
   for(let i=0;i<data.length;i++){const n=Math.random()*2-1;value=(value+.02*n)/1.02;data[i]=low?value*3.5:n;}
  }
  return buffer;
 }
 function loop(buffer,high,low,gain,destination=master){
  const source=ctx.createBufferSource(),hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),amp=ctx.createGain();
  source.buffer=buffer;source.loop=true;hp.type='highpass';hp.frequency.value=high;lp.type='lowpass';lp.frequency.value=low;amp.gain.value=gain;
  source.connect(hp).connect(lp).connect(amp).connect(destination);source.start();return amp;
 }
 function oscillator(type,frequency,destination){const o=ctx.createOscillator();o.type=type;o.frequency.value=frequency;o.connect(destination);o.start();return o;}
 function noise(duration,type,frequency,gain,{delay=0,pan=0,low=false,attack=.02,echo=false}={}){
  if(!ctx||ctx.state!=='running')return;
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),amp=ctx.createGain(),position=ctx.createStereoPanner(),at=ctx.currentTime+delay;
  source.buffer=low?brown:white;source.loop=true;filter.type=type;filter.frequency.setValueAtTime(frequency,at);position.pan.value=pan;
  if(low)filter.frequency.exponentialRampToValueAtTime(Math.max(45,frequency*.4),at+duration);
  source.connect(filter).connect(amp).connect(position).connect(master);if(echo)position.connect(reverb);
  amp.gain.setValueAtTime(.0001,at);amp.gain.exponentialRampToValueAtTime(gain,at+attack);amp.gain.exponentialRampToValueAtTime(.0001,at+duration);
  source.start(at,Math.random()*5);source.stop(at+duration);sources.add(source);
  source.onended=()=>{sources.delete(source);source.disconnect();filter.disconnect();amp.disconnect();position.disconnect();};
 }
 function knock(frequency,end,duration,gain,delay=0){
  if(!ctx||ctx.state!=='running')return;
  const o=ctx.createOscillator(),amp=ctx.createGain(),at=ctx.currentTime+delay;
  o.frequency.setValueAtTime(frequency,at);o.frequency.exponentialRampToValueAtTime(end,at+duration);
  amp.gain.setValueAtTime(.0001,at);amp.gain.exponentialRampToValueAtTime(gain,at+.004);amp.gain.exponentialRampToValueAtTime(.0001,at+duration);
  o.connect(amp).connect(master);amp.connect(reverb);o.start(at);o.stop(at+duration);sources.add(o);
  o.onended=()=>{sources.delete(o);o.disconnect();amp.disconnect();};
 }
 function init(){
  if(!Audio)return false;
  ctx=new Audio();master=ctx.createGain();master.gain.value=muted?0:.62;
  const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-14;limiter.ratio.value=8;limiter.attack.value=.004;limiter.release.value=.3;master.connect(limiter).connect(ctx.destination);
  white=makeNoise(10);brown=makeNoise(12,true);
  // Soft outdoor reflections on thunder and metal; weather remains direct.
  const impulse=makeNoise(1.8),echo=ctx.createConvolver();
  for(let c=0;c<2;c++){const data=impulse.getChannelData(c);for(let i=0;i<data.length;i++)data[i]*=Math.pow(1-i/data.length,3)*(i<ctx.sampleRate*.035?0:1);}
  echo.buffer=impulse;reverb=ctx.createGain();reverb.gain.value=.2;reverb.connect(echo).connect(master);
  loop(white,900,10000,.21);const wash=loop(brown,90,1800,.46);
  const gust=ctx.createGain();gust.gain.value=.08;oscillator('sine',.12,gust);gust.connect(wash.gain);
  // Uneven roof/leaf impacts and close water taps, independently in each ear.
  const drops=ctx.createBuffer(2,ctx.sampleRate*13,ctx.sampleRate);
  for(let c=0;c<2;c++){
   const data=drops.getChannelData(c);
   for(let n=0;n<1000;n++){
    const at=Math.floor(Math.random()*(data.length-ctx.sampleRate*.07)),length=Math.floor(ctx.sampleRate*(.008+Math.random()*.045)),frequency=700+Math.random()*3500,amplitude=.04+Math.random()*.18;
    for(let i=0;i<length;i++){const t=i/ctx.sampleRate;data[at+i]+=amplitude*Math.exp(-i/length*7)*(Math.sin(t*frequency*2*Math.PI)*.5+(Math.random()*2-1)*.5);}
   }
  }
  loop(drops,300,7000,.5);
  machinePan=ctx.createStereoPanner();machinePan.connect(master);machinePan.connect(reverb);
  motorGain=ctx.createGain();motorGain.gain.value=0;motorFilter=ctx.createBiquadFilter();motorFilter.type='lowpass';motorFilter.frequency.value=650;motorFilter.Q.value=1.4;
  motorFilter.connect(motorGain).connect(machinePan);
  motor=oscillator('sawtooth',58,motorFilter);const gear=oscillator('sawtooth',59.3,motorFilter);gear.detune.value=8;
  const subGain=ctx.createGain();subGain.gain.value=.75;subGain.connect(motorFilter);motorSub=oscillator('triangle',29,subGain);
  const chatter=ctx.createGain();chatter.gain.value=6;oscillator('sine',13,chatter);chatter.connect(motor.frequency);
  grindGain=loop(white,180,1500,0,machinePan);
  servoGain=ctx.createGain();servoGain.gain.value=0;servoGain.connect(machinePan);servo=oscillator('triangle',240,servoGain);
  return true;
 }
 async function resume(){try{if(!ctx&&!init())return false;await ctx.resume();return ctx.state==='running';}catch{return false;}}
 function update(w){
  if(!ctx||ctx.state!=='running')return;
  const at=ctx.currentTime,moving=Math.abs(w.motor||0)>.005,p=w.player;
  const distance=Math.hypot(p.x-silo.x,p.z-silo.z),presence=Math.max(.55,1/(1+distance/35));
  const bearing=Math.atan2(silo.x-p.x,-(silo.z-p.z))-p.yaw;machinePan.pan.setTargetAtTime(Math.sin(bearing)*.8,at,.15);
  const turning=w.observation&&w.turret.lift>=1&&(w.turret.yawRate||w.turret.pitchRate);
  motorGain.gain.setTargetAtTime((moving?.3:turning?.065:0)*presence,at,.08);
  const pitch=moving?(w.motor<0?46:64)+w.turret.lift*18:105+Math.abs(w.turret.yawRate||0)*30;
  motor.frequency.setTargetAtTime(pitch,at,.16);motorSub.frequency.setTargetAtTime(pitch/2,at,.16);
  motorFilter.frequency.setTargetAtTime(moving?380+w.turret.lift*620:420,at,.16);grindGain.gain.setTargetAtTime((moving?.2:turning?.035:0)*presence,at,.08);
  servoGain.gain.setTargetAtTime(turning?.012*presence:0,at,.05);servo.frequency.setTargetAtTime(190+Math.abs(w.turret.yawRate||0)*80,at,.08);
 }
 function play(event){
  if(event==='step'){
   const pan=(foot++%2?1:-1)*.18;
   knock(95+Math.random()*15,38,.16,.3);noise(.2,'lowpass',850,.4,{pan});
   noise(.22,'bandpass',1600+Math.random()*500,.24,{delay:.07,pan,attack:.01});noise(.3,'highpass',2800,.085,{delay:.1,pan});
  }
  if(event==='shot'){noise(.06,'highpass',1500,.9,{attack:.002,echo:true});noise(.25,'lowpass',3600,.8,{echo:true});noise(1,'lowpass',170,.55,{low:true,echo:true});}
  if(event==='thunder'){
   const side=Math.random()*1.4-.7;
   noise(.65,'lowpass',2800,.85,{attack:.008,pan:side,echo:true});
   noise(2.8,'bandpass',550,.65,{delay:.12,attack:.12,pan:-side,echo:true});
   noise(7,'lowpass',1000,1.25,{low:true,attack:.18,pan:side,echo:true});
   for(let i=0;i<4;i++)noise(3+Math.random()*2,'lowpass',450+Math.random()*550,.65+Math.random()*.3,{low:true,delay:.6+i*.85+Math.random()*.3,attack:.3,pan:side*(1-i*.4),echo:true});
  }
  if(event==='impact')noise(.2,'bandpass',1300,.24,{echo:true});
  if(event==='hit')noise(.22,'lowpass',350,.45);
  if(event==='piston'){noise(.7,'bandpass',850,.24,{echo:true});noise(.3,'lowpass',150,.6,{low:true,echo:true});}
  if(event==='piston-stop'){noise(.3,'lowpass',220,.55,{low:true,echo:true});noise(.35,'highpass',1800,.12);}
  if(event==='lock'){knock(1450,650,.12,.27);knock(950,420,.18,.19,.045);noise(.065,'highpass',2300,.45,{attack:.002,echo:true});}
  if(event==='door')noise(.6,'lowpass',250,.23);
 }
 function mute(value){muted=value;if(master)master.gain.setTargetAtTime(value?0:.62,ctx.currentTime,.08);}
 function suspend(){if(ctx)void ctx.suspend().catch(()=>{});}
 function close(){if(ctx){void ctx.close().catch(()=>{});ctx=null;}sources.clear();}
 return {resume,update,play,mute,suspend,close,get active(){return ctx?.state==='running';},get muted(){return muted;},get supported(){return !!Audio;}};
}
