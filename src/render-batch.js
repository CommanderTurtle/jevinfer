import * as T from '../vendor/three.js';
// Instance static boxes by material; dynamic actors remain separate objects.
export function batchBoxes(root,excluded=new Set()){
 root.updateMatrixWorld(true);const groups=new Map(),inverse=root.matrixWorld.clone().invert();
 function visit(o){if(excluded.has(o))return;if(o.isMesh&&o.geometry.type==='BoxGeometry'&&!Array.isArray(o.material)){const list=groups.get(o.material)||[];list.push(o);groups.set(o.material,list);}for(const child of o.children)visit(child);}
 for(const child of root.children)visit(child);
 for(const [material,meshes]of groups){if(meshes.length<3)continue;const batch=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material,meshes.length);meshes.forEach((m,i)=>{const p=m.geometry.parameters,transform=new T.Matrix4().multiplyMatrices(inverse,m.matrixWorld).scale(new T.Vector3(p.width,p.height,p.depth));batch.setMatrixAt(i,transform);m.removeFromParent();m.geometry.dispose();});batch.computeBoundingSphere();root.add(batch);}
}
