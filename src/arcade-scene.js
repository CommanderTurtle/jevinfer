import {pathPoint,projectPath} from './race-course.js';
import {trackGap} from './arcade-kart.js';

// Painter's-order sprites and road strips, as in the original Canvas2D demo.
// Projection is presentation only: all positions/collisions come from the world.
export function createArcadeScene(canvas,mapCanvas){
 const ctx=canvas.getContext('2d',{alpha:false}),map=mapCanvas.getContext('2d');
 let width=1,height=1,world=null,frame=0;
 function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);width=Math.max(1,r.width);height=Math.max(1,r.height);canvas.width=Math.round(width*d);canvas.height=Math.round(height*d);ctx.setTransform(d,0,0,d,0,0);}
 const observer=new ResizeObserver(resize);observer.observe(canvas);
 const poly=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
 function projection(w,z,offset=0){
  let x=offset,depth=z;
  if(w.arcade){const p=pathPoint(w.path,w.progress+z),dx=p.x+Math.cos(p.heading)*offset-w.x,dz=p.z+Math.sin(p.heading)*offset-w.z;
   x=dx*Math.cos(w.heading)+dz*Math.sin(w.heading);depth=dx*Math.sin(w.heading)-dz*Math.cos(w.heading);
  }else x=offset-(w.x-1)*3.5;
  const denominator=Math.max(-5,depth)+8,scale=Math.min(width*.8,height*1.6)/denominator;
  return {x:width*.5+x*scale,y:height*.36+height*4.16/denominator,scale,depth};
 }
 function sprite(x,y,s,color,kart=false,player=false){
  const w=s*1.7,h=s*(kart?1:1.25);
  ctx.fillStyle='#080b16a0';ctx.beginPath();ctx.ellipse(x,y,w*.7,h*.18,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111424';ctx.fillRect(x-w*.62,y-h*.6,w*.22,h*.58);ctx.fillRect(x+w*.4,y-h*.6,w*.22,h*.58);
  poly([[x-w*.5,y-h*.12],[x+w*.5,y-h*.12],[x+w*.46,y-h*.64],[x-w*.46,y-h*.64]],color);
  if(kart){ctx.fillStyle='#272238';ctx.fillRect(x-w*.22,y-h*.9,w*.44,h*.6);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y-h*.91,w*.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffedc0';ctx.fillRect(x-w*.18,y-h*.85,w*.36,h*.1);ctx.fillStyle=color;ctx.fillRect(x-w*.65,y-h*.25,w*1.3,h*.12);}
  else{poly([[x-w*.34,y-h],[x+w*.34,y-h],[x+w*.46,y-h*.6],[x-w*.46,y-h*.6]],color);poly([[x-w*.29,y-h*.93],[x+w*.29,y-h*.93],[x+w*.36,y-h*.68],[x-w*.36,y-h*.68]],'#1a2640');}
  ctx.fillStyle=player?'#ff5269':'#ffd8a0';for(const side of [-1,1])ctx.fillRect(x+side*w*.3-w*.09,y-h*.34,w*.18,h*.1);
  ctx.fillStyle='#ffffff55';ctx.fillRect(x-w*.42,y-h*.6,w*.84,Math.max(1,s*.04));
 }
 function backdrop(w){
  const sky=ctx.createLinearGradient(0,0,0,height*.48);sky.addColorStop(0,w.arcade?'#19263f':'#100d27');sky.addColorStop(1,w.arcade?'#bb798b':'#bc6389');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
  const sx=width*.68,sy=height*.23,r=height*.1;ctx.fillStyle='#f8b799';ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();
  for(let i=0;i<6;i++){ctx.fillStyle='#9a5484';ctx.fillRect(sx-r,sy+i*r*.16,2*r,2+i);}
  for(let layer=0;layer<2;layer++)for(let i=0;i<25;i++){const x=i*width/24,hh=height*(.025+Math.abs(Math.sin(i*3.7+layer))*.15);ctx.fillStyle=layer?'#17192e':'#453052';ctx.fillRect(x,height*.38-hh,width/23,hh);if(layer){ctx.fillStyle=i%2?'#ad548899':'#4ad2dd88';ctx.fillRect(x+2,height*.38-hh,2,hh);for(let row=6;row<hh;row+=12)ctx.fillRect(x+6,height*.38-hh+row,width/40,2);}}
  ctx.fillStyle=w.arcade?'#294447':'#10172c';ctx.fillRect(0,height*.38,width,height*.62);
 }
 function drawMap(w){
  map.fillStyle='#101525';map.fillRect(0,0,160,160);map.strokeStyle='#7e8caa';map.lineWidth=7;map.beginPath();
  if(w.arcade){w.path.points.forEach((p,i)=>i?map.lineTo(80+p.x*.7,80+p.z*.7):map.moveTo(80+p.x*.7,80+p.z*.7));}
  else{map.moveTo(80,160);map.lineTo(80,0);}map.stroke();
  map.fillStyle='#eea65e';for(const o of w.arcade?w.objects:w.cars){const x=w.arcade?80+o.x*.7:80+(o.lane-1)*12,y=w.arcade?80+o.z*.7:135-o.z*.6;map.fillRect(x-2,y-2,4,4);}
  map.fillStyle='#91f5eb';const x=w.arcade?80+w.x*.7:80+(w.x-1)*12,y=w.arcade?80+w.z*.7:135;map.beginPath();map.arc(x,y,3,0,7);map.fill();
 }
 function render(w,{view='chase'}={}){
  world=w;backdrop(w);
  const half=w.arcade?5.3:5.25;
  for(let z=180;z>=0;z-=3){
   const al=projection(w,z,-half),ar=projection(w,z,half),bl=projection(w,z-3,-half),br=projection(w,z-3,half);
   if(al.depth< -3.01||bl.depth< -3.01||bl.y<al.y)continue;
   const stripe=Math.floor((z+(w.arcade?w.progress:w.distance))/9)%2;
   poly([[al.x,al.y],[ar.x,ar.y],[br.x,br.y],[bl.x,bl.y]],stripe?'#333047':'#2e2c42');
   for(const side of [-1,1]){const a=projection(w,z,side*half),b=projection(w,z-3,side*half);poly([[a.x,a.y],[a.x+side*a.scale*.25,a.y],[b.x+side*b.scale*.25,b.y],[b.x,b.y]],stripe?(w.arcade?'#ffd1b6':'#ef6acb'):'#53678a');}
   if(stripe)for(const offset of [-1.75,1.75]){const a=projection(w,z,offset),b=projection(w,z-3,offset);poly([[a.x-a.scale*.025,a.y],[a.x+a.scale*.025,a.y],[b.x+b.scale*.025,b.y],[b.x-b.scale*.025,b.y]],'#ccd4e077');}
  }
  for(let i=18;i>=0;i--){const z=i*10+10-(w.distance%10),p=projection(w,z);if(p.depth<0)continue;for(const side of [-1,1]){const a=projection(w,z,side*7.3);ctx.fillStyle='#585174';ctx.fillRect(a.x,a.y-a.scale*5,Math.max(1,a.scale*.1),a.scale*5);ctx.fillStyle=side<0?'#fd74cf':'#69e9ed';ctx.fillRect(a.x,a.y-a.scale*5,-side*a.scale*1.1,Math.max(1,a.scale*.1));}}
  const actors=w.arcade?w.objects.map(o=>({gap:trackGap(w,o.s),offset:o.offset,color:o.color,kind:'car'})):w.cars.map(o=>({gap:o.z,offset:(o.lane-1)*3.5,color:o.color,kind:o.kind}));
  if(w.arcade)for(const p of [...w.pickups.filter(p=>p.readyAt<=w.time).map(p=>({...p,kind:'BOX'})),...w.projectiles,...w.effects.map(p=>({...p,kind:'FX'}))]){const t=projectPath(w.path,p),offset=(p.x-t.x)*Math.cos(t.heading)+(p.z-t.z)*Math.sin(t.heading);actors.push({...p,gap:trackGap(w,t.s),offset});}
  if(view!=='hood')actors.push({gap:0,offset:w.arcade?w.laneOffset:(w.x-1)*3.5,kind:'car',color:'#f780b8',player:true});
  for(const o of actors.sort((a,b)=>b.gap-a.gap)){
   if(o.gap< -4||o.gap>180)continue;const p=projection(w,o.gap,o.offset);if(p.depth< -4)continue;
   if(o.kind==='car')sprite(p.x,p.y,p.scale,o.color,w.arcade,o.player);
   else if(o.kind==='BOX'){const s=p.scale*.7;ctx.save();ctx.translate(p.x,p.y-s);ctx.rotate(w.time*1.7);ctx.fillStyle='#ffcc62';ctx.fillRect(-s,-s,s*2,s*2);ctx.restore();ctx.fillStyle='#282343';ctx.font=`bold ${Math.max(8,p.scale)}px sans-serif`;ctx.textAlign='center';ctx.fillText('?',p.x,p.y-s*.5);}
   else{ctx.fillStyle=o.color||({RED_SHELL:'#ff5269',SHELL:'#5ceb9d',OIL:'#b981db',cone:'#ffb258'}[o.kind]||'#ffc0eb');ctx.beginPath();ctx.ellipse(p.x,p.y-p.scale*.2,p.scale*(o.kind==='FX'?1.5:.6),p.scale*(o.kind==='OIL'?.12:.35),0,0,Math.PI*2);ctx.fill();}
  }
  if(w.arcade&&w.time<(w.shieldUntil||0)){const p=projection(w,0,w.laneOffset);ctx.strokeStyle='#c3acff';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(p.x,p.y-p.scale*.8,p.scale*1.3,p.scale*1.4,0,0,7);ctx.stroke();}
  if(w.arcade&&w.time<(w.boostUntil||0)){ctx.strokeStyle='#63e9ed77';ctx.lineWidth=2;for(let i=0;i<12;i++){const x=(i/11)*width;ctx.beginPath();ctx.moveTo(width*.5+(x-width*.5)*.7,height*.68);ctx.lineTo(x,height);ctx.stroke();}}
  if(frame++%4===0)drawMap(w);canvas.dataset.renderer='canvas2d';canvas.dataset.drawCalls='0';canvas.dataset.triangles='0';
 }
 return {render,resize,setWorld(w){world=w;resize();},dispose(){observer.disconnect();world=null;}};
}
