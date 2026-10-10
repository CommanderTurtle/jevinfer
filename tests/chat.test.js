import {test,expect} from 'bun:test';
import {ChatReplay,parseChat,schedule,makeQuestions,presets,sampleChat} from '../src/chat-engine.js';

const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function rig(count=8,workers=2){let clock=0;const pending=new Map(),released=[],arrived=[];const messages=parseChat(Array.from({length:count},(_,i)=>`u${i}: hello`).join('\n'));const run=new ChatReplay({messages,times:schedule(messages,{rate:10}),workers,now:()=>clock,infer:message=>new Promise((resolve,reject)=>pending.set(message.id,{resolve,reject})),onArrival:r=>arrived.push(r.index),onRelease:r=>released.push(r.index)});return {run,pending,released,arrived,time:t=>clock=t};}

test('Chat parser retains plain messages, Unicode users and timestamps',()=>{
  expect(parseChat('[00:01.250] viewer: hello\n[00:00:02] café: wow')).toEqual([{id:0,user:'viewer',text:'hello',stamp:1250},{id:1,user:'café',text:'wow',stamp:2000}]);
  expect(parseChat('https://example.com\njust some chat')[0].text).toBe('https://example.com');
  expect(parseChat('{not json}','plain')[0].text).toBe('{not json}');
});
test('JSONL supports seconds, ISO time, at_ms and username aliases',()=>{
  const lines=[{user:'a',message:'hi',timestamp:1.5},{username:'b',text:'ok',at_ms:2300},{message:'yo',timestamp:'2026-10-10T00:00:00Z'}];
  const out=parseChat(lines.map(x=>JSON.stringify(x)).join('\n'));expect(out.map(x=>x.stamp)).toEqual([1500,2300,Date.parse('2026-10-10T00:00:00Z')]);expect(out[1].user).toBe('b');
});
test('Malformed chat input fails explicitly',()=>{
  for(const value of ['', '{bad}', '{"message":3}', '[00:99:00] user: hello','{"message":"hi","timestamp":"never"}','x'.repeat(4097)])expect(()=>parseChat(value)).toThrow();
});
test('Timestamp replay preserves spacing and simultaneous arrivals',()=>{
  expect(schedule(parseChat('[00:01] a: one\n[00:01] b: two\n[00:03] c: three'),{mode:'timestamps',speed:2})).toEqual([0,0,1000]);
  expect(()=>schedule(parseChat('hi'),{mode:'timestamps'})).toThrow();
  expect(()=>schedule(parseChat('[00:03] hi\n[00:01] yo'),{mode:'timestamps'})).toThrow();expect(schedule([])).toEqual([]);
});
test('Burst schedule integrates higher rates without losing messages',()=>{
  const messages=Array(20).fill({stamp:null});const times=schedule(messages,{mode:'bursts',rate:2,period:4,duration:1,multiplier:3});
  expect(times.slice(0,7)).toEqual([0,500,1000,1500,2000,2500,3000]);expect(times[7]).toBeCloseTo(3166.6667,3);expect(times[12]).toBeCloseTo(4000,3);expect(times.length).toBe(20);
  expect(schedule(messages,{rate:10,speed:2})[10]).toBeCloseTo(500);expect(()=>schedule(messages,{mode:'bursts',duration:9,period:8})).toThrow();
  expect(()=>schedule(messages,{mode:'bursts',period:Infinity})).toThrow();
});
test('Prior six-category preset and extra Noul/Score questions remain editable',()=>{
  const p=presets.signal;expect(Object.keys(p.criteria)).toEqual(['QUESTION','INSIGHT','FEEDBACK','FUNNY','NOISE','SPAM']);
  expect(makeQuestions(p.instructions,p.criteria,{urgent:{type:'noul'},value:{type:'score',criteria:['Low','High']}}).urgent.type).toBe('noul');
  expect(()=>makeQuestions(p.instructions,p.criteria,{category:{type:'noul'}})).toThrow();expect(()=>makeQuestions('',p.criteria)).toThrow();expect(()=>makeQuestions('classify',{A:4})).toThrow();
  expect(parseChat(sampleChat()).length).toBe(288);
});
test('Independent arrivals keep flowing when all workers are blocked',async()=>{
  const r=rig();r.run.tick();await flush();r.time(800);r.run.tick();await flush();
  expect(r.arrived.length).toBe(8);expect(r.pending.size).toBe(2);expect(r.run.snapshot().queued).toBe(6);expect(r.run.snapshot().inflight).toBe(2);r.run.stop();
});
test('Out-of-order completion buffers results until prior message resolves',async()=>{
  const r=rig(3);r.time(300);r.run.tick();await flush();r.pending.get(1).resolve({ms:20});await flush();expect(r.released).toEqual([]);expect(r.pending.has(2)).toBe(true);
  r.pending.get(2).resolve({ms:25});await flush();expect(r.released).toEqual([]);r.time(600);r.pending.get(0).resolve({ms:600});await flush();
  expect(r.released).toEqual([0,1,2]);expect(r.run.finished).toBe(true);expect(r.run.records[1].bufferMs).toBe(500);
});
test('Endpoint failure releases an error row and does not deadlock later rows',async()=>{
  const r=rig(2);r.time(200);r.run.tick();await flush();r.pending.get(1).resolve({ms:1});r.pending.get(0).reject(Error('HTTP 429'));await flush();
  expect(r.released).toEqual([0,1]);expect(r.run.snapshot().errors).toBe(1);expect(r.run.finished).toBe(true);expect(r.run.records[0].error).toBe('HTTP 429');
});
test('Pause freezes source and dispatch but allows in-flight work to finish',async()=>{
  const r=rig(3,1);r.run.tick();await flush();r.time(50);r.run.pause();r.time(5000);r.run.tick();r.pending.get(0).resolve({ms:5000});await flush();
  expect(r.arrived).toEqual([0]);expect(r.run.elapsed()).toBe(50);r.run.resume();r.time(5100);r.run.tick();await flush();expect(r.arrived).toEqual([0,1]);expect(r.pending.size).toBe(2);r.run.stop();
});
test('Stop cancels queued work and ignores late results',async()=>{
  const r=rig(4,1);r.time(400);r.run.tick();await flush();r.run.stop();r.pending.get(0).resolve({ms:1});await flush();
  expect(r.pending.size).toBe(1);expect(r.released).toEqual([]);expect(r.run.snapshot().cancelled).toBe(4);expect(r.run.records.every(x=>x.status==='cancelled')).toBe(true);
});
test('Stop before dispatch microtask does not call the endpoint',async()=>{const r=rig();r.run.tick();r.run.stop();await flush();expect(r.pending.size).toBe(0);});
test('Repeated messages each get one request; all queued work is drained',async()=>{
  let calls=0,clock=100;const messages=parseChat(Array(160).fill('viewer: repeated').join('\n'));const run=new ChatReplay({messages,times:Array(160).fill(0),workers:8,now:()=>clock,infer:async()=>{calls++;return {ms:1};}});
  run.tick();for(let i=0;i<200&&!run.finished;i++)await flush();expect(run.finished).toBe(true);expect(calls).toBe(160);expect(run.released).toBe(160);expect(run.snapshot().queued).toBe(0);
});
