import {$,el,Client,Run,validQuestions,endpointOrigin,download} from './core.js';
import {initRace} from './race.js';
import {initPaint} from './paint.js';
import {initVortex} from './vortex.js';
import {initChat} from './chat.js';
import {initGreenLight} from './green-light.js';
import {initPacman} from './pacman.js';

const defaults={url:'http://alien.local:8000',protocol:'systemone',concurrency:2,timeout:30,model:'',key:''};
let saved={};try{saved=JSON.parse(localStorage.getItem('jev-infer.config')||'{}');}catch{}
const config={...defaults,...saved,key:''};let toastTimer,playRun=null,lastResult=null,total=0,totalMs=0;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,8000);}
const client=new Client(config,result=>{total++;totalMs+=result.ms;$('#session-metrics').textContent=`${total.toLocaleString()} requests · ${(totalMs/total).toFixed(0)} ms mean round trip`;$('#connection-dot').classList.add('ready');$('#connection-label').textContent=new URL(config.url).host;});
const race=initRace(client,toast),paint=initPaint(client,toast),vortex=initVortex(client,toast),chat=initChat(client,toast),green=initGreenLight(client,toast),pacman=initPacman(client,toast);
function stopAll(){playRun?.stop();race.stop();paint.stop();vortex.stop();chat.stop();green.stop();pacman.stop();}
function tab(id){if(!['playground','drive','paint','tornado','chat','green-light','pacman'].includes(id))id='playground';for(const p of document.querySelectorAll('.pane'))p.classList.toggle('active',p.id===id);for(const b of document.querySelectorAll('.tab')){const active=b.dataset.tab===id;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');}race.setVisible(id==='drive');paint.setVisible(id==='paint');vortex.setVisible(id==='tornado');chat.setVisible(id==='chat');green.setVisible(id==='green-light');pacman.setVisible(id==='pacman');if(id!=='playground')playRun?.stop();history.replaceState(null,'','#'+id);}
for(const b of document.querySelectorAll('.tab'))b.onclick=()=>{tab(b.dataset.tab);window.scrollTo(0,0);};$('.brand').onclick=e=>{e.preventDefault();tab('playground');window.scrollTo(0,0);};
window.addEventListener('hashchange',()=>tab(location.hash.slice(1)));window.addEventListener('pagehide',stopAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)race.stop();});

