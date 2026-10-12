import {test, expect} from 'bun:test';
import {PacmanSession} from '../../src/pacman/session.js';
import {Scheduler} from '../../src/pacman/scheduler.js';
import {createGame, nextDecisionPoint} from '../../src/pacman/sim.js';
import {Client, validQuestions} from '../../src/core.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const config = {url:'http://local.test', protocol:'systemone', concurrency:2, timeout:5};
function response(questions) {
  return {answers:Object.fromEntries(Object.entries(questions).map(([key,q])=>{
    const dirs=Object.keys(q.criteria), choice=dirs[0];
    return [key,{type:'choice',choice,confidence:1,probabilities:Object.fromEntries(dirs.map(d=>[d,d===choice?1:0]))}];
  })), ms:12, raw:{}};
}

test('classic manual game does not contact the endpoint',()=>{
  const game=new PacmanSession({config,infer:()=>{throw Error('Unexpected inference');}});
  game.reset('classic'); game.start();
  for(let i=0;i<360;i++)game.tick(1/60);
  expect(game.state.score).toBeGreaterThan(0);
  expect(game.state.ghosts.blinky.tile).not.toEqual({x:13,y:11});
  expect(game.stats.calls).toBe(0);game.stop();
});

for(const mode of ['pacman','ghosts','both'])test(`${mode} asks only selected actors with legal question shapes`,async()=>{
  const calls=[];
  const game=new PacmanSession({config,async infer(state,questions){validQuestions(questions);calls.push(questions);return response(questions);}});
  game.reset(mode);game.start();game.tick(1/60);await flush();
  expect(Object.keys(calls[0]).sort()).toEqual(mode==='both'?['blinky','pacman']:mode==='pacman'?['pacman']:['blinky']);
  expect(game.stats.calls).toBe(1);expect(game.stats.decisions).toBe(Object.keys(calls[0]).length);
  game.stop();
});

test('transport failure pauses; no scripted Jev choices or automatic retry',async()=>{
  let calls=0;
  const events=[];
  const game=new PacmanSession({config,async infer(){calls++;throw Error('HTTP 429');}},e=>events.push(e));
  game.start();game.tick(1/60);await flush();
  expect(game.active).toBe(false);expect(game.error).toBe('HTTP 429');
  expect(events.some(e=>e.type==='decision')).toBe(false);
  for(let i=0;i<100;i++)game.tick(1/60);
  expect(calls).toBe(1);expect(game.slots.inFlight).toBe(0);
});

test('pause aborts the request and late replies cannot steer a resumed game',async()=>{
  const calls=[];
  const game=new PacmanSession({config:{...config,concurrency:1},infer:(state,questions,signal)=>new Promise(resolve=>calls.push({questions,signal,resolve}))});
  game.start();game.tick(1/60);game.stop();
  expect(calls[0].signal.aborted).toBe(true);
  game.start();game.tick(1/60);
  expect(calls).toHaveLength(1); // The old physical request still occupies its slot.
  calls[0].resolve(response(calls[0].questions));await flush();
  expect(game.stats.calls).toBe(0);expect(game.stats.decisions).toBe(0);
  game.tick(1/60);expect(calls).toHaveLength(2);
  calls[1].resolve(response(calls[1].questions));await flush();
  expect(game.stats.calls).toBe(1);expect(game.active).toBe(true);game.stop();
});

test('strict scheduler rejects malformed answers without fallback',async()=>{
  const events=[];
  const scheduler=new Scheduler({now:()=>0,onEvent:e=>events.push(e),transport:async()=>({answers:{},latencyMs:0})});
  const s=createGame();scheduler.update(s);await flush();
  expect(scheduler.failed).toBe(true);
  expect(events.some(e=>e.type==='error')).toBe(true);
  expect(events.some(e=>e.type==='decision')).toBe(false);
  expect(scheduler.decide(nextDecisionPoint(s,'pacman'),s)).toBeNull();
});

test('strict scheduler times out without dispatching additional work',()=>{
  let now=0,calls=0;const events=[];
  const scheduler=new Scheduler({now:()=>now,timeoutMs:100,onEvent:e=>events.push(e),transport:()=>{calls++;return new Promise(()=>{});}});
  scheduler.update(createGame());now=101;scheduler.update(createGame());scheduler.update(createGame());
  expect(calls).toBe(1);expect(events.some(e=>e.type==='error')).toBe(true);
  expect(events.some(e=>e.type==='decision')).toBe(false);
});

test('strict fruit invalidation re-asks instead of selecting a greedy route',async()=>{
  const calls=[];
  const s=createGame();
  const scheduler=new Scheduler({now:()=>0,actors:['pacman'],onEvent:()=>{},transport:async body=>{calls.push(body);return {...response(body.questions),latencyMs:12};}});
  scheduler.update(s);await flush();
  s.fruit={tile:{x:13,y:17},kind:'cherry',secondsLeft:9.5,points:100};
  expect(scheduler.decide(nextDecisionPoint(s,'pacman'),s)).toBeNull();
  scheduler.update(s);await flush();expect(calls).toHaveLength(2);
});

for(const protocol of ['systemone','decision'])test(`local ${protocol} transport does not require hosted Jevman services`,async()=>{
  const saved=globalThis.fetch;const requests=[];
  globalThis.fetch=async(url,opts)=>{
    requests.push({url:String(url),body:JSON.parse(opts.body)});
    const body=requests[0].body;
    return Response.json(protocol==='systemone'?response(body.questions):{results:[{fields:Object.fromEntries(Object.entries(body.schema).map(([k,q])=>[k,{value:q.choices[0],probability:.8}]))}]});
  };
  try{
    const game=new PacmanSession(new Client({...config,protocol},()=>{}));game.start();game.tick(1/60);await flush();
    expect(requests).toHaveLength(1);expect(requests[0].url).toBe(`http://local.test/v1/${protocol}`);
    expect(game.error).toBe('');expect(game.stats.decisions).toBe(1);game.stop();
  }finally{globalThis.fetch=saved;}
});
