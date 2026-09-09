import { LANE, SET, CX, CY, simulate, poseAt } from '../../src/engine/index.js';
import { crossSpec, teeSpec, stopPoint, exitPoint, exitSideFor, roadHalf, hasLeg, controlOf, SIDES } from '../../src/engine/road.js';

const m = (px) => Math.round(px / 20 * 100) / 100;

console.log('T-INTERSECTION  (no north leg; stem is the south, stop-controlled)');
const tee = teeSpec({ missing: 'N', stem: 'S' });
for (const s of SIDES) {
  if (!hasLeg(tee, s)) { console.log(`  ${s}: absent`); continue; }
  const p = stopPoint(tee, s, LANE, SET, 0, CX, CY);
  console.log(`  ${s}: stop at ${Math.round(p.x)},${Math.round(p.y)}  control=${controlOf(tee, s)}`);
}
console.log('  a left from the stem exits ->', exitSideFor('S', 'left'),
            '| straight ->', exitSideFor('S', 'straight'), '(the missing leg — must not be used)');

console.log('\nMULTI-LANE  (two lanes each way on the east-west road)');
const wide = { legs: { N: { lanes: 1, control: 'stop' }, S: { lanes: 1, control: 'stop' },
                       E: { lanes: 2, control: 'none' }, W: { lanes: 2, control: 'none' } } };
console.log(`  east-west half-width ${m(roadHalf(wide, 'horiz', LANE))}m  (one lane: ${m(roadHalf(crossSpec(), 'horiz', LANE))}m)`);
for (const lane of [0, 1]) {
  const p = stopPoint(wide, 'W', LANE, SET, lane, CX, CY);
  console.log(`  W lane ${lane}: ${Math.round(p.x)},${Math.round(p.y)}`);
}
const sN = stopPoint(wide, 'S', LANE, SET, 0, CX, CY);
const sNarrow = stopPoint(crossSpec(), 'S', LANE, SET, 0, CX, CY);
console.log(`  south leg stops further back because the road it crosses is wider: ${m(sN.y - CY)}m vs ${m(sNarrow.y - CY)}m`);

console.log('\nDOES A T ACTUALLY RUN?');
const scn = {
  id: 'tee-probe', control: 'stop', duration: 14,
  road: tee,
  ego: { from: 'S', intent: 'left', arriveAt: 1.2, stops: true },
  actors: [{ id: 'e1', from: 'E', intent: 'straight', arriveAt: 2.4, stops: false, kind: 'car', name: 'Through car', priority: -2 }],
};
const sim = simulate(scn);
console.log(`  ego arrives ${scn.ego.arriveAt}, window ${sim.legalAt} (waits ${Math.round((sim.legalAt - scn.ego.arriveAt) * 100) / 100}s)`);
console.log(`  priors: ${sim.priors.map((p) => p.id).join(',') || 'none'}`);
const at = poseAt(sim.ego, sim.legalAt + 1);
console.log(`  ego one second after its window: ${Math.round(at.x)},${Math.round(at.y)} (heading ${Math.round(at.rot)})`);
