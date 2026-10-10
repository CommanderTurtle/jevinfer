import {download} from './core.js';

const LIMIT = 262144;
export async function* textChunks(file) {
  const reader=file.stream().getReader(), decoder=new TextDecoder('utf-8',{fatal:true});
  try { while(true){const {value,done}=await reader.read();if(done)break;yield decoder.decode(value,{stream:true});}const tail=decoder.decode();if(tail)yield tail; }
  finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}

// The state machine survives chunk boundaries, including a split escaped quote.
export async function* csvRecords(chunks, delimiter=',') {
  let fields=[],field='',quoted=false,afterQuote=false,skipLF=false,first=true,size=0,started=false;
  for await(const chunk of chunks) for(const char of chunk) {
    if(first){first=false;if(char==='\ufeff')continue;}
    if(skipLF){skipLF=false;if(char==='\n')continue;}
    if(++size>LIMIT)throw Error('A CSV record exceeds 256 KiB. Split oversized records before importing.');
    if(quoted){if(char==='"'){quoted=false;afterQuote=true;}else field+=char;started=true;continue;}
    if(afterQuote && char==='"'){field+='"';quoted=true;afterQuote=false;continue;}
    if(afterQuote && char!==delimiter && char!=='\r' && char!=='\n')throw Error('Unexpected text after a closing CSV quote.');
    afterQuote=false;
    if(char===delimiter){fields.push(field);field='';started=true;}
    else if(char==='\r'||char==='\n') {fields.push(field);if(started||field||fields.length>1)yield fields;fields=[];field='';size=0;started=false;skipLF=char==='\r';}
    else if(char==='"'){if(field)throw Error('Unexpected quote in an unquoted CSV field.');quoted=true;started=true;}
    else {field+=char;started=true;}
  }
  if(quoted)throw Error('Unclosed CSV quote.');
  if(started||field||fields.length){fields.push(field);yield fields;}
}
export function headers(values) {
  const used=new Set();return values.map((v,i)=>{const base=v.trim()||`column_${i+1}`;let key=base,n=2;while(used.has(key))key=`${base}_${n++}`;used.add(key);return key;});
}
async function* lines(chunks) {
  let line='';for await(const chunk of chunks){line+=chunk;let pos;while((pos=line.indexOf('\n'))>=0){const value=line.slice(0,pos).trim();line=line.slice(pos+1);if(value.length>LIMIT)throw Error('A JSONL record exceeds 256 KiB.');if(value)yield value;}if(line.length>LIMIT)throw Error('A JSONL record exceeds 256 KiB.');}if(line.trim())yield line.trim();
}
export async function* jsonArray(chunks) {
  let started=false,ended=false,string=false,escape=false,depth=0,value='',needsValue=false;
  for await(const chunk of chunks)for(const ch of chunk){
    if(!started){if(/\s|\ufeff/.test(ch))continue;if(ch!=='[')throw Error('JSON import expects an array of records. Use JSONL for one object per line.');started=true;continue;}
    if(ended){if(!/\s/.test(ch))throw Error('Unexpected content after JSON array.');continue;}
    if(!string && depth===0 && (ch===','||ch===']')){
      if(value.trim()){yield JSON.parse(value);value='';needsValue=ch===',';}
      else if(ch===','||needsValue)throw Error('Missing JSON array element.');
      if(ch===']')ended=true;continue;
    }
    value+=ch;if(value.length>LIMIT)throw Error('A JSON record exceeds 256 KiB.');
    if(string){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')string=false;}
    else if(ch==='"')string=true;else if(ch==='{'||ch==='[')depth++;else if(ch==='}'||ch===']'){depth--;if(depth<0)throw Error('Invalid JSON nesting.');}
  }
  if(!ended)throw Error('Incomplete JSON array.');
}
function objectRow(row){if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Each record must be an object.');return row;}
export async function* rows(file) {
  const name=file.name.toLowerCase();let index=0;
  if(name.endsWith('.json')){for await(const row of jsonArray(textChunks(file)))yield {index:index++,row:objectRow(row)};}
  else if(/\.(jsonl|ndjson)$/.test(name)){for await(const line of lines(textChunks(file)))yield {index:index++,row:objectRow(JSON.parse(line))};}
  else {let keys;for await(const cells of csvRecords(textChunks(file),name.endsWith('.tsv')?'\t':',')){
    if(!keys){keys=headers(cells);continue;}if(cells.length!==keys.length)throw Error(`Row ${index+2} has ${cells.length} fields; expected ${keys.length}.`);
    yield {index:index++,row:Object.fromEntries(keys.map((key,i)=>[key,cells[i]]))};
  }}
}
export async function inspect(file) {
  const keys=new Set(),examples=[];for await(const {row} of rows(file)){for(const key of Object.keys(row))keys.add(key);examples.push(row);if(examples.length===5)break;}if(!examples.length)throw Error('No data rows found.');return {keys:[...keys],examples};
}
const transactionDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted.'));});
export class Journal {
  async open(){if(this.db)return this.db;if(!this.opening)this.opening=new Promise((resolve,reject)=>{const req=indexedDB.open('jev-infer-journal',1);req.onupgradeneeded=()=>req.result.createObjectStore('rows',{keyPath:['run','index']});req.onsuccess=()=>{this.db=req.result;this.db.onversionchange=()=>this.db.close();resolve(this.db);};req.onerror=()=>reject(req.error);});return this.opening;}
  async put(record){const db=await this.open(),tx=db.transaction('rows','readwrite');const done=transactionDone(tx);tx.objectStore('rows').put(record);await done;}
  async clear(){const db=await this.open(),tx=db.transaction('rows','readwrite');const done=transactionDone(tx);tx.objectStore('rows').clear();await done;}
  async *records(run){const db=await this.open();let last=-1;while(true){const batch=await new Promise((resolve,reject)=>{const tx=db.transaction('rows'),req=tx.objectStore('rows').getAll(IDBKeyRange.bound([run,last+1],[run,Number.MAX_SAFE_INTEGER]),256);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});if(!batch.length)return;for(const record of batch)yield record;last=batch.at(-1).index;}}
  async export(run){
    let handle;if(window.showSaveFilePicker) {try{handle=await window.showSaveFilePicker({suggestedName:'jev-inference.jsonl',types:[{description:'JSON Lines',accept:{'application/json':['.jsonl']}}]});}catch(e){if(e.name==='AbortError')return;throw e;}}
    if(handle){const writer=await handle.createWritable();try{for await(const record of this.records(run))await writer.write(JSON.stringify(record)+'\n');await writer.close();}catch(e){await writer.abort();throw e;}}
    else {const parts=[];let size=0;for await(const record of this.records(run)){const line=JSON.stringify(record)+'\n';size+=line.length;if(size>64*1024*1024)throw Error('Export exceeds the 64 MiB in-memory fallback. Use a browser supporting Save File Picker for streaming exports.');parts.push(line);}download('jev-inference.jsonl',new Blob(parts,{type:'application/x-ndjson'}));}
  }
}
export function sampleFile(){const data=['timestamp,slug,yes_bid,yes_ask,no_bid,no_ask,previous_yes_mid,volume'];for(let i=0;i<64;i++){const mid=.5+Math.sin(i*.61)*.23,prev=.5+Math.sin((i-1)*.61)*.23;data.push([new Date(Date.UTC(2026,0,1,0,i)).toISOString(),'synthetic-btc-up-down',(mid-.01).toFixed(3),(mid+.01).toFixed(3),(1-mid-.01).toFixed(3),(1-mid+.01).toFixed(3),prev.toFixed(3),100+i*7].join(','));}return new File([data.join('\n')],'synthetic-market-sample.csv',{type:'text/csv'});}
