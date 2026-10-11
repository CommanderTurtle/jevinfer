// Opt-in, bounded live checks for the arcade and final-second emergency contracts.
import {Client} from '../src/core.js';
import {createArcadeKart,arcadeKartState,kartQuestions} from '../src/arcade-kart.js';
import {createBoat,panicContract,firePanic,stepBoat,boardingSeconds} from '../src/boat-physics.js';
const url=process.env.JEV_ENDPOINT;if(!url)throw Error('Set JEV_ENDPOINT.');
const client=new Client({url,key:process.env.JEV_API_KEY,protocol:'systemone',timeout:10});
const kart=createArcadeKart(),r=await client.infer(arcadeKartState(kart),kartQuestions);
console.log(JSON.stringify({case:'arcade-grid',answers:r.answers,ms:r.ms}));
if(r.answers.throttle.choice!=='ACCELERATE')throw Error('Open starting grid should accelerate.');
// Let the emergency clock run during HTTP inference; do not freeze its window.
const w=createBoat();w.time=6;w.speed=8;w.waves=[];w.police=[{id:0,x:8,z:0,heading:0,speed:8,hull:3,boarding:boardingSeconds-.98}];
const contract=panicContract(w);let last=performance.now();
const timer=setInterval(()=>{const now=performance.now();stepBoat(w,(now-last)/1000,{sail:.5});last=now;},8);
try{
 const response=await client.infer(contract.state,contract.questions);
 const accepted=contract.valid(w)&&response.answers.panic_fire.noul>.5&&firePanic(w);
 console.log(JSON.stringify({case:'final-second-volley',ms:response.ms,accepted,noul:response.answers.panic_fire.noul,remaining:boardingSeconds-(w.police[0].boarding||0)}));
 if(!accepted)throw Error('Emergency answer missed the live boarding window.');
 await new Promise(resolve=>setTimeout(resolve,250));
 if(w.finished||!w.disabled)throw Error('Volley failed to interrupt boarding.');
 console.log(JSON.stringify({survived:!w.finished,sunk:w.disabled,cooldown:w.panicReadyAt-w.time}));
}finally{clearInterval(timer);}
