import * as T from '../vendor/three.js';

// All geometry and textures are generated locally; no model/texture downloads.
export function createAssets(){
 const materials=new Set(),textures=new Set(),cache=new Map();
 const material=(key,options)=>{key='material:'+key;if(!cache.has(key)){const m=new T.MeshPhysicalMaterial(options);cache.set(key,m);materials.add(m);}return cache.get(key);};
 function texture(key,paint,size=256){key='texture:'+key;if(cache.has(key))return cache.get(key);const c=document.createElement('canvas');c.width=c.height=size;paint(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;textures.add(t);cache.set(key,t);return t;}
 function mesh(parent,geo,mat,x=0,y=0,z=0){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function rounded(parent,x,y,z,w,h,d,mat,r=.08){return mesh(parent,new T.RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),mat,x,y,z);}
 const metal=()=>material('chrome',{color:'#b5c2ca',metalness:.95,roughness:.22});
 const rubber=()=>material('rubber',{color:'#11141b',roughness:.88});
 const glow=color=>material('glow'+color,{color,emissive:color,emissiveIntensity:3,roughness:.28});
 function loft(parent,rows,mat){
  const n=24,vertices=[],indices=[];
  for(const [z,width,center,height] of rows)for(let i=0;i<n;i++){const a=i/n*Math.PI*2;vertices.push(Math.cos(a)*width,center+Math.sin(a)*height,z);}
  for(let j=0;j<rows.length-1;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n,c=a+n,d=b+n;indices.push(a,b,c,b,d,c);}
  for(let i=1;i<n-1;i++){indices.push(0,i+1,i);const a=(rows.length-1)*n;indices.push(a,a+i,a+i+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return mesh(parent,g,mat);
 }
 function wheel(parent,x,z,kart){const pivot=new T.Group();pivot.position.set(x,.36,z);parent.add(pivot);const spin=new T.Group();pivot.add(spin);
  const tyre=mesh(spin,new T.CylinderGeometry(.35,.35,kart?.28:.23,32),rubber());tyre.rotation.z=Math.PI/2;
  for(const side of [-1,1]){const rim=mesh(spin,new T.TorusGeometry(.235,.025,8,24),metal(),side*.145,0,0);rim.rotation.y=Math.PI/2;for(let j=0;j<5;j++){const spoke=rounded(spin,side*.15,Math.cos(j*1.256)*.10,Math.sin(j*1.256)*.10,.02,.22,.035,metal(),.008);spoke.rotation.x=j*1.256;}const hub=mesh(spin,new T.CylinderGeometry(.07,.07,.025,12),metal(),side*.16,0,0);hub.rotation.z=Math.PI/2;}
  return {pivot,spin,front:z<0};
 }
 function vehicle(color,kart=false){
  const g=new T.Group(),paint=material('paint'+color,{color,metalness:.7,roughness:.24,clearcoat:1,clearcoatRoughness:.13}),glass=material('glass',{color:'#142334',metalness:.45,roughness:.08,clearcoat:1}),wheels=[];
  if(kart){
   loft(g,[[-1.3,.25,.39,.15],[-.8,.65,.4,.17],[.3,.65,.4,.17],[1.15,.6,.42,.18]],paint);
   rounded(g,0,.66,.25,.7,.35,.85,rubber());rounded(g,0,.8,1.1,1.8,.08,.38,paint);
   for(const x of [-.62,.62])rounded(g,x,.58,1.1,.06,.42,.08,metal());
   const driver=person(0,false);driver.scale.setScalar(.65);driver.position.set(0,.46,.22);g.add(driver);driver.userData.legs.forEach((l,i)=>{l.rotation.x=-1.2;l.position.z=-.1;});
   const helmet=mesh(g,new T.SphereGeometry(.25,24,16),paint,0,1.48,.2);helmet.scale.y=.88;
   rounded(g,0,1.45,-.015,.37,.13,.06,glass,.05);
   const engine=rounded(g,.55,.7,.7,.34,.3,.38,metal());for(let z=.52;z<.9;z+=.08)rounded(g,.74,.7,z,.035,.3,.025,rubber());
  }else{
   loft(g,[[-2.05,.55,.5,.15],[-1.8,.82,.55,.26],[-.9,.88,.59,.3],[.8,.88,.59,.31],[1.8,.82,.6,.28],[2.05,.62,.6,.2]],paint);
   loft(g,[[-1.05,.63,.88,.04],[-.56,.68,1.01,.32],[.5,.67,1.04,.35],[1.05,.65,.88,.07]],glass);
   rounded(g,0,1.32,.1,1.18,.065,.8,paint,.03);
   for(const x of [-.72,.72]){rounded(g,x,.86,.1,.035,.45,.06,paint,.01);rounded(g,x,.71,.5,.17,.025,.04,metal(),.008);const mirror=rounded(g,x*1.34,1,-.67,.23,.12,.2,paint,.055);}
   rounded(g,0,.4,-2.04,1.15,.15,.025,rubber(),.04);for(let x=-.5;x<.51;x+=.09)rounded(g,x,.4,-2.06,.028,.1,.02,metal(),.005);
   rounded(g,0,.51,2.05,.44,.13,.015,material('plate',{color:'#d8ded8',roughness:.7}),.01);
   for(const x of [-.55,.55]){rounded(g,x,.42,2.05,.13,.1,.12,metal(),.03);rounded(g,x,.69,-1.97,.44,.07,.08,glow('#c6e9ff'),.025);}
   rounded(g,0,.76,2.015,1.3,.055,.065,glow('#ff304c'),.02);
  }
  for(const x of [-.88,.88])for(const z of kart?[-.78,.81]:[-1.29,1.3])wheels.push(wheel(g,x,z,kart));
  g.userData.wheels=wheels;return g;
 }
 function person(index=0,pirate=false){
  const g=new T.Group(),skin=material('skin',{color:'#cba079',roughness:.8}),cloth=material('cloth'+index+pirate,{color:pirate?'#493b30':['#bf714e','#467f89','#7a507a'][index%3],roughness:.9}),pants=material('pants',{color:'#243345',roughness:.95});
  const torso=mesh(g,new T.CapsuleGeometry(.18,.35,4,12),cloth,0,1.02,0);torso.scale.z=.65;
  const head=mesh(g,new T.SphereGeometry(.17,18,12),skin,0,1.49,0);head.scale.z=.87;
  const hair=mesh(g,new T.SphereGeometry(.18,16,8,0,Math.PI*2,0,Math.PI*.54),material('hair',{color:'#281d18',roughness:1}),0,1.52,0);
  const legs=[],arms=[];for(const side of [-1,1]){
   const leg=new T.Group();leg.position.set(side*.11,.8,0);g.add(leg);mesh(leg,new T.CapsuleGeometry(.075,.5,3,10),pants,0,-.3,0);rounded(leg,0,-.64,-.04,.16,.13,.28,rubber(),.04);legs.push(leg);
   const arm=new T.Group();arm.position.set(side*.23,1.19,0);g.add(arm);mesh(arm,new T.CapsuleGeometry(.058,.4,3,10),cloth,0,-.22,0);mesh(arm,new T.SphereGeometry(.07,10,8),skin,0,-.46,0);arms.push(arm);
  }
  if(pirate){
   const hat=mesh(g,new T.ConeGeometry(.33,.09,3),material('hat',{color:'#29201a',roughness:.9}),0,1.7,0);hat.rotation.y=Math.PI;mesh(g,new T.CylinderGeometry(.19,.21,.14,16),cloth,0,1.71,0);
   const sash=rounded(g,0,.87,-.02,.4,.09,.25,material('sash',{color:'#9e2934',roughness:.85}),.02);
   for(let i=0;i<7;i++)mesh(g,new T.CapsuleGeometry(.025,.35,2,6),material('hair',{color:'#281d18',roughness:1}),Math.cos(i)*.17,1.35,.09+Math.sin(i)*.1);
  }
  g.userData={legs,arms};return g;
 }
 function animatePerson(g,time,pace=1){const {legs=[],arms=[]}=g.userData;legs.forEach((l,i)=>l.rotation.x=Math.sin(time*8+i*Math.PI)*.55*pace);arms.forEach((l,i)=>l.rotation.x=-Math.sin(time*8+i*Math.PI)*.55*pace);g.rotation.z=Math.sin(time*4)*.025*pace;}
 const asphalt=()=>material('asphalt',{color:'#515b65',metalness:.18,roughness:.33,bumpScale:.025,map:texture('asphalt-map',(c,s)=>{c.fillStyle='#737d86';c.fillRect(0,0,s,s);let seed=31;for(let i=0;i<22000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%s;seed=(seed*1664525+1013904223)>>>0;const y=seed%s;c.fillStyle=i%3?'#59657188':'#b2bfc866';c.fillRect(x,y,1,1);}c.strokeStyle='#34404a';c.lineWidth=.35;for(let i=0;i<6;i++){c.beginPath();c.moveTo(i*42,0);c.lineTo(i*43+6,s/2);c.lineTo(i*40,s);c.stroke();}})});
 function facade(neon,index){const m=material('facade'+neon+index,{color:neon?'#26324c':['#c1b5a3','#8b999e','#b29f8a'][index%3],roughness:.72,metalness:.12,map:texture('facade-map'+neon+index,(c,s)=>{
   c.fillStyle=neon?'#111927':'#444c51';c.fillRect(0,0,s,s);
   for(let y=0;y<s;y+=32)for(let x=0;x<s;x+=32){c.fillStyle=neon?'#242b39':'#9c9990';c.fillRect(x,y,32,4);c.fillRect(x,y,4,32);const lit=(x*3+y*7+index*13)%11<5;const grad=c.createLinearGradient(x,y,x+30,y+28);grad.addColorStop(0,lit?(neon?'#9fb7ea':'#9dadb5'):'#26313f');grad.addColorStop(1,lit?(neon?'#304b71':'#304450'):'#0d1924');c.fillStyle=grad;c.fillRect(x+6,y+6,22,24);c.fillStyle=lit?'#efc982':'#384553';c.fillRect(x+7,y+25,20,3);c.fillStyle='#080d1755';c.fillRect(x+17,y+5,1,25);}
  }),emissive:neon?'#8193b3':'#000000',emissiveIntensity:neon?.55:0});if(neon)m.emissiveMap=m.map;return m;}
 function tower(parent,x,z,w,d,h,index=0,neon=false){
  const g=new T.Group();g.position.set(x,0,z);parent.add(g);
  const wall=facade(neon,index%3);const shell=mesh(g,new T.BoxGeometry(w,h,d),wall,0,h/2,0);
  // UV repetition yields consistent floor/window dimensions on large facades.
  const uv=shell.geometry.attributes.uv;for(let i=0;i<uv.count;i++){uv.setXY(i,uv.getX(i)*w/8,uv.getY(i)*h/9);}uv.needsUpdate=true;
  const concrete=material('concrete',{color:'#68727d',roughness:.85});rounded(g,0,h+.25,0,w+.5,.5,d+.5,concrete,.12);
  rounded(g,0,h+1.3,0,w*.45,2,d*.35,concrete,.2);
  for(let a=-w/2;a<=w/2;a+=w/4)rounded(g,a,h/2,-d/2-.03,.13,h,.13,metal(),.025);
  if(index%3===0){const tank=mesh(g,new T.CylinderGeometry(1.2,1.2,2.4,20),material('tank',{color:'#604739',roughness:.86}),w*.2,h+2,0);mesh(g,new T.ConeGeometry(1.4,.7,20),concrete,w*.2,h+3.55,0);for(const dx of [-.8,.8])rounded(g,w*.2+dx,h+.4,0,.1,1,.1,metal());}
  if(neon){const m=glow(index%2?'#dc44b9':'#40c5e7');for(const side of [-1,1])rounded(g,side*(w/2+.05),h/2,-d/2,.075,h,.075,m,.01);rounded(g,0,h*.68,-d/2-.09,w,.1,.06,m,.01);}
  else{const awning=material('awning'+index%2,{color:index%2?'#274843':'#713e38',roughness:.8});for(let a=-w/2+3;a<w/2;a+=5){rounded(g,a,2.7,-d/2-.6,4,.2,1.4,awning,.05);rounded(g,a,1.3,-d/2-.02,3.1,2.4,.06,material('storeglass',{color:'#172d38',metalness:.5,roughness:.08}),.02);}}
  return g;
 }
 function tree(parent,x,z,size=1){
  const g=new T.Group();g.position.set(x,0,z);g.scale.setScalar(size);parent.add(g);
  const bark=material('bark',{color:'#4c4038',roughness:1});mesh(g,new T.CylinderGeometry(.12,.26,3.2,9),bark,0,1.6,0);
  for(let i=0;i<5;i++){const branch=mesh(g,new T.CylinderGeometry(.025,.10,1.7,7),bark,Math.sin(i*2.4)*.4,2.5,Math.cos(i*2.4)*.4);branch.rotation.set(Math.cos(i*2.4)*.6,0,Math.sin(i*2.4)*.6);}
  const leafMap=texture('foliage',(c,s)=>{let seed=71;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<190;i++){const angle=random()*Math.PI*2,r=Math.sqrt(random())*s*.44,x=s/2+Math.cos(angle)*r,y=s/2+Math.sin(angle)*r;c.fillStyle=['#365738','#587645','#768d54','#254530'][i%4];c.beginPath();c.ellipse(x,y,4+random()*7,2+random()*4,angle,0,Math.PI*2);c.fill();}},256);
  const leaf=material('leaf',{map:leafMap,alphaTest:.45,side:T.DoubleSide,roughness:.95}),foliage=new T.InstancedMesh(new T.PlaneGeometry(1.6,1.6),leaf,36),dummy=new T.Object3D();
  for(let i=0;i<36;i++){const u=(i+.5)/36,y=1-2*u,r=Math.sqrt(1-y*y),theta=i*2.39996;dummy.position.set(Math.cos(theta)*r*1.2,3.5+y*1.45,Math.sin(theta)*r*1.2);dummy.rotation.set(Math.sin(i)*.7,theta,Math.cos(i)*.6);dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);}
  foliage.castShadow=true;foliage.receiveShadow=true;g.add(foliage);return g;
 }
 function lightPool(parent,x,z,color,width=8,length=15){const tex=texture('pool',(c,s)=>{const g=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'#ffffffff');g.addColorStop(.3,'#ffffff55');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,s,s);});const m=new T.MeshBasicMaterial({map:tex,color,transparent:true,opacity:.18,depthWrite:false,blending:T.AdditiveBlending});materials.add(m);const p=mesh(parent,new T.PlaneGeometry(width,length),m,x,.022,z);p.rotation.x=-Math.PI/2;p.castShadow=false;return p;}
 return {materials,textures,material,texture,mesh,rounded,loft,vehicle,person,animatePerson,asphalt,facade,tower,tree,lightPool,metal,rubber,glow,dispose(){for(const m of materials)m.dispose();for(const t of textures)t.dispose();materials.clear();textures.clear();cache.clear();}};
}
