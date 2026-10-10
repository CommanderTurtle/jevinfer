import {$,Run,pool,choice,download} from './core.js';

export const palettes={candy:{PAPER:'#fff4df',PINK:'#ef80ab',RED:'#d85153',GOLD:'#e8b951',GREEN:'#71986d',BLUE:'#527fa7',PURPLE:'#87739c',INK:'#333346'},earth:{CREAM:'#ede5cc',OCHRE:'#ca9847',CLAY:'#ad6254',OLIVE:'#7b8752',FOREST:'#3a6354',SKY:'#81b4be',OCEAN:'#39678a',CHARCOAL:'#323c43'},mono:{PAPER:'#faf6ed',INK:'#272630'}};
export function* pixelBatches(grid,batch=16){for(let offset=0;offset<grid*grid;offset+=batch){const pixels=[];for(let i=offset;i<Math.min(grid*grid,offset+batch);i++)pixels.push({index:i,x:i%grid,y:Math.floor(i/grid)});yield pixels;}}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export function pixelColor(answer,palette,blend){if(!blend||answer.partial)return rgb(palette[answer.choice]);const out=[0,0,0];for(const [color,p]of Object.entries(answer.probabilities)){rgb(palette[color]).forEach((v,i)=>out[i]+=v*p);}return out.map(Math.round);}
function rand(seed){let n=seed|0;return ()=>{n=(n*1664525+1013904223)|0;return(n>>>0)/4294967296;};}
export function initPaint(client,toast){
  const canvas=$('#paint-canvas'),ctx=canvas.getContext('2d');let run=null,painting=null,complete=0;
  function estimate(){const n=Number($('#paint-grid').value);$('#paint-estimate').textContent=`${(n*n).toLocaleString()} inferred pixels · ${Math.ceil(n*n/16).toLocaleString()} requests · 16 independent questions per request. Larger grids take longer.`;}
  function draw(){const size=Number($('#paint-size').value);if(canvas.width!==size){canvas.width=canvas.height=size;}ctx.fillStyle='#fffaf2';ctx.fillRect(0,0,size,size);if(!painting)return;
    const cell=size/painting.grid,style=$('#paint-surface').value;for(const [key,answer]of Object.entries(painting.pixels)){const i=Number(key),x=i%painting.grid,y=Math.floor(i/painting.grid),color=pixelColor(answer,painting.palette,style==='blend');ctx.fillStyle=`rgb(${color})`;ctx.fillRect(x*cell,y*cell,Math.ceil(cell),Math.ceil(cell));}
    if(style==='splatter')for(const [key,answer]of Object.entries(painting.pixels)){const i=Number(key),x=i%painting.grid,y=Math.floor(i/painting.grid),random=rand(i+7103),color=pixelColor(answer,painting.palette,false);ctx.fillStyle=`rgba(${color},.65)`;for(let dot=0;dot<13;dot++){ctx.beginPath();ctx.ellipse((x+random()*1.8-.4)*cell,(y+random()*1.8-.4)*cell,cell*(.012+random()*.075),cell*(.009+random()*.045),random()*6,0,Math.PI*2);ctx.fill();}}
  }
  function lock(value){for(const id of ['paint-start','paint-grid','paint-palette','paint-prompt'])$('#'+id).disabled=value;$('#paint-stop').disabled=!value;}
  function stop(){run?.stop();}
  async function start(){if(run)return;const prompt=$('#paint-prompt').value.trim();if(!prompt)return toast('Describe a picture first.');const current=new Run();run=current;lock(true);complete=0;const started=performance.now();painting={prompt,grid:Number($('#paint-grid').value),palette:{...palettes[$('#paint-palette').value]},protocol:client.config.protocol,pixels:{},requests:[],complete:false};$('#paint-watermark').hidden=true;$('#paint-status').textContent='Mixing possibilities';$('#paint-data').disabled=true;draw();
    try{await pool(pixelBatches(painting.grid),client.config.concurrency,current,async pixels=>{
      const state={artwork:prompt,grid:{width:painting.grid,height:painting.grid,origin:'top left',x:'increases right',y:'increases downward'},palette:painting.palette,instructions:'Imagine one coherent simple illustration on this entire grid. Each question independently asks the color at a coordinate in that same illustration.'};
      const questions=Object.fromEntries(pixels.map(p=>['p'+p.index,choice(`At pixel x=${p.x}, y=${p.y} on this ${painting.grid} by ${painting.grid} image, which palette color best belongs here?`,Object.keys(painting.palette))]));
      const result=await client.infer(state,questions,current.signal);if(current.signal.aborted)return;
      for(const p of pixels)painting.pixels[p.index]=result.answers['p'+p.index];complete+=pixels.length;painting.requests.push({pixels:pixels.map(p=>p.index),ms:result.ms});$('#paint-progress').textContent=`${complete.toLocaleString()} / ${(painting.grid**2).toLocaleString()} pixels inferred`;$('#paint-time').textContent=`${((performance.now()-started)/1000).toFixed(1)} s elapsed`;$('#paint-status').textContent=`Painting · ${Math.round(complete/painting.grid**2*100)}%`;draw();
    });painting.complete=true;$('#paint-status').textContent='A happy little inference';}
    catch(e){$('#paint-status').textContent=e.name==='AbortError'?'Stopped · partial artwork':'Interrupted · partial artwork';if(e.name!=='AbortError')toast(e.message);}
    finally{run=null;lock(false);$('#paint-data').disabled=!complete;}
  }
  $('#paint-start').onclick=start;$('#paint-stop').onclick=stop;$('#paint-grid').onchange=estimate;$('#paint-size').onchange=draw;$('#paint-surface').onchange=draw;
  $('#paint-export').onclick=()=>canvas.toBlob(blob=>{if(blob)download('jev-paint.png',blob);},'image/png');$('#paint-data').onclick=()=>{if(painting)download('jev-paint-scores.json',painting);};
  estimate();draw();return {stop,setVisible(value){if(!value)stop();}};
}
