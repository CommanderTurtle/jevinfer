import {clamp} from './core.js';

// Original particle renderer. Animation is decorative; activity is fed only by completions.
export function tornado(canvas) {
  const ctx=canvas.getContext('2d',{alpha:false}), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const particles=Array.from({length:7800},(_,i)=>({h:Math.random(),angle:i%5===0?Math.random()*Math.PI*2:(i%3)*Math.PI*2/3+(Math.random()+Math.random()-1)*.54,band:i%5,r:Math.random(),shine:Math.random()}));
  let visible=false,raf=0,last=0,time=0,activity=0,w=1,h=1,pointer=0;
  function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);w=r.width;h=r.height;canvas.width=Math.max(1,Math.floor(w*d));canvas.height=Math.max(1,Math.floor(h*d));ctx.setTransform(d,0,0,d,0,0);}
  new ResizeObserver(resize).observe(canvas);
  canvas.addEventListener('pointermove',e=>pointer=(e.offsetX/w-.5)*.25);
  function draw(now){if(!visible)return;const dt=Math.min((now-last)/1000,.04)||0;last=now;time+=reduced.matches?0:dt;activity=Math.max(0,activity-dt*.3);
    ctx.fillStyle='#05040b';ctx.fillRect(0,0,w,h);const cx=w*.5,by=h*.88,top=h*.11,span=by-top,wide=Math.min(w*.29,h*.5);
    const haze=ctx.createRadialGradient(cx,by-span*.4,0,cx,by-span*.4,wide*1.2);haze.addColorStop(0,'#8e1f6323');haze.addColorStop(.5,'#5e14531b');haze.addColorStop(1,'#05040b00');ctx.fillStyle=haze;ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation='lighter';
    for(const p of particles){const y=(p.h+time*(.016+p.band*.001))%1,theta=p.angle+time*(1.35-y*.5)+y*14+pointer;
      const radius=(9+Math.pow(y,1.7)*wide)*(p.band===0?p.r*.92:.88+p.r*.2);
      const bend=Math.sin(y*5+time*.38)*wide*.12*y;
      const x=cx+bend+Math.cos(theta)*radius,sy=by-y*span+Math.sin(theta)*radius*.24;
      const front=(Math.sin(theta)+1)/2,alpha=(.28+front*.68)*(p.band===0?.5:1),size=.6+front*.9+(p.shine>.98?1.4:0);
      ctx.fillStyle=`rgba(255,${Math.round(78+front*108+activity*26)},${Math.round(169+front*72)},${alpha})`;
      ctx.fillRect(x,sy,size,size);if(front>.7&&p.shine>.91){ctx.strokeStyle=`rgba(255,134,215,${alpha*.45})`;ctx.beginPath();ctx.moveTo(x,sy);ctx.lineTo(x-Math.sin(theta)*4,sy+2);ctx.stroke();}
    }
    for(let band=0;band<3;band++){ctx.beginPath();for(let i=0;i<180;i++){const y=i/179,rad=9+y**1.7*wide,theta=y*14+time*1.3+band*Math.PI*2/3;const x=cx+Math.sin(y*5+time*.38)*wide*.12*y+Math.cos(theta)*rad,sy=by-y*span+Math.sin(theta)*rad*.24;i?ctx.lineTo(x,sy):ctx.moveTo(x,sy);}ctx.strokeStyle='#ed71c32b';ctx.lineWidth=1;ctx.shadowColor='#ff68c3';ctx.shadowBlur=9;ctx.stroke();ctx.shadowBlur=0;}
    const floor=ctx.createRadialGradient(cx,by,1,cx,by,80+activity*20);floor.addColorStop(0,'#ffe6fcaa');floor.addColorStop(.1,'#ff65c488');floor.addColorStop(.5,'#a6397822');floor.addColorStop(1,'#4b143500');ctx.fillStyle=floor;ctx.fillRect(cx-110,by-110,220,220);
    ctx.strokeStyle='#d2539d44';ctx.beginPath();ctx.moveTo(0,by+12);ctx.lineTo(w,by+12);ctx.stroke();ctx.globalCompositeOperation='source-over';
    if(!reduced.matches)raf=requestAnimationFrame(draw);
  }
  return {setVisible(value){visible=value;cancelAnimationFrame(raf);if(value){resize();last=performance.now();raf=requestAnimationFrame(draw);}},pulse(){activity=clamp(activity+.22,0,1);if(visible&&reduced.matches)draw(performance.now());}};
}

export function sparkline(canvas,values){const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);if(!values.length)return;const max=Math.max(...values,1);c.strokeStyle='#f48acb';c.lineWidth=2;c.beginPath();values.forEach((v,i)=>{const x=i/Math.max(1,values.length-1)*w,y=h-5-v/max*(h-10);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();}
