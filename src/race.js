import * as THREE from '../vendor/three.js';
import {$,el,Run,delay} from './core.js';
import {createWorld,stepWorld,drivingQuestions,drivingState} from './race-physics.js';
export {drivingQuestions,drivingState} from './race-physics.js';
export function initRace(client,toast){
 const canvas=$('#race-canvas'),keys=new Set();
 let renderer=null,scene,camera,player,roadMarks=[],scenery=[],finishGate,meshes=new Map(),world,mode='parked',run=null,visible=false,raf=0,last=0,target=1,throttle='COAST',decisions=0,lastDecision=0;
 const material=(color,emissive=0)=>new THREE.MeshStandardMaterial({color,emissive,roughness:.6,metalness:.25});
 function box(parent,x,y,z,w,h,d,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;}
 function vehicle(color){
  const g=new THREE.Group(),body=material(color),glass=material('#142534'),rubber=material('#090b0e');
  box(g,0,.55,0,1.75,.55,4.1,body);box(g,0,1.0,-.05,1.4,.65,1.85,glass);box(g,0,1.36,-.05,1.46,.12,1.8,body);
  for(const x of [-.86,.86])for(const z of [-1.3,1.3]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.22,12),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.35,z);g.add(wheel);}
  for(const x of [-.57,.57]){box(g,x,.65,2.07,.42,.14,.06,material('#ff6171','#ff1020'));box(g,x,.65,-2.07,.42,.15,.06,material('#e1f9ff','#a6ecff'));}
  return g;
 }
 function init3D(){
  if(renderer)return true;
  try{
   renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#0a101a');
   scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#0a101a',.0055);camera=new THREE.PerspectiveCamera(62,1,.1,750);
   scene.add(new THREE.HemisphereLight('#b4d7ff','#302246',2.4));const light=new THREE.DirectionalLight('#fff2d7',3);light.position.set(-40,70,20);scene.add(light);
   box(scene,0,-.18,-260,10.7,.3,600,material('#202832'));box(scene,0,-.42,-260,700,.2,650,material('#111d25'));
   for(const x of [-5.6,5.6])box(scene,x,.35,-260,.18,.65,600,material('#81a3ff','#182446'));
   const white=material('#a6b3c4'),pink=material('#e86cae','#34152a');
   for(let i=0;i<65;i++){const g=new THREE.Group();for(const x of [-1.75,1.75])box(g,x,.005,0,.12,.02,4,white);g.position.z=-i*9;scene.add(g);roadMarks.push(g);}
   for(let i=0;i<50;i++){const group=new THREE.Group();scene.add(group);scenery.push({group,z:-i*13});const side=i%2?-1:1,z=-i*13,h=6+(i*17%31);box(group,side*(18+i%4*7),h/2,z,5,h,6,material(i%2?'#202a3a':'#292739'));box(group,side*6.7,3,z,.08,6,.08,pink);box(group,side*6.7,6,z,.8,.15,.4,material('#d994c8','#9a4782'));}
   finishGate=new THREE.Group();const gateMat=material('#dce6f5');box(finishGate,-5,4,0,.3,8,.3,gateMat);box(finishGate,5,4,0,.3,8,.3,gateMat);
   for(let i=0;i<20;i++)for(let j=0;j<2;j++)box(finishGate,-4.75+i*.5,7+j*.5,0,.5,.5,.18,material((i+j)%2?'#16202e':'#dce6f5'));
   scene.add(finishGate);player=vehicle('#82a5ff');scene.add(player);const sun=new THREE.Mesh(new THREE.SphereGeometry(22,24,16),new THREE.MeshBasicMaterial({color:'#bf6c8e'}));sun.position.set(65,75,-550);scene.add(sun);resize();return true;
  }catch(e){renderer=null;toast('WebGL2 unavailable: '+e.message);return false;}
 }
 function obstacle(c){if(c.kind==='car')return vehicle(c.color);const g=new THREE.Group();if(c.kind==='barrier'){box(g,0,.55,0,2.6,1.1,1,material('#e79455'));for(const x of [-.8,0,.8])box(g,x,.55,.51,.28,1.1,.02,material('#252b34'));}else{box(g,0,.08,0,1.3,.16,1.3,material('#272b34'));const cone=new THREE.Mesh(new THREE.ConeGeometry(.58,1.5,12),material('#ef9c54'));cone.position.y=.88;g.add(cone);}return g;}
 function resize(){if(!renderer)return;const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);camera.updateProjectionMatrix();}
 new ResizeObserver(resize).observe(canvas);
 function dispose(g){g.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});scene.remove(g);}
 function reset(){world=createWorld($('#race-course').value,Number($('#race-limit').value));target=1;decisions=0;$('#race-log').replaceChildren();$('#race-command').textContent='Ready';if(scene)for(const m of meshes.values())dispose(m);meshes.clear();hud();}
 function hud(){$('#race-mode').textContent=world.finished?'FINISH':mode.toUpperCase();$('#race-speed').textContent=Math.round(world.speed*3.6);$('#race-distance').textContent=Math.round(world.distance);$('#race-hits').textContent=world.hits;$('#race-decisions').textContent=decisions;$('#race-clock').textContent=world.time.toFixed(1)+' s';$('#race-position').textContent=world.course==='race'?Math.min(100,world.distance/20).toFixed(0)+'% · 2 km':world.passed+' passed';canvas.parentElement.classList.toggle('collision',world.flash>0);}
 function stop(){run?.stop();run=null;mode='parked';keys.clear();$('#race-stop').disabled=true;$('#race-start').disabled=false;$('#race-demo').disabled=false;hud();}
 function log(text){$('#race-log').prepend(el('div',{},text));while($('#race-log').children.length>5)$('#race-log').lastChild.remove();}
 async function start(){
  stop();if(!init3D())return;if(world.finished)reset();const current=new Run();run=current;mode='jev';lastDecision=performance.now();throttle='COAST';$('#race-start').disabled=true;$('#race-demo').disabled=true;$('#race-stop').disabled=false;
  try{while(!current.signal.aborted&&!world.finished){
   const started=performance.now(),result=await client.infer(drivingState(world),drivingQuestions,current.signal);if(current.signal.aborted)break;
   const age=performance.now()-started;decisions++;
   if(age*Number($('#race-timescale').value)>1500){throttle='BRAKE';log('Stale command · brake');}
   else{target=['LEFT','CENTER','RIGHT'].indexOf(result.answers.lane.choice);throttle=result.answers.throttle.choice;lastDecision=performance.now();$('#race-command').textContent=result.answers.lane.choice+' / '+throttle;log('#'+decisions+' · '+result.answers.lane.choice+' · '+throttle);}
   $('#race-latency').textContent=Math.round(result.ms)+' ms';await delay(Math.max(0,Number($('#race-interval').value)-age),current.signal);
  }}catch(e){if(!current.signal.aborted)toast(e.message);}finally{if(run===current)stop();}
 }
 function tick(now){if(!visible)return;let dt=Math.min(.08,(now-last)/1000)||0;last=now;
  if(mode!=='parked'){
   dt*=Number($('#race-timescale').value);const stale=mode==='jev'&&(now-lastDecision)*Number($('#race-timescale').value)>1500;
   if(mode==='manual'){target=keys.has('ArrowLeft')?0:keys.has('ArrowRight')?2:world.x;throttle=keys.has('ArrowDown')?'BRAKE':keys.has('ArrowUp')?'ACCELERATE':'COAST';}
   const hits=world.hits;while(dt>0){const step=Math.min(dt,1/120);stepWorld(world,step,target,stale?'BRAKE':throttle);dt-=step;}if(world.hits>hits)log('Collision · '+world.hits);if(world.finished)stop();hud();
  }
  if(renderer){player.position.x=(world.x-1)*3.5;player.rotation.z=THREE.MathUtils.lerp(player.rotation.z,-(target-world.x)*.045,.15);
   for(let i=0;i<roadMarks.length;i++)roadMarks[i].position.z=-(i*9)+world.distance%9;
   for(const item of scenery)item.group.position.z=25-((25-item.z-world.distance)%650+650)%650-item.z;
   finishGate.visible=world.course==='race';finishGate.position.z=world.distance-2000;
   const alive=new Set();for(const c of world.cars){alive.add(c.id);if(!meshes.has(c.id)){const m=obstacle(c);scene.add(m);meshes.set(c.id,m);}meshes.get(c.id).position.set((c.lane-1)*3.5,0,-c.z);}
   for(const [id,m]of meshes)if(!alive.has(id)){dispose(m);meshes.delete(id);}
   camera.fov=THREE.MathUtils.lerp(camera.fov,62+world.speed*.16,.05);camera.updateProjectionMatrix();camera.position.set((world.x-1)*.6,4.2,10);camera.lookAt((world.x-1)*.45,.7,-24);renderer.render(scene,camera);
  }raf=requestAnimationFrame(tick);
 }
 $('#race-start').onclick=start;$('#race-stop').onclick=stop;$('#race-reset').onclick=()=>{stop();reset();};$('#race-course').onchange=()=>{stop();reset();};$('#race-limit').oninput=()=>{world.limit=Number($('#race-limit').value)/3.6;$('#race-limit-value').textContent=$('#race-limit').value+' km/h';};
 $('#race-demo').onclick=()=>{stop();if(!init3D())return;mode='manual';$('#race-stop').disabled=false;$('#race-command').textContent='← → steer · ↑ ↓ throttle';canvas.focus();};
 canvas.tabIndex=0;window.addEventListener('keydown',e=>{if(visible&&mode==='manual'&&e.key.startsWith('Arrow')&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){e.preventDefault();keys.add(e.key);}});window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>keys.clear());
 reset();return {stop,setVisible(value){visible=value;cancelAnimationFrame(raf);if(!value)stop();else if(init3D()){resize();last=performance.now();raf=requestAnimationFrame(tick);}}};
}
