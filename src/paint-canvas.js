// Minecraft texture coordinates (64x64, classic or slim); no renderer dependency.
export function skinRegions(slim=false) {
  const parts=[['Head',0,0,8,8,8,32,0],['Body',16,16,8,12,4,16,32],['Right arm',40,16,slim?3:4,12,4,40,32],['Left arm',32,48,slim?3:4,12,4,48,48],['Right leg',0,16,4,12,4,0,32],['Left leg',16,48,4,12,4,0,48]];
  const regions=[];
  for(const [part,u,v,w,h,d,ou,ov] of parts)for(const [layer,x,y] of [['Base',u,v],['Outer',ou,ov]]){
    const faces=[['Top',x+d,y,w,d],['Bottom',x+d+w,y,w,d],['Right',x,y+d,d,h],['Front',x+d,y+d,w,h],['Left',x+d+w,y+d,d,h],['Back',x+2*d+w,y+d,w,h]];
    for(const [face,rx,ry,width,height]of faces)regions.push({name:`${part} / ${layer} / ${face}`,part,layer,face,x:rx,y:ry,width,height});
  }
  return regions;
}
export function canvasLayout(kind='square',width=16,height=width,regions=[]) {
  if(kind==='classic'||kind==='slim')return {kind,width:64,height:64,regions:skinRegions(kind==='slim')};
  if(!['square','custom'].includes(kind))throw Error('Unknown canvas type.');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024)throw Error('Use whole canvas dimensions from 1 to 1,024 pixels.');
  if(!Array.isArray(regions)||regions.length>128)throw Error('Use up to 128 named rectangular regions.');
  const checked=regions.map(r=>{
    if(!r||typeof r.name!=='string'||!r.name.trim()||r.name.length>100||!['x','y','width','height'].every(k=>Number.isInteger(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>width||r.y+r.height>height)throw Error('Each region needs a name and integer x, y, width, height inside the canvas.');
    return {name:r.name,x:r.x,y:r.y,width:r.width,height:r.height};
  });
  if(new Set(checked.map(r=>r.name)).size!==checked.length)throw Error('Region names must be distinct.');
  return {kind,width,height,regions:checked};
}
export const contains=(r,x,y)=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height;
export function outputSize(layout,longEdge){const scale=longEdge/Math.max(layout.width,layout.height);return {width:Math.max(1,Math.round(layout.width*scale)),height:Math.max(1,Math.round(layout.height*scale))};}
export function selectedRegions(layout,selection='all') {
  if(selection==='all')return layout.regions.length?layout.regions:[{name:'Canvas',x:0,y:0,width:layout.width,height:layout.height}];
  if(selection==='base'||selection==='outer')return layout.regions.filter(r=>r.layer?.toLowerCase()===selection);
  if(selection.startsWith('part:'))return layout.regions.filter(r=>r.part===selection.slice(5)&&r.layer==='Base');
  return layout.regions.filter(r=>r.name===selection);
}
export function* canvasBatches(layout,selection='all',batch=16){
  const regions=selectedRegions(layout,selection);let pixels=[];
  for(let y=0;y<layout.height;y++)for(let x=0;x<layout.width;x++){
    const region=regions.find(r=>contains(r,x,y));if(!region)continue;
    pixels.push({index:y*layout.width+x,x,y,region:region.name});
    if(pixels.length===batch){yield pixels;pixels=[];}
  }
  if(pixels.length)yield pixels;
}
export function selectionCount(layout,selection){let count=0;for(const pixels of canvasBatches(layout,selection,256))count+=pixels.length;return count;}
export function hexAt(data,width,x,y){const i=(y*width+x)*4;return '#'+Array.from(data.subarray(i,i+4),v=>v.toString(16).padStart(2,'0')).join('');}
export function paintState(layout,data,pixels,prompt,palette){
  const regions=[...new Set(pixels.map(p=>p.region))].map(name=>selectedRegions(layout,'all').find(r=>r.name===name));
  const context=regions.filter(Boolean).map(r=>{
    const step=Math.max(1,Math.ceil(Math.max(r.width,r.height)/16)),rows=[];
    for(let y=r.y;y<r.y+r.height;y+=step){const row=[];for(let x=r.x;x<r.x+r.width;x+=step)row.push(hexAt(data,layout.width,x,y));rows.push(row);}
    return {...r,sample_step:step,current_rgba_rows:rows};
  });
  return {artwork:prompt,canvas:{kind:layout.kind,width:layout.width,height:layout.height,origin:'top left'},palette,regions:context,pixels:pixels.map(p=>({...p,current:hexAt(data,layout.width,p.x,p.y),neighbors:[[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dy])=>{const x=p.x+dx,y=p.y+dy;return x<0||y<0||x>=layout.width||y>=layout.height?null:hexAt(data,layout.width,x,y);})})),instructions:'Edit only the requested pixels. Use the current RGBA colors and neighboring pixels to make a coherent image matching the artwork description. A KEEP choice preserves the exact existing pixel. A CLEAR choice makes an outer-layer pixel transparent. Skin coordinates are a flat UV texture, not a drawing of a person.'};
}
export function applyPaintAnswer(data,index,answer,palette,color){
  if(answer.choice==='KEEP')return;
  if(answer.choice==='CLEAR'){data.fill(0,index*4,index*4+4);return;}
  data.set([...color(answer,palette),255],index*4);
}
