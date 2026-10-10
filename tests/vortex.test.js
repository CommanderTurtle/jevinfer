import {test,expect} from 'bun:test';
import {funnelPoint,VortexActivity} from '../src/vortex-motion.js';

test('Funnel projection stays finite and expands from a narrow ground emitter',()=>{
  for(const [w,h] of [[1280,680],[640,800],[360,620]])for(const y of [0,.3,.7,1])for(const angle of [0,1,3,6]){
    const p=funnelPoint(y,angle,w,h,123,.9,.1);expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);expect(p.depth>=0&&p.depth<=1).toBe(true);
  }
  expect(funnelPoint(0,0,1280,680).radius).toBe(6);expect(funnelPoint(1,0,1280,680).radius).toBeGreaterThan(300);
});
test('Vortex cards are created by real dispatch and completion events only',()=>{
  let clock=10;const visual=new VortexActivity(()=>clock);expect(visual.cards()).toEqual([]);
  visual.reset();visual.begin(0,'synthetic-market');expect(visual.cards()[0].pending).toBe(true);
  clock=80;visual.settle(0,{choice:'RISING',probability:.8,ms:70});
  expect(visual.pending.size).toBe(0);expect(visual.cards()[0]).toMatchObject({id:0,label:'synthetic-market',choice:'RISING',probability:.8,ms:70,at:80,pending:false});
  visual.begin(1,'next');visual.end('stopped');expect(visual.pending.size).toBe(0);expect(visual.recent.length).toBe(1);expect(visual.mode).toBe('stopped');
});
test('Visual history is bounded without dropping or mutating inference data',()=>{
  const visual=new VortexActivity(()=>0);for(let i=0;i<500;i++){visual.begin(i,'row '+i);visual.settle(i,{choice:'HOLD',probability:.6,ms:20});}
  expect(visual.recent.length).toBe(8);expect(visual.cards().length).toBe(7);expect(visual.cards()[0].id).toBe(499);expect(visual.energy).toBe(1);
  visual.begin(501,'bad');visual.settle(501,{error:true});expect(visual.cards()[0].error).toBe(true);
  visual.reset();expect(visual.cards()).toEqual([]);expect(visual.energy).toBe(0);
});
