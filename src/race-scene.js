import * as THREE from '../vendor/three.js';
import {freeCourses,pathPoint,courseTarget,signalAt} from './race-course.js';

export function createRaceScene(canvas,mapCanvas){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.type=THREE.PCFShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 const camera=new THREE.PerspectiveCamera(62,1,.1,1000),look=new THREE.Vector3(),map=mapCanvas.getContext('2d');
 let scene,player,sun,targetRing,finishGate,objects=new Map(),marks=[],roadScenery=[],signals=[],free=false,worldRef,frame=0,realism=false,cameraReady=false,materials=new Map();
 const mat=(color,emissive=0)=>{const key=color+'/'+emissive;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,emissive,roughness:.78,metalness:.12}));return materials.get(key);};
 function box(parent,x,y,z,w,h,d,color,emit=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color,emit));mesh.position.set(x,y,z);mesh.castShadow=h>.2;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 function label(parent,text,x,y,z,width=5){const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#163735';ctx.fillRect(0,0,256,64);ctx.strokeStyle='#cadccd';ctx.strokeRect(3,3,250,58);ctx.fillStyle='#f3f6ee';ctx.font='500 24px sans-serif';ctx.textAlign='center';ctx.fillText(text,128,41);const tex=new THREE.CanvasTexture(c),m=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));m.position.set(x,y,z);parent.add(m);return m;}
 function car(color,kart=false){
  const g=new THREE.Group(),body=box(g,0,.55,0,1.7,kart?.3:.6,kart?2.4:4.1,color);
  if(kart){box(g,0,.86,.1,.8,.5,.8,'#252e40');box(g,0,1.28,.1,.5,.45,.5,'#f2dbb9');box(g,0,1.53,.1,.6,.25,.6,color);box(g,0,.7,1.1,1.9,.12,.4,color);}
  else{box(g,0,1.02,-.05,1.42,.64,1.85,'#172631');box(g,0,1.36,-.05,1.47,.11,1.85,color);}
  for(const x of [-.85,.85])for(const z of kart?[-.75,.8]:[-1.3,1.3]){const m=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.26,12),mat('#141820'));m.rotation.z=Math.PI/2;m.position.set(x,.35,z);m.castShadow=true;g.add(m);}
  for(const x of [-.55,.55]){box(g,x,.67,kart?1.22:2.07,.4,.13,.04,'#ec5564','#8b1723');box(g,x,.67,kart?-1.22:-2.07,.4,.13,.04,'#e0f1ff','#879dbc');}
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.3,kart?3:4.9),new THREE.MeshBasicMaterial({color:'#070b15',transparent:true,opacity:.25,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;g.add(shadow);g.userData.body=body;return g;
 }
 function cone(){const g=new THREE.Group();box(g,0,.045,0,.65,.09,.65,'#24292e');const c=new THREE.Mesh(new THREE.ConeGeometry(.27,.85,12),mat('#ff9b42'));c.position.y=.5;c.castShadow=true;g.add(c);const band=new THREE.Mesh(new THREE.CylinderGeometry(.115,.16,.15,12),mat('#f8e9d4'));band.position.y=.5;g.add(band);return g;}
 function pedestrian(index){const g=new THREE.Group();box(g,0,1.0,0,.42,.65,.28,['#d6ab67','#6ea49b','#ba7091'][index%3]);const head=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),mat('#d6b090'));head.position.y=1.53;g.add(head);for(const x of [-.12,.12])box(g,x,.39,0,.13,.7,.18,'#293c4c');return g;}
 function segment(a,b,width,color,y=.006){const d=Math.hypot(a.x-b.x,a.z-b.z),m=box(scene,(a.x+b.x)/2,y,(a.z+b.z)/2,width,.015,d+.12,color);m.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);return m;}
 function ring(x,z,radius=1.5,color='#68d9c1'){const m=new THREE.Mesh(new THREE.RingGeometry(radius,radius+.18,32),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(x,.035,z);scene.add(m);return m;}
 function clear(){if(!scene)return;sun.shadow.dispose();const geometries=new Set(),mats=new Set(materials.values());scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);});for(const g of geometries)g.dispose();for(const m of mats){m.map?.dispose();m.dispose();}materials.clear();objects.clear();marks=[];roadScenery=[];signals=[];finishGate=null;}
 function building(x,z,w,d,h,color,windows){
  box(scene,x,h/2,z,w,h,d,color);box(scene,x,h+.2,z,w+.4,.4,d+.4,'#424751');box(scene,x,h+1,z,w*.35,1.5,d*.3,'#555762');
  for(let y=3;y<h-1;y+=3.8)for(let a=-w/2+1.3;a<w/2-1;a+=2.8)for(const side of [-1,1])windows.push({x:x+a,y,z:z+side*(d/2+.015),h:side>0?0:Math.PI});
  for(let y=3;y<h-1;y+=3.8)for(let a=-d/2+1.3;a<d/2-1;a+=2.8)for(const side of [-1,1])windows.push({x:x+side*(w/2+.015),y,z:z+a,h:side*Math.PI/2});
 }
 function city(w){
  box(scene,0,-.35,0,340,.3,340,'#777b78');
  for(const k of [-80,0,80]){box(scene,k,-.035,0,17,.06,330,'#353b43');box(scene,0,-.036,k,330,.06,17,'#353b43');
   for(let t=-150;t<=150;t+=9)if([-80,0,80].every(n=>Math.abs(t-n)>12)){box(scene,k,.01,t,.12,.01,4,'#d5b45e');box(scene,t,.01,k,4,.01,.12,'#d5b45e');}}
  const windows=[];let index=0;
  for(const x of [-120,-40,40,120])for(const z of [-120,-40,40,120]){
   box(scene,x,.05,z,61,.18,61,'#a3a69e');
   for(const dx of [-15,15])for(const dz of [-15,15]){const h=12+(index*13%52);building(x+dx,z+dz,22,23,h,['#666374','#8a776c','#616f78','#837e71'][index++%4],windows);}
  }
  const win=new THREE.InstancedMesh(new THREE.PlaneGeometry(.95,1.6),mat('#b7c5ce','#28241f'),windows.length),dummy=new THREE.Object3D();
  windows.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.h;dummy.updateMatrix();win.setMatrixAt(i,dummy.matrix);win.setColorAt(i,new THREE.Color(i%5===0?'#eddba5':'#405365'));});scene.add(win);
  for(const [i,c]of w.crossings.entries()){
   for(let j=-7;j<=7;j+=2){const m=box(scene,c.x+(c.axis==='x'?j:0),.025,c.z+(c.axis==='z'?j:0),c.axis==='x'?1.1:3,.025,c.axis==='x'?3:1.1,'#dfdfcf');}
   const g=new THREE.Group();g.position.set(c.x+(c.axis==='x'?9:3),0,c.z+(c.axis==='z'?9:3));scene.add(g);box(g,0,2.5,0,.15,5,.15,'#58665e');box(g,0,4.8,0,.55,1.35,.4,'#1e2528');const lamps=[];
   for(let j=0;j<3;j++){const m=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),new THREE.MeshBasicMaterial({color:'#293c35'}));m.position.set(0,5.23-j*.42,.24);g.add(m);lamps.push(m);}signals.push(lamps);
   label(g,['Canal St','Broadway','Mercer St','Spring St'][i],1.7,3.6,0,3.5);
  }
  for(let i=0;i<32;i++){const p=pathPoint(w.path,i*w.path.length/32),x=p.x+Math.cos(p.heading)*11,z=p.z+Math.sin(p.heading)*11;box(scene,x,3.5,z,.12,7,.12,'#59646a');box(scene,x,7,z,1,.14,.4,'#dfc394','#695530');}
 }
 function setWorld(w){
  clear();worldRef=w;free=freeCourses.has(w.course);cameraReady=false;scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#bbd5f3','#383442',2.3));
  sun=new THREE.DirectionalLight('#ffebd2',3.3);sun.position.set(-45,85,35);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:220});sun.shadow.bias=-.0005;scene.add(sun,sun.target);
  if(!free){
   box(scene,0,-.18,-260,10.7,.3,640,'#303744');box(scene,0,-.42,-260,700,.2,650,'#1b3030');
   for(const x of [-5.6,5.6])box(scene,x,.35,-260,.18,.65,620,'#a5b2c4');
   for(let i=0;i<70;i++){const g=new THREE.Group();for(const x of [-1.75,1.75])box(g,x,.01,0,.12,.02,4,'#d8d6c6');scene.add(g);marks.push(g);}
   for(let i=0;i<44;i++){const g=new THREE.Group();const side=i%2?-1:1,h=8+i*17%35;box(g,side*(18+i%4*7),h/2,0,7,h,9,i%2?'#414959':'#4c4959');box(g,side*6.8,3.5,0,.12,7,.12,'#8695a7');box(g,side*6.8,7,0,1,.1,.5,'#c6dfec','#556772');scene.add(g);roadScenery.push(g);}
   if(w.course==='race'){finishGate=new THREE.Group();for(const x of [-5.1,5.1])box(finishGate,x,3,0,.25,6,.3,'#91aaca');for(let x=-5;x<5;x++)for(let y=0;y<2;y++)box(finishGate,x+.5,5.5+y*.5,0,1,.5,.15,(x+y)%2?'#e8ebdf':'#283443');scene.add(finishGate);}
  }else if(w.course==='city')city(w);
  else{
   box(scene,0,-.35,-80,650,.3,850,w.course==='kart'?'#314d47':'#273841');
   if(w.course==='kart'){
    for(const s of w.path.segments)segment(s.a,s.b,14,'#39424a');
    for(let s=0;s<w.path.length;s+=3){const p=pathPoint(w.path,s);for(const side of [-1,1]){const m=box(scene,p.x+Math.cos(p.heading)*7.3*side,.12,p.z+Math.sin(p.heading)*7.3*side,.8,.25,3.1,Math.floor(s/3)%2?'#e7e7d4':'#c96369');m.rotation.y=-p.heading;}}
    for(let i=0;i<9;i++){const p=pathPoint(w.path,60+i*w.path.length/9);ring(p.x,p.z,1,'#e8c568');}
    const start=pathPoint(w.path,w.startS);for(let i=-6;i<7;i++)for(let j=0;j<2;j++){const m=box(scene,start.x+Math.cos(start.heading)*i,.03,start.z+Math.sin(start.heading)*i,1,.02,1,(i+j)%2?'#eceada':'#1c2630');m.position.x+=Math.sin(start.heading)*j;m.position.z-=Math.cos(start.heading)*j;m.rotation.y=-start.heading;}
    for(let i=0;i<12;i++){const p=pathPoint(w.path,i*w.path.length/12);box(scene,p.x+Math.cos(p.heading)*20,2,p.z+Math.sin(p.heading)*20,10,4,5,'#546771');}
   }else if(w.course==='parking'){
    box(scene,0,-.04,0,38,.05,46,'#424a51');for(let x=-13;x<14;x+=3.5){box(scene,x,.015,-8,.09,.02,7,'#cbd0c8');box(scene,x+1.75,.015,-11.5,3.5,.02,.09,'#cbd0c8');}
    const b=w.bay;box(scene,b.x,.019,b.z,b.width,.02,b.length,'#305d58');for(const x of [-1,1])box(scene,b.x+x*b.width/2,.03,b.z,.12,.02,b.length,'#79e7c2');for(const z of [-1,1])box(scene,b.x,.03,b.z+z*b.length/2,b.width,.02,.12,'#79e7c2');label(scene,'P',b.x,2.8,-12,1.6);
    box(scene,0,.2,-22,38,.4,.3,'#99a3a8');box(scene,-18,.2,0,.3,.4,44,'#99a3a8');box(scene,18,.2,0,.3,.4,44,'#99a3a8');
   }else{
    box(scene,0,-.04,-130,34,.05,340,'#424a51');for(const [i,g]of w.gates.entries()){segment({x:g.x-g.width/2,z:g.z},{x:g.x+g.width/2,z:g.z},.1,'#769b98');label(scene,String(i+1),g.x+5,1.2,g.z,1.2);}
    for(let z=20;z>-290;z-=8)for(const x of [-16,16]){const c=cone();c.position.set(x,0,z);scene.add(c);}
   }
   for(const s of w.path.segments){const line=segment(s.a,s.b,.08,'#77b4b5');line.material=new THREE.MeshBasicMaterial({color:'#6ca5a3',transparent:true,opacity:.3});}
  }
  player=car('#86a5ff',w.course==='kart');scene.add(player);targetRing=ring(0,0,1.4);targetRing.visible=free;resize();
 }
 function resize(){const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);camera.updateProjectionMatrix();}
 const observer=new ResizeObserver(resize);observer.observe(canvas);
 function drawMap(w){
  map.clearRect(0,0,160,160);map.fillStyle='#0c1422cc';map.fillRect(0,0,160,160);
  const scale=w.course==='parking'?3:w.course==='slalom'?.45:.7,center=w.course==='slalom'?{x:0,z:w.z-35}:w.course==='parking'?{x:0,z:0}:{x:0,z:0};
  const point=p=>[80+(p.x-center.x)*scale,80+(p.z-center.z)*scale];
  map.lineWidth=free?5:16;map.strokeStyle='#697987';map.beginPath();if(free)w.path.points.forEach((p,i)=>{const a=point(p);i?map.lineTo(...a):map.moveTo(...a);});else{map.moveTo(80,160);map.lineTo(80,0);}map.stroke();
  map.fillStyle='#e8b55f';for(const o of free?w.objects:w.cars){const [x,y]=free?point(o):[80+(o.lane-1)*12,135-o.z*.3];map.fillRect(x-2,y-2,4,4);}
  if(free){const p=point(courseTarget(w));map.strokeStyle='#73e6c9';map.strokeRect(p[0]-4,p[1]-4,8,8);}
  const p=free?point(w):[80+(w.x-1)*12,135];map.save();map.translate(...p);map.rotate(free?w.heading:0);map.fillStyle='#96baff';map.beginPath();map.moveTo(0,-6);map.lineTo(-4,5);map.lineTo(4,5);map.closePath();map.fill();map.restore();
 }
 function render(w,{realistic=false,view='chase'}={}){
  if(!scene||worldRef!==w)setWorld(w);
  if(realism!==realistic||!scene.background){realism=realistic;scene.background=new THREE.Color(realistic?'#adc2cf':'#121d2e');scene.fog=new THREE.Fog(scene.background,realistic?170:120,realistic?700:520);renderer.shadowMap.enabled=realistic;}
  const px=free?w.x:(w.x-1)*3.5,pz=free?w.z:0,h=free?w.heading:0;
  player.position.set(px,0,pz);player.rotation.set(0,-h,free?-w.steer*Math.min(.065,Math.abs(w.speed)*.002):0);
  // Model heading is clockwise from north; Three.js local forward is -Z.
  player.rotation.y=-h;
  for(let i=0;i<marks.length;i++)marks[i].position.z=-i*9+w.distance%9;
  for(let i=0;i<roadScenery.length;i++)roadScenery[i].position.z=30-((i*15-w.distance)%660+660)%660;
  if(finishGate)finishGate.position.z=w.distance-2000;
  const alive=new Set();for(const [i,o]of (free?w.objects:w.cars).entries()){
   alive.add(o.id);let mesh=objects.get(o.id);if(!mesh){mesh=o.kind==='cone'?cone():o.kind==='pedestrian'?pedestrian(i):car(o.color||'#d7b064',w.course==='kart');scene.add(mesh);objects.set(o.id,mesh);}
   mesh.position.set(free?o.x:(o.lane-1)*3.5,0,free?o.z:-o.z);mesh.rotation.y=free?-o.heading:0;
   if(o.kind==='pedestrian'){mesh.rotation.z=Math.sin(w.time*9+i)*.045;mesh.position.y=Math.abs(Math.sin(w.time*7+i))*.025;}
  }
  for(const [id,m]of objects)if(!alive.has(id)){scene.remove(m);const shared=new Set(materials.values());m.traverse(o=>{o.geometry?.dispose();if(o.material&&!shared.has(o.material))o.material.dispose();});objects.delete(id);}
  if(free){const t=courseTarget(w);targetRing.position.set(t.x,.04,t.z);targetRing.scale.setScalar(1+Math.sin(w.time*3)*.08);}
  signals.forEach((lamps,i)=>{const status=signalAt(w,w.crossings[i]);lamps.forEach((l,j)=>l.material.color.set(j==={red:0,amber:1,green:2}[status]?['#ff6464','#ffce69','#7ce9a3'][j]:'#293936'));});
  const f={x:Math.sin(h),z:-Math.cos(h)},cam=view==='overhead'?new THREE.Vector3(px,free?38:32,pz+6):view==='hood'?new THREE.Vector3(px+f.x*.4,1.7,pz+f.z*.4):new THREE.Vector3(px-f.x*(w.course==='parking'?9:12),w.course==='parking'?7:5.8,pz-f.z*(w.course==='parking'?9:12));
  const aim=view==='overhead'?new THREE.Vector3(px,0,pz-3):new THREE.Vector3(px+f.x*(view==='hood'?25:10),view==='hood'?1.4:1,pz+f.z*(view==='hood'?25:10));
  if(!cameraReady){camera.position.copy(cam);look.copy(aim);cameraReady=true;}else{camera.position.lerp(cam,.12);look.lerp(aim,.14);}camera.lookAt(look);camera.fov=view==='overhead'?55:62+Math.abs(w.speed)*.12;camera.updateProjectionMatrix();player.visible=view!=='hood';
  sun.position.set(px-45,85,pz+35);sun.target.position.set(px,0,pz);renderer.render(scene,camera);if(frame++%4===0)drawMap(w);
 }
 return {render,setWorld,resize,dispose(){observer.disconnect();clear();renderer.dispose();}};
}
