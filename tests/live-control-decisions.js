// Opt-in semantic fixtures: check actual choices, not just valid response JSON.
import {Client} from '../src/core.js';
import {controlCases} from './control-cases.js';
import {inferDriving,resetDrivingPolicy} from '../src/driving-policy.js';
import {combatContract} from '../src/combat-policy.js';
const endpoint=process.env.JEV_ENDPOINT;if(!endpoint)throw Error('Set JEV_ENDPOINT.');
const client=new Client({url:endpoint,key:process.env.JEV_API_KEY,protocol:process.env.JEV_PROTOCOL||'systemone',timeout:30});
const repeats=Number(process.env.JEV_CONTROL_REPEATS||2);
if(!Number.isInteger(repeats)||repeats<1||repeats>10)throw Error('JEV_CONTROL_REPEATS must be 1–10.');
let passed=0,total=0;
for(const c of controlCases())for(let repeat=0;repeat<repeats;repeat++){
 resetDrivingPolicy(c.world);
 const r=await inferDriving(client,c.world),controls=r.command,combat=combatContract(c.world);
 controls.item=false;if(combat){const weapon=await client.infer(combat.state,combat.questions);Object.assign(controls,combat.decode(weapon.answers));r.ms+=weapon.ms;}
 const ok=!!c.check(controls);total++;passed+=Number(ok);
 console.log(JSON.stringify({case:c.id,repeat,ok,expected:c.expectation,controls,ms:Math.round(r.ms)}));
}
console.log(JSON.stringify({passed,total}));if(passed!==total)process.exitCode=1;
