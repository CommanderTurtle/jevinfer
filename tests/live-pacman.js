// Opt-in real-time play: latency, deaths and inference errors are reported, not hidden.
import {liveClient} from './live-client.js';
import {PacmanSession,MODES} from '../src/pacman/session.js';
import {delay} from '../src/core.js';
const client=await liveClient();
const seconds=Number(process.env.JEV_PACMAN_SECONDS||30),mode=process.env.JEV_PACMAN_MODE||'pacman';
if(!Number.isFinite(seconds)||seconds<=0||seconds>600)throw Error('JEV_PACMAN_SECONDS must be >0 and <=600.');
if(!Object.hasOwn(MODES,mode)||mode==='classic')throw Error('Choose pacman, ghosts or both.');
const game=new PacmanSession(client);game.reset(mode);game.start();
const began=performance.now();let last=began;
try{
 while(game.active&&performance.now()-began<seconds*1000){
  const now=performance.now();game.tick((now-last)/1000);last=now;
  await delay(8);
 }
 console.log(JSON.stringify({mode,seconds:(performance.now()-began)/1000,capacity:client.capacity,...game.stats,
  status:game.state.status,score:game.state.score,lives:game.state.lives,error:game.error||null}));
 if(game.error)process.exitCode=1;
}finally{game.stop();}
