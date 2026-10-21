/* THE GREEN, WARNED BEFORE IT IS JUDGED (22 October). A candidate at the
   head of the queue when the light goes green: does a horn come first (at
   HONK_AFTER, 2.0 s for a sound driver behind), do they notice on their own,
   or does the sheet mark them (lateOffGreen at UNDUE_AT, 4 s)? On a course
   where every intersection is lit, per observation rating, over seeds.
   Usage: node tools/measure/green-escalation.mjs [seeds=1,2,3] */
import { seedCourse, step, DT } from "../../src/sim/crossing.js";
import { withCandidates, keepDriving, PROFILES } from "../../src/sim/candidate.js";
import { noticing } from "../../src/sim/marking.js";
const LIT = { N: "signal", E: "signal", S: "signal", W: "signal" };
const sound = PROFILES.find((p) => p.id === "sound").ratings;
const seeds = (process.argv[2] ?? "1,2,3").split(",").map(Number);
for (const obs of [1, 0.5, 0.15]) {
  const t = { greens: 0, honked: 0, alone: 0, marked: 0, waits: [] };
  for (const seed of seeds) {
    let w = withCandidates(seedCourse(seed, 60, { every: 4.0, control: LIT, cols: 3, rows: 2 }), [{ id: "X", profile: "sound", ratings: { ...sound, observation: obs } }]);
    let green = null, honkedNow = false;
    for (let i = 0; i < 300 / DT; i++) {
      w = noticing(keepDriving(step(w)));
      const a = w.actors.find((x) => x.candidate === "X");
      if (!a) { green = null; continue; }
      if (a.wake != null && green == null) { green = w.t; honkedNow = false; t.greens++; }
      if (green != null && w.actors.some((b) => b.honkTo === a.id && b.honkAt != null && b.honkAt >= green)) honkedNow = true;
      if (green != null && a.wake == null) { t.waits.push(w.t - green); if (honkedNow) t.honked++; else t.alone++; green = null; }
    }
    t.marked += (w.faults ?? []).filter((f) => f.who === "X" && f.trait === "lateOffGreen").length;
  }
  const q = (xs, f) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
  console.log(`observation ${obs}: ${t.greens} greens -- woken by a horn ${t.honked}, noticed alone ${t.alone}, marked late ${t.marked}; sat median ${q(t.waits, 0.5).toFixed(1)} s, longest ${Math.max(0, ...t.waits).toFixed(1)} s`);
}
