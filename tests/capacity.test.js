import {test,expect} from 'bun:test';
import {RequestBudget,advertisedCapacity,measureCapacity} from '../src/capacity.js';
import {Client,Run,pool,choice,delay} from '../src/core.js';
import {connectionDefaults,normalizeEndpoint,addressSpace,permissionState} from '../src/connection.js';
import {ChatReplay} from '../src/chat-engine.js';

const qs={go:choice('Go?', ['YES','NO'])};
export function reply(questions){return {answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>[id,q.type==='noul'?{type:'noul',noul:.1}:q.type==='score'?{type:'score',score:0,probabilities:Object.fromEntries(q.criteria.map((_,i)=>[i,i===0?1:0])),confidence:1}:{type:'choice',choice:Object.keys(q.criteria)[0],probabilities:Object.fromEntries(Object.keys(q.criteria).map((k,i)=>[k,i===0?1:0])),confidence:1}]))};}
const config=(extra={})=>({...connectionDefaults,...extra});

test('localhost defaults, /v1 normalization and browser address spaces',async()=>{
 expect(connectionDefaults.url).toBe('http://localhost:8000');expect(connectionDefaults.concurrency).toBe(0);
 expect(normalizeEndpoint('localhost:8000/v1/')).toBe('http://localhost:8000');
 for(const url of ['http://user:password@localhost','file:///tmp','http://0.0.0.0','https://localhost/a','http://localhost?secret=x'])expect(()=>normalizeEndpoint(url)).toThrow();
 for(const url of ['http://localhost:8000','http://127.0.0.1','http://[::1]','http://localhost.','http://[::ffff:127.0.0.1]'])expect(addressSpace(url)).toBe('loopback');
 for(const url of ['http://192.168.0.3','http://10.0.0.5','https://server.local','http://[fd12::1]','http://[::ffff:192.168.0.3]'])expect(addressSpace(url)).toBe('local');
 expect(addressSpace('https://example.com')).toBeNull();
 const names=[];expect(await permissionState('http://localhost',{query:async({name})=>{names.push(name);if(name==='loopback-network')throw Error();return {state:'denied'};}})).toBe('denied');expect(names).toEqual(['loopback-network','local-network-access']);
});
test('only explicit Jev request capacity counts as reported capacity',()=>{
 expect(advertisedCapacity({data:[{id:'test',max_concurrency:8,context_window:180000,workers:64}]})).toBeNull();
 expect(advertisedCapacity({data:[{id:'test',capabilities:{jev:{max_concurrent_requests:24}}}]},'test')).toBe(24);
 expect(advertisedCapacity({data:[],capabilities:{jev:{max_concurrent_requests:0}}})).toBeNull();
});
test('bounded probe distinguishes true parallel throughput from a serial queue',async()=>{
 for(const workers of [1,4,16]){
  let time=0;const slots=Array(workers).fill(0);
  const result=await measureCapacity(async()=>{const i=slots.indexOf(Math.min(...slots)),end=Math.max(time,slots[i])+10;slots[i]=end;await Promise.resolve();time=Math.max(time,end);},{ceiling:64,now:()=>time});
  expect(result.limit).toBe(workers);expect(result.samples.at(-1).width).toBe(workers*2);expect(result.source).toBe('measured');
 }
});
test('probe backs off on 429, but does not hide auth, route or schema failures',async()=>{
 let calls=0;const report=await measureCapacity(async()=>{if(++calls>1)throw Object.assign(Error('busy'),{status:429});},{ceiling:8});expect(report.limit).toBe(1);
 await expect(measureCapacity(async()=>{throw Object.assign(Error('unauthorized'),{status:401});})).rejects.toThrow('unauthorized');
 const ac=new AbortController();ac.abort();await expect(measureCapacity(async()=>{}, {signal:ac.signal})).rejects.toThrow();
});
test('request budget is adjustable, priority ordered and cancellation releases waiters',async()=>{
 const b=new RequestBudget(1),ac=new AbortController(),first=await b.acquire();let order=[];
 const low=b.acquire().then(r=>{order.push('bulk');r();}),high=b.acquire(undefined,3).then(r=>{order.push('control');r();});
 const cancelled=b.acquire(ac.signal).catch(e=>e.name);ac.abort();expect(await cancelled).toBe('AbortError');first();await Promise.all([low,high]);expect(order).toEqual(['control','bulk']);expect(b.active).toBe(0);expect(b.queue).toHaveLength(0);
 const a=await b.acquire();let started=false;const waiting=b.acquire().then(r=>{started=true;r();});b.setLimit(2);await waiting;expect(started).toBe(true);a();
});
test('dynamic pools exceed old per-game caps without losing any rows',async()=>{
 let active=0,peak=0,limit=2;const seen=new Set();
 await pool(Array.from({length:100},(_,i)=>i),()=>limit,new Run(),async i=>{active++;peak=Math.max(peak,active);if(i===0)limit=40;await delay(1);seen.add(i);active--;});expect(peak).toBeGreaterThan(32);expect(seen.size).toBe(100);
});
test('chat inherits live global capacity while arrivals remain independent',async()=>{
 let limit=1;const resolves=[];const replay=new ChatReplay({messages:Array.from({length:50},(_,id)=>({id})),times:Array(50).fill(0),workers:()=>limit,now:()=>0,infer:()=>new Promise(r=>resolves.push(r))});
 replay.tick();await Promise.resolve();expect(replay.active).toBe(1);expect(replay.arrived).toBe(50);limit=40;replay.tick();await Promise.resolve();expect(replay.active).toBe(40);replay.stop();resolves.forEach(r=>r({}));await Promise.resolve();expect(replay.completed).toBe(0);
});
test('Connect discovers models and validates the selected route; no constructor network calls',async()=>{
 const old=fetch,seen=[];globalThis.fetch=async(url,init)=>{seen.push({url,init});if(url.endsWith('/models'))return Response.json({data:[{id:'local-model',capabilities:{jev:{max_concurrent_requests:12}}}]});return Response.json(reply(JSON.parse(init.body).questions));};
 try{const c=new Client(config());expect(seen).toHaveLength(0);const report=await c.connect();expect(report.limit).toBe(12);expect(report.source).toBe('reported');expect(c.config.model).toBe('local-model');expect(seen).toHaveLength(2);expect(seen[0].init.targetAddressSpace).toBe('loopback');expect(seen[0].url).toBe('http://localhost:8000/v1/models');}finally{globalThis.fetch=old;}
});
test('all logical calls and protocol overrides share the same HTTP budget',async()=>{
 const old=fetch;let active=0,peak=0,calls=0;globalThis.fetch=async(url,init)=>{calls++;active++;peak=Math.max(peak,active);await delay(2);active--;const body=JSON.parse(init.body);if(body.questions)return Response.json(reply(body.questions));return Response.json({results:[{fields:Object.fromEntries(Object.entries(body.schema).map(([id,q])=>[id,{value:q.type==='boolean'?true:q.choices[0],probability:1}]))}]});};
 try{const c=new Client(config({concurrency:7})),questions=Object.fromEntries(Array.from({length:20},(_,i)=>['q'+i,qs.go]));const responses=await Promise.all(Array.from({length:8},(_,i)=>c.infer({i},questions,undefined,{protocol:i%2?'decision':'systemone'})));expect(peak).toBe(7);expect(calls).toBeGreaterThan(8);expect(responses.every(r=>Object.keys(r.answers).length===20)).toBe(true);expect(responses.every(r=>r.queueMs>=0&&r.networkMs>=0)).toBe(true);expect(c.budget.active).toBe(0);}finally{globalThis.fetch=old;}
});
test('busy responses reduce the global budget and retry within the same abortable deadline',async()=>{
 const old=fetch;let calls=0;globalThis.fetch=async()=>++calls===1?new Response('busy',{status:429,headers:{'Retry-After':'0'}}):Response.json(reply(qs));
 try{const c=new Client(config({concurrency:8}));const r=await c.infer('x',qs);expect(c.capacity).toBe(4);expect(r.httpRequests).toBe(2);expect(c.capacitySource).toBe('backpressure');}finally{globalThis.fetch=old;}
});
test('abort during queued work or retry never sends late input',async()=>{
 const old=fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('busy',{status:429,headers:{'Retry-After':'10'}});};
 try{const c=new Client(config({concurrency:1})),ac=new AbortController();const pending=c.infer('x',qs,ac.signal);await delay(2);ac.abort();await expect(pending).rejects.toThrow();expect(calls).toBe(1);expect(c.budget.active).toBe(0);}finally{globalThis.fetch=old;}
});
