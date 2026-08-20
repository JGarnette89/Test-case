import { SCENARIOS } from '../../src/engine/scenarios.js';
import { simulate } from '../../src/engine/index.js';
import { rotateScenario, isRotatable } from '../../src/engine/route.js';
import { specOf, hasLeg, validateRoad, SIDES } from '../../src/engine/road.js';

const tee = SCENARIOS.find(s => s.id === 'tee');
console.log('tee rotatable?', isRotatable(tee));
console.log('legs present :', SIDES.filter(s => hasLeg(specOf(tee), s)).join(','));
console.log('base window  :', simulate(tee).legalAt);
console.log('');
for (const n of [1, 2, 3]) {
  const r = rotateScenario(tee, n);
  if (!r) { console.log(`turn ${n}: refused`); continue; }
  const spec = specOf(r);
  const legs = SIDES.filter(s => hasLeg(spec, s)).join(',');
  const from = [r.ego, ...r.actors].map(p => `${p.id ?? 'ego'}:${p.from}`).join(' ');
  const problems = validateRoad(spec, [{ ...r.ego, id: 'ego' }, ...r.actors]);
  console.log(`turn ${n}: legs ${legs} | ${from}`);
  console.log(`         window ${simulate(r).legalAt}  problems: ${problems.length ? problems.join('; ') : 'none'}`);
}
