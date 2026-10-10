import {$,el,Run,delay,choice,clamp} from './core.js';

export const drivingQuestions={
  lane:choice('Choose the safest absolute target lane. Avoid obstacles with low time_to_contact. Prefer the current lane when safe; do not weave without reason.',['LEFT','CENTER','RIGHT']),
  throttle:choice('Choose acceleration when the selected lane is clear. Brake if an obstacle is close and a safe lane change is not possible.',['ACCELERATE','COAST','BRAKE'])
};
export function drivingState(world){return {
  task:'Drive a simulated three-lane road without collisions. These are world sensors, not a screenshot.',
  current_lane:['LEFT','CENTER','RIGHT'][Math.round(world.x)],speed_kmh:Math.round(world.speed*3.6),
  lane_change_seconds:.45,
  lanes:['LEFT','CENTER','RIGHT'].map((name,lane)=>{const next=world.cars.filter(c=>c.lane===lane&&c.z>-5).sort((a,b)=>a.z-b.z)[0];return {lane:name,clearance_m:next?Math.round(next.z):300,time_to_contact_seconds:next?Number((next.z/Math.max(1,world.speed-next.speed)).toFixed(2)):null};})
};}
export function initRace(client,toast){
  const canvas=$('#race-canvas'),ctx=canvas.getContext('2d',{alpha:false}),keys=new Set();
  let world,visible=false,raf=0,last=0,mode='parked',run=null,lastDecision=0,target=1,throttle='COAST',decisions=0,spawn=0;
  let w=900,h=600;
  function reset(){world={x:1,speed:0,distance:0,hits:0,cars:[{lane:1,z:150,speed:13,color:'#44dcc5'},{lane:0,z:240,speed:15,color:'#e9b93b'}]};target=1;decisions=0;spawn=0;$('#race-log').replaceChildren();$('#race-command').textContent='Waiting at the starting line';$('#race-latency').textContent='—';updateHUD();draw();}
  function resize(){const r=canvas.getBoundingClientRect();w=Math.max(1,r.width);h=Math.max(1,r.height);const d=Math.min(devicePixelRatio||1,1.5);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);draw();}
  new ResizeObserver(resize).observe(canvas);
  function updateHUD(){$('#race-mode').textContent=mode==='jev'?'JEV DRIVING':mode==='manual'?'MANUAL / NO INFERENCE':'PARKED';$('#race-speed').textContent=Math.round(world.speed*3.6);$('#race-distance').textContent=Math.round(world.distance);$('#race-hits').textContent=world.hits;$('#race-decisions').textContent=decisions;}
  function stop(){run?.stop();run=null;mode='parked';world.speed=0;keys.clear();$('#race-stop').disabled=true;$('#race-start').disabled=false;$('#race-demo').disabled=false;updateHUD();}
  function log(text){const n=el('div',{},text);$('#race-log').prepend(n);while($('#race-log').children.length>5)$('#race-log').lastChild.remove();}
  async function start(){stop();const current=new Run();run=current;mode='jev';lastDecision=performance.now();throttle='COAST';$('#race-start').disabled=true;$('#race-demo').disabled=true;$('#race-stop').disabled=false;updateHUD();
    try{while(!current.signal.aborted){const started=performance.now(),state=drivingState(world);const result=await client.infer(state,drivingQuestions,current.signal);if(current.signal.aborted)break;
      decisions++;const age=performance.now()-started;
      if(age>1500){throttle='BRAKE';$('#race-command').textContent='Stale response · braking';log(`${Math.round(age)} ms · stale command ignored`);}
      else{target=['LEFT','CENTER','RIGHT'].indexOf(result.answers.lane.choice);throttle=result.answers.throttle.choice;lastDecision=performance.now();$('#race-command').textContent=`${result.answers.lane.choice} / ${throttle}`;log(`${decisions.toString().padStart(3,'0')} · ${result.answers.lane.choice} · ${throttle}`);}
      $('#race-latency').textContent=`${Math.round(result.ms)} ms round trip`;updateHUD();await delay(Math.max(0,Number($('#race-interval').value)-age),current.signal);
    }}catch(e){if(!current.signal.aborted)toast(e.message);}finally{if(run===current)stop();}
  }
  function tick(now){if(!visible)return;const dt=Math.min((now-last)/1000,.04)||0;last=now;
    if(mode!=='parked'){
      const stale=mode==='jev'&&now-lastDecision>1500;
      let force=stale||throttle==='BRAKE'?-18:throttle==='ACCELERATE'?8:-1.5;
      if(mode==='manual'){force=keys.has('ArrowDown')?-18:keys.has('ArrowUp')?8:1;world.x=clamp(world.x+((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*2.7,0,2);}
      else world.x+=clamp(target-world.x,-dt*2.5,dt*2.5);
      world.speed=clamp(world.speed+force*dt,0,45);world.distance+=world.speed*dt;
      for(const car of world.cars){car.z+=(car.speed-world.speed)*dt;if(car.z<5&&car.z>-6&&!car.hit&&Math.abs(world.x-car.lane)<.43){car.hit=true;world.hits++;world.speed*=.38;log('Collision · speed reduced');}}
      world.cars=world.cars.filter(c=>c.z>-25&&c.z<400);
      spawn+=dt;if(spawn>({light:5,normal:3,heavy:1.8}[$('#race-traffic').value])){spawn=0;world.cars.push({lane:Math.floor(Math.random()*3),z:280,speed:10+Math.random()*10,color:['#4ec6cb','#bd73f3','#efb750'][Math.floor(Math.random()*3)]});}
      if(stale)$('#race-command').textContent='Waiting for fresh control · braking';updateHUD();
    }
    draw();raf=requestAnimationFrame(tick);
  }
  function roadAt(z){const p=1/(1+Math.max(0,z)*.033),y=h*.43+p*h*.52,width=w*(.024+p*.77),bend=Math.sin(world.distance*.0015+z*.006)*w*.075*(1-p);return {p,y,width,cx:w*.5+bend};}
  function quad(a,b,c,d,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineTo(...c);ctx.lineTo(...d);ctx.closePath();ctx.fill();}
  function car(x,y,scale,color,player=false){const cw=scale*65,ch=cw*.55;ctx.fillStyle='#08081599';ctx.fillRect(x-cw*.58,y+ch*.8,cw*1.16,ch*.27);ctx.fillStyle='#100e20';ctx.fillRect(x-cw*.56,y+ch*.4,cw*.18,ch*.7);ctx.fillRect(x+cw*.38,y+ch*.4,cw*.18,ch*.7);ctx.fillStyle=color;ctx.fillRect(x-cw*.5,y+ch*.25,cw,ch*.68);quad([x-cw*.34,y-ch*.2],[x+cw*.34,y-ch*.2],[x+cw*.47,y+ch*.4],[x-cw*.47,y+ch*.4],color);quad([x-cw*.29,y-ch*.1],[x+cw*.29,y-ch*.1],[x+cw*.36,y+ch*.3],[x-cw*.36,y+ch*.3],'#231a41');ctx.fillStyle=player?'#ff457c':'#f7e8b8';ctx.fillRect(x-cw*.42,y+ch*.6,cw*.2,ch*.12);ctx.fillRect(x+cw*.22,y+ch*.6,cw*.2,ch*.12);ctx.fillStyle='#ffffff66';ctx.fillRect(x-cw*.44,y+ch*.33,cw*.88,2);}
  function draw(){if(!world||w<2)return;const sky=ctx.createLinearGradient(0,0,0,h*.48);sky.addColorStop(0,'#100d27');sky.addColorStop(.7,'#38234b');sky.addColorStop(1,'#e27880');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    const sunY=h*.3,sunR=h*.105;ctx.fillStyle='#f5a593';ctx.beginPath();ctx.arc(w*.54,sunY,sunR,0,Math.PI*2);ctx.fill();for(let i=0;i<6;i++){ctx.fillStyle='#6c3d65';ctx.fillRect(w*.54-sunR,sunY+i*sunR*.14,sunR*2,2+i);}
    for(let layer=0;layer<2;layer++){ctx.fillStyle=layer?'#231938':'#4b2c50';ctx.beginPath();ctx.moveTo(0,h*.48);for(let i=0;i<=18;i++)ctx.lineTo(w*i/18,h*(.38-Math.abs(Math.sin(i*4.63+layer*2))*.10)+layer*18);ctx.lineTo(w,h*.5);ctx.closePath();ctx.fill();}
    ctx.fillStyle='#172335';ctx.fillRect(0,h*.44,w,h*.56);
    for(let z=300;z>0;z-=5){const a=roadAt(z),b=roadAt(z-5),stripe=Math.floor((z+world.distance)/12)%2;quad([a.cx-a.width/2,a.y],[a.cx+a.width/2,a.y],[b.cx+b.width/2,b.y],[b.cx-b.width/2,b.y],stripe?'#2e2740':'#292437');
      for(const side of [-1,1]){const ax=a.cx+side*a.width/2,bx=b.cx+side*b.width/2;quad([ax,a.y],[ax+side*a.width*.035,a.y],[bx+side*b.width*.035,b.y],[bx,b.y],stripe?'#ed85b0':'#593052');}
      if(stripe)for(const lane of [1,2]){const ax=a.cx-a.width/2+a.width*lane/3,bx=b.cx-b.width/2+b.width*lane/3;quad([ax-1,a.y],[ax+1,a.y],[bx+b.width*.003,b.y],[bx-b.width*.003,b.y],'#eac5c58a');}
    }
    for(let z=250;z>0;z-=25){const a=roadAt((z+300-world.distance%25)%300);for(const side of [-1,1]){const x=a.cx+side*a.width*.68;ctx.fillStyle='#da64b8';ctx.fillRect(x,a.y-a.p*65,Math.max(1,a.p*3),a.p*65);ctx.fillStyle='#6de8ed';ctx.fillRect(x-side*a.p*12,a.y-a.p*65,a.p*15,2);}}
    for(const c of [...world.cars].sort((a,b)=>b.z-a.z)){if(c.z<0)continue;const a=roadAt(c.z);car(a.cx+(c.lane-1)*a.width/3,a.y-a.p*25,a.p*w/550,c.color);}
    car(w*.5+(world.x-1)*w*.26,h*.80,w/580,'#f779b0',true);
    ctx.fillStyle='#10082312';for(let y=0;y<h;y+=4)ctx.fillRect(0,y,w,1);
  }
  $('#race-start').onclick=start;$('#race-stop').onclick=stop;$('#race-reset').onclick=()=>{stop();reset();};$('#race-demo').onclick=()=>{stop();mode='manual';$('#race-stop').disabled=false;$('#race-command').textContent='Manual control · arrow keys';updateHUD();canvas.focus();};
  canvas.tabIndex=0;window.addEventListener('keydown',e=>{if(visible&&mode==='manual'&&e.key.startsWith('Arrow')&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();keys.add(e.key);}});window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>keys.clear());
  reset();return {stop,setVisible(value){visible=value;cancelAnimationFrame(raf);if(!value)stop();else{resize();last=performance.now();raf=requestAnimationFrame(tick);}}};
}
