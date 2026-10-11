import {test,expect} from 'bun:test';
import {buildRequests,pack,palette} from '../src/pigment/jev.mjs';
import {prepare} from '../src/pigment/art.mjs';
import {renderPaint} from '../src/pigment/renderer.mjs';
import {createWorld,stepWorld,sweptContact,drivingState} from '../src/race-physics.js';
import {ChatReplay,barrageChat,parseChat,filterRecord} from '../src/chat-engine.js';

const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
test('Every paint representation covers a 10×7 canvas, bounded to 30 typed questions per request',()=>{
 for(const method of ['palette','hsl','rgb','silhouette']){
  const batches=buildRequests('a pink house',method,10,7),all=Object.assign({},...batches.map(b=>b.questions));
  expect(Object.keys(all).length).toBe(70*(['hsl','rgb'].includes(method)?3:1));
  expect(batches.every(b=>Object.keys(b.questions).length<=30&&b.state===batches[0].state)).toBe(true);
  expect(batches[0].state.height).toBe(7);
  const answers=Object.fromEntries(Object.entries(all).map(([key,q])=>[key,q.type==='noul'?{noul:.7}:{probabilities:Object.fromEntries((Array.isArray(q.criteria)?q.criteria.map((_,i)=>String(i)):Object.keys(q.criteria)).map((c,i)=>[c,i===0?1:0]))}]));
  const result=pack(answers,method,10,'a pink house',7),prepared=prepare(result);
  expect(prepared.pixels.length).toBe(70);
  expect(prepared.mean.every(Number.isFinite)).toBe(true);
  expect(result.width).toBe(10);expect(result.height).toBe(7);
 }
});
test('Paint rejects missing probabilities and invalid grids rather than blank success',()=>{
 for(const dim of [0,10.5,1025])expect(()=>buildRequests('a house','palette',dim)).toThrow();
 expect(()=>pack({},'silhouette',10,'circle')).toThrow();
 expect(()=>pack({},'palette',10,'house')).toThrow();
});
test('Reference pigment renderer produces spatial color and relief for an odd grid',()=>{
 const colors=Object.values(palette),pixels=Array.from({length:100},(_,i)=>({probabilities:colors.map((_,k)=>k===(i%10<5?3:10)?1:0)}));
 const result={method:'palette',size:10,width:10,height:10,palette:colors,pixels};
 const prepared=prepare(result);expect(prepared.pixels[0].hard).toEqual(palette.red);expect(prepared.pixels[9].hard).toEqual(palette.blue);
 const rendered=renderPaint(result,80);
 expect(rendered.pixels.length).toBe(80*80*4);
 const average=(x)=>{let sum=[0,0,0];for(let y=10;y<70;y++)for(let c=0;c<3;c++)sum[c]+=rendered.pixels[(y*80+x)*4+c];return sum;};
 const left=average(15),right=average(65);expect(left[0]).toBeGreaterThan(left[2]);expect(right[2]).toBeGreaterThan(right[0]);
 expect(new Set(rendered.pixels).size).toBeGreaterThan(20);
});
test('Immediate chat output releases later results without head-of-line blocking',async()=>{
 const waiting=[],released=[],messages=parseChat('a: slow\nb: quick\nc: next');
 const run=new ChatReplay({messages,times:[0,0,0],workers:2,ordered:false,infer:()=>new Promise(resolve=>waiting.push(resolve)),onRelease:r=>released.push(r.index)});
 run.tick();await flush();waiting[1]({ms:1});await flush();expect(released).toEqual([1]);expect(waiting.length).toBe(3);
 waiting[2]({ms:1});await flush();waiting[0]({ms:5});await flush();expect(released).toEqual([1,2,0]);expect(run.finished).toBe(true);expect(run.records.every(r=>r.delivered)).toBe(true);
});
test('Category filters use model answers, not fixture position; barrage is editable',()=>{
 const messages=parseChat(barrageChat());expect(messages.length).toBe(1344);
 const record={result:{answers:{category:{choice:'NOISE',probabilities:{NOISE:.9,QUESTION:.1}}}}};
 expect(filterRecord(record,['QUESTION'])).toBe(false);expect(filterRecord(record,['NOISE'])).toBe(true);expect(filterRecord(record,['NOISE'],.95)).toBe(false);
 expect(parseChat(barrageChat(5).replace('Kappa','my edit'))[0].text).toBe('my edit');
});
test('Swept collision detects rapid lane crossings and high-speed longitudinal motion',()=>{
 expect(sweptContact(-1,0,1,0)).not.toBeNull();
 expect(sweptContact(0,-30,0,30)).not.toBeNull();
 expect(sweptContact(-1,-30,-1,30)).toBeNull();
});
;
test('Lane sensors distinguish alongside traffic from the next obstacle ahead',()=>{
 const state=drivingState({x:0,speed:0,cars:[{lane:0,z:-2,speed:20,kind:'car'},{lane:0,z:5,speed:0,kind:'barrier'}]});
 expect(state.lanes[0].alongside).toBe(true);expect(state.lanes[0].clearance_m).toBe(5);expect(state.lanes[0].blocked).toBe(true);
 expect(state.lanes[1].blocked).toBe(false);
});
test('A collision stops penetration but allows steering away from a stopped obstacle',()=>{
 const w=createWorld('obstacles',200);w.cars=[{id:0,lane:1,z:5,speed:0,kind:'barrier'}];w.speed=40;
 stepWorld(w,.1,1,'ACCELERATE');expect(w.hits).toBe(1);expect(w.cars[0].z).toBeGreaterThanOrEqual(4.4);expect(w.speed).toBe(0);
 for(let i=0;i<120;i++)stepWorld(w,1/120,0,'ACCELERATE');
 expect(w.x).toBeLessThan(.1);expect(w.hits).toBe(1);expect(w.distance).toBeGreaterThan(1);
});
test('Fast side-swipe cannot teleport through a neighboring car',()=>{
 const w=createWorld();w.x=0;w.speed=20;w.cars=[{id:0,lane:1,z:0,speed:20,kind:'car'}];
 for(let i=0;i<45;i++)stepWorld(w,1/120,2,'COAST');
 expect(w.x).toBeLessThan(.48);expect(w.hits).toBe(1);
});
