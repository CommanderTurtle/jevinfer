import {Client,choice} from '../src/core.js';
import {buildRequests,pack} from '../src/pigment/jev.mjs';
const endpoint=process.env.JEV_ENDPOINT;
if(!endpoint){console.error('Set JEV_ENDPOINT to the local NInfer origin before running live checks.');process.exit(1);}
const config={url:endpoint,key:process.env.JEV_API_KEY,timeout:60};
import {canvasLayout,canvasBatches,paintState} from '../src/paint-canvas.js';
import {drivingState,drivingQuestions} from '../src/race-physics.js';
import {createCourse} from '../src/race-course.js';
import {drivingContract} from '../src/driving-policy.js';
import {createArcadeKart,arcadeKartState,kartQuestions} from '../src/arcade-kart.js';
import {createBoat,boatContract} from '../src/boat-physics.js';
import {presets,makeQuestions} from '../src/chat-engine.js';
import {createGame,decisionPoints,jevActors} from '../src/pacman/sim.js';
import {optionFeatures} from '../src/pacman/features.js';
import {buildRequest as pacmanRequest} from '../src/pacman/brain.js';
const pacman=createGame({pacmanControl:'jev',ghostsByAI:true});
const pacmanSetup=pacmanRequest(pacman,jevActors(pacman).flatMap(id=>decisionPoints(pacman,id)).map(point=>({point,features:optionFeatures(pacman,point)})));
const layout=canvasLayout('classic'),pixels=[...canvasBatches(layout,'Head / Base / Front')][0];
const palette={SKIN:'#dca477',HAIR:'#4a3027',WHITE:'#f1eadc',BLACK:'#222334'};
const cases=[
 ['playground',{message:'My new laptop arrived broken. I need a replacement today.'},{route:choice('Route the ticket.',['RETURNS','SHIPPING','GENERAL']),urgent:{type:'noul',instructions:'Is this time-sensitive?'},severity:{type:'score',instructions:'How serious is the issue?',criteria:['Low','Medium','High']}}],
 ['pacman',pacmanSetup.state,pacmanSetup.questions],
 ['drive',drivingState({x:1,speed:20,cars:[{lane:1,z:30,speed:10}]}),drivingQuestions],
 ...['parking','slalom','city'].map(mode=>{const c=drivingContract(createCourse(mode));return ['drive-'+mode,c.state,c.questions];}),
 ['drive-kart',arcadeKartState(createArcadeKart()),kartQuestions],
 ...[boatContract(createBoat())].map(c=>['drive-pirate',c.state,c.questions]),
 ['skin-paint',paintState(layout,new Uint8ClampedArray(64*64*4),pixels,'Paint a friendly face with dark hair.',palette),Object.fromEntries(pixels.map(p=>['p'+p.index,choice('Choose the color at x='+p.x+', y='+p.y+', '+p.region+'.',Object.keys(palette))]))],
 ['tornado',{slug:'synthetic-market',yes_bid:.60,yes_ask:.62,previous_yes_mid:.55},{classification:choice('Compare the current midpoint with the previous midpoint. Classify direction only.',['UP','DOWN','FLAT'])}],
 ['chat',{stream_context:presets.signal.context,username:'test_viewer',message:'What library are you using for the audio visualizer?'},makeQuestions(presets.signal.instructions,presets.signal.criteria)]
];
for(const protocol of ['systemone','decision'])for(const [mode,state,questions] of cases){try{const r=await new Client({...config,protocol}).infer(state,questions);console.log(JSON.stringify({protocol,mode,ok:true,questions:Object.keys(questions).length,ms:Math.round(r.ms)}));}catch(e){console.log(JSON.stringify({protocol,mode,ok:false,error:e.message}));process.exitCode=1;}}


// Exercise every source paint representation with a small rectangular canvas.
for(const method of ['palette','silhouette','rgb','hsl']){
 try{const answers={},client=new Client({...config,protocol:'systemone'});let requests=0;
  for(const batch of buildRequests('A yellow sun above green grass',''+method,3,2)){const result=await client.infer(batch.state,batch.questions);Object.assign(answers,result.answers);requests++;}
  const result=pack(answers,method,3,'A yellow sun above green grass',2);if(result.pixels.length!==6)throw Error('Incomplete image');
  console.log(JSON.stringify({mode:'paint-'+method,ok:true,pixels:result.pixels.length,requests}));
 }catch(e){console.log(JSON.stringify({mode:'paint-'+method,ok:false,error:e.message}));process.exitCode=1;}
}
