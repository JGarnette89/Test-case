/* Tiles: a declared runway is a promise, and this holds them to it.
 *
 * The lesson that produced this check, twice over: measure the quantity
 * the game depends on, not a proxy that happens to correlate.
 *
 *   - spacing between junction centres looked like approach, and was not.
 *     Designing to it gave a band 20m too generous.
 *   - distance to the junction CENTRE looked like runway, and was not.
 *     The candidate has to have acted by the stop line, which sits further
 *     back on a wider road.
 *
 * So a tile declares RUNWAY and this file verifies it against measured
 * geometry, for every tile that could precede it — because what the
 * previous junction consumes on the way out depends on ITS width, not on
 * the tile making the promise. A tile that cannot deliver what it claims
 * fails here, at authoring time, rather than becoming a junction nobody
 * can direct several stages later.
 */
import { TILES, CHARACTER, CHARACTERS, specFor, runwayNeededFor, kerbsideFor, roadsideLifeFor } from "../src/engine/tiles.js";
import { driveThroughTiles, runwayFor, linkBetween, spacingForRunway } from "../src/engine/world.js";
import { simulate, poseAt, M } from "../src/engine/index.js";
import { whatEgoSees, visibility, eyePoint } from "../src/engine/sight.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

const m = (px) => Math.round((px / 20) * 10) / 10;
let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

const base = SCENARIOS.find((s) => s.id === "opposite");
const legFor = (spec) => ({
  ...base, road: spec,
  ego: { ...base.ego, departAt: simulate({ ...base, road: spec }).legalAt },
});
const withSpec = (t) => ({ ...t, spec: specFor(t.character) });

/* ---------- 1. every declared runway is actually delivered ---------- */
console.log("1. A DECLARED RUNWAY IS A PROMISE");
{
  console.log("\n   after ->        res-quiet  res-busy  coll-std   art-main");
  console.log("   " + "-".repeat(58));
  let drifted = 0, pairs = 0;
  for (const prev of TILES) {
    const row = [];
    for (const tile of TILES) {
      const a = withSpec(prev), b = withSpec(tile);
      const drive = driveThroughTiles({
        tiles: [a, b], legs: [legFor(a.spec), legFor(b.spec)],
      });
      const measured = runwayFor(drive, 1);
      pairs++;
      // Half a metre of slack for the sampling step, no more.
      if (Math.abs(measured - tile.runway) > M(0.6)) {
        drifted++;
        fail(`${prev.id} -> ${tile.id}: declared ${m(tile.runway)}m, delivers ${m(measured)}m`);
      }
      row.push(`${m(measured).toFixed(1)}m`.padStart(9));
    }
    console.log(`   ${prev.id.padEnd(14)}${row.join(" ")}`);
  }
  drifted === 0
    ? ok(`all ${pairs} tile pairings deliver the runway the tile declared`)
    : null;
}

/* ---------- 2. and the declaration is enough to be directable ------- */
console.log("\n2. EVERY TILE IS DIRECTABLE ON ITS OWN ROAD");
{
  console.log("\n   tile            character     speed    declared   needed");
  console.log("   " + "-".repeat(62));
  let short = 0;
  for (const t of TILES) {
    const need = runwayNeededFor(t.character);
    const kmh = Math.round((CHARACTER[t.character].speed / 20) * 3.6);
    console.log(
      `   ${t.id.padEnd(15)} ${t.character.padEnd(13)} ${String(kmh).padStart(3)} km/h ` +
      `${(m(t.runway) + "m").padStart(10)} ${(m(need) + "m").padStart(8)}`
    );
    if (t.runway < need) {
      short++;
      fail(`${t.id}: declares ${m(t.runway)}m but a turn off a ${t.character} road needs ${m(need)}m`);
    }
  }
  short === 0
    ? ok("every tile declares more runway than a turn off its own road needs")
    : null;

  /* A faster road needs MORE approach for the same instruction, because
     runwayNeeded is in seconds. If that ever inverts, the directing task
     has stopped reading road character. */
  const bySpeed = [...CHARACTERS].sort((a, b) => CHARACTER[a].speed - CHARACTER[b].speed);
  let rising = true;
  for (let i = 1; i < bySpeed.length; i++) {
    if (!(runwayNeededFor(bySpeed[i]) > runwayNeededFor(bySpeed[i - 1]))) rising = false;
  }
  rising
    ? ok(`a faster road needs more approach: ${bySpeed.map((c) => `${c} ${m(runwayNeededFor(c))}m`).join(", ")}`)
    : fail("runway needed does not rise with the speed the road carries");
}

