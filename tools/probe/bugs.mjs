import { simulate, poseAt, CROSS } from '../../src/engine/index.js';
import { composeScenario } from '../../src/engine/compose.js';
import { crossSpec } from '../../src/engine/road.js';

console.log('A. DOES A NON-STOPPING CAR SLOW DOWN ANYWAY?');
{
  const scn = {
    id: 'p', control: 'stop', duration: 14, road: crossSpec(),
    ego: { from: 'S', intent: 'straight', arriveAt: 9, stops: true },
    actors: [{ id: 'w', from: 'W', intent: 'straight', arriveAt: 3.0, stops: false, kind: 'car', name: 'Through car' }],
  };
  const sim = simulate(scn);
  const a = sim.actors[0];
  let prev = null;
  console.log('   t     speed (m/s)');
  for (let t = 0.6; t <= 4.2; t += 0.6) {
    const p = poseAt(a, t), q = poseAt(a, t + 0.1);
    const v = Math.hypot(q.x - p.x, q.y - p.y) / 0.1 / 20;
    console.log('   ' + t.toFixed(1) + '   ' + v.toFixed(1) + (Math.abs(v) < 0.5 ? '   <-- stopped' : ''));
  }
}

console.log('');
console.log('B. WHO DOES THE COMPOSER GIVE PRIORITY TO?');
{
  const scn = composeScenario({ traffic: 'busy', visibility: 'open', intersection: 'cross' }, 11);
  const sim = simulate(scn);
  console.log('   ego on leg', scn.ego.from, 'control =', scn.road.legs[scn.ego.from].control,
              '| arrives', scn.ego.arriveAt);
  for (const a of scn.actors) {
    console.log('   ' + a.id + ' leg ' + a.from + ' control=' + scn.road.legs[a.from].control +
      ' arrives ' + a.arriveAt + ' stops=' + a.stops + ' priority=' + a.priority +
      (a.arriveAt > scn.ego.arriveAt ? '   <-- arrives AFTER the ego but still outranks it' : ''));
  }
}

console.log('');
console.log('C. DOES A COMPOSED BLIND SCENE ASK FOR MORE THAN ONE BUTTON?');
{
  const scn = composeScenario({ traffic: 'busy', visibility: 'restricted' }, 5);
  console.log('   sightBlockers:', (scn.sightBlockers || []).length,
              '| manoeuvre:', scn.manoeuvre ?? '(none -> single GO, so no PULL UP and no occlusion)');
}