const presets={
  support:{state:{message:'My order arrived with a cracked screen. I need a replacement before a work trip on Friday.',customer:'Returning customer',order_age_days:3},questions:{category:{type:'choice',instructions:'Which team should handle this ticket?',criteria:{RETURNS:'Damaged items, refunds or exchanges',SHIPPING:'Missing or delayed delivery',GENERAL:'Other questions'}},urgent:{type:'noul',instructions:'Does the customer need time-sensitive assistance?'},impact:{type:'score',instructions:'How serious is the issue for the customer?',criteria:['Minor inconvenience','Moderate inconvenience','Significant disruption','Unable to use product']}}},
  invoice:{state:{vendor:'Studio North',amount:840,currency:'USD',purchase_order:810,services:'Design retainer',approved_budget:1000,bank_details_changed:true},questions:{action:{type:'choice',instructions:'Choose the next action for this invoice.',criteria:{APPROVE:'All checks passed',REVIEW:'Human review needed',REJECT:'Clearly invalid'}},risk:{type:'noul',instructions:'Should the bank details be verified before paying?'},priority:{type:'score',instructions:'Rate the review priority.',criteria:['Low','Normal','High']}}},
  robot:{state:{battery_percent:18,carrying:'fragile glass',aisle:'blocked',human_nearby:true,charging_station_distance_m:7},questions:{action:{type:'choice',instructions:'Choose a safe next action.',criteria:{WAIT:'Stop and wait',ASK_HELP:'Request human help',CHARGE:'Go to charging station'}},safe_to_move:{type:'noul',instructions:'Is moving through this aisle safe right now?'},battery:{type:'score',instructions:'How urgent is charging?',criteria:['Not urgent','Soon','Urgent','Critical']}}},
  blank:{state:'',questions:{decision:{type:'choice',instructions:'What should happen next?',criteria:{YES:null,NO:null}}}}
};
function addQuestion(id='question_'+($('#question-list').children.length+1),q={type:'choice',instructions:'',criteria:{YES:null,NO:null}}){
  const card=el('div',{class:'question'}),top=el('div',{class:'question-top'}),name=el('input',{'aria-label':'Question ID',value:id}),type=el('select',{'aria-label':'Question type'});
  for(const [value,label]of [['choice','Choice'],['noul','Noul'],['score','Score']]){const option=el('option',{value},label);type.append(option);}type.value=q.type;
  const remove=el('button',{class:'close',title:'Remove question','aria-label':'Remove question'},'×');remove.onclick=()=>card.remove();top.append(name,type,remove);
  const instructions=el('textarea',{'aria-label':'Question instructions',rows:'2',placeholder:'What should the model judge?'});instructions.value=q.instructions||'';
  const criteria=el('textarea',{class:'criteria','aria-label':'Criteria, one per line',rows:'3'});criteria.value=q.type==='score'?q.criteria.join('\n'):q.type==='choice'?Object.entries(q.criteria).map(([k,v])=>k+(v?': '+v:'')).join('\n'):'';
  const update=()=>{criteria.hidden=type.value==='noul';criteria.placeholder=type.value==='score'?'Ordered levels, one per line (2–10)':'LABEL: description, one per line';};type.onchange=()=>{if(!criteria.value)criteria.value=type.value==='score'?'Low\nMedium\nHigh':'YES\nNO';update();};update();card.append(top,instructions,criteria);$('#question-list').append(card);
  card.read=()=>{const question={type:type.value,instructions:instructions.value};if(type.value!=='noul'){const lines=criteria.value.split('\n').map(x=>x.trim()).filter(Boolean);if(type.value==='score')question.criteria=lines;else {const entries=lines.map(line=>{const i=line.indexOf(':');return i<0?[line,null]:[line.slice(0,i).trim(),line.slice(i+1).trim()||null];});if(entries.some(([k])=>!k)||new Set(entries.map(([k])=>k)).size!==entries.length)throw Error('Choice labels must be nonempty and distinct.');question.criteria=Object.fromEntries(entries);}}return [name.value.trim(),question];};
}
function readSetup(){const value=$('#state-input').value;let state=value;try{state=JSON.parse(value);}catch{}const entries=[...$('#question-list').children].map(n=>n.read());if(new Set(entries.map(([k])=>k)).size!==entries.length)throw Error('Question IDs must be distinct.');const questions=validQuestions(Object.fromEntries(entries));return {state,questions};}
function applySetup(setup){validQuestions(setup.questions);$('#state-input').value=typeof setup.state==='string'?setup.state:JSON.stringify(setup.state,null,2);$('#question-list').replaceChildren();for(const [id,q]of Object.entries(setup.questions))addQuestion(id,q);}
$('#preset').onchange=()=>applySetup(presets[$('#preset').value]);$('#add-question').onclick=()=>{if($('#question-list').children.length>=32)return toast('Maximum 32 questions per request.');addQuestion();};
function renderAnswers(result,questions){$('#answers').replaceChildren();for(const [id,a]of Object.entries(result.answers)){
  const card=el('article',{class:'answer'}),head=el('div',{class:'answer-title'});head.append(el('h3',{},id),el('span',{class:'answer-type'},a.type));card.append(head);
  const big=el('div',{class:'answer-big'});big.append(document.createTextNode(a.type==='noul'?(a.noul*100).toFixed(1)+'%':a.type==='score'?a.score.toFixed(2):a.choice));big.append(el('small',{},a.type==='noul'?'P(true)':a.partial?'Selected score only':a.type==='score'?`out of ${questions[id].criteria.length-1}`:`confidence ${(a.confidence*100).toFixed(1)}%`));card.append(big);
  const probs=a.type==='noul'?{True:a.noul,False:1-a.noul}:a.partial?{[a.choice]:a.selectedProbability}:a.probabilities;
  for(const [key,p]of Object.entries(probs)){const row=el('div',{class:'prob-row'}),bar=el('div',{class:'bar'}),fill=el('i');fill.style.width=p*100+'%';bar.append(fill);row.append(el('span',{},a.type==='score'?(questions[id].criteria[Number(key)]||key):key),el('span',{},(p*100).toFixed(2)+'%'),bar);card.append(row);}
  if(a.partial)card.append(el('p',{class:'micro'},'Decision reports the selected probability, not a full distribution.'));$('#answers').append(card);
}}
$('#run-play').onclick=async()=>{if(playRun)return;let setup;try{setup=readSetup();}catch(e){return toast(e.message);}const current=new Run();playRun=current;$('#run-play').disabled=true;$('#stop-play').disabled=false;$('#play-latency').textContent='Inferring…';
  try{lastResult=await client.infer(setup.state,setup.questions,current.signal);if(current.signal.aborted)return;renderAnswers(lastResult,setup.questions);$('#raw-output').textContent=JSON.stringify({request:lastResult.request,response:lastResult.raw},null,2);$('#play-latency').textContent=Math.round(lastResult.ms)+' ms';$('#export-result').disabled=false;}
  catch(e){$('#play-latency').textContent=current.signal.aborted?'Stopped':'Request failed';if(!current.signal.aborted)toast(e.message);}
  finally{playRun=null;$('#run-play').disabled=false;$('#stop-play').disabled=true;}
};$('#stop-play').onclick=()=>playRun?.stop();
$('#export-schema').onclick=()=>{try{download('jev-setup.json',readSetup());}catch(e){toast(e.message);}};$('#export-result').onclick=()=>{if(lastResult)download('jev-result.json',lastResult);};
$('#import-schema').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>1024*1024)throw Error('Setup files must be smaller than 1 MiB.');applySetup(JSON.parse(await file.text()));$('#preset').value='blank';}catch(e){toast(e.message);}};
function showSettings(){for(const [id,k]of [['url','url'],['protocol','protocol'],['concurrency','concurrency'],['timeout','timeout'],['model','model'],['key','key']])$('#endpoint-'+id).value=config[k];$('#settings').showModal();}
$('#settings-open').onclick=showSettings;
$('#endpoint-save').onclick=async()=>{let next;try{const timeout=Number($('#endpoint-timeout').value);if(!Number.isFinite(timeout)||timeout<5||timeout>180)throw Error('Timeout must be 5–180 seconds.');next={url:endpointOrigin($('#endpoint-url').value),protocol:$('#endpoint-protocol').value,concurrency:Number($('#endpoint-concurrency').value),timeout,model:$('#endpoint-model').value.trim(),key:$('#endpoint-key').value.trim()};}catch(e){return toast(e.message);}
  stopAll();Object.assign(config,next);try{const {key,...persist}=config;localStorage.setItem('jev-infer.config',JSON.stringify(persist));}catch{}$('#endpoint-save').disabled=true;$('#settings-status').textContent='Checking health…';$('#connection-dot').classList.remove('ready');$('#connection-label').textContent=new URL(config.url).host;
  try{await client.request('/health');$('#connection-dot').classList.add('ready');$('#settings-status').textContent='Endpoint reachable. Your next inference will verify the selected Jev API.';toast('Endpoint connected.');}catch(e){$('#settings-status').textContent=e.message;}finally{$('#endpoint-save').disabled=false;}
};
$('#forget').onclick=()=>{stopAll();try{localStorage.removeItem('jev-infer.config');}catch{}Object.assign(config,defaults);$('#connection-label').textContent='Connect endpoint';$('#connection-dot').classList.remove('ready');$('#endpoint-key').value='';toast('Saved connection settings cleared. CSV results are managed separately.');};
applySetup(presets.support);tab(location.hash.slice(1));
