import {el,clamp} from './core.js';
import {panicAvailable} from './boat-physics.js';

export function manualInput(course,values,keys,currentLane=1){
 const down=(...names)=>names.some(k=>keys.has(k));
 const left=down('ArrowLeft','a'),right=down('ArrowRight','d');
 const steer=left?-1:right?1:Number(values.steer||0);
 const throttle=down('ArrowUp','w')?1:Number(values.throttle||0),brake=down('ArrowDown','s')?1:Number(values.brake||0);
 if(course==='traffic'||course==='race'||course==='kart-arcade')return {lane:left?0:right?2:Number(values.lane??currentLane),throttle:brake||down(' ')?'BRAKE':throttle?'ACCELERATE':'COAST',...(course==='kart-arcade'?{item:down('Shift')}: {})};
 if(course==='pirate')return {steer,sail:brake||down(' ')?0:throttle,port:down('q'),starboard:down('e'),...(down('x')?{panic:true}: {})};
 return {steer,throttle:down('r')?Math.max(.3,throttle):throttle,brake,gear:down('r')?'REVERSE':values.gear||'DRIVE',handbrake:down(' ')?'HOLD':'RELEASE',item:course==='kart'&&down('Shift')};
}

export function initManualControls(root,keys,isManual){
 let course='traffic',values={},inputs={},meters={},buttons=[],taps=new Set();
 function reset(next){
  course=next;values={steer:0,throttle:0,brake:0,lane:1,gear:'DRIVE'};inputs={};meters={};buttons=[];taps.clear();root.replaceChildren();
  const road=['traffic','race','kart-arcade'].includes(course),boat=course==='pirate';
  root.append(el('h3',{},boat?'Helm':road?'Lane controls':'Cockpit'));
  const axes=el('div',{class:'manual-axes'});root.append(axes);
  function slider(id,name,min,max,step){
   const label=el('label',{}),heading=el('span',{},name),output=el('output',{'aria-label':name+' applied'},'0'),input=el('input',{type:'range',min,max,step,value:values[id],'aria-label':name});
   heading.append(output);label.append(heading,input);axes.append(label);inputs[id]=input;meters[id]=output;
   input.oninput=()=>values[id]=Number(input.value);
  }
  if(road){const lanes=el('div',{class:'button-row'});root.append(lanes);for(const [i,name]of ['Left lane','Centre lane','Right lane'].entries()){const b=el('button',{'aria-pressed':String(i===1),'data-lane':i},name);b.onclick=()=>values.lane=i;lanes.append(b);buttons.push(b);}}
  else slider('steer',boat?'Rudder':'Wheel',-1,1,.01);
  slider('throttle',boat?'Sail':'Accelerator',0,1,road?1:.01);
  if(!boat)slider('brake','Service brake',0,1,road?1:.01);
  if(!road&&!boat){
   const label=el('label',{},'Gear'),select=el('select',{'aria-label':'Gear'});for(const gear of ['DRIVE','REVERSE'])select.append(el('option',{value:gear},gear));select.onchange=()=>values.gear=select.value;label.append(select);root.append(label);inputs.gear=select;
  }
  const pad=el('div',{class:'drive-pad'});root.append(pad);
  const controls=boat?[['a','Port','A / ←'],['w','Full sail','W / ↑'],['d','Starboard','D / →'],[' ','Furl','Space'],['q','Port fire','Q'],['e','Starboard fire','E'],['x','Last stand','X']]:
   [['a',road?'Left lane':'Wheel left','A / ←'],['w','Accelerate','W / ↑'],['d',road?'Right lane':'Wheel right','D / →'],['s','Brake','S / ↓'],...(!road?[['r','Reverse','R'],[' ',course==='kart'?'Drift':'E-brake','Space']]:[]),...(course.startsWith('kart')?[['Shift','Use item','Shift']]:[])];
  for(const [key,name,hint]of controls){
   const b=el('button',{'data-drive-key':key,'aria-label':name},name);b.append(el('kbd',{},hint));pad.append(b);buttons.push(b);
   b.onpointerdown=e=>{if(!isManual())return;e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(key);};
   b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>keys.delete(key);
   b.onclick=()=>{if(isManual())taps.add(key);};
  }
  const release=el('button',{class:'quiet'},'Release controls');release.onclick=clear;root.append(release);buttons.push(release);
 }
 function clear(){keys.clear();taps.clear();for(const k of ['steer','throttle','brake']){values[k]=0;if(inputs[k])inputs[k].value=0;}}
 function draw(command,world){
  const manual=isManual();for(const input of Object.values(inputs))input.disabled=!manual;for(const b of buttons)b.disabled=!manual;
  const boat=course==='pirate',road=['traffic','race','kart-arcade'].includes(course);
  const c=world.controls||command||{};
  const actual={steer:c.appliedSteer??c.steer??0,throttle:boat?c.sail||0:road?(command?.throttle==='ACCELERATE'?1:0):c.throttle||0,brake:road?(command?.throttle==='BRAKE'?1:0):c.brake||0};
  for(const [id,out]of Object.entries(meters)){out.value=Math.round(clamp(actual[id],-1,1)*100)+'%';if(!manual&&inputs[id])inputs[id].value=actual[id];}
  for(const b of buttons)if(b.dataset.driveKey)b.setAttribute('aria-pressed',String(manual&&keys.has(b.dataset.driveKey)));
  for(const b of buttons)if(b.dataset.driveKey==='x'){b.hidden=!panicAvailable(world);b.disabled=!manual||b.hidden;}
  for(const b of buttons)if(b.dataset.lane!==undefined)b.setAttribute('aria-pressed',String(Number(b.dataset.lane)===(manual?values.lane:command?.lane)));
 }
 return {reset,clear,draw,read(world){
  const input=manualInput(course,values,new Set([...keys,...taps]),world.x);
  if(taps.has(' ')&&!keys.has(' ')&&course!=='pirate'&&course!=='traffic'&&course!=='race')input.handbrake='PULSE';
  if(['traffic','race','kart-arcade'].includes(course))values.lane=input.lane;
  taps.clear();return input;
 }};
}
