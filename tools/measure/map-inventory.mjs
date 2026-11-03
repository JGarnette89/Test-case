/* THE MAP INVENTORY (handoff 2026-10-28 evening section 9, item 1):
   which features exist on which map, COUNTED from each loaded map rather
   than read off its name or blurb -- a blurb is a claim, the loaded map is
   the fact. Prints MAP-INVENTORY.md's first table to stdout:

     node tools/measure/map-inventory.mjs > /tmp/inv.md

   The maps: every TEST_MAPS entry (what #/tests offers), the bench's map
   (#/bench), and the default brief at seed 1 (#/tests "make a map"). The
   intersection type is brief.js `typeOfNode`, the one definition. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { mapFromBrief, DEFAULT_BRIEF, typeOfNode } from "../../src/map/brief.js";
import { benchMap } from "../../src/iso/benchworld.js";
import { graphOf } from "../../src/sim/graph.js";
import { sidewalksOf } from "../../src/map/sidewalks.js";
import { carsFor } from "../../src/map/cars.js";
import { TRUCK_SHARE } from "../../src/sim/crossing.js";

const maps = [
  ...TEST_MAPS.map((t) => ({ id: t.id, where: "#/tests", raw: t.build() })),
  { id: "bench", where: "#/bench", loaded: benchMap() },
  { id: "brief-default", where: "#/tests, make a map", raw: mapFromBrief(DEFAULT_BRIEF, 1) },
];

const headingTurn = (r) => {
  /* How much a road turns along its own length, end to end of its interior
     (not at its ends, where an intersection turns it): the sum of every
     change of heading between samples. A bend 189 m round at 60 km/h turns
     about 3 degrees in 10 m, so a short window sees nothing; the total does. */
  const p = r.pts;
  let total = 0;
  for (let i = 2; i < p.length - 1; i++) {
    const a = Math.atan2(p[i - 1].y - p[i - 2].y, p[i - 1].x - p[i - 2].x), b = Math.atan2(p[i].y - p[i - 1].y, p[i].x - p[i - 1].x);
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += Math.abs(d);
  }
  return (total * 180) / Math.PI;
};
/* The real extent: the box round every road point (a map's stored bounds can be a chunk default). */
const extentKm2 = (L) => {
  const xs = L.roads.flatMap((r) => r.pts.map((q) => q.x)), ys = L.roads.flatMap((r) => r.pts.map((q) => q.y));
  return Math.round((((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / 1e6) * 100) / 100;
};

const rows = [];
for (const m of maps) {
  const L = m.loaded ?? loadMap(m.raw);
  const raw = m.raw ?? null;
  const roads = Object.fromEntries(L.roads.map((r) => [r.id, r]));
  const course = graphOf(L, { conflicts: false });
  const major = L.nodes.filter((n) => n.legs.length >= 3);
  const types = {};
  for (const n of major) { const t = typeOfNode(L, n); types[t] = (types[t] ?? 0) + 1; }
  const byLegs = { 3: 0, 4: 0, "5+": 0 };
  for (const n of major) byLegs[n.legs.length >= 5 ? "5+" : n.legs.length]++;
  const km = (f) => Math.round(L.roads.filter(f).reduce((s, r) => s + r.length, 0) / 100) / 10;
  const kinds = {};
  for (const r of L.roads) kinds[r.kind] = Math.round(((kinds[r.kind] ?? 0) + r.length / 1000) * 10) / 10;
  const twoLeg = L.nodes.filter((n) => n.legs.length === 2);
  const lanesOf = (l) => roads[l.road]?.lanes ?? 1;
  const signKinds = {};
  for (const s of L.signs ?? []) signKinds[s.kind] = (signKinds[s.kind] ?? 0) + 1;
  for (const r of L.roads) for (const e of ["start", "end"]) if (String(r.control?.[e]).includes("no-right-on-red")) signKinds["no-right-on-red"] = (signKinds["no-right-on-red"] ?? 0) + 1;
  const walks = (() => { try { return sidewalksOf(L).length; } catch { return "?"; } })();
  rows.push({
    id: m.id, where: m.where,
    km2: extentKm2(L),
    roadKm: km(() => true), kinds,
    cars: carsFor(L),
    T: byLegs[3], cross: byLegs[4], five: byLegs["5+"],
    signal: types.signal ?? 0, arrow: types["signal-arrow"] ?? 0, allStop: types["all-stop"] ?? 0,
    minorStop: types["minor-stop"] ?? 0, minorYield: types["minor-yield"] ?? 0, uncontrolled: types.none ?? 0,
    waves: course.waves?.systems?.length ?? 0,
    signs: signKinds,
    oneWay: L.roads.filter((r) => r.oneWay).length,
    speeds: [...new Set(L.roads.map((r) => r.speed))].sort((a, b) => a - b),
    crosswalks: L.roads.reduce((s, r) => s + (r.crosswalk?.start ? 1 : 0) + (r.crosswalk?.end ? 1 : 0), 0),
    midblock: twoLeg.filter((n) => n.legs.every((l) => l.control === "stop")).length,
    curbStops: (L.stops ?? []).filter((s) => s.kind === "curb").length,
    bayStops: (L.stops ?? []).filter((s) => s.kind === "bay").length,
    turnBays: L.roads.filter((r) => r.bays && (r.bays.start || r.bays.end)).length,
    accel: L.roads.filter((r) => r.accel && (r.accel.start || r.accel.end)).length,
    laneDrop: twoLeg.filter((n) => lanesOf(n.legs[0]) !== lanesOf(n.legs[1])).length,
    overpass: (L.crossings ?? []).filter((c) => c.over).length,
    riseM: Math.round(Math.max(0, ...L.roads.flatMap((r) => r.pts.map((p) => p.z ?? 0))) * 10) / 10,
    bends: L.roads.filter((r) => headingTurn(r) > 25).length,
    highwayJunctions: L.nodes.filter((n) => n.legs.length >= 3 && n.legs.some((l) => roads[l.road]?.kind === "highway")).length,
    parkingKm: km((r) => r.parking && r.parking !== "none"),
    buildings: (L.props ?? []).length,
    sidewalks: walks,
    zones: (L.zones ?? []).map((z) => `${z.kind}${z.character && z.character !== "ordinary" ? `/${z.character}` : ""}`),
    generated: raw ? raw.roads.filter((r) => r.gen).length : "?",
    trucks: L.traffic?.trucks ?? TRUCK_SHARE,
    shaped: !!L.traffic?.shape,
    sections: (L.sections ?? []).length,
    warnings: L.warnings.length,
  });
}

const fmt = (o) => (Array.isArray(o) ? (o.length ? o.join(", ") : "--") : typeof o === "object" ? (Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ") : "--") : o === 0 ? "--" : String(o));
const FEATURES = [
  ["Offered on", "where"], ["Extent of its roads (km²)", "km2"], ["Road (km)", "roadKm"], ["Road by kind (km)", "kinds"], ["Default cars", "cars"],
  ["T intersections", "T"], ["Crossroads", "cross"], ["Five-way or more", "five"],
  ["Signals", "signal"], ["Signals with a left arrow", "arrow"], ["Green-wave systems", "waves"],
  ["All-way stops", "allStop"], ["Stop on the minor road", "minorStop"], ["Yield on the minor road", "minorYield"], ["Uncontrolled (incl. highway splits)", "uncontrolled"], ["Highway junctions (ramps meeting)", "highwayJunctions"],
  ["Signs as objects", "signs"], ["One-way roads", "oneWay"], ["Speed limits (km/h)", "speeds"],
  ["Crosswalk ends", "crosswalks"], ["Mid-block crossings", "midblock"], ["Sidewalk pieces", "sidewalks"],
  ["Bus stops, curb", "curbStops"], ["Bus stops, bay", "bayStops"],
  ["Roads with turn bays", "turnBays"], ["Acceleration lanes", "accel"], ["Lane drops (lanes change at a join)", "laneDrop"],
  ["Overpasses", "overpass"], ["Highest point (m)", "riseM"], ["Roads turning over 25° along their length", "bends"],
  ["Parking (km of road)", "parkingKm"], ["Buildings", "buildings"], ["Zones (kind/character)", "zones"], ["Generated streets", "generated"],
  ["Truck share", "trucks"], ["Density shaping asked for", "shaped"], ["Sections", "sections"], ["Load warnings", "warnings"],
];
console.log(`| Feature | ${rows.map((r) => `\`${r.id}\``).join(" | ")} |`);
console.log(`|---|${rows.map(() => "---").join("|")}|`);
for (const [label, key] of FEATURES) console.log(`| ${label} | ${rows.map((r) => fmt(r[key])).join(" | ")} |`);
