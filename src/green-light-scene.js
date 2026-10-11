import * as THREE from '../vendor/three.js';
import {cameraMount,cameraRange,yard,silo,cover,turretOrigin} from './green-light-world.js';
import {createWetLens} from './green-light-weather.js';

export function createGreenScene(canvas){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
 const wetLens=createWetLens(renderer),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#252d32');scene.fog=new THREE.FogExp2('#343e43',.0135);
 const eye=new THREE.PerspectiveCamera(66,1,.06,170),look=new THREE.Vector3();
 const mats=new Map(),textures=[];
 const mat=(color,roughness=.85,metalness=0)=>{const key=[color,roughness,metalness].join('/');if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness}));return mats.get(key);};
 function mesh(parent,geometry,material,x=0,y=0,z=0){const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);parent.add(o);return o;}
 const box=(parent,x,y,z,w,h,d,color)=>mesh(parent,new THREE.BoxGeometry(w,h,d),mat(color),x,y,z);
 function cylinder(parent,x,y,z,r1,r2,h,color){return mesh(parent,new THREE.CylinderGeometry(r1,r2,h,16),mat(color,.4,.4),x,y,z);}
 const hemi=new THREE.HemisphereLight('#c0c9d1','#4a504c',1.05),moon=new THREE.DirectionalLight('#b6c3cc',1.15),lightning=new THREE.DirectionalLight('#d5eaff',0);
 moon.position.set(-18,38,20);lightning.position.set(15,35,-30);scene.add(hemi,moon,lightning);

 const groundCanvas=document.createElement('canvas');groundCanvas.width=groundCanvas.height=256;
 const ctx=groundCanvas.getContext('2d');ctx.fillStyle='#313a33';ctx.fillRect(0,0,256,256);
 for(let i=0;i<5000;i++){const x=Math.random()*256,y=Math.random()*256;ctx.fillStyle=i%3?'#202924':'#485247';ctx.fillRect(x,y,1,1+Math.random()*4);}
 const groundTex=new THREE.CanvasTexture(groundCanvas);groundTex.wrapS=groundTex.wrapT=THREE.RepeatWrapping;groundTex.repeat.set(10,14);groundTex.colorSpace=THREE.SRGBColorSpace;textures.push(groundTex);
 const earth=new THREE.MeshStandardMaterial({map:groundTex,roughness:.68,metalness:.12});
 const ground=mesh(scene,new THREE.PlaneGeometry(90,180),earth,0,-.025,28);ground.rotation.x=-Math.PI/2;
 // Puddles catch moonlight without a reflection pass or external textures.
 const puddleMat=new THREE.MeshStandardMaterial({color:'#17282a',roughness:.13,metalness:.8,transparent:true,opacity:.8});
 for(let i=0;i<46;i++){const p=mesh(scene,new THREE.CircleGeometry(1,24),puddleMat,Math.sin(i*12.34)*12,.006,-16+(i*7.3%80));p.rotation.x=-Math.PI/2;p.scale.set(.4+(i%5)*.22,.18+(i%3)*.12,1);}
 for(let z=yard.startZ;z>yard.doorZ;z-=2.2)box(scene,6+Math.sin(z)*.15,.015,z,1.4,.035,1.5,'#56615d');

 const fenceMat=mat('#323b34'),slatGeometry=new THREE.BoxGeometry(.19,2.5,.11),slats=[];
 const backFence=yard.maxZ+1.5,fenceLength=backFence+19;
 for(let z=-19;z<=backFence;z+=.23){slats.push({x:-14,z,angle:Math.PI/2},{x:14,z,angle:Math.PI/2});}
 for(let x=-14;x<=14;x+=.23)slats.push({x,z:backFence,angle:0});
 const fence=new THREE.InstancedMesh(slatGeometry,fenceMat,slats.length),dummy=new THREE.Object3D();
 slats.forEach((p,i)=>{dummy.position.set(p.x,1.23,p.z);dummy.rotation.set(0,p.angle,0);dummy.updateMatrix();fence.setMatrixAt(i,dummy.matrix);});scene.add(fence);
 for(const x of [-14,14])for(const y of [.65,1.85])box(scene,x,y,(backFence-19)/2,.2,.16,fenceLength,'#242b26');
 for(const y of [.65,1.85])box(scene,0,y,backFence,28,.16,.2,'#242b26');

 box(scene,0,3,-23,24,6,8,'#303937');
 for(let y=.3;y<6;y+=.35)box(scene,0,y,-18.96,24,.025,.035,'#202925');
 for(const side of [-1,1]){const roof=box(scene,0,6.7,-23+side*2,25,.2,5.1,'#182421');roof.rotation.x=side*.36;}
 box(scene,-7,7.7,-24,1.5,2.7,1.5,'#242d2a');
 for(const x of [-7,-1,10]){box(scene,x,3.3,-18.94,1.8,2.3,.06,'#080f12');box(scene,x,3.3,-18.89,.07,2.35,.1,'#515c53');box(scene,x,3.3,-18.89,1.8,.07,.1,'#515c53');}
 const door=box(scene,6,1.5,-18.9,1.65,3,.12,'#172924');cylinder(scene,6.58,1.45,-18.78,.06,.06,.16,'#87947c').rotation.x=Math.PI/2;
 const porch=new THREE.PointLight('#a7cf93',8,9,2);porch.position.set(6,3.4,-18.3);scene.add(porch);
 mesh(scene,new THREE.SphereGeometry(.07,8,6),new THREE.MeshBasicMaterial({color:'#bbcba0'}),6,3.4,-18.8);

 for(const o of cover){
  box(scene,o.x,o.h/2,o.z,o.w,o.h,o.d,o.kind==='shed'?'#283731':'#333e38');
  if(o.kind==='shed'){const roof=box(scene,o.x,o.h+.15,o.z,o.w+.6,.25,o.d+.5,'#1d2926');roof.rotation.z=.08;box(scene,o.x,1.6,o.z+o.d/2+.025,1.7,2.9,.06,'#16221e');}
  else for(let y=.4;y<o.h;y+=.5)box(scene,o.x,y,o.z+o.d/2+.015,o.w,.045,.04,'#192922');
 }
 cylinder(scene,silo.x,silo.height/2,silo.z,silo.radius,silo.radius,silo.height,'#465249');
 for(const y of [.2,1.2,2.4,3.6]){const ring=mesh(scene,new THREE.TorusGeometry(silo.radius,.035,6,40),mat('#192b25'),silo.x,y,silo.z);ring.rotation.x=Math.PI/2;}
 cylinder(scene,silo.x,3.78,silo.z,2.67,2.67,.16,'#202e27');
 const piston=cylinder(scene,silo.x,4,silo.z,.21,.26,1,'#798a7e');
 const mount=new THREE.Group();scene.add(mount);
 cylinder(mount,0,-.18,0,.53,.58,.35,'#1d2c24');
 const pivot=new THREE.Group();mount.add(pivot);
 box(pivot,0,.05,-.25,.45,.36,1.2,'#26382d');
 const barrel=cylinder(pivot,0,.05,-1.1,.065,.09,1.65,'#1a211c');barrel.rotation.x=Math.PI/2;
 box(pivot,0,.31,-.12,.16,.12,.6,'#090f0b');
 const muzzle=new THREE.PointLight('#ffd8a3',0,12);muzzle.position.set(0,.05,-1.95);pivot.add(muzzle);

 cylinder(scene,cameraMount.x,cameraMount.y-.7,cameraMount.z,.075,.075,1.4,'#364339');
 const scanner=new THREE.Group();scanner.position.set(cameraMount.x,cameraMount.y,cameraMount.z);scene.add(scanner);
 const head=new THREE.Group();head.rotation.x=-.26;scanner.add(head);
 box(head,0,0,-.2,.45,.31,.9,'#78887a');box(head,0,-.02,-.66,.33,.22,.02,'#08120b');
 const lens=mesh(head,new THREE.CircleGeometry(.085,12),new THREE.MeshBasicMaterial({color:'#8bdc91'}),0,0,-.68);lens.rotation.y=Math.PI;
 const spot=new THREE.SpotLight('#589a71',40,cameraRange,Math.PI*38/180,.6,.7);spot.position.copy(scanner.position);scene.add(spot,spot.target);
 const beamPositions=[0,.035,0];for(let i=0;i<=24;i++){const a=-Math.PI*38/180+i*Math.PI*76/180/24;beamPositions.push(Math.sin(a)*(cameraRange-2),.035,-Math.cos(a)*(cameraRange-2));}
 const fanGeometry=new THREE.BufferGeometry();fanGeometry.setAttribute('position',new THREE.Float32BufferAttribute(beamPositions,3));const indices=[];for(let i=1;i<=24;i++)indices.push(0,i,i+1);fanGeometry.setIndex(indices);
 const fan=mesh(scene,fanGeometry,new THREE.MeshBasicMaterial({color:'#609675',transparent:true,opacity:.035,side:THREE.DoubleSide,depthWrite:false}),cameraMount.x,0,cameraMount.z);

 // Instanced trunks/branches: silhouettes, not a forest of draw calls.
 const branchGeometry=new THREE.CylinderGeometry(.05,.15,1,5),segments=[];
 for(let i=0;i<40;i++){
  const x=(i%2?1:-1)*(17+i%5*2),z=-26+i*2.8,h=7+i%5;
  segments.push({x,y:h/2,z,h,rz:0,rx:0});
  for(let j=0;j<4;j++)segments.push({x:x+(j%2?1:-1)*.6,y:h*(.45+j*.12),z:z+.2,h:3,rz:(j%2?1:-1)*.7,rx:j*.4});
 }
 const trees=new THREE.InstancedMesh(branchGeometry,mat('#13231c'),segments.length);
 segments.forEach((s,i)=>{dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(s.rx,0,s.rz);dummy.scale.set(1,s.h,1);dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);});scene.add(trees);

 const drops=1100,rainData=new Float32Array(drops*6),rainSeed=Array.from({length:drops},()=>({x:Math.random()*46-23,z:Math.random()*50-25,y:Math.random()*17}));
 const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainData,3));
 const rain=new THREE.LineSegments(rainGeometry,new THREE.LineBasicMaterial({color:'#9cbab1',transparent:true,opacity:.22,depthWrite:false}));rain.frustumCulled=false;scene.add(rain);
 const traceData=new Float32Array(16*6),traceGeometry=new THREE.BufferGeometry();traceGeometry.setAttribute('position',new THREE.BufferAttribute(traceData,3));
 const traces=new THREE.LineSegments(traceGeometry,new THREE.LineBasicMaterial({color:'#ffe3ad',transparent:true,opacity:.85}));traces.frustumCulled=false;scene.add(traces);
 let width=0,height=0;
 function render(w,weather,flash,reduceFlash){
  const r=canvas.getBoundingClientRect();if(r.width<1||r.height<1)return;
  if(width!==r.width||height!==r.height){width=r.width;height=r.height;renderer.setSize(width,height,false);eye.aspect=width/height;eye.updateProjectionMatrix();}
  const p=w.player,bob=p.moving?Math.sin(w.time*8*(p.sprinting?1.35:1))*(p.sprinting?.03:.022):0;
  const fov=66+(p.sprinting?3:0);if(eye.fov!==fov){eye.fov=fov;eye.updateProjectionMatrix();}
  eye.position.set(p.x,p.y+bob,p.z);look.set(p.x+Math.sin(p.yaw)*Math.cos(p.pitch),p.y+bob+Math.sin(p.pitch),p.z-Math.cos(p.yaw)*Math.cos(p.pitch));eye.lookAt(look);
  const o=turretOrigin(w);mount.position.set(o.x,o.y,o.z);mount.rotation.y=-w.turret.yaw;pivot.rotation.x=w.turret.pitch;
  piston.position.y=(3.25+o.y)/2;piston.scale.y=Math.max(.02,o.y-3.25);mount.visible=w.turret.lift>.2;
  scanner.rotation.y=-w.cameraYaw;fan.rotation.y=-w.cameraYaw;
  spot.target.position.set(cameraMount.x+Math.sin(w.cameraYaw)*32,0,cameraMount.z-Math.cos(w.cameraYaw)*32);
  lens.material.color.set(w.observation?'#c9eabb':'#68ac79');
  lightning.intensity=reduceFlash?Math.min(.25,flash):flash;
  muzzle.intensity=reduceFlash?0:(w.turret.cooldown>2.72?30:0);
  for(let i=0;i<drops;i++){
   const s=rainSeed[i],y=((s.y-weather*12)%17+17)%17;
   const x=p.x+s.x+Math.sin(weather*.2)*.8,z=p.z+s.z;
   rainData.set([x,y,z,x+.045,y+.6,z+.035],i*6);
  }
  rainGeometry.attributes.position.needsUpdate=true;
  w.tracers.forEach((t,i)=>traceData.set([t.a.x,t.a.y,t.a.z,t.b.x,t.b.y,t.b.z],i*6));traceGeometry.setDrawRange(0,w.tracers.length*2);traceGeometry.attributes.position.needsUpdate=true;
  wetLens.render(scene,eye,weather,reducedMotion);
 }
 function dispose(){
  const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);if(o.isInstancedMesh)o.dispose();});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());wetLens.dispose();renderer.dispose();
 }
 return {render,dispose};
}
