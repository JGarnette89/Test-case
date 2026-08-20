import { STOPS, EXITS, LANE, HALF, OFF, SET, CX, CY } from '../../src/engine/index.js';
import { crossSpec, stopPoint, exitPoint, exitSideFor, SIDES } from '../../src/engine/road.js';

const spec = crossSpec();
let bad = 0;
const eq = (a, b, what) => {
  const same = Math.abs(a - b) < 1e-9;
  if (!same) { bad++; console.log(`  MISMATCH ${what}: derived ${a} vs table ${b}`); }
  return same;
};

console.log('STOP POINTS');
for (const s of SIDES) {
  const d = stopPoint(spec, s, LANE, SET, 0, CX, CY);
  const t = STOPS[s];
  const ok = eq(d.x, t.x, `${s}.x`) && eq(d.y, t.y, `${s}.y`) && eq(d.rot, t.rot, `${s}.rot`);
  if (ok) console.log(`  ${s}: ${d.x},${d.y} rot ${d.rot}  same`);
}

console.log('EXIT POINTS');
for (const s of SIDES) {
  for (const intent of ['straight', 'right', 'left']) {
    const side = exitSideFor(s, intent);
    const d = exitPoint(side, LANE, 0, CX, CY);
    const t = EXITS[s][intent];
    const ok = eq(d.x, t.x, `${s}.${intent}.x`) && eq(d.y, t.y, `${s}.${intent}.y`);
    if (ok) console.log(`  ${s} ${intent.padEnd(8)} -> ${side}  ${d.x},${d.y}  same`);
  }
}
console.log(bad === 0 ? '\nOK: derived geometry equals the hardcoded tables.' : `\n${bad} MISMATCH(ES)`);
process.exit(bad === 0 ? 0 : 1);
