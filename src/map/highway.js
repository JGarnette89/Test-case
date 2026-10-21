/* =====================================================================
   THE OPEN HIGHWAY (21 October). The maintainer: "the endless highway
   being a circle is more like a NASCAR track and doesn't really represent
   what the experience of driving is like ... I was on the 403 the other
   day traveling to Toronto, and the 90kmh limit sections downhill were
   genuinely exciting and fun to drive even in moderate traffic."

   So: a highway that goes somewhere, with a character that CHANGES along
   it -- what made the 403 memorable was a section, and a uniform road is a
   longer circle. One carriageway, open at both ends: traffic comes in at
   the start and up the on-ramps and leaves at the far end and down the
   off-ramps, so a queue drains instead of meeting its own tail
   (DECISIONS.md 10.14).

   ABOUT 15 KM, NOT 30-40. The car budget on a phone is 300-400, and the
   loop runs about 200 cars on 31 lane-km; 15 km of mostly three lanes is
   about 45 lane-km, the loop's density at about 300 cars. A 35 km road at
   that budget would be empty around the player: longer needs density
   shaping (DECISIONS 10.10), and that is the maintainer's call once he
   has driven this.

   Built only from what the network supports: lane counts change AT
   junctions -- a lane added where two roads meet, an exit-only curb lane
   -- never mid-road (a lane drop along a road is not built). Not an
   on-ramp that becomes a through lane: a one-way road's lanes are centred
   on it, so two lanes becoming three shifts the through lanes across the
   junction into the slip road's path -- two conflicts, and the two queues
   hold each other (measured, the first draft of this map);
   entrances with acceleration lanes (map/accel.js); a limit that changes
   at a two-road node, where the speed sign goes. EVERY JUNCTION IS ON
   LEVEL GROUND: grade lives between interchanges until the clearing
   predictions at a junction know about slope.
   ===================================================================== */
import { emptyMap, road } from "./format.js";

/* Along the road, u metres: the sections. Grade in rise over run; curve
   in degrees of heading per km (positive turns right -- y is down). */
const STEP = 4;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const GRADES = [
  /* [from, to, grade]: eased in and out over EASE metres at each end (a vertical curve) */
  [2300, 4800, 0.045],     // THE CLIMB: 112 m in 2.5 km, trucks on it
  [7600, 10400, -0.04],    // THE DOWNHILL 90
  [11900, 12600, 0.02],    // rolling
  [12700, 13200, -0.02],
];
const EASE = 250;
const CURVES = [
  [2500, 3400, 6], [3700, 4500, -5],      // the climb winds
  [7800, 8800, -4], [9200, 10200, 5],     // so does the downhill
  [11800, 12400, 7], [12600, 13200, -7],
];
const at = (u) => {
  let g = 0, c = 0;
  for (const [a, b, gr] of GRADES) g += gr * Math.min(smooth((u - a) / EASE), smooth((b - u) / EASE));
  for (const [a, b, cv] of CURVES) if (u > a && u < b) c += cv * Math.min(smooth((u - a) / 150), smooth((b - u) / 150));
  return { g, c };
};

/* The centreline: integrated from u = 0, heading east. */
const LENGTH = 15000;
const line = (() => {
  const pts = [];
  let x = 0, y = 0, z = 0, h = 0;
  for (let u = 0; u <= LENGTH; u += STEP) {
    pts.push({ u, x, y, z, h });
    const { g, c } = at(u);
    h += ((c / 1000) * STEP * Math.PI) / 180;
    x += Math.cos(h) * STEP; y += Math.sin(h) * STEP; z += g * STEP;
  }
  return pts;
})();
const r2 = (v) => Math.round(v * 10000) / 10000;
const P = (u) => line[Math.min(line.length - 1, Math.round(u / STEP))];

/* The interchanges and the roads between them. */
const NODES = [
  { u: 1500, kind: "accel", ramp: "on-1" },
  { u: 5600, kind: "exitOnly", ramp: "off-1" },   // the curb lane leaves
  { u: 6300, kind: "accel", ramp: "on-2" },
  { u: 7400, kind: "limit" },                      // 2 lanes to 3, and 100 to 90
  { u: 10800, kind: "exit", ramp: "off-2" },
  { u: 11500, kind: "accel", ramp: "on-3" },
  { u: 13500, kind: "exitOnly", ramp: "off-3" },
];
const SPANS = [
  /* [from, to, lanes, km/h] */
  [0, 1500, 3, 100],
  [1500, 5600, 3, 100],
  [5600, 6300, 2, 100],
  [6300, 7400, 2, 100],
  [7400, 10800, 3, 90],
  [10800, 11500, 3, 100],
  [11500, 13500, 3, 100],
  [13500, LENGTH, 2, 100],
];
const ACCEL = 350;   // m: map/accel.js, as on the loop -- a flagged figure
const RAMP = 400, ANG = (35 * Math.PI) / 180;