/* ---------- 3. the inversion, which is the difficulty model --------- */
console.log("\n3. AS OCCLUSION FALLS, SPEED RISES");
{
  /* The point of the character table: difficulty does not decrease along
     it, it changes KIND. A residential street is a seeing problem; an
     arterial is a timing problem. An author could quietly break that by
     making a fast road cluttered, so it is asserted rather than assumed. */
  console.log("\n   character      speed    kerbside density   activity");
  console.log("   " + "-".repeat(58));
  const bySpeed = [...CHARACTERS].sort((a, b) => CHARACTER[a].speed - CHARACTER[b].speed);
  for (const c of bySpeed) {
    const k = CHARACTER[c].kerbside;
    console.log(
      `   ${c.padEnd(14)} ${String(Math.round((CHARACTER[c].speed / 20) * 3.6)).padStart(3)} km/h ` +
      `${k.density.toFixed(2).padStart(14)} ${k.activity.toFixed(2).padStart(10)}`
    );
  }
  let falling = true;
  for (let i = 1; i < bySpeed.length; i++) {
    if (!(CHARACTER[bySpeed[i]].kerbside.density < CHARACTER[bySpeed[i - 1]].kerbside.density)) falling = false;
  }
  falling
    ? ok("density falls as speed rises, so difficulty changes kind rather than degree")
    : fail("a faster road is as cluttered as a slower one — the inversion is broken");
}

/* ---------- 4. roadside content is real, and character-driven ------- */
console.log("\n4. THE PROPS ARE THE OCCLUSION");
{
  console.log("\n   tile            blockers   people   blockers per 100m");
  console.log("   " + "-".repeat(58));
  const counts = {};
  for (const t of TILES) {
    const tile = withSpec(t);
    const drive = driveThroughTiles({ tiles: [tile, tile], legs: [legFor(tile.spec), legFor(tile.spec)] });
    const link = drive.links[0];
    const blockers = kerbsideFor(tile, link, 11);
    const people = roadsideLifeFor(tile, link, 12);
    const per100 = (blockers.length / (link.length / 20)) * 100;
    counts[t.id] = { blockers: blockers.length, per100, character: t.character };
    console.log(
      `   ${t.id.padEnd(15)} ${String(blockers.length).padStart(8)} ${String(people.length).padStart(8)} ` +
      `${per100.toFixed(1).padStart(18)}`
    );
  }
  Object.values(counts).every((c) => c.blockers > 0)
    ? ok("every tile lays down roadside content as a matter of course, not as a special case")
    : fail("a tile produced no roadside content at all");

  const res = Object.values(counts).filter((c) => c.character === "residential");
  const art = Object.values(counts).filter((c) => c.character === "arterial");
  const avg = (a) => a.reduce((x, y) => x + y.per100, 0) / (a.length || 1);
  avg(res) > avg(art) * 2
    ? ok(`a residential street is far denser than an arterial (${avg(res).toFixed(0)} vs ${avg(art).toFixed(0)} props per 100m)`)
    : fail(`density does not separate character (${avg(res).toFixed(0)} vs ${avg(art).toFixed(0)} per 100m)`);
}

/* ---------- 5. and that density is genuinely harder to see out of --- */
console.log("\n5. DENSITY IS THE DIFFICULTY DIAL, MEASURED THROUGH SIGHT");
{
  /* The claim the whole design rests on: environmental density is the
     occlusion budget and the difficulty dial at once. So it has to show
     up in what the candidate can SEE, not in a separate setting. */
  console.log("\n   tile            people hidden by props   sightings");
  console.log("   " + "-".repeat(58));
  const blockedRate = {};
  for (const t of TILES) {
    const tile = withSpec(t);
    const drive = driveThroughTiles({ tiles: [tile, tile], legs: [legFor(tile.spec), legFor(tile.spec)] });
    const link = drive.links[0];
    /* Across many seeds, so the claim rests on a real sample rather than
       on whichever handful of people one draw happened to place. */
    let blocked = 0, total = 0;
    for (let seed = 1; seed <= 40; seed++) {
    const blockers = kerbsideFor(tile, link, seed * 37).map((b) => ({
      p: { id: b.id, kind: "static" }, pose: { x: b.x, y: b.y, rot: b.rot }, hl: b.hl, hw: b.hw,
    }));
    /* Look from the road at the people standing AT THE KERB further up
       it — which is where roadsideLifeFor puts them, and where the parked
       cars are. That is the case the whole design turns on: a pedestrian
       is hidden precisely because the props that make the street feel
       lived-in are between you and them. Sighting along the centreline
       would never cross the kerb and would measure nothing. */
    const people = roadsideLifeFor(tile, link, seed * 91);
    const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    for (let k = 0.05; k <= 0.6; k += 0.05) {
      const eye = { x: link.from.x + dx * k, y: link.from.y + dy * k };
      for (const person of people) {
        const along = (person.x - link.from.x) * ux + (person.y - link.from.y) * uy;
        if (along <= len * k) continue;          // behind the eye
        total++;
        const v = visibility(eye, { kind: "ped" }, { x: person.x, y: person.y, rot: 0 }, blockers);
        if (v !== "clear") blocked++;
      }
    }
    }
    const rate = total ? blocked / total : 0;
    blockedRate[t.character] = Math.max(blockedRate[t.character] ?? 0, rate);
    console.log(`   ${t.id.padEnd(15)} ${(rate * 100).toFixed(0).padStart(19)}% ${String(total).padStart(12)}`);
  }
  (blockedRate.residential ?? 0) > (blockedRate.arterial ?? 0)
    ? ok(`a residential street genuinely blocks more sight than an arterial (${((blockedRate.residential) * 100).toFixed(0)}% vs ${((blockedRate.arterial) * 100).toFixed(0)}%)`)
    : fail(`density did not translate into occlusion (${JSON.stringify(blockedRate)})`);
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: tiles keep their promises, and density is the difficulty." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
