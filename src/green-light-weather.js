import * as THREE from '../vendor/three.js';

export function createWetLens(renderer){
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:2}),size=new THREE.Vector2();
 const beads=Array.from({length:16},(_,i)=>({x:Math.random(),y:.08+Math.random()*.8,r:i<10?1.5+Math.random()*1.6:3.5+Math.random()*2.5,offset:Math.random()*20,life:12+Math.random()*14}));
 const drops=beads.map(()=>new THREE.Vector4()),uniforms={image:{value:target.texture},resolution:{value:new THREE.Vector2(1,1)},drops:{value:drops}};
 const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`uniform sampler2D image;uniform vec2 resolution;uniform vec4 drops[16];varying vec2 vUv;
   void main(){vec2 bend=vec2(0.);float glint=0.;float shade=0.;
    for(int i=0;i<16;i++){
     vec4 d=drops[i];vec2 p=(vUv-d.xy)*resolution;
     if(abs(p.x)>d.z*1.5||p.y< -d.z*1.7||p.y>d.z*6.)continue;
     vec2 q=p/vec2(d.z,d.z*(i<10?1.05:1.45));q.x+=.1*sin(q.y*2.5+float(i));float r=dot(q,q);
     if(r<1.){float mask=(1.-smoothstep(.6,1.,r))*d.w;
      bend-=p*.45*sqrt(1.-r)*mask;
      vec2 h=(q-vec2(-.26,.3))*vec2(8.,13.);glint+=exp(-dot(h,h))*.13*mask;
      shade+=max(0.,-q.y)*.025*mask;
     }
     if(i>=10&&p.y>0.){float trail=exp(-p.x*p.x/1.6)*(1.-smoothstep(d.z,d.z*6.,p.y))*d.w;
      bend.x+=trail*p.x*.24;glint+=trail*.004;
     }
    }
    gl_FragColor=vec4(texture2D(image,clamp(vUv+bend/resolution,vec2(.001),vec2(.999))).rgb*(1.-shade)+glint,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
 const screen=new THREE.Scene(),camera=new THREE.Camera(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;screen.add(quad);
 function render(scene,eye,time,reduceMotion){
  renderer.getDrawingBufferSize(size);
  if(target.width!==size.x||target.height!==size.y){target.setSize(size.x,size.y);uniforms.resolution.value.copy(size);}
  const ratio=renderer.getPixelRatio();
  beads.forEach((b,i)=>{
   const age=((reduceMotion?8:time)+b.offset)%b.life/b.life,fall=i<10?0:Math.pow(Math.max(0,(age-.55)/.45),2)*.3;
   const visible=Math.min(1,age*7)*Math.min(1,(1-age)*8),growth=.6+Math.min(1,age*2)*.4;
   drops[i].set(b.x+Math.sin(fall*13+i)*fall*.01,1-b.y-fall,b.r*growth*ratio,visible);
  });
  renderer.setRenderTarget(target);renderer.render(scene,eye);renderer.setRenderTarget(null);renderer.render(screen,camera);
 }
 return {render,dispose(){target.dispose();quad.geometry.dispose();material.dispose();}};
}