export function testHighway() {
  const m = emptyMap("test-highway-long", "The open highway -- 15 km that change character: a climb, a downhill 90, interchanges");
  m.traffic = { trucks: 0.15 };
  const xs = line.map((p) => p.x), ys = line.map((p) => p.y);
  m.bounds = { x: Math.min(...xs) - 800, y: Math.min(...ys) - 800, w: Math.max(...xs) - Math.min(...xs) + 1600, h: Math.max(...ys) - Math.min(...ys) + 1600 };
  SPANS.forEach(([a, b, lanes, kmh], i) => {
    const pts = [];
    for (let u = a; u < b; u += STEP) { const p = P(u); pts.push({ x: r2(p.x), y: r2(p.y), z: r2(p.z) }); }
    const e = P(b); pts.push({ x: r2(e.x), y: r2(e.y), z: r2(e.z) });
    const startNode = NODES.find((n) => n.u === a), endNode = NODES.find((n) => n.u === b);
    const extra = {};
    if (startNode?.kind === "accel") extra.accel = { start: { from: startNode.ramp, length: ACCEL } };
    /* An exit-only curb lane: the approach's last lane may only leave. */
    if (endNode?.kind === "exitOnly") extra.turns = { end: Array.from({ length: lanes }, (_, j) => (j === lanes - 1 ? ["right"] : ["straight"])) };
    m.roads.push(road({ id: `hw-${i}`, kind: "highway", lanes, speed: kmh, oneWay: true, points: pts, ...extra }));
  });
  /* Ramps: 400 m at 35 degrees off the right of travel, level at the node's height. */
  for (const n of NODES) {
    if (!n.ramp) continue;
    const p = P(n.u), z = r2(p.z);
    const right = (h, d) => ({ x: Math.cos(h) * d, y: Math.sin(h) * d });
    const pts = [];
    if (n.ramp.startsWith("off")) {
      const d = right(p.h + ANG, RAMP);
      for (let i = 0; i <= 40; i++) pts.push({ x: r2(p.x + (d.x * i) / 40), y: r2(p.y + (d.y * i) / 40), z });
      m.roads.push(road({ id: n.ramp, kind: "arterial", lanes: 1, oneWay: true, speed: 60, points: pts }));
    } else {
      const d = right(p.h - ANG, RAMP);
      for (let i = 0; i <= 40; i++) pts.push({ x: r2(p.x - d.x + (d.x * i) / 40), y: r2(p.y - d.y + (d.y * i) / 40), z });
      m.roads.push(road({ id: n.ramp, kind: "arterial", lanes: 1, oneWay: true, speed: 80, points: pts }));
    }
  }
  const look = (u, side = 250) => { const p = P(u); return { x: r2(p.x + Math.cos(p.h + Math.PI / 2) * side * 0.4), y: r2(p.y + Math.sin(p.h + Math.PI / 2) * side * 0.4) }; };
  m.sections = [
    { id: "climb", name: "the climb", look: look(3500), start: { road: "on-1", end: "end" }, judge: "Join from the acceleration lane, then climb: 2.5 km at 4.5%. Loaded trucks lose speed on it; does a queue form behind them, and do the confident drivers pull out to pass while the timid sit?" },
    { id: "downhill", name: "the downhill 90", look: look(8800), start: { road: "on-2", end: "end" }, judge: "Join from the acceleration lane, then the limit drops to 90 for 2.8 km downhill at 4%. Is it fun? Who creeps over the limit, and do the trucks hold back?" },
    { id: "exit-only", name: "an exit-only lane", look: look(5600), start: { road: "on-1", end: "end" }, judge: "Over the crest the curb lane leaves as an exit-only lane: anybody going on has to be out of it in time -- who leaves it late?" },
    { id: "rolling", name: "the rolling end", look: look(12500), start: { road: "on-3", end: "end" }, judge: "Rolling hills and curves to the end, where the curb lane leaves again and two lanes carry on." },
  ];
  return m;
}
