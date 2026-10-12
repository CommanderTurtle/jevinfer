import {Client} from '../src/core.js';
import {connectionDefaults} from '../src/connection.js';
import {positiveInteger} from '../src/capacity.js';

export async function liveClient(protocol=process.env.JEV_PROTOCOL||'systemone',timeout=30){
 const url=process.env.JEV_ENDPOINT;
 if(!url)throw Error('Set JEV_ENDPOINT to your served NInfer origin.');
 const concurrency=Number(process.env.JEV_CONCURRENCY||0);
 if(concurrency!==0)positiveInteger(concurrency);
 const client=new Client({...connectionDefaults,url,protocol,timeout,concurrency,
  probeCeiling:positiveInteger(process.env.JEV_PROBE_CEILING||64),key:process.env.JEV_API_KEY});
 const connection=await client.connect();
 console.log(JSON.stringify({connection:{url,protocol,...connection}}));
 return client;
}
