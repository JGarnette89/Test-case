/* =====================================================================
   ENVIRONMENTS
   What sits either side of the road. Purely scenery — it changes nothing
   the engine decides, and the engine cannot see it. Kept out of
   src/engine/ for that reason.

   Data, not code: an environment declares a palette and the kinds of thing
   scattered in it, and one generic placer draws all of them. Adding a
   fourth setting is an entry in this file, not a new component.

   Chosen from the scenario's id rather than at random, so a given
   situation always looks the same. That matters more than it sounds: the
   daily has to be identical for everyone who plays it, and a scenario that
   redecorated itself on every retry would be its own distraction.
   ===================================================================== */

/* Item kinds the placer understands:
     block  a building — body plus a darker roof inset
     pad    flat ground: a driveway, a parking apron, a yard
     tree   canopy over a trunk
     patch  a soft ground-colour variation, no outline                    */
export const ENVIRONMENTS = [
  {
    id: "city",
    name: "City",
    ground: "#6A6D75",
    groundDark: "#5E6169",
    density: 30,
    items: [
      { kind: "block", weight: 7, w: [44, 120], h: [44, 120], fill: "#4B4F59", roof: "#3D414B" },
      { kind: "block", weight: 3, w: [30, 60], h: [30, 60], fill: "#545865", roof: "#444852" },
      { kind: "pad", weight: 3, w: [34, 78], h: [26, 56], fill: "#5C5F68" },
      { kind: "tree", weight: 2, r: [7, 10], fill: "#4E7746", trunk: "#4A3B2E" },
    ],
  },
  {
    id: "suburban",
    name: "Suburban",
    ground: "#5E8A54",
    groundDark: "#4E7746",
    density: 24,
    items: [
      { kind: "block", weight: 5, w: [38, 66], h: [34, 58], fill: "#8C7A63", roof: "#6B5B48" },
      { kind: "pad", weight: 4, w: [22, 40], h: [30, 54], fill: "#7C7F86" },
      { kind: "tree", weight: 6, r: [9, 15], fill: "#456F3E", trunk: "#4A3B2E" },
      { kind: "patch", weight: 3, w: [40, 90], h: [26, 60], fill: "#65915A" },
    ],
  },
  {
    id: "rural",
    name: "Rural",
    ground: "#6C8F4C",
    groundDark: "#5C7D42",
    density: 18,
    items: [
      { kind: "patch", weight: 8, w: [70, 170], h: [50, 130], fill: "#7A9A55" },
      { kind: "patch", weight: 4, w: [60, 150], h: [44, 110], fill: "#A9A05C" },
      { kind: "tree", weight: 5, r: [11, 19], fill: "#3F6637", trunk: "#4A3B2E" },
      { kind: "block", weight: 1, w: [46, 74], h: [38, 60], fill: "#8A4A3C", roof: "#6E3B30" },
    ],
  },
];

export const environmentById = (id) => ENVIRONMENTS.find((e) => e.id === id) || ENVIRONMENTS[0];

/* Stable 32-bit hash of a string, so the same scenario id always picks the
   same setting on every device. */
function hashId(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function environmentFor(scenarioId) {
  return ENVIRONMENTS[hashId(scenarioId) % ENVIRONMENTS.length];
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* =====================================================================
   Placement
   Scenery must never sit on the road, on a crosswalk, or inside a
   roundabout. `keepOut` describes the road so this file does not have to
   know the layouts — the renderer, which does, hands it in.

   `bounds` describes how much ground there is to fill: `{ cx, cy, half }`,
   a square of that half-extent centred on (cx, cy). Defaults to the
   original fixed 720x720 board (half 360, centred at 360,360) so nothing
   that does not pass bounds explicitly changes behaviour. A scenario
   whose camera opens wider than that board needs more ground than the
   default reaches, or the extra space a wide camera reveals is bare —
   see worldHalfFor in ../frame.js, which is what the renderer measures
   this from. `density` scales with the area actually being filled, on
   the same reasoning: the number env.density names was tuned for the
   720x720 board, and holding it fixed over a much larger board would
   thin the scenery out rather than fill the space a wider camera opened.
   ===================================================================== */
const BASE_HALF = 360;
export function scatter(env, seed, keepOut, bounds = { cx: 360, cy: 360, half: BASE_HALF }) {
  const r = rng(seed);
  const pick = (lo, hi) => lo + r() * (hi - lo);
  const { cx, cy, half } = bounds;

  // Weighted bag, resolved once.
  const bag = [];
  for (const it of env.items) for (let i = 0; i < (it.weight || 1); i++) bag.push(it);

  const clear = (x, y, hw, hh) => {
    for (const z of keepOut) {
      if (z.kind === "band") {
        // An infinite strip: horizontal or vertical.
        if (z.axis === "x" && Math.abs(x - z.at) < z.half + hw + z.pad) return false;
        if (z.axis === "y" && Math.abs(y - z.at) < z.half + hh + z.pad) return false;
      } else if (z.kind === "circle") {
        const reach = Math.hypot(hw, hh);
        if (Math.hypot(x - z.x, y - z.y) < z.r + reach + z.pad) return false;
      }
    }
    return true;
  };

  const out = [];
  // Capped: a camera that opened very wide should still fill it, but not
  // at unbounded cost. 6x the tuned baseline is comfortably past anything
  // a scenario built so far asks for.
  const areaRatio = Math.min(6, (half * half) / (BASE_HALF * BASE_HALF));
  const target = Math.round(env.density * areaRatio);
  // Bounded: a crowded layout should thin out rather than spin.
  for (let attempt = 0; attempt < target * 14 && out.length < target; attempt++) {
    const spec = bag[Math.floor(r() * bag.length)];
    const isTree = spec.kind === "tree";
    const rad = isTree ? pick(spec.r[0], spec.r[1]) : 0;
    const w = isTree ? rad * 2 : pick(spec.w[0], spec.w[1]);
    const h = isTree ? rad * 2 : pick(spec.h[0], spec.h[1]);
    const x = pick(cx - half + w, cx + half - w);
    const y = pick(cy - half + h, cy + half - h);
    if (!clear(x, y, w / 2, h / 2)) continue;
    out.push({
      kind: spec.kind, x, y, w, h, r: rad,
      fill: spec.fill, roof: spec.roof, trunk: spec.trunk,
      rot: spec.kind === "patch" ? pick(0, 180) : 0,
    });
  }
  return out;
}
