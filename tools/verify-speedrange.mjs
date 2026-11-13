/* THE HIGHWAY SPEED RANGE (14 November, DECISIONS 10.71; the maintainer's ruling): 85 to 140 km/h on a 100 km/h road, confidence sets how fast, COMPLIANCE is the second factor for the fast tail
   (confident AND non-compliant, both needed), and skill is independent of speed. The expectations are stated here in km/h, not read from traffic.js's constants (a check that reads the code's
   own constant cannot see it wrong). Over 6000 drivers drawn through `driver` itself on a 100 km/h highway. */
import { driver } from "../src/sim/traffic.js";
let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) bad++; };
const road = { speed: 100 / 3.6, kind: "highway", lane: 3.6 };
const D = [];
for (let n = 0; n < 6000; n++) { const d = driver(road, 7, n); D.push({ kmh: d.v0 * 3.6, caution: d.caution, lax: 1 - d.ratings.compliance, r: d.ratings }); }
const kmh = D.map((d) => d.kmh), mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;
console.log(`1. THE RANGE: ${Math.min(...kmh).toFixed(1)} to ${Math.max(...kmh).toFixed(1)} km/h over ${D.length} drivers`);
check(Math.min(...kmh) >= 84.9 && Math.max(...kmh) <= 140.1, "nobody wants less than 85 or more than 140 on a 100 km/h highway");
check(Math.min(...kmh) < 88 && Math.max(...kmh) > 125, "and the ends are reached by drawn drivers (under 88; over 125)");
console.log("2. BOTH FACTORS FOR THE FAST TAIL");
const bold = D.filter((d) => d.caution < 0.3), compliantBold = bold.filter((d) => d.lax < 0.05), laxBold = bold.filter((d) => d.lax > 0.6);
check(compliantBold.length > 20 && laxBold.length > 20, `the draw has both (confident and compliant: ${compliantBold.length}; confident and non-compliant: ${laxBold.length})`);
check(Math.max(...compliantBold.map((d) => d.kmh)) <= 111.6, `a confident but compliant driver drives the limit briskly and no more (fastest ${Math.max(...compliantBold.map((d) => d.kmh)).toFixed(1)} km/h <= 111.6: briskly is 110, plus 30 km/h of the compliance deficit, which is under 0.05 here)`);
check(mean(laxBold.map((d) => d.kmh)) - mean(compliantBold.map((d) => d.kmh)) > 12, `a confident non-compliant one is much faster than a compliant one equally confident (${mean(laxBold.map((d) => d.kmh)).toFixed(0)} against ${mean(compliantBold.map((d) => d.kmh)).toFixed(0)} km/h)`);
const timidLax = D.filter((d) => d.caution > 1.2 && d.lax > 0.6);
check(timidLax.length > 10 && Math.max(...timidLax.map((d) => d.kmh)) <= 101.01, `a non-compliant timid driver does not speed: confidence above 1.2 is at most 101 km/h whatever their compliance (${timidLax.length} drivers, fastest ${Math.max(...timidLax.map((d) => d.kmh)).toFixed(1)} km/h)`);
const fast = D.filter((d) => d.kmh > 125);
check(fast.length > 0 && fast.every((d) => d.caution < 0.4 && d.lax > 0.4), `everyone over 125 km/h (${fast.length}) is both confident and non-compliant`);
console.log("3. SKILL IS INDEPENDENT OF SPEED");
const corr = (xs, ys) => { const mx = mean(xs), my = mean(ys); let a = 0, b = 0, c = 0; for (let i = 0; i < xs.length; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; } return a / Math.sqrt(b * c); };
for (const axis of ["braking", "observation", "steering"]) { const r = corr(kmh, D.map((d) => d.r[axis])); check(Math.abs(r) < 0.1, `speed and ${axis}: correlation ${r.toFixed(3)} (|r| < 0.1)`); }
const poorBraking = fast.filter((d) => d.r.braking < 0.5).length / Math.max(1, fast.length), poorAll = D.filter((d) => d.r.braking < 0.5).length / D.length;
check(poorBraking > 0, `and the fast tail does contain poor brakers (${(100 * poorBraking).toFixed(0)}% of it): the reckless drivers are drawn, not invented`);
/* A FINDING, NOT A PASS (DECISIONS 10.71): marginally independent is not independent WITHIN the fast tail. The draw gives a driver a profile (weak on one or two axes, the variety-over-volume rule), and a driver
   bold AND non-compliant has spent two of those slots, so the tail is poor at braking at about HALF the population's rate (14-16% against 29-30%). Printed, not asserted: the bar would be Jay's to state. */
console.log(`  FINDING  the fast tail (${fast.length} of ${D.length}, ${(100 * fast.length / D.length).toFixed(1)}%) is poor at braking ${(100 * poorBraking).toFixed(0)}% of the time against the population's ${(100 * poorAll).toFixed(0)}%: the profile rule holds the tail's other skills BETTER than independence would`);
console.log(bad ? `\nFAILED: ${bad}` : "\nOK: 85 to 140, the fast tail confident and non-compliant, skill uncorrelated with speed overall (NOT within the tail: see the FINDING).");
process.exit(bad ? 1 : 0);
