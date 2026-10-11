export const hazardQuestion={type:'noul',instructions:'At the current speed, is a collision likely within the NEXT ONE SECOND without braking? Use visible obstacles on the current path, closing speeds and clearances. With route_tracker steering, current_line follows the road around bends; do not project a straight ray off a bend. Distant objects, edges off the path and adjacent parked cars are not imminent collisions. A stopped car with no approaching hazard is false. Judge this yes/no event, not severity.'};
export function drivingQueries(base,risk=true){return risk?{...base,imminent_collision:hazardQuestion}:base;}
export function applyRisk(pedal,probability,speed){
 if(!Number.isFinite(probability)||Math.abs(speed)<1||pedal==='REVERSE'||pedal==='BRAKE')return pedal;
 if(probability>=.8)return 'BRAKE';
 if(probability>=.5&&['FORWARD','BOOST','ACCELERATE'].includes(pedal))return 'COAST';
 return pedal;
}
