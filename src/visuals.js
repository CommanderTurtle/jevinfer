import {funnelPoint,VortexActivity} from './vortex-motion.js';

// Original Canvas renderer: idle choreography is decorative; row cards are real events.
export function tornado(canvas,onFrame=()=>{}) {
  const ctx=canvas.getContext('2d',{alpha:false}),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const activity=new VortexActivity(),tau=Math.PI*2;
  const particles=Array.from({length:10500},(_,i)=>({y:Math.random(),a:i%5===0?Math.random()*tau:i%3*tau/3+(Math.random()+Math.random()-1)*.55,r:.88+Math.random()*.16,s:Math.random()}));
  const dust=Array.from({length:550},()=>({x:Math.random(),y:Math.random(),a:Math.random()*tau,r:Math.random(),s:Math.random()}));
  const inks=Array.from({length:8},(_,i)=>`rgba(255,${98+i*21},${190+i*9},${.23+i*.095})`);
  let visible=false,moving=!reduced.matches,raf=0,last=0,time=0,w=1,h=1,pointer=0,frameCount=0,frameStart=0,disposed=false;
  function canAnimate(){return visible&&moving&&!document.hidden&&!disposed;}
  function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);w=r.width;h=r.height;canvas.width=Math.max(1,Math.floor(w*d));canvas.height=Math.max(1,Math.floor(h*d));ctx.setTransform(d,0,0,d,0,0);if(visible&&!canAnimate())draw(performance.now());}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  canvas.addEventListener('pointermove',e=>{pointer=(e.offsetX/Math.max(1,w)-.5)*.22;if(visible&&!canAnimate())draw(performance.now());});
  canvas.addEventListener('pointerleave',()=>pointer=0);
  function card(item,slot,count,front){
    const level=.19+slot/Math.max(1,count-1)*.56,theta=time*.38+slot*2.399;
    const p=funnelPoint(level,theta,w,h,time,1.05,pointer);
    if((p.depth>.46)!==front)return;
    const scale=.76+p.depth*.25,ambient=item.ambient;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.sin(theta)*.065);ctx.scale(scale,scale);
    ctx.globalAlpha=.48+p.depth*.52;ctx.fillStyle='#0b0713ee';ctx.strokeStyle=item.error?'#ef768aa0':'#c570a870';
    const width=Math.min(182,Math.max(116,w*.17)),left=-width/2;
    ctx.shadowBlur=front?12:0;ctx.shadowColor='#ed68bf44';
    ctx.beginPath();ctx.roundRect(left,-20,width,40,4);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    ctx.font='9px Consolas, monospace';ctx.fillStyle=item.error?'#ff9eb0':'#f8c7eb';
    const headline=ambient?item.label:item.pending?'ROW '+String(item.id+1).padStart(4,'0')+' / IN FLIGHT':item.error?'ROW '+(item.id+1)+' / ERROR':item.choice;
    ctx.fillText(headline.slice(0,26),left+8,-4);
    ctx.font='7px Consolas, monospace';ctx.fillStyle='#b58bac';
    const detail=ambient?'AMBIENT / NO REQUEST':item.pending?item.label:item.error?'DETAILS IN JOURNAL':Math.round(item.ms)+' ms · '+(item.probability*100).toFixed(1)+'%';
    ctx.fillText(detail.slice(0,33),left+8,10);
    if(!ambient&&!item.pending&&!item.error){ctx.fillStyle='#e260af';ctx.fillRect(left+8,15,(width-16)*item.probability,1.5);}
    ctx.restore();
  }
  function draw(now) {
    if(!visible||disposed)return;
    const dt=Math.min(Math.max(0,(now-last)/1000),.04)||0;last=now;if(canAnimate())time+=dt;
    activity.energy=Math.max(0,activity.energy-dt*.3);
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='#05040b';ctx.fillRect(0,0,w,h);
    const cx=w*.5,base=h*.88,wide=Math.min(w*.39,h*.53);
    const haze=ctx.createRadialGradient(cx,h*.49,0,cx,h*.49,wide*1.3);
    haze.addColorStop(0,'#84185430');haze.addColorStop(.5,'#50124320');haze.addColorStop(1,'#05040b00');ctx.fillStyle=haze;ctx.fillRect(0,0,w,h);
    // A distant field and a rotating ground plane frame the narrow emitter.
    ctx.strokeStyle='#76305524';ctx.lineWidth=.6;
    for(let ring=0;ring<7;ring++){ctx.beginPath();ctx.ellipse(cx,base,40+ring*wide*.24,8+ring*9,0,0,tau);ctx.stroke();}
    for(const p of dust){const x=(p.x*w+Math.sin(time*.09+p.a)*30+w)%w,y=(p.y*h-time*(4+p.s*10)+h*8)%h;ctx.fillStyle=p.s>.85?'#e7b8da75':'#a170ac30';ctx.fillRect(x,y,p.s>.85?1.4:.7,p.s>.85?1.4:.7);}
    const actual=activity.cards(),cards=actual.length?actual:[{ambient:true,label:'READ → CLASSIFY'},{ambient:true,label:'FINITE DECISIONS'},{ambient:true,label:'SCORE → JOURNAL'}];
    cards.forEach((c,i)=>card(c,i,cards.length,false));
    ctx.globalCompositeOperation='lighter';
    // Tangential strokes form dense, circling filaments rather than isolated dots.
    const paths=Array.from({length:8},()=>new Path2D());
    for(const p of particles){
      const y=(p.y+time*(.009+p.s*.003))%1,theta=p.a+time*(1.8-y*.65)+y*16;
      const point=funnelPoint(y,theta,w,h,time,p.r,pointer),prev=funnelPoint(y,theta-.035-p.s*.045,w,h,time,p.r,pointer);
      const bucket=Math.min(7,Math.floor(point.depth*5+p.s*2));
      paths[bucket].moveTo(prev.x,prev.y);paths[bucket].lineTo(point.x,point.y);
    }
    for(let i=0;i<paths.length;i++){ctx.strokeStyle=inks[i];ctx.lineWidth=.55+i*.11+activity.energy*.15;ctx.shadowColor='#ff76c9';ctx.shadowBlur=i>5?3:0;ctx.stroke(paths[i]);}ctx.shadowBlur=0;
    // Long ribbons travel up the funnel; their phase is independent of request speed.
    for(let band=0;band<22;band++){
      ctx.beginPath();for(let i=0;i<100;i++){const y=i/99,p=funnelPoint(y,y*38+time*1.45+band*tau/22,w,h,time,.92,pointer);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}
      ctx.strokeStyle=band%3===0?'#ffa3e247':'#fa71c222';ctx.lineWidth=.7;ctx.stroke();
    }
    // Ground spray spirals outward around the emitter.
    const spray=new Path2D();
    for(let i=0;i<240;i++){const p=dust[i],travel=(p.r+time*.075)%1,a=p.a+time*.6,r=12+travel*wide*1.25,x=cx+Math.cos(a)*r,y=base+Math.sin(a)*r*.15-travel*12;spray.moveTo(x,y);spray.lineTo(x+Math.cos(a)*travel*9,y+Math.sin(a)*travel*2);}
    ctx.strokeStyle='#fba0d951';ctx.lineWidth=.7;ctx.stroke(spray);
    const flare=ctx.createRadialGradient(cx,base,1,cx,base,80+activity.energy*22);
    flare.addColorStop(0,'#ffefffd9');flare.addColorStop(.1,'#ffabe7aa');flare.addColorStop(.4,'#e9429d35');flare.addColorStop(1,'#4b143500');
    ctx.fillStyle=flare;ctx.fillRect(cx-105,base-105,210,210);
    ctx.fillStyle='#ffe8f7a0';ctx.beginPath();ctx.ellipse(cx,base,14+activity.energy*7,3,0,0,tau);ctx.fill();
    ctx.strokeStyle='#d2539d50';ctx.beginPath();ctx.moveTo(0,base+12);ctx.lineTo(w,base+12);ctx.stroke();
    ctx.globalCompositeOperation='source-over';
    cards.forEach((c,i)=>card(c,i,cards.length,true));
    frameCount++;if(now-frameStart>700){onFrame(canAnimate()?frameCount*1000/(now-frameStart):0);frameStart=now;frameCount=0;}
    if(canAnimate())raf=requestAnimationFrame(draw);else raf=0;
  }
  function restart(){cancelAnimationFrame(raf);raf=0;if(!canAnimate())onFrame(0);if(visible&&!document.hidden){last=frameStart=performance.now();frameCount=0;raf=requestAnimationFrame(draw);}}
  function visibility(){restart();}
  document.addEventListener('visibilitychange',visibility);
  function motionPreference(){moving=!reduced.matches;restart();}
  reduced.addEventListener('change',motionPreference);
  function refresh(){if(visible&&!canAnimate())draw(performance.now());}
  return {
    setVisible(value){visible=value;if(value)resize();restart();},
    setMotion(value){moving=value;restart();return moving;},
    get moving(){return moving;},
    reset(){activity.reset();refresh();},
    begin(id,label){activity.begin(id,label);refresh();},
    settle(id,result){activity.settle(id,result);refresh();},
    end(mode){activity.end(mode);refresh();},
    destroy(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motionPreference);}
  };
}

export function sparkline(canvas,values){const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);if(!values.length)return;const max=Math.max(...values,1);c.strokeStyle='#f48acb';c.lineWidth=2;c.beginPath();values.forEach((v,i)=>{const x=i/Math.max(1,values.length-1)*w,y=h-5-v/max*(h-10);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();}
