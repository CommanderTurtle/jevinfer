import {clamp} from './core.js';

export function funnelPoint(y,angle,width,height,time=0,spread=1,pointer=0) {
  const wide=Math.min(width*.39,height*.53),radius=(6+y**1.45*wide)*spread;
  const bend=Math.sin(y*4.8-time*.3)*wide*.10*y;
  return {x:width*.5+bend+Math.cos(angle+pointer)*radius,y:height*.88-y*height*.83+Math.sin(angle+pointer)*radius*.22,depth:(Math.sin(angle+pointer)+1)/2,radius};
}

// Visual state only: no requests, fabricated results, or changes to the job queue.
export class VortexActivity {
  constructor(now=()=>performance.now()){this.now=now;this.mode='idle';this.pending=new Map();this.recent=[];this.energy=0;}
  reset(){this.pending.clear();this.recent=[];this.energy=0;this.mode='running';}
  begin(id,label){this.pending.set(id,{id,label:String(label).slice(0,26),at:this.now(),pending:true});}
  settle(id,{choice='',probability=0,ms=0,error=false}={}) {
    const request=this.pending.get(id);this.pending.delete(id);
    this.recent.unshift({id,label:request?.label||'row '+(id+1),choice:String(choice).slice(0,28),probability:clamp(probability,0,1),ms,at:this.now(),error,pending:false});
    this.recent.length=Math.min(this.recent.length,8);this.energy=clamp(this.energy+.3,0,1);
  }
  end(mode='complete'){this.mode=mode;this.pending.clear();}
  cards(){return [...this.pending.values()].slice(0,3).concat(this.recent).slice(0,7);}
}
