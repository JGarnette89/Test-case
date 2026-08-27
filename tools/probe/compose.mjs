import { composeScenario, measure, signatureOf, TRAFFIC, VISIBILITY } from '../../src/engine/compose.js';

const briefs = [
  { traffic: 'light',  visibility: 'open' },
  { traffic: 'busy',   visibility: 'open' },
  { traffic: 'heavy',  visibility: 'open' },
  { traffic: 'busy',   visibility: 'restricted' },
  { traffic: 'heavy',  visibility: 'restricted' },
];

for (const b of briefs) {
  let made = 0, sigs = new Set(), priors = [], blind = [], junctions = new Set();
  for (let s = 1; s <= 40; s++) {
    const scn = composeScenario(b, s);
    if (!scn) continue;
    made++;
    sigs.add(signatureOf(scn));
    junctions.add(scn.conditions.junction);
    priors.push(scn.measured.priors);
    blind.push(scn.measured.blindness);
  }
  const avg = (xs) => xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length * 100) / 100 : 0;
  console.log(
    `${b.traffic.padEnd(6)}/${b.visibility.padEnd(11)} made ${String(made).padStart(2)}/40  ` +
    `distinct ${String(sigs.size).padStart(2)}  priors~${avg(priors)}  blindness~${avg(blind)}  ` +
    `junctions: ${[...junctions].join(',')}`
  );
}
