import {$,el,Run,pool,choice,download,Client} from './core.js';
import {canvasLayout,canvasBatches,selectedRegions,selectionCount,paintState,applyPaintAnswer,contains,outputSize} from './paint-canvas.js';

import {buildRequests,pack,palette as referencePalette} from './pigment/jev.mjs';
import {prepare} from './pigment/art.mjs';
export const palettes={reference:Object.fromEntries(Object.entries(referencePalette).map(([k,v])=>[k,'#'+v.map(n=>n.toString(16).padStart(2,'0')).join('')])),candy:{PAPER:'#fff4df',PINK:'#ef80ab',RED:'#d85153',GOLD:'#e8b951',GREEN:'#71986d',BLUE:'#527fa7',PURPLE:'#87739c',INK:'#333346'},earth:{CREAM:'#ede5cc',OCHRE:'#ca9847',CLAY:'#ad6254',OLIVE:'#7b8752',FOREST:'#3a6354',SKY:'#81b4be',OCEAN:'#39678a',CHARCOAL:'#323c43'},mono:{PAPER:'#faf6ed',INK:'#272630'},skin:{SKIN:'#dca477',LIGHT:'#f8ceac',SHADOW:'#9c664e',HAIR:'#4a3027',WHITE:'#f1eadc',BLACK:'#222334',BLUE:'#537aa6',GREEN:'#668c69',RED:'#bc535e',PINK:'#e490bd',GOLD:'#d9ba63',PURPLE:'#87729f'}};
export function* pixelBatches(grid,batch=16){for(const pixels of canvasBatches(canvasLayout('square',grid),'all',batch))yield pixels.map(({index,x,y})=>({index,x,y}));}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export function pixelColor(answer,palette,blend){if(!blend||answer.partial)return rgb(palette[answer.choice]);const out=[0,0,0];for(const [color,p]of Object.entries(answer.probabilities)){rgb(palette[color]).forEach((v,i)=>out[i]+=v*p);}return out.map(Math.round);}
export function surfacePixels(data,scores,blend){const pixels=data.slice();if(blend)for(const [index,a]of Object.entries(scores)){if(a.palette&&a.probabilities&&Object.keys(a.probabilities).every(k=>a.palette[k]))pixels.set([...pixelColor(a,a.palette,true),255],Number(index)*4);}return pixels;}
export function initPaint(client,toast){
  const canvas=$('#paint-canvas'),raw=document.createElement('canvas');
  let pigment=null,worker=null,lastPigment=null,pigmentEdge=0,blendPixels=null;
  let run=null,layout=canvasLayout(),data=new Uint8ClampedArray(layout.width*layout.height*4),scores={},history=[],complete=0,requests=[],stroke=false,dirty=false;
  const isSkin=()=>['classic','slim'].includes(layout.kind);
  const selection=()=>$('#paint-region').value;
  function stash(){history.push({data:data.slice(),scores:{...scores},pigment,lastPigment,pigmentEdge,blendPixels});if(history.length>10)history.shift();$('#paint-undo').disabled=false;}
  const newComposition=()=>!isSkin()&&!$('#paint-preserve').checked&&selection()==='all'&&!layout.regions.length;
  function estimate(){const n=selectionCount(layout,selection()),fresh=newComposition(),channels=['hsl','rgb'].includes($('#paint-method').value)?3:1;$('#paint-estimate').textContent=layout.width+'×'+layout.height+' · '+n.toLocaleString()+' pixels · '+Math.ceil(fresh?n*channels/30:n/16).toLocaleString()+' requests · /v1/'+(fresh?'systemone':client.config.protocol);}
  function regions(){const list=$('#paint-region');list.replaceChildren();const add=(value,label)=>list.append(el('option',{value},label));add('all',isSkin()?'All mapped faces + outer layers':layout.regions.length?'All named regions':'Entire canvas');if(isSkin()){add('base','All base faces');add('outer','All outer layers');for(const part of ['Head','Body','Right arm','Left arm','Right leg','Left leg'])add('part:'+part,part+' · base faces');}for(const r of layout.regions)add(r.name,r.name);if(isSkin())list.value='Head / Base / Front';estimate();}
  function syncRaw(){raw.width=layout.width;raw.height=layout.height;const blend=!isSkin()&&$('#paint-surface').value==='blend';raw.getContext('2d').putImageData(new ImageData(blend&&blendPixels?blendPixels:surfacePixels(data,scores,blend),layout.width,layout.height),0,0);}
  function render(target,guides=false){
    const c=target.getContext('2d'),w=target.width,h=target.height;c.clearRect(0,0,w,h);c.imageSmoothingEnabled=false;c.drawImage(raw,0,0,w,h);
    const cell=w/layout.width,style=$('#paint-surface').value;
    if(!isSkin()&&style==='splatter'&&pigment){c.imageSmoothingEnabled=true;c.drawImage(pigment,0,0,w,h);}

    if(guides&&$('#paint-guides').checked){const chosen=selectedRegions(layout,selection());c.lineWidth=Math.max(1,w/600);for(const r of layout.regions){c.strokeStyle=chosen.includes(r)?'#ed45bc':'#70809680';c.strokeRect(r.x*cell,r.y*cell,r.width*cell,r.height*cell);}}
  }
  function preview(){const target=$('#skin-preview');target.hidden=!isSkin();if(!isSkin())return;const c=target.getContext('2d');c.clearRect(0,0,target.width,target.height);c.imageSmoothingEnabled=false;const arm=layout.kind==='slim'?3:4;for(const [part,x,y,w,h]of [['Head',8,0,8,8],['Body',8,8,8,12],['Right arm',8-arm,8,arm,12],['Left arm',16,8,arm,12],['Right leg',8,20,4,12],['Left leg',12,20,4,12]])for(const layer of ['Base','Outer']){const r=layout.regions.find(r=>r.part===part&&r.layer===layer&&r.face==='Front');c.drawImage(raw,r.x,r.y,r.width,r.height,x*8,y*8,w*8,h*8);}}
  function draw(){syncRaw();const size=outputSize(layout,Math.min(1024,Number($('#paint-size').value)));canvas.width=size.width;canvas.height=size.height;render(canvas,true);preview();}
  function configure(next,pixels){pigment=null;lastPigment=null;blendPixels=null;pigmentEdge=0;layout=next;data=pixels||new Uint8ClampedArray(layout.width*layout.height*4);scores={};history=[];requests=[];complete=0;dirty=!!pixels;$('#paint-undo').disabled=true;$('#paint-data').disabled=true;$('#paint-watermark').hidden=!!pixels||isSkin();$('#paint-status').textContent=pixels?'Imported · ready to edit':'Blank canvas';$('#paint-progress').textContent='0 pixels inferred';$('#paint-time').textContent='—';regions();draw();}
  function readLayout(){const kind=$('#paint-template').value;return canvasLayout(kind,Number(kind==='square'?$('#paint-grid').value:$('#paint-width').value),Number(kind==='square'?$('#paint-grid').value:$('#paint-height').value),kind==='custom'?JSON.parse($('#paint-regions').value||'[]'):[]);}
  function controls(){const kind=$('#paint-template').value;$('#paint-custom').hidden=kind!=='custom';$('#paint-square').hidden=kind!=='square';$('#paint-surface').disabled=isSkin();$('#paint-method').disabled=!newComposition();$('#paint-palette').disabled=newComposition();$('#paint-export').textContent=isSkin()?'Save skin PNG · 64×64':'Save PNG';estimate();}
  function applyLayout(){try{const next=readLayout();if(dirty&&!confirm('Start a new canvas? Export the current image first if you want to keep it.'))return;configure(next);controls();}catch(e){toast(e.message);}}
  function lock(value){for(const field of document.querySelectorAll('#paint-controls input,#paint-controls textarea,#paint-controls select,#paint-controls button'))field.disabled=value;$('#paint-stop').disabled=!value;$('#paint-export').disabled=value;if(!value){controls();$('#paint-undo').disabled=!history.length;$('#paint-data').disabled=!complete;}}
  function stop(){run?.stop();worker?.terminate();worker=null;}
  async function texture(result,signal,longEdge=Math.min(1024,Number($('#paint-size').value))){
    if(signal?.aborted)throw new DOMException('Stopped','AbortError');
    lastPigment=result;const prepared=prepare(result);blendPixels=data.slice();
    prepared.pixels.forEach((p,i)=>blendPixels.set(p.mean.map(Math.round),i*4));
    return new Promise((resolve,reject)=>{
      const active=new Worker(new URL('./paint-worker.js',import.meta.url),{type:'module'});worker=active;
      const done=()=>{signal?.removeEventListener('abort',cancel);active.terminate();if(worker===active)worker=null;};
      const cancel=()=>{done();reject(new DOMException('Stopped','AbortError'));};
      signal?.addEventListener('abort',cancel,{once:true});
      active.onmessage=({data:r})=>{done();if(r.error)reject(Error(r.error));else{pigment=r.bitmap;pigmentEdge=longEdge;draw();resolve();}};
      active.onerror=()=>{done();reject(Error('Pigment renderer failed.'));};
      active.postMessage({result,longEdge});
    });
  }
  function editedComposition(palette){
    const names=Object.keys(palette),colors=Object.values(palette).map(rgb);
    return {method:'palette',size:layout.width,width:layout.width,height:layout.height,palette:colors,pixels:Array.from({length:layout.width*layout.height},(_,i)=>{
      const a=scores[i],rgba=Array.from(data.subarray(i*4,i*4+4));
      return a&&!a.partial&&rgba[3]&&names.every(n=>typeof a.probabilities?.[n]==='number')&&!a.probabilities.KEEP&&!a.probabilities.CLEAR
        ?{probabilities:names.map(n=>a.probabilities[n])}:{rgba};
    })};
  }
  async function composition(current,prompt,started){
    const method=$('#paint-method').value,answers={},total=layout.width*layout.height;
    const batches=buildRequests(prompt,method,layout.width,layout.height);
    const infer=new Client({...client.config,protocol:'systemone'},client.onResult);
    $('#paint-status').textContent='Inferring';
    await pool(batches,Math.min(4,client.config.concurrency),current,async batch=>{const result=await infer.infer(batch.state,batch.questions,current.signal);Object.assign(answers,result.answers);requests.push({ms:result.ms,questions:Object.keys(batch.questions).length});complete=Object.keys(answers).length/(method==='hsl'||method==='rgb'?3:1);$('#paint-progress').textContent=Math.floor(complete)+' / '+total+' pixels';$('#paint-time').textContent=((performance.now()-started)/1000).toFixed(1)+' s';});
    const result=pack(answers,method,layout.width,prompt,layout.height),prepared=prepare(result);
    for(let i=0;i<prepared.pixels.length;i++)data.set([...prepared.pixels[i].hard,255],i*4);
    scores=answers;dirty=true;draw();$('#paint-status').textContent='Rendering';await texture(result,current.signal);
  }
  async function start(){if(run)return;const prompt=$('#paint-prompt').value.trim();if(!prompt)return toast('Describe a picture or an edit first.');let next;try{next=readLayout();}catch(e){return toast(e.message);}if(next.width!==layout.width||next.height!==layout.height||next.kind!==layout.kind){if(dirty&&!confirm('Use the new canvas dimensions?'))return;configure(next);controls();}const total=selectionCount(layout,selection());if(!total)return toast('Select a mapped region.');if(total>16384&&!confirm('Infer '+total.toLocaleString()+' pixels in '+Math.ceil(total/16).toLocaleString()+' requests? This can take a long time.'))return;
    stash();const current=new Run();run=current;lock(true);complete=0;requests=[];const started=performance.now(),palette={...palettes[$('#paint-palette').value]},edit=$('#paint-preserve').checked,selected=selection(),base=data.slice();$('#paint-watermark').hidden=true;$('#paint-status').textContent='Inferring';pigment=null;lastPigment=null;blendPixels=null;pigmentEdge=0;
    try{if(newComposition()){await composition(current,prompt,started);}else await pool(canvasBatches(layout,selected),client.config.concurrency,current,async pixels=>{
      const options=[...Object.keys(palette),...(edit?['KEEP']:[])];if(isSkin()&&pixels.some(p=>p.region.includes(' / Outer / ')))options.push('CLEAR');
      // All requests in a pass use the same starting image, regardless of completion order.
      const state=paintState(layout,base,pixels,prompt,palette),questions=Object.fromEntries(pixels.map(p=>['p'+p.index,choice('Choose the color at x='+p.x+', y='+p.y+', '+p.region+'. '+(edit?'KEEP preserves this pixel if no change is needed.':'')+(options.includes('CLEAR')&&p.region.includes(' / Outer / ')?' CLEAR removes an outer-layer pixel.':''),options.filter(v=>v!=='CLEAR'||p.region.includes(' / Outer / ')))]));
      const result=await client.infer(state,questions,current.signal);if(current.signal.aborted)return;
      for(const p of pixels){const a=result.answers['p'+p.index];scores[p.index]={...a,palette};applyPaintAnswer(data,p.index,a,palette,pixelColor);}dirty=true;complete+=pixels.length;requests.push({pixels:pixels.map(p=>p.index),ms:result.ms});$('#paint-progress').textContent=complete.toLocaleString()+' / '+total.toLocaleString()+' pixels inferred';$('#paint-time').textContent=((performance.now()-started)/1000).toFixed(1)+' s elapsed';$('#paint-status').textContent='Painting · '+Math.round(complete/total*100)+'%';draw();
    });if(!isSkin()&&!lastPigment){$('#paint-status').textContent='Rendering';await texture(editedComposition(palette),current.signal);}$('#paint-status').textContent='Complete';}
    catch(e){$('#paint-status').textContent=e.name==='AbortError'?'Stopped · partial artwork':'Interrupted · partial artwork';if(e.name!=='AbortError')toast(e.message);}
    finally{run=null;lock(false);}
  }
  function brush(e){if(run||!stroke)return;const r=canvas.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/r.width*layout.width),y=Math.floor((e.clientY-r.top)/r.height*layout.height);if(!selectedRegions(layout,selection()).some(region=>contains(region,x,y)))return;const i=(y*layout.width+x)*4;if($('#paint-tool').value==='pick'){$('#paint-color').value='#'+Array.from(data.subarray(i,i+3),n=>n.toString(16).padStart(2,'0')).join('');return;}pigment=null;lastPigment=null;blendPixels=null;if($('#paint-tool').value==='erase')data.fill(0,i,i+4);else data.set([...rgb($('#paint-color').value),255],i);delete scores[y*layout.width+x];dirty=true;$('#paint-watermark').hidden=true;draw();}
  canvas.addEventListener('pointerdown',e=>{if(run)return;stash();stroke=true;canvas.setPointerCapture(e.pointerId);brush(e);});canvas.addEventListener('pointermove',brush);canvas.addEventListener('pointerup',()=>stroke=false);canvas.addEventListener('pointercancel',()=>stroke=false);
  $('#paint-start').onclick=start;$('#paint-stop').onclick=stop;$('#paint-apply').onclick=applyLayout;$('#paint-template').onchange=controls;$('#paint-grid').onchange=applyLayout;$('#paint-region').onchange=()=>{controls();draw();};$('#paint-size').onchange=draw;$('#paint-preserve').onchange=controls;$('#paint-method').onchange=estimate;$('#paint-surface').onchange=draw;$('#paint-guides').onchange=draw;
  $('#paint-undo').onclick=()=>{const old=history.pop();if(!old)return;data=old.data;scores=old.scores;pigment=old.pigment;lastPigment=old.lastPigment;pigmentEdge=old.pigmentEdge;blendPixels=old.blendPixels;dirty=true;$('#paint-undo').disabled=!history.length;draw();};
  $('#paint-export').onclick=async()=>{if(run)return;const sizeWanted=Number($('#paint-size').value);if(!isSkin()&&lastPigment&&$('#paint-surface').value==='splatter'&&pigmentEdge!==sizeWanted){const current=new Run();run=current;lock(true);try{await texture(lastPigment,current.signal,sizeWanted);}catch(e){if(e.name!=='AbortError')toast(e.message);return;}finally{run=null;lock(false);}}const out=document.createElement('canvas'),size=outputSize(layout,isSkin()?64:Number($('#paint-size').value));out.width=size.width;out.height=size.height;render(out);out.toBlob(blob=>{if(blob)download(isSkin()?'jev-skin.png':'jev-paint.png',blob);},'image/png');};
  $('#paint-data').onclick=()=>download('jev-paint-scores.json',{layout,prompt:$('#paint-prompt').value,protocol:lastPigment?.prompt?'systemone':client.config.protocol,composition:lastPigment,scores,requests});
  $('#paint-import').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file||run)return;let image;try{if(file.size>16*1024*1024)throw Error('Import a PNG up to 16 MiB.');if(file.type!=='image/png')throw Error('Please import a PNG image.');image=await createImageBitmap(file);const kind=$('#paint-template').value;if(['classic','slim'].includes(kind)&&(image.width!==64||image.height!==64))throw Error('Skin imports must be modern 64×64 PNGs. Choose Custom for other dimensions.');const next=canvasLayout(['classic','slim'].includes(kind)?kind:'custom',image.width,image.height);const tmp=document.createElement('canvas');tmp.width=image.width;tmp.height=image.height;const c=tmp.getContext('2d');c.drawImage(image,0,0);const pixels=c.getImageData(0,0,image.width,image.height).data;configure(next,pixels);$('#paint-template').value=next.kind;$('#paint-width').value=next.width;$('#paint-height').value=next.height;$('#paint-regions').value='[]';$('#paint-preserve').checked=true;controls();}catch(error){toast(error.message);}finally{image?.close();}};
  $('#paint-save-layout').onclick=()=>{try{const next=readLayout();localStorage.setItem('jev-infer.canvas',JSON.stringify(next));toast('Canvas dimensions and regions saved in this browser.');}catch(e){toast(e.message);}};
  $('#paint-load-layout').onclick=()=>{try{const saved=JSON.parse(localStorage.getItem('jev-infer.canvas')||'null');if(!saved)throw Error('Save a custom canvas first.');const next=canvasLayout(saved.kind,saved.width,saved.height,saved.regions);$('#paint-template').value=next.kind;$('#paint-grid').value=next.width;$('#paint-width').value=next.width;$('#paint-height').value=next.height;$('#paint-regions').value=JSON.stringify(next.regions,null,2);controls();toast('Saved layout loaded. Apply / New canvas when ready.');}catch(e){toast(e.message);}};
  regions();controls();draw();return {stop,setVisible(value){if(!value)stop();}};
}
