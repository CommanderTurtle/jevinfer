import * as T from '../vendor/three.js';
import {createAssets} from './scene-assets.js';
import {seaHeight,seaWaves,waterHeight} from './boat-physics.js';
import {batchBoxes} from './render-batch.js';

export const policeBeaconLit=(time,id,bank,enabled=true)=>enabled&&Math.floor(time*4+id)%2===bank;

export function createBoatScene(canvas,mapCanvas){
 const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.shadowMap.enabled=false;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.3,24000),a=createAssets({simple:true}),map=mapCanvas.getContext('2d');scene.background=new T.Color('#648ea0');scene.fog=new T.Fog('#bdb5b2',450,1600);

 const sun=new T.DirectionalLight('#ffdda7',3.2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:200});sun.shadow.normalBias=.06;scene.add(sun,sun.target,new T.HemisphereLight('#bfdde9','#3e505b',1.5));
 const skyMaterial=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{day:{value:0}},vertexShader:`varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 direction;uniform float day;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec3 d=normalize(direction);float y=max(0.,d.y);vec3 horizon=mix(vec3(.75,.48,.4),vec3(.69,.82,.87),day),zenith=mix(vec3(.12,.24,.39),vec3(.14,.37,.59),day);vec3 color=mix(horizon,zenith,sqrt(y));vec3 sunDir=normalize(vec3(-.5,.35,-.7));float s=max(0.,dot(d,sunDir));color+=vec3(1.,.68,.37)*(pow(s,600.)*2.+pow(s,12.)*.15);vec2 uv=d.xz/max(.15,y)*2.;float n=noise(uv)*.6+noise(uv*2.3)*.3+noise(uv*5.1)*.1;float clouds=smoothstep(.56,.77,n)*smoothstep(.03,.25,y);color=mix(color,vec3(.85,.79,.74),clouds*.5);gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});const sky=new T.Mesh(new T.SphereGeometry(20000,32,16),skyMaterial);scene.add(sky);

 const woodTex=a.texture('wood',(c,s)=>{c.fillStyle='#68482d';c.fillRect(0,0,s,s);for(let y=0;y<s;y+=16){c.fillStyle=y%32?'#805438':'#a27445';c.fillRect(0,y,s,14);c.strokeStyle='#402b22';c.beginPath();c.moveTo(0,y+14);c.lineTo(s,y+14);c.stroke();for(let x=0;x<s;x+=43){c.fillStyle='#2a2724';c.fillRect(x+(y%32),y+3,2,2);c.strokeStyle='#bd966344';c.beginPath();c.moveTo(x,y+5);c.bezierCurveTo(x+8,y,x+26,y+13,x+40,y+6);c.stroke();}}});
 const wood=a.material('wood',{color:'#ba9566',roughness:.7,map:woodTex}),hullMat=a.material('hull',{color:'#35281f',roughness:.48,clearcoat:.35}),gold=a.material('brass',{color:'#c39850',metalness:.8,roughness:.3}),ropeMat=a.material('rope',{color:'#b7a384',roughness:1}),cloth=a.material('sail',{color:'#d6c3a0',side:T.DoubleSide,roughness:.96}),black=a.material('iron',{color:'#25272a',metalness:.8,roughness:.4});
 const sails=[];
 function spar(parent,p,q,radius,material){const v=new T.Vector3(...q).sub(new T.Vector3(...p)),m=a.mesh(parent,new T.CylinderGeometry(radius,radius,v.length(),10),material);m.position.copy(new T.Vector3(...p).add(new T.Vector3(...q)).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return m;}
 function ship(){const g=new T.Group();
  a.loft(g,[[-9,.1,1.1,.2],[-7,1.5,-.1,1.5],[-4,2.65,-.1,1.6],[2,2.9,-.1,1.6],[6,2.4,.1,1.5],[7,1.8,.2,1.4]],hullMat);
  const deckShape=new T.Shape();deckShape.moveTo(0,-8.8);deckShape.bezierCurveTo(3,-6,3.3,1,2.3,6.6);deckShape.lineTo(-2.3,6.6);deckShape.bezierCurveTo(-3.3,1,-3,-6,0,-8.8);const deck=a.mesh(g,new T.ShapeGeometry(deckShape,24),wood,0,1.7,0);deck.rotation.set(-Math.PI/2,0,Math.PI);
  a.rounded(g,0,2.1,5.1,4.4,.9,3,wood,.14);a.rounded(g,0,2.8,6.1,4.6,.2,1.8,wood);
  for(const side of [-1,1]){for(let z=-6;z<=6;z+=1.1){const x=side*(2.75-Math.max(0,Math.abs(z)-3)*.17);spar(g,[x,1.65,z],[x,2.3,z],.045,gold);}for(let j=0;j<2;j++){const points=[];for(let z=-6;z<=6;z+=.5)points.push(new T.Vector3(side*(2.75-Math.max(0,Math.abs(z)-3)*.17),2.2+j*.12,z));a.mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(points),32,.035,5,false),gold);}for(const z of [-2.5,0,2.5]){a.rounded(g,side*2.2,1.8,z,.7,.4,.75,wood);spar(g,[side*1.8,2.03,z],[side*3.1,2.03,z],.14,black);for(const zz of [-.23,.23]){const wheel=a.mesh(g,new T.CylinderGeometry(.19,.19,.08,12),wood,side*2.2,1.7,z+zz);wheel.rotation.x=Math.PI/2;}}
   for(let z=-6;z<6;z+=.75)a.rounded(g,side*(2.7-Math.max(0,Math.abs(z)-3)*.17),.95,z,.08,.12,.58,gold,.02);
  }
  for(const [z,height,width]of [[-3,13,7],[2,15,9]]){spar(g,[0,1.7,z],[0,height,z],.13,wood);for(const side of [-1,1]){spar(g,[0,height-1,z],[side*2.7,1.7,z+2],.024,ropeMat);spar(g,[0,height-1,z],[side*2.7,1.7,z-2],.024,ropeMat);}for(const [top,h,w]of [[height-1,5,width],[height-6,3,width*.8]]){spar(g,[-w/2,top,z],[w/2,top,z],.08,wood);const geometry=new T.PlaneGeometry(w,h,16,10),p=geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,Math.cos(x/w*Math.PI)*Math.sin((y/h+.5)*Math.PI)*1.15);}geometry.computeVertexNormals();const sail=a.mesh(g,geometry,cloth,0,top-h/2,z);sails.push(sail);}}
  spar(g,[0,2,-7],[0,3.5,-11],.09,wood);
  const helm=a.mesh(g,new T.TorusGeometry(.42,.045,8,24),gold,0,3.25,4.1);for(let i=0;i<8;i++)spar(g,[0,3.25,4.1],[Math.cos(i*Math.PI/4)*.55,3.25+Math.sin(i*Math.PI/4)*.55,4.1],.023,wood);spar(g,[0,2.5,4.1],[0,3.25,4.1],.06,wood);
  const flagGeo=new T.PlaneGeometry(1.8,1.1,10,6),flag=a.mesh(g,flagGeo,a.material('flag',{color:'#171c25',side:T.DoubleSide,roughness:1}),.9,14.2,2);sails.push(flag);
  const skull=a.mesh(g,new T.SphereGeometry(.18,16,10),a.material('skull',{color:'#d6ceba'}),.9,14.25,1.96);skull.scale.z=.15;for(const x of [-.07,.07])a.mesh(g,new T.SphereGeometry(.035,8,6),black,.9+x,14.27,1.927);
  return g;
 }
 const player=ship();batchBoxes(player);scene.add(player);const captain=a.person(0,true);captain.scale.setScalar(1.18);player.add(captain);
 const beach=new T.Group();scene.add(beach);const sand=a.mesh(beach,new T.SphereGeometry(1,48,20),a.material('sand',{color:'#c6ad80',roughness:1}),-20,-2,65);sand.scale.set(100,5,40);
 const island=new T.Group();scene.add(island);
 const shore=a.mesh(island,new T.SphereGeometry(1,32,12),a.material('island-sand',{color:'#d8bd84',roughness:1,fog:false}),0,-4,0);shore.scale.set(325,18,300);
 for(const [x,z,r,h]of [[-75,-35,210,620],[120,-70,145,320],[-190,25,110,180]]){
  const geo=new T.ConeGeometry(r,h,24,8),pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){const px=pos.getX(i),py=pos.getY(i),pz=pos.getZ(i),n=1+.12*Math.sin(px*.036+pz*.017)*Math.cos(py*.023);pos.setXYZ(i,px*n,py,pz*n);}
  geo.computeVertexNormals();a.mesh(island,geo,a.material('island-rock',{color:'#536955',roughness:1,fog:false}),x,h/2+8,z);
 }
 for(let z=8;z<50;z+=2){a.rounded(beach,0,1.1,z,4,.25,1.92,wood);for(const x of [-1.6,1.6])spar(beach,[x,-1,z],[x,1.2,z],.13,wood);}
 for(let i=0;i<9;i++){const x=-85+i*17,z=70+Math.sin(i*2)*12,h=9+i%3;const trunk=new T.CatmullRomCurve3([new T.Vector3(x,1,z),new T.Vector3(x+1,h*.6,z),new T.Vector3(x+2,h,z)]);a.mesh(beach,new T.TubeGeometry(trunk,12,.24,8,false),wood);for(let j=0;j<7;j++){const theta=j/7*Math.PI*2,leaf=new T.Shape();leaf.moveTo(0,0);leaf.quadraticCurveTo(1,2,.1,5);leaf.quadraticCurveTo(-1,2,0,0);const m=a.mesh(beach,new T.ShapeGeometry(leaf,12),a.material('palm',{color:'#3c6545',side:T.DoubleSide,roughness:1}),x+2,h,z);m.rotation.set(-.9,theta,Math.sin(theta)*.5);}}
 const waveShader=`uniform float time;uniform vec4 patches[18];
 float wave(vec2 v){
  float height=${seaWaves.map(([a,x,z,s])=>`${a.toFixed(3)}*sin(v.x*${x.toFixed(3)}+v.y*${z.toFixed(3)}-time*${s.toFixed(3)})`).join('+')};
  float scale=1.;for(int i=0;i<18;i++){float q=max(0.,1.-distance(v,patches[i].xy)/max(1.,patches[i].z));scale+=q*q*3.;}
  return height*scale;
 }`;
 const waterMaterial=new T.ShaderMaterial({
  uniforms:{time:{value:0},patches:{value:Array.from({length:18},()=>new T.Vector4(0,99999,1,0))},eye:{value:new T.Vector3()},day:{value:0}},
  vertexShader:`varying vec3 p;varying vec3 normalW;${waveShader}
   void main(){vec4 w=modelMatrix*vec4(position,1.);w.y=wave(w.xz);p=w.xyz;normalW=normalize(vec3((wave(w.xz-vec2(.4,0))-wave(w.xz+vec2(.4,0)))/.8,1.,(wave(w.xz-vec2(0,.4))-wave(w.xz+vec2(0,.4)))/.8));gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`varying vec3 p;varying vec3 normalW;uniform vec3 eye;uniform float day;uniform float time;
   void main(){
    vec2 v=p.xz;float warp=sin(v.x*.19+v.y*.12-time*.3);
    vec2 ripple=vec2(sin(v.x*1.3+v.y*.9+warp-time*1.7)+sin(v.x*3.1-v.y*1.1+time*2.3)*.4,sin(v.x*.8-v.y*1.4+warp-time*1.1)+sin(v.y*3.7+time*1.9)*.3)*.045*(1.-smoothstep(60.,300.,length(eye-p)));
    vec3 n=normalize(normalW+vec3(ripple.x,0.,ripple.y));
    vec3 e=normalize(eye-p),l=normalize(vec3(-.5,.7,.4));float fres=pow(1.-max(0.,dot(n,e)),4.);
    vec3 deep=mix(vec3(.009,.095,.14),vec3(.015,.16,.21),day),sky=mix(vec3(.67,.39,.39),vec3(.53,.73,.82),day);
    float light=pow(max(dot(reflect(-l,n),e),0.),180.),foam=smoothstep(.8,1.4,p.y)*.32;
    vec3 color=mix(deep,sky,fres*.8)+vec3(1.,.83,.6)*light*2.+foam;float fog=1.-exp(-length(eye-p)*.0013);
    color=mix(color,sky,fog);gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const farWaterMaterial=waterMaterial.clone();farWaterMaterial.uniforms=waterMaterial.uniforms;
 farWaterMaterial.vertexShader='varying vec3 p;varying vec3 normalW;void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xyz;normalW=vec3(0.,1.,0.);gl_Position=projectionMatrix*viewMatrix*w;}';
 const distantSea=a.mesh(scene,new T.PlaneGeometry(50000,50000),farWaterMaterial,0,-2,0);distantSea.rotation.x=-Math.PI/2;
 const waterGeo=new T.PlaneGeometry(900,900,72,72);waterGeo.rotateX(-Math.PI/2);const water=new T.Mesh(waterGeo,waterMaterial);scene.add(water);
 const police=new Map(),balls=[],bursts=[],foam=[],hazards=[];
 function policeBoat(variant){const g=new T.Group(),white=a.material('police-white',{color:'#e0e4df',metalness:.2,roughness:.28,clearcoat:1}),glass=a.material('police-glass',{color:'#102939',metalness:.7,roughness:.1});a.loft(g,[[-5,.1,.5,.15],[-3,1.2,.25,.9],[2,1.5,.3,1],[4,1.2,.35,.9]],white);a.rounded(g,0,1.15,.4,2.25,.2,5.5,white);a.rounded(g,0,2,.7,1.85,1.7,2.7,glass,.25);a.rounded(g,0,2.9,.7,2.2,.12,3,white);g.userData.beacons=[-.65,.65].map(x=>a.rounded(g,x,3.05,.7,.8,.15,.32,a.glow(x<0?'#318cff':'#ff334b')));for(const x of [-1.4,1.4])a.rounded(g,x,.7,1,.07,.28,5,a.material('navy',{color:'#16384d',roughness:.4}));spar(g,[0,2.9,1],[0,4.4,1],.025,a.metal());if(variant===1)a.rounded(g,0,1,3,1.8,.7,1.6,black);if(variant===2){const radar=a.mesh(g,new T.CylinderGeometry(.7,.7,.12,20),white,0,3.7,1);spar(g,[0,2.9,1],[0,3.7,1],.06,a.metal());}return g;}
 const splashGeo=new T.SphereGeometry(1,8,6),ballGeo=new T.SphereGeometry(.18,10,8);
 for(let i=0;i<24;i++){const group=new T.Group();group.visible=false;for(let j=0;j<15;j++){const m=new T.Mesh(splashGeo,new T.MeshBasicMaterial({color:'#ffe1a0',transparent:true,depthWrite:false}));group.add(m);}scene.add(group);bursts.push(group);}
 for(let i=0;i<12;i++){const b=new T.Mesh(ballGeo,black);scene.add(b);balls.push(b);}
 const foamTex=a.texture('foam',(c,s)=>{const gradient=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);gradient.addColorStop(0,'#ffffff22');gradient.addColorStop(.35,'#ffffff77');gradient.addColorStop(1,'#ffffff00');c.fillStyle=gradient;c.fillRect(0,0,s,s);});
 const foamGeo=new T.PlaneGeometry(1,1),foamMat=new T.MeshBasicMaterial({map:foamTex,color:'#d4edf1',transparent:true,opacity:.12,depthWrite:false,side:T.DoubleSide});for(let i=0;i<52;i++){const m=new T.Mesh(foamGeo,foamMat.clone());m.rotation.x=-Math.PI/2;scene.add(m);foam.push(m);}foamMat.dispose();
 batchBoxes(beach);const target=new T.Vector3();let ready=false,worldRef;
 function setWorld(w){worldRef=w;ready=false;island.position.set(w.island.x,0,w.island.z);for(const m of police.values()){scene.remove(m);m.traverse(n=>n.geometry?.dispose());}police.clear();for(const p of w.police){const m=policeBoat(p.variant);scene.add(m);police.set(p.id,m);}for(const m of hazards){scene.remove(m);m.geometry.dispose();m.material.dispose();}hazards.length=0;for(const h of w.waves){const m=new T.Mesh(new T.RingGeometry(h.radius-.4,h.radius,48),new T.MeshBasicMaterial({color:'#edc77e',transparent:true,opacity:.24,side:T.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(h.x,.7,h.z);scene.add(m);hazards.push(m);}}
 function resize(){const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);camera.updateProjectionMatrix();}const observer=new ResizeObserver(resize);observer.observe(canvas);
 function float(m,x,z,h,t){const fx=Math.sin(h)*2,fz=-Math.cos(h)*2,rx=Math.cos(h)*2,rz=Math.sin(h)*2;m.position.set(x,waterHeight(worldRef,x,z)*.8,z);m.rotation.set((waterHeight(worldRef,x+fx,z+fz)-waterHeight(worldRef,x-fx,z-fz))*.12,-h,(waterHeight(worldRef,x+rx,z+rz)-waterHeight(worldRef,x-rx,z-rz))*.12);}
 function render(w,{view='overhead',realistic=false,policeLights=true}={}){
  if(worldRef!==w)setWorld(w);water.position.set(w.x,0,w.z);waterMaterial.uniforms.time.value=w.time;waterMaterial.uniforms.day.value=realistic?1:.65;waterMaterial.uniforms.patches.value.forEach((p,i)=>{const v=w.waves[i];p.set(v?.x||0,v?.z??99999,v?.radius||1,0);});scene.background.set(realistic?'#8db4c6':'#708294');scene.fog.color.set(realistic?'#b6cbd1':'#b7a4a3');
  sky.position.copy(camera.position);skyMaterial.uniforms.day.value=realistic?1:.65;
  float(player,w.x,w.z,w.heading,w.time);beach.visible=w.z>-500;
  const firing=w.time-w.fireAt,run=firing<2.5?Math.sin(Math.min(1,firing/1.25)*Math.PI):0;
  if(w.time<5){captain.position.set(0,1.2+Math.sin(Math.max(0,w.time-3.5)/1.5*Math.PI)*2.5,32-w.time*5.6);captain.rotation.y=0;a.animatePerson(captain,w.time,1.8);}
  else{captain.position.set(w.fireSide*1.9*run,2.65-.9*run+Math.abs(Math.sin(firing*5))*run*.35,4.6*(1-run));captain.rotation.y=firing<1.2?-w.fireSide*Math.PI/2:firing<2.5?w.fireSide*Math.PI/2:0;a.animatePerson(captain,w.time,run?2:.12);}
  sails.forEach((m,i)=>{m.rotation.y=Math.sin(w.time*1.6+i)*.055;});
  for(const p of w.police){const m=police.get(p.id);float(m,p.x,p.z,p.heading,w.time);m.userData.beacons.forEach((b,i)=>{b.visible=policeBeaconLit(w.time,p.id,i,policeLights&&p.hull>0);});if(p.hull<=0){const age=w.time-(p.destroyedAt??w.time);m.position.y-=age*1.1;m.rotation.z=Math.min(1.5,age*.35);m.rotation.x+=Math.min(.5,age*.12);m.visible=age<7;}else m.visible=true;}
  balls.forEach((m,i)=>{const b=w.balls[i];m.visible=!!b;if(b)m.position.set(b.x,b.y,b.z);});
  bursts.forEach((g,i)=>{const b=w.bursts[i];g.visible=!!b;if(!b)return;const age=w.time-b.at;g.position.set(b.x,0,b.z);g.children.forEach((m,j)=>{const angle=j*2.4,r=age*(1.5+j%4);m.position.set(Math.cos(angle)*r,Math.max(0,age*(6+j%3)-age*age*3),Math.sin(angle)*r);m.scale.setScalar((b.type==='wreck'?2:b.type==='fire'?1.2:.6)*(1+age*.3));m.material.color.set(b.type!=='water'?(age<.3?'#fff2bc':age<.9?'#ed762e':'#454950'):'#cfecf3');m.material.opacity=Math.max(0,1-age/3);});});
  foam.forEach((m,i)=>{const p=w.trail[i];m.visible=!!p&&w.speed>1;if(p){const age=w.time-p.at;m.position.set(p.x,waterHeight(w,p.x,p.z)+.08,p.z);m.rotation.z=p.heading;m.scale.set(6+age*2,3+age*.8,1);m.material.opacity=Math.max(0,.18-age*.028);}});
  hazards.forEach((m,i)=>{const p=w.waves[i];m.position.set(p.x,seaHeight(p.x,p.z,w.time)+.15,p.z);});
  const f={x:Math.sin(w.heading),z:-Math.cos(w.heading)},cam=view==='overhead'?new T.Vector3(w.x,53,w.z+25):view==='hood'?new T.Vector3(w.x-f.x*5,6,w.z-f.z*5):new T.Vector3(w.x-f.x*28,17,w.z-f.z*28),aim=new T.Vector3(w.x,1,w.z-8);
  if(w.time<5){const t=Math.max(0,Math.min(1,(w.time-1.5)/2)),blend=t*t*(3-2*t);cam.set(-12,12-blend*4,45-w.time*4);aim.set(w.island.x,150,w.island.z).sub(cam).normalize().multiplyScalar(60).add(cam).lerp(new T.Vector3(0,2,32-w.time*5.6),blend);}
  if(!ready){camera.position.copy(cam);target.copy(aim);ready=true;}else{camera.position.lerp(cam,.09);target.lerp(aim,.1);}camera.lookAt(target);waterMaterial.uniforms.eye.value.copy(camera.position);sun.position.set(w.x-45,80,w.z+45);sun.target.position.set(w.x,0,w.z);renderer.render(scene,camera);canvas.dataset.drawCalls=renderer.info.render.calls;canvas.dataset.triangles=renderer.info.render.triangles;
  map.fillStyle='#0b2735';map.fillRect(0,0,160,160);map.fillStyle='#edc77e';for(const p of w.waves)if(Math.hypot(p.x-w.x,p.z-w.z)<160){map.beginPath();map.arc(80+(p.x-w.x)*.5,100+(p.z-w.z)*.5,p.radius*.5,0,Math.PI*2);map.fill();}map.fillStyle='#6da9fb';for(const p of w.police)if(p.hull>0)map.fillRect(78+(p.x-w.x)*.5,98+(p.z-w.z)*.5,4,4);map.save();map.translate(80,100);map.rotate(w.heading);map.fillStyle='#f8d496';map.beginPath();map.moveTo(0,-8);map.lineTo(-4,6);map.lineTo(4,6);map.fill();map.restore();
  const bearing=Math.atan2(w.island.x-w.x,w.z-w.island.z);map.save();map.translate(80+Math.sin(bearing)*65,80-Math.cos(bearing)*65);map.rotate(bearing);map.fillStyle='#a4e79b';map.beginPath();map.moveTo(0,-6);map.lineTo(-4,4);map.lineTo(4,4);map.fill();map.restore();
 }
 return {setWorld,render,resize,dispose(){observer.disconnect();sun.shadow.dispose();const gs=new Set(),ms=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);});for(const g of gs)g.dispose();for(const m of ms)if(!a.materials.has(m))m.dispose();a.dispose();renderer.dispose();}};
}
