import {$,el,download} from './core.js';
import {ChatReplay,parseChat,schedule,presets,makeQuestions,sampleChat,barrageChat,filterRecord} from './chat-engine.js';
import {longTestChat} from './chat-fixtures.js';

export function initChat(client,toast) {
  let replay=null,setup=null,visible=false,frame=0,lastDraw=0,kept=0,held=0,totalRtt=0,totalBuffer=0,rttCount=0,releaseCount=0,latestError='';
  const raw=$('#chat-raw'),filtered=$('#chat-filtered'),source=$('#chat-source');
  const historyLimit=120,colors=['#bb98ff','#5cd7be','#f5a5ca','#ffc575','#79c5ff'];
  const editable=[...document.querySelectorAll('#chat-source-config input,#chat-source-config textarea,#chat-source-config select,#chat-source-config button,#chat-policy-config input,#chat-policy-config textarea,#chat-policy-config select')];
  function preset(){const p=presets[$('#chat-preset').value];$('#chat-context').value=p.context;$('#chat-instructions').value=p.instructions;$('#chat-criteria').value=JSON.stringify(p.criteria,null,2);$('#chat-keep').value=p.keep.join(', ');$('#chat-extras').value='{}';$('#chat-threshold').value='0';filterChips();}
  function append(list,node){list.querySelector('.chat-empty')?.remove();const bottom=$('#chat-follow').checked;list.append(node);while(list.children.length>historyLimit)list.firstElementChild.remove();if(bottom)list.scrollTop=list.scrollHeight;}
  function messageNode(record,buffered=false){
    const node=el('article',{class:'chat-message'+(buffered?' judged':'')+(record.error?' failed':'')});
    const head=el('div',{class:'chat-message-head'}),name=el('strong',{},record.message.user);name.style.color=colors[record.index%colors.length];
    head.append(name,el('time',{},(record.scheduledMs/1000).toFixed(2)+'s'));
    node.append(head,el('div',{class:'chat-text'},record.message.text));
    if(buffered){
      const tags=el('div',{class:'chat-message-tags'});
      if(record.error){tags.append(el('span',{class:'chat-category error'},'REQUEST FAILED'),el('span',{},record.error));}
      else {
        tags.append(el('span',{class:'chat-category'},record.category),el('span',{},`${(record.probability*100).toFixed(1)}% · ${Math.round((record.result.networkMs??record.result.ms))} ms HTTP`),el('span',{},record.kept?'KEPT':'HELD'));
        node.classList.toggle('held',!record.kept);
        const extra=Object.entries(record.result.answers).filter(([id])=>id!=='category').map(([id,a])=>`${id}: ${a.type==='noul'?(a.noul*100).toFixed(1)+'%':a.type==='score'?a.score.toFixed(2):a.choice}`);
        if(extra.length)tags.append(el('span',{},extra.join(' · ')));
      }
      tags.append(el('span',{},`${Math.round(record.bufferWallMs)} ms end-to-end`));node.append(tags);
      const details=el('details',{class:'chat-inspect'});details.append(el('summary',{},'Inspect judgment'),el('pre',{},JSON.stringify(record.result?{answers:record.result.answers,response:record.result.raw,timing:{queueMs:record.waitMs,httpMs:record.result.networkMs??record.result.ms,clientQueueMs:record.result.queueMs??0,outputMs:record.bufferWallMs}}:{error:record.error},null,2)));node.append(details);
    }
    return node;
  }
  function keepLabels(){return $('#chat-keep').value.split(',').map(x=>x.trim()).filter(Boolean);}
  function filterChips(){let labels;try{labels=Object.keys(JSON.parse($('#chat-criteria').value));}catch{return;}const selected=keepLabels();$('#chat-filter-chips').replaceChildren(...labels.map(label=>{const button=el('button',{type:'button','aria-pressed':String(selected.includes(label))},label);button.onclick=()=>{const keep=new Set(keepLabels());keep.has(label)?keep.delete(label):keep.add(label);$('#chat-keep').value=[...keep].join(', ');filterChips();reclassify();};return button;}));}
  function reclassify(){kept=held=0;for(const r of replay?.records||[])if(r?.delivered&&r.result){r.kept=filterRecord(r,keepLabels(),Number($('#chat-threshold').value)/100);r.kept?kept++:held++;}renderHistory();draw();}
  function shouldShow(record){return record.delivered&&($('#chat-show-held').checked||record.kept||record.error);}
  function release(record){
    if(record.result){const a=record.result.answers.category;record.category=a.choice;record.probability=a.partial?a.selectedProbability:a.probabilities[a.choice];record.kept=filterRecord(record,keepLabels(),Number($('#chat-threshold').value)/100);record.kept?kept++:held++;totalRtt+=record.result.networkMs??record.result.ms;rttCount++;}
    else {latestError=record.error;$('#chat-last-error').textContent=latestError;$('#chat-last-error').hidden=false;}
    totalBuffer+=record.bufferWallMs;releaseCount++;
    if(shouldShow(record))append(filtered,messageNode(record,true));
  }
  function renderHistory(){
    filtered.replaceChildren();if(!replay)return;
    const recent=[];for(const r of replay.records.filter(r=>r&&shouldShow(r)).sort((a,b)=>b.releasedMs-a.releasedMs||b.index-a.index).slice(0,historyLimit))recent.push(r);
    for(const r of recent.reverse())filtered.append(messageNode(r,true));filtered.scrollTop=filtered.scrollHeight;
  }
  function controls(){const running=replay&&!replay.stopped&&!replay.finished;for(const field of editable)if(!['chat-keep','chat-threshold'].includes(field.id))field.disabled=!!running;$('#chat-order').disabled=!!running;$('#chat-start').disabled=!!running;$('#chat-pause').disabled=!running;$('#chat-stop').disabled=!running;$('#chat-pause').textContent=replay?.pausedAt!==null&&running?'Resume':'Pause';$('#chat-export').disabled=!replay?.arrived;}
  function draw(){
    if(!replay){$('#chat-state').textContent='READY';return;}
    const s=replay.snapshot(),paused=replay.pausedAt!==null&&!s.finished&&!s.stopped;
    $('#chat-state').textContent=s.finished?'COMPLETE':s.stopped?'STOPPED':paused?'PAUSED':s.remaining?'REPLAYING':'DRAINING BUFFER';
    $('#chat-stage').classList.toggle('running',!s.finished&&!s.stopped&&!paused);
    for(const [key,value]of Object.entries({arrived:s.arrived,completed:s.completed,kept,held,queued:s.queued,inflight:s.inflight,errors:s.errors}))$('#chat-'+key).textContent=value.toLocaleString();
    $('#chat-rtt').textContent=rttCount?(totalRtt/rttCount).toFixed(0)+' ms':'—';
    $('#chat-lag').textContent=releaseCount?(totalBuffer/releaseCount).toFixed(0)+' ms':'—';
    $('#chat-elapsed').textContent=(s.elapsedMs/1000).toFixed(1)+'s';
    $('#chat-progress').value=s.completed;$('#chat-progress').max=replay.messages.length;
    $('#chat-caption').textContent=`${s.arrived.toLocaleString()} / ${replay.messages.length.toLocaleString()} arrivals · ${s.completed.toLocaleString()} judged · ${s.completed-s.released} waiting for an earlier result${s.cancelled?' · '+s.cancelled+' cancelled':''}${s.remaining&&s.stopped?' · '+s.remaining+' not sent':''}`;
    $('#chat-rate').textContent=s.elapsedMs>0?(s.completed/(s.elapsedMs/1000)).toFixed(1)+' /s':'0 /s';
    $('#chat-peak').textContent=s.peakQueue.toLocaleString();
    const outstanding=s.queued+s.inflight;
    $('#chat-buffer-dots').replaceChildren(...Array.from({length:Math.min(24,outstanding)},(_,i)=>el('i',{class:i<s.inflight?'working':'waiting'})));
    $('#chat-buffer-label').textContent=outstanding?`${s.queued} queued · ${s.inflight} in flight`:'Buffer clear';
    const period=setup.timing.period*1000/setup.timing.speed,duration=setup.timing.duration*1000/setup.timing.speed;
    const burst=setup.timing.mode==='bursts'&&!paused&&!s.stopped&&s.remaining>0&&s.elapsedMs%period>=period-duration;
    $('#chat-burst-live').textContent=burst?'BURST ×'+setup.timing.multiplier:setup.timing.mode==='timestamps'?'ORIGINAL TIMING':'SOURCE PACE';
    $('#chat-burst-live').classList.toggle('burst',burst);controls();
  }
  function loop(now){if(!visible){frame=0;return;}replay?.tick();if(now-lastDraw>100){draw();lastDraw=now;}frame=requestAnimationFrame(loop);}
  function stop(){replay?.stop();draw();controls();}
  function readSetup(){
    const messages=parseChat(source.value,$('#chat-format').value),criteria=JSON.parse($('#chat-criteria').value),questions=makeQuestions($('#chat-instructions').value,criteria,JSON.parse($('#chat-extras').value));
    const keep=$('#chat-keep').value.split(',').map(x=>x.trim()).filter(Boolean);if(keep.some(x=>!Object.hasOwn(criteria,x)))throw Error('Kept categories must match your category labels exactly.');
    const threshold=Number($('#chat-threshold').value)/100;if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw Error('Probability threshold must be 0–100%.');
    const timing={mode:$('#chat-timing').value,rate:Number($('#chat-arrival-rate').value),period:Number($('#chat-period').value),duration:Number($('#chat-duration').value),multiplier:Number($('#chat-multiplier').value),speed:Number($('#chat-speed').value)};
    return {messages,questions,keep,threshold,timing,times:schedule(messages,timing),workers:Number($('#chat-workers').value),context:$('#chat-context').value,protocol:client.config.protocol};
  }
  $('#chat-start').onclick=()=>{
    try {
      const next=readSetup();if(!Number.isSafeInteger(next.workers)||next.workers<0)throw Error('Use 0 for global capacity, or a positive worker limit.');
      stop();setup=next;kept=held=totalRtt=totalBuffer=rttCount=releaseCount=0;latestError='';$('#chat-last-error').hidden=true;raw.replaceChildren();filtered.replaceChildren();
      replay=new ChatReplay({messages:setup.messages,times:setup.times,workers:()=>setup.workers?Math.min(setup.workers,client.capacity):client.capacity,ordered:$('#chat-order').value==='ordered',infer:(message,signal)=>client.infer({stream_context:setup.context,username:message.user,message:message.text},setup.questions,signal),onArrival:record=>append(raw,messageNode(record)),onRelease:release,onChange:run=>{if(run.finished||run.stopped){draw();controls();}}});
      $('#chat-protocol').textContent='/v1/'+setup.protocol+' · '+(setup.workers||'global')+' workers';replay.tick();draw();controls();
    } catch(e){toast(e.message);}
  };
  $('#chat-stop').onclick=stop;
  $('#chat-pause').onclick=()=>{if(!replay)return;if(replay.pausedAt===null)replay.pause();else replay.resume();draw();controls();};
  $('#chat-preset').onchange=preset;
  $('#chat-show-held').onchange=renderHistory;$('#chat-keep').oninput=()=>{filterChips();reclassify();};$('#chat-threshold').oninput=reclassify;$('#chat-criteria').onchange=filterChips;$('#chat-follow').onchange=()=>{if($('#chat-follow').checked)for(const feed of [raw,filtered])feed.scrollTop=feed.scrollHeight;};$('#chat-barrage').onclick=()=>{source.value=barrageChat();$('#chat-format').value='plain';$('#chat-timing').value='bursts';$('#chat-source-note').textContent='1,344 messages · 7.7% signal prompts';};
  $('#chat-sample').onclick=()=>{source.value=sampleChat();$('#chat-format').value='plain';$('#chat-timing').value='bursts';$('#chat-source-note').textContent='288 messages';};
  $('#chat-long-test').onclick=()=>{source.value=longTestChat();$('#chat-format').value='plain';const switched=$('#chat-timing').value==='timestamps';if(switched)$('#chat-timing').value='bursts';$('#chat-source-note').textContent='1,344 messages'+(switched?' Using burst timing because this fixture has no timestamps.':'');source.focus();};
  $('#chat-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>16*1024*1024)throw Error('Chat files must be 16 MiB or smaller.');source.value=await file.text();$('#chat-source-note').textContent=`Loaded ${file.name}.`;}catch(error){toast(error.message);}};
  $('#chat-export').onclick=()=>{
    if(!replay||!setup)return;
    const {messages,times,...settings}=setup;settings.keep=keepLabels();settings.threshold=Number($('#chat-threshold').value)/100;settings.ordered=replay.ordered;
    const header={type:'replay',version:1,settings,metrics:{...replay.snapshot(),kept,held,meanHttpMs:rttCount?totalRtt/rttCount:null,meanOutputMs:releaseCount?totalBuffer/releaseCount:null},timing:'Arrival schedule uses active replay time; output delay is wall time after arrival, including pauses.'};
    const parts=[JSON.stringify(header)+'\n'];for(const record of replay.records)if(record){const {result,...rest}=record;parts.push(JSON.stringify({...rest,...(result?{answers:result.answers,response:result.raw,httpMs:result.ms}:{} )})+'\n');}
    download('jev-chat-replay.jsonl',new Blob(parts,{type:'application/x-ndjson'}));
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&replay&&!replay.finished&&!replay.stopped&&replay.pausedAt===null){replay.pause();draw();controls();toast('Chat replay paused while the page is hidden. Resume when ready.');}});
  preset();source.value=barrageChat();controls();
  return {stop,setVisible(value){visible=value;if(!value){stop();cancelAnimationFrame(frame);frame=0;}else if(!frame)frame=requestAnimationFrame(loop);}};
}
