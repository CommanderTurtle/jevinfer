import {test,expect} from 'bun:test';
import * as T from '../vendor/three.js';
import {createAssets} from '../src/scene-assets.js';
test('Generated loft normals face outwards, including both caps',()=>{
 const a=createAssets(),parent=new T.Group(),m=a.loft(parent,[[-1,1,0,1],[1,1,0,1]],a.metal()),p=m.geometry.attributes.position,n=m.geometry.attributes.normal;
 expect(n.getX(0)).toBeGreaterThan(0);for(let i=0;i<p.count;i++)expect(p.getX(i)*n.getX(i)+p.getY(i)*n.getY(i)).toBeGreaterThan(0);
 m.geometry.dispose();a.dispose();
});
test('Material and texture caches have distinct namespaces',()=>{
 const before=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({})})};
 try{const a=createAssets(),texture=a.texture('wood',()=>{}),material=a.material('wood',{map:texture});expect(texture.isTexture).toBe(true);expect(material.isMaterial).toBe(true);expect(material.map).toBe(texture);expect(a.material('wood',{})).toBe(material);a.dispose();}finally{globalThis.document=before;}
});
