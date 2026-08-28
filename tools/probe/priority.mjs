import { composeScenario } from '../../src/engine/compose.js';
let unfair = 0, checked = 0, byKind = {};
for (const brief of [{traffic:'busy',visibility:'open'},{traffic:'heavy',visibility:'open'},{traffic:'heavy',visibility:'restricted'}]) {
  for (let s = 1; s <= 60; s++) {
    const scn = composeScenario(brief, s);
    if (!scn) continue;
    checked++;
    const kind = scn.conditions.junction;
    byKind[kind] = byKind[kind] || 0;
    for (const a of scn.actors) {
      const egoCtl = scn.road.legs[scn.ego.from].control;
      const aCtl = scn.road.legs[a.from].control;
      // Unfair = handed priority while ALSO being required to stop, or
      // outranking an ego that arrived first at an equal-control junction.
      if (a.priority != null && a.stops) { unfair++; byKind[kind]++; }
      if (a.priority != null && egoCtl === aCtl && egoCtl === 'stop') { unfair++; byKind[kind]++; }
    }
  }
}
console.log('checked ' + checked + ' scenes; unfair priority grants: ' + unfair);
console.log('by junction:', JSON.stringify(byKind));
