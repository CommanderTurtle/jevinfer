// JEV_ENDPOINT=http://localhost:8000 bun tests/live-green-light.js
// Real responses only: the game owns physics, the endpoint owns every action.
import {delay} from '../src/core.js';
import {liveClient} from './live-client.js';
import {createGreenWorld,advanceGreenWorld,greenContract,applyGreenDecision,cameraMount} from '../src/green-light-world.js';
const url=process.env.JEV_ENDPOINT;
if(!url)throw Error('Set JEV_ENDPOINT to the served NInfer origin.');
const client=await liveClient(process.env.JEV_PROTOCOL||'systemone',15);
const world=createGreenWorld();world.player.z=32;
world.cameraYaw=Math.atan2(world.player.x-cameraMount.x,-(world.player.z-cameraMount.z));
const started=performance.now();let previous=started,applied=0,expired=0,raised=false,shots=0;
const controller=new AbortController(),timer=setInterval(()=>{
 const now=performance.now();advanceGreenWorld(world,(now-previous)/1000,{forward:1});previous=now;
 raised||=world.turret.lift>=1;shots=world.shotCount;
},10);
try{
 while(!world.result&&performance.now()-started<45000){
  const contract=greenContract(world);
  if(!contract||world.turret.turning){await delay(20);continue;}
  const sentAt=world.time,track=world.track,result=await client.infer(contract.state,contract.questions,controller.signal);
  const accepted=applyGreenDecision(world,result.answers,track,sentAt);accepted?applied++:expired++;
  console.log(JSON.stringify({phase:contract.state.phase,ms:Math.round(result.ms),choices:Object.fromEntries(Object.entries(result.answers).map(([k,a])=>[k,a.choice])),accepted,lift:Math.round(world.turret.lift*100),shots:world.shotCount}));
 }
 console.log(JSON.stringify({raised,shots,result:world.result,applied,expired,elapsed_s:Math.round((performance.now()-started)/1000)}));
 if(!raised||!shots)process.exitCode=1;
}finally{clearInterval(timer);controller.abort();}
