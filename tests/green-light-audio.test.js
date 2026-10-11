import {test,expect} from 'bun:test';
import {createGreenAudio} from '../src/green-light-audio.js';
import {createGreenWorld} from '../src/green-light-world.js';

test('Every bundled WAV has audible PCM data; events use the decoded assets',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,started=[];
 const param=()=>({value:0,setTargetAtTime(value){this.value=value;}});
 const node=()=>({connect(next){this.next=next;return next;},disconnect(){}});
 class AudioContext{
  currentTime=0;state='suspended';destination=node();
  createGain(){return {...node(),gain:param()};}
  createStereoPanner(){return {...node(),pan:param()};}
  createDynamicsCompressor(){return {...node(),threshold:param(),ratio:param(),attack:param(),release:param()};}
  createBufferSource(){return {...node(),playbackRate:param(),start(){started.push(this);},stop(){this.stopped=true;this.onended?.();}};}
  async decodeAudioData(data){
   const bytes=new DataView(data);let offset=12,length=0,peak=0;
   expect(new TextDecoder().decode(data.slice(0,4))).toBe('RIFF');
   while(offset+8<data.byteLength){
    const id=new TextDecoder().decode(data.slice(offset,offset+4)),size=bytes.getUint32(offset+4,true);offset+=8;
    if(id==='data'){length=size/2;for(let i=0;i<size;i+=2)peak=Math.max(peak,Math.abs(bytes.getInt16(offset+i,true)));break;}
    offset+=size+(size%2);
   }
   expect(length).toBeGreaterThan(1000);expect(peak).toBeGreaterThan(1000);expect(peak).toBeLessThan(32767);
   return {length};
  }
  async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
 }
 let sound;
 try{
  globalThis.window={AudioContext};
  globalThis.fetch=async url=>new Response(await Bun.file(url).arrayBuffer());
  sound=createGreenAudio();expect(await sound.resume()).toBe(true);expect(sound.ready).toBe(true);expect(sound.error).toBe('');
  const motor=started[1],w=createGreenWorld();w.motor=1;
  sound.update(w);expect(motor.next.gain.value).toBeGreaterThan(.5);expect(motor.playbackRate.value).toBe(.82);
  w.motor=-1;sound.update(w);expect(motor.playbackRate.value).toBe(.62);
  w.motor=0;w.observation={};w.turret.lift=1;w.turret.yawRate=1;sound.update(w);expect(motor.next.gain.value).toBeGreaterThan(0);expect(motor.next.gain.value).toBeLessThan(.3);
  const count=started.length;for(const event of ['shot','lock','piston','piston-stop','thunder','step'])sound.play(event);
  expect(started.length-count).toBe(6);expect(started.every(s=>s.buffer.length>0)).toBe(true);
  sound.suspend();expect(started.slice(2).every(s=>s.stopped)).toBe(true);expect(motor.next.gain.value).toBe(0);
 }finally{sound?.close();globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});

test('A missing sample is an explicit error, not silently synthesized',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 const node=()=>({gain:{value:0},threshold:{value:0},ratio:{value:0},attack:{value:0},release:{value:0},connect(n){return n;}});
 let sound;
 try{
  globalThis.window={AudioContext:class{state='running';createGain=node;createDynamicsCompressor=node;async resume(){}async close(){}}};
  globalThis.fetch=async()=>new Response('',{status:404});sound=createGreenAudio();
  expect(await sound.resume()).toBe(false);expect(sound.error).toContain('HTTP 404');expect(sound.ready).toBe(false);
 }finally{sound?.close();globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});
