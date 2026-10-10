import {$,el,Run,pool,choice} from './core.js';
import {inspect,rows,Journal,sampleFile} from './data.js';
import {tornado,sparkline} from './visuals.js';

export function initVortex(client,toast){
  const exit=el('button',{id:'vortex-exit','aria-label':'Exit immersive view'},'↙ Exit');exit.onclick=()=>document.exitFullscreen();$('#vortex-stage').append(exit);
  const visual=tornado($('#tornado-canvas')),journal=new Journal(),cells=Array.from({length:64},()=>el('i'));
  $('#evidence-matrix').append(...cells);let file=null,run=null,runId=null,read=0,completed=0,errors=0,inflight=0,latencies=[],started=0,pausedAt=0,pauseMs=0,inspectVersion=0;
  function feed(text,error=false){const node=el('div',{},text);if(error)node.style.color='#ff687d';$('#vortex-feed').prepend(node);while($('#vortex-feed').children.length>7)$('#vortex-feed').lastChild.remove();}
  function metrics(){const seconds=Math.max(.001,((pausedAt||performance.now())-started-pauseMs)/1000);$('#vortex-completed').textContent=completed.toLocaleString();$('#vortex-errors').textContent=errors;$('#vortex-pending').textContent=inflight;$('#vortex-row').textContent=read.toLocaleString()+' rows read';$('#vortex-rate').textContent=(completed/seconds).toFixed(1)+' /s';}
  function lock(value){for(const id of ['vortex-start','data-file','sample-data','vortex-instructions','vortex-labels','vortex-pacing'])$('#'+id).disabled=value;for(const box of $('#column-picker').querySelectorAll('input'))box.disabled=value;$('#vortex-stop').disabled=!value;$('#vortex-pause').disabled=!value;}
  async function load(next){if(run)return toast('Stop the current stream before importing another file.');const version=++inspectVersion;file=null;$('#file-label').textContent='Reading preview…';$('#column-picker').replaceChildren();
    try{const preview=await inspect(next);if(version!==inspectVersion)return;file=next;$('#file-label').textContent=`${file.name} · ${(file.size/1024/1024).toFixed(2)} MiB`;for(const key of preview.keys){const box=el('input',{type:'checkbox',value:key,checked:''}),label=el('label');label.append(box,document.createTextNode(key));$('#column-picker').append(label);}$('#file-preview').textContent=`Previewed ${preview.examples.length} rows. ${preview.keys.length} columns detected in this preview. Choose which to send. First row: ${JSON.stringify(preview.examples[0]).slice(0,280)}`;}
    catch(e){if(version===inspectVersion){$('#file-label').textContent='Choose another file';$('#file-preview').textContent=e.message;toast(e.message);}}
  }
  function stop(){run?.stop();}
  async function start(){if(run)return;if(!file)return toast('Import a file or choose the synthetic sample CSV.');const selected=[...$('#column-picker').querySelectorAll('input:checked')].map(n=>n.value);if(!selected.length)return toast('Select at least one column to send.');const labels=$('#vortex-labels').value.split(',').map(x=>x.trim()).filter(Boolean);if(!labels.length||labels.length>32||new Set(labels).size!==labels.length)return toast('Use 1–32 distinct choices.');const instructions=$('#vortex-instructions').value.trim();if(!instructions)return toast('Add classification instructions.');
    const current=new Run();run=current;lock(true);runId=crypto.randomUUID();read=completed=errors=inflight=0;latencies=[];started=performance.now();pauseMs=pausedAt=0;$('#vortex-feed').replaceChildren();cells.forEach(c=>c.style.background='');$('#vortex-pause').textContent='Pause';$('#vortex-mode').textContent='LIVE / REAL INFERENCE';$('#vortex-render').textContent='PARTICLE FIELD · RESPONSE-DRIVEN ACTIVITY';$('#op-reader').textContent='STREAMING';$('#op-classifier').textContent='ACTIVE';$('#op-journal').textContent='OPENING';$('#vortex-export').disabled=true;$('#vortex-latest').textContent='Waiting for the first completed row';$('#vortex-choice').textContent='Reading data';$('#vortex-confidence').textContent='No results yet';metrics();sparkline($('#vortex-spark'),[]);
    try{await journal.open();$('#op-journal').textContent='RECORDING';localStorage.setItem('jev-infer.lastRun',runId);
      await pool(rows(file),client.config.concurrency,current,async item=>{
        read++;inflight++;metrics();const state=Object.fromEntries(selected.filter(k=>Object.hasOwn(item.row,k)).map(k=>[k,item.row[k]]));let result,error;
        try{result=await client.infer(state,{classification:choice(instructions,labels)},current.signal);}
        catch(e){if(current.signal.aborted)throw e;error=e.message;}
        finally{inflight--;}
        if(current.signal.aborted)return;
        // Persist before counting a completion; storage failure stops the stream.
        await journal.put({run:runId,index:item.index,state,...(error?{error}:{answer:result.answers.classification,ms:result.ms}),at:new Date().toISOString(),protocol:client.config.protocol});
        $('#vortex-export').disabled=false;
        if(error){errors++;feed(`#${item.index+1} ERROR · ${error.slice(0,95)}`,true);if(errors>=5&&completed===0)throw Error('Five rows failed without a successful response. Stopped to avoid sending the rest of the file to a broken endpoint.');}
        else {completed++;const answer=result.answers.classification,prob=answer.partial?answer.selectedProbability:answer.probabilities[answer.choice];visual.pulse();latencies.push(result.ms);if(latencies.length>40)latencies.shift();sparkline($('#vortex-spark'),latencies);$('#vortex-latency').textContent=Math.round(result.ms)+' ms';$('#vortex-choice').textContent=answer.choice;$('#vortex-confidence').textContent=(prob*100).toFixed(1)+'% selected probability'+(answer.partial?' · selected score only':'');$('#vortex-latest').textContent=JSON.stringify(state,null,2).slice(0,1200);cells[(completed-1)%64].style.background=`hsl(${285+labels.indexOf(answer.choice)*35} 65% ${24+prob*43}%)`;feed(`#${String(item.index+1).padStart(5,'0')} ${answer.choice} · ${Math.round(result.ms)}ms`);}
        metrics();
      },Number($('#vortex-pacing').value));
      $('#vortex-mode').textContent=errors?'COMPLETE / WITH ERRORS':'COMPLETE';feed(`Finished · ${completed} results · ${errors} errors`);
    }catch(e){$('#vortex-mode').textContent=e.name==='AbortError'?'STOPPED / PARTIAL':'INTERRUPTED';if(e.name!=='AbortError'){toast(e.message);feed(e.message.slice(0,100),true);}}
    finally{if(pausedAt){pauseMs+=performance.now()-pausedAt;pausedAt=0;}run=null;inflight=0;lock(false);$('#op-reader').textContent='IDLE';$('#op-classifier').textContent='IDLE';$('#op-journal').textContent='SAVED';$('#vortex-render').textContent='PARTICLE FIELD · IDLE ANIMATION';metrics();}
  }
  $('#vortex-start').onclick=start;$('#vortex-stop').onclick=stop;$('#vortex-pause').onclick=()=>{if(!run)return;run.paused=!run.paused;if(run.paused){pausedAt=performance.now();$('#vortex-mode').textContent='PAUSED / DRAINING IN FLIGHT';}else{pauseMs+=performance.now()-pausedAt;pausedAt=0;$('#vortex-mode').textContent='LIVE / REAL INFERENCE';}$('#vortex-pause').textContent=run.paused?'Resume':'Pause';$('#op-reader').textContent=run.paused?'PAUSED':'STREAMING';};
  $('#sample-data').onclick=()=>load(sampleFile());$('#data-file').onchange=e=>{if(e.target.files[0])load(e.target.files[0]);e.target.value='';};
  const zone=$('#drop-zone');zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('over');});zone.addEventListener('dragleave',()=>zone.classList.remove('over'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('over');if(e.dataTransfer.files[0])load(e.dataTransfer.files[0]);});
  $('#vortex-export').onclick=async()=>{try{if(runId)await journal.export(runId);}catch(e){toast(e.message);}};
  try{runId=localStorage.getItem('jev-infer.lastRun');if(runId){$('#vortex-export').disabled=false;feed('Previous journal available for export');}}catch{}
  $('#clear-journal').onclick=async()=>{if(run)return toast('Stop the CSV run before clearing its journal.');if(!confirm('Delete all CSV inference results saved by jev infer in this browser?'))return;try{await journal.clear();localStorage.removeItem('jev-infer.lastRun');runId=null;$('#vortex-export').disabled=true;toast('Local CSV results cleared.');}catch(e){toast(e.message);}};
  $('#tornado-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#vortex-stage').requestFullscreen();}catch(e){toast(e.message);}};
  return {stop,setVisible(value){visual.setVisible(value);if(!value)stop();}};
}
