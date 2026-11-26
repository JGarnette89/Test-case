/* =====================================================================
   THE GAME LOOK'S CHECK (WORK-game-slice10 section 5), called from
   verify-rounds.mjs as its section 20.

   The drawing is judged through a RECORDING CANVAS: every call and every
   assignment is logged, and fills, strokes, text and arcs are kept as
   structured ops with their style and path, so a check can say "this
   path has 8 vertices, is filled red and is 33 px across" about what
   was painted. Nothing here reads a pixel.

   Every negative assertion carries its own line asserting the case arose.
   ===================================================================== */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { drawFrame } from "../../src/iso/draw.js";
import { viewOf } from "../../src/iso/project.js";
import { cornersOf, pushStats, signPx, SPEED_MAX_PX, PLATE_TEXT_MIN_PX, SIGN_MIN_PX, SIGN_MAX_PX, PERSON_MIN_PX, BAR_MIN_PX, STOP_MIN_PX, RETURN_R, spriteStats } from "../../src/iso/gamelook.js";
import { lightAt, arrowAt } from "../../src/sim/signal.js";
import { loadMap, groundFor } from "../../src/map/load.js";
import * as MAPS from "../../src/map/samples.js";
import { sidewalksOf } from "../../src/map/sidewalks.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { playedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { pedPose } from "../../src/sim/peds.js";
import { driverPose, carriedPlayer } from "../../src/sim/drive.js";
import { TYPES } from "../../src/game/rounds.js";
import { toDecision } from "../../src/game/round.js";
import { frameCamera, decisionFrame } from "../../src/game/stage.js";

/* The look's own colours, restated here (not imported) so a wrong colour in the module cannot also be what the check expects [stated in the check]. */
const RED = "#d4202a", WHITE = "#f7f7f2", HOUSING = "#14161b";
const LENS = { red: "#e4483c", amber: "#f2b84b", green: "#4fd07a" };
const DARK = { red: "#4a2622", amber: "#4a3d22", green: "#22402e" };
const LEADER = "rgba(70,74,82,0.9)", CURB = "#e2dfd6", ZEBRA = "rgba(250,250,242,0.95)", STOPLINE = "rgba(252,252,246,0.98)";

/* A canvas context that records. */
export function recorder() {
  const raw = [], fills = [], strokes = [], texts = [], arcs = [], images = [], groups = [];
  let open = null;
  let path = [];
  const st = { fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, font: "", globalAlpha: 1, lineCap: "butt", lineJoin: "miter", textAlign: "start", textBaseline: "alphabetic" };
  const n = (v) => (typeof v === "number" ? +v.toFixed(3) : String(v));
  const box = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const M = {
    beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); }, closePath() {},
    arc(x, y, r) { path.push({ arc: [x, y, r] }); },
    rect(x, y, w, h) { path.push(...box(x, y, w, h)); }, roundRect(x, y, w, h) { path.push(...box(x, y, w, h)); },
    fill() { fills.push({ style: st.fillStyle, pts: path.slice(), at: raw.length }); },
    stroke() { strokes.push({ style: st.strokeStyle, lw: st.lineWidth, pts: path.slice(), at: raw.length }); },
    fillRect(x, y, w, h) { fills.push({ style: st.fillStyle, pts: box(x, y, w, h), rect: { w, h }, at: raw.length }); },
    strokeRect(x, y, w, h) { strokes.push({ style: st.strokeStyle, lw: st.lineWidth, pts: box(x, y, w, h), rect: { w, h }, at: raw.length }); },
    fillText(s, x, y) { texts.push({ s, style: st.fillStyle, font: st.font, x, y, at: raw.length }); },
    save() { open = raw.length; }, restore() { if (open != null) groups.push({ start: open, end: raw.length - 1 }); open = null; },
    drawImage(img, x, y, w, h) { images.push({ x, y, w, h, at: raw.length }); },
    getTransform() { return { a: 1 }; },
    measureText(s) { return { width: String(s).length * 6 }; },
  };
  const ctx = new Proxy({}, {
    get: (_, p) => {
      if (p in st) return st[p];
      if (p === "canvas") return { width: 1, height: 1 };
      return (...a) => { raw.push(`${String(p)}(${a.map(n).join(",")})`); return M[p] ? M[p](...a) : undefined; };
    },
    set: (_, p, v) => { raw.push(`${String(p)}=${n(v)}`); st[p] = v; return true; },
  });
  return { ctx, raw, fills, strokes, texts, arcs, images, groups };
}
const ptsOf = (op) => op.pts.flatMap((p) => (p.arc ? [[p.arc[0] - p.arc[2], p.arc[1] - p.arc[2]], [p.arc[0] + p.arc[2], p.arc[1] + p.arc[2]]] : [p]));
export function bboxOf(ops) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const op of ops) for (const [x, y] of ptsOf(op)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { w: x1 - x0, h: y1 - y0, x0, y0, x1, y1 };
}
const SIZE = { w: 412, h: 915 };
const draw = (scene, opts = {}, fn = drawFrame) => { const r = recorder(); const out = fn(r.ctx, SIZE, scene, opts); return { ...r, out }; };
const asphaltOf = (world, p) => ({ id: p.id, x: p.x, y: p.y });
void asphaltOf;

/* The scene of a loaded map's world, at a camera. */
function sceneOf(loaded, world, actors, cam, k, rot = 0) {
  const ground = groundFor(loaded, { cell: 20 });
  return { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: [], groundAt: ground, junctions: junctionsOf(world.course), sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: [], cam, rot, k, tilt: false, actors, t: world.t, lights: world.lights };
}
const actorsOfWorld = (world) => [
  ...world.actors.filter((a) => !a.shadow).map((a) => { const p = poseOf(world, a); return { id: a.id ?? a.n, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, n: Math.abs(+a.n || 0), player: a.player, ...(a.player ? { colour: "#ffd23f" } : {}) }; }),
  ...(world.peds ?? []).map((q) => ({ id: q.id, n: Math.abs(+(q.look ?? q.n) || 0), ...pedPose(world, q), ped: true, struck: q.state === "struck" })),
];

/* A hazard decision scene with a person in view: the round's freeze, then the world stepped (the sim's own people) until somebody is on the screen. */
function roundScenes(want) {
  const out = [];
  for (const type of TYPES) {
    const ht = type.hazardType;
    for (const seed of ht.pools.hazard.slice(0, 6)) {
      if (out.filter((s) => s.type === ht.id).length >= want) break;
      const rs = toDecision(ht, seed, ht.cars);
      if (!rs) continue;
      const p = driverPose(carriedPlayer(rs.me, 0), rs.world.course), fr = frameCamera(decisionFrame(rs), p, SIZE);
      const loaded = loadMap(ht.map());
      const view = viewOf(fr.k, { ...fr.cam, id: null }, fr.rot, SIZE);
      let world = rs.world, seen = null;
      for (let i = 0; i < 40 * 20 && !seen; i++) {
        const onScreen = (world.peds ?? []).filter((q) => { const pp = pedPose(world, q); return view.onScreen(pp.x, pp.y, pp.z ?? 0, 0); });
        if (onScreen.length) seen = world; else world = step(world);
      }
      if (!seen) continue;
      out.push({ type: ht.id, seed, loaded, world: seen, scene: sceneOf(loaded, seen, actorsOfWorld(seen), { ...fr.cam, id: null }, fr.k, fr.rot), rs });
    }
  }
  return out;
}
/* The plain rounds' freeze (stop signs with ALL WAY, speed limits, a crosswalk-free crossroads). */
function plainScene(type, seed) {
  const rs = toDecision(type, seed, type.cars);
  const p = driverPose(carriedPlayer(rs.me, 0), rs.world.course), fr = frameCamera(decisionFrame(rs), p, SIZE);
  const loaded = loadMap(type.map());
  return { type: `${type.id}/plain`, seed, loaded, world: rs.world, scene: sceneOf(loaded, rs.world, actorsOfWorld(rs.world), { ...fr.cam, id: null }, fr.k, fr.rot) };
}
function mapScene(name, k = 11, jIndex = 0) {
  const loaded = loadMap(MAPS[name]());
  const world = playedGraph(3, 20, loaded, { target: 60, posted: true });
  const js = junctionsOf(world.course);
  const j = js.filter((q) => q.surface.length)[jIndex];
  return { type: name, loaded, world, j, scene: sceneOf(loaded, world, actorsOfWorld(world), { x: j.at.x, y: j.at.y, z: j.at.z ?? 0, id: null }, k, 0) };
}

/* The unmodified drawFrame of the commit before this slice, loaded from git with its imports made absolute: the control for "the default is untouched". */
async function baseDrawFrame(base) {
  const src = execFileSync("git", ["show", `${base}:src/iso/draw.js`], { encoding: "utf8", cwd: new URL("../..", import.meta.url) });
  const dir = mkdtempSync(join(tmpdir(), "drawbase-"));
  const root = new URL("../../src/iso/", import.meta.url).href;
  const fixed = src.replace(/from "\.\/([^"]+)"/g, (_, f) => `from "${root}${f}"`).replace(/from "\.\.\/([^"]+)"/g, (_, f) => `from "${new URL(`../${f}`, root).href}"`);
  const file = join(dir, "draw-base.mjs");
  writeFileSync(file, fixed);
  try { return (await import(pathToFileURL(file).href)).drawFrame; } finally { rmSync(dir, { recursive: true, force: true }); }
}

export async function gameLookChecks(check, { base = "9074f5e" } = {}) {
  /* ---- the scenes ---- */
  const hz = roundScenes(4);
  const peopleSeen = hz.reduce((n, s) => n + (s.world.peds ?? []).length, 0);
  const plain = TYPES.map((t) => plainScene(t, t.pools.now[0]));
  const tm1 = mapScene("testMap1"), loop = mapScene("testLoop"), signs = mapScene("testSigns");
  console.log(`        scenes: ${hz.length} hazard decision scenes carrying ${peopleSeen} people on foot (${[...new Set(hz.map((s) => s.type))].join(", ")}), ${plain.length} plain freezes, test map 1 (signals), the loop (one way, do not enter), the signs map (yield)`);

  /* ---- 1. the default is untouched ---- */
  console.log("\n  20.1 THE DEFAULT IS UNTOUCHED");
  {
    const src = readFileSync(new URL("../../src/iso/draw.js", import.meta.url), "utf8");
    const code = src.split("\n").filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l));
    const tests = code.filter((l) => /const game = look === "game"/.test(l));
    const uses = code.filter((l) => /\bGL\./.test(l)), bare = uses.filter((l) => !/\bgame\b/.test(l));
    const lookReads = code.filter((l) => /(?<![.\w])look\b/.test(l) && !/const game = look === "game"/.test(l) && !/skip = null, look = null/.test(l));
    check(tests.length === 1, "draw.js reads the look once, as one `const game = look === \"game\"`");
    check(uses.length >= 6, `the game look's calls in draw.js exist (the case arose): ${uses.length} lines call into gamelook.js`);
    check(bare.length === 0, `every one of those lines is behind the \`game\` test on the same line${bare.length ? ` (not: ${bare[0].trim().slice(0, 80)})` : ""} (source text)`);
    check(lookReads.length === 0, "nothing else in draw.js reads `look`");
    const gsrc = readFileSync(new URL("../../src/game/Game.jsx", import.meta.url), "utf8");
    check(/\{ look: "game" \}\);/.test(gsrc), "Game.jsx passes look: \"game\" to drawFrame (source text)");
    const other = ["../../src/apps/MapRoad.jsx", "../../src/apps/ExamRide.jsx", "../../src/iso/bench.js", "../../src/apps/IsoRoad.jsx", "../../src/apps/Wheel.jsx"].filter((f) => /look:\s*"game"/.test(readFileSync(new URL(f, import.meta.url), "utf8")));
    check(other.length === 0, "no other screen passes the look (source text: MapRoad, ExamRide, the bench, IsoRoad, Wheel)");
    const s0 = hz[0].scene;
    const a = draw(s0), b = draw(s0, { look: null }), g = draw(s0, { look: "game" });
    check(a.raw.length > 1000, `EXPOSURE: the default frame makes ${a.raw.length} canvas calls`);
    check(a.raw.join("\n") === b.raw.join("\n"), "look absent and look null make the same call log, call for call and value for value");
    check(g.raw.join("\n") !== a.raw.join("\n"), "the game look differs from the default on the same scene (the case arose: the comparison is not between two identical things)");
    let baseDraw = null;
    try { baseDraw = await baseDrawFrame(base); } catch (e) { console.log(`        CANNOT TELL against ${base}: ${e.message.split("\n")[0]}`); }
    if (baseDraw) {
      let same = 0, total = 0;
      for (const sc of [...hz.map((x) => x.scene), ...plain.map((x) => x.scene), tm1.scene, loop.scene, signs.scene]) {
        const old = draw(sc, {}, baseDraw), now = draw(sc);
        total++; if (old.raw.join("\n") === now.raw.join("\n")) same++;
      }
      check(same === total && total >= 8, `with no look given, the call log is the unmodified draw.js of ${base}'s, on ${same} of ${total} scenes (hazard, plain, signals, loop, signs)`);
    }
  }

  /* ---- 2. people ---- */
  console.log("\n  20.2 PEOPLE ARE VISIBLE");
  {
    let smallest = Infinity, ctlSmallest = Infinity, n = 0, tallest = 0;
    for (const sc of hz) for (const q of sc.scene.actors.filter((a) => a.ped)) {
      const view = viewOf(sc.scene.k, sc.scene.cam, sc.scene.rot, SIZE);
      if (!view.onScreen(q.x, q.y, q.z ?? 0, 0)) continue;
      const alone = { ...sc.scene, roads: [], junctions: [], sidewalks: [], stops: [], props: [], actors: [q] };
      const g = draw(alone, { look: "game" }), d = draw(alone);
      const figure = (r) => [...r.fills, ...r.strokes].filter((op) => bboxOf([op]).w < SIZE.w * 0.9);   // the ground plane under everything is not the person
      const bb = bboxOf(figure(g)), bd = bboxOf(figure(d));
      smallest = Math.min(smallest, bb.h); ctlSmallest = Math.min(ctlSmallest, bd.h); tallest = Math.max(tallest, bb.h); n++;
    }
    console.log(`        [M, this run] ${n} people on the screen at the decision frame: game look painted height min ${smallest.toFixed(1)} px, max ${tallest.toFixed(1)} px; default look min ${ctlSmallest.toFixed(1)} px`);
    check(n >= 8, `EXPOSURE: ${n} people on foot measured on the screen (at least 8)`);
    check(smallest >= PERSON_MIN_PX, `every person is painted at least ${PERSON_MIN_PX} px tall under the game look (smallest ${smallest.toFixed(1)} px)`);
    check(ctlSmallest < PERSON_MIN_PX, `the control: the default look paints the same people under ${PERSON_MIN_PX} px (smallest ${ctlSmallest.toFixed(1)} px), so the floor is the look's doing`);
    /* the floor holds at any zoom */
    const q = hz[0].scene.actors.find((a) => a.ped), lows = [];
    for (const k of [2.6, 4, 8, 20, 40]) lows.push(bboxOf((() => { const r = draw({ ...hz[0].scene, k, cam: { x: q.x, y: q.y, z: q.z ?? 0, id: null }, rot: 0, roads: [], junctions: [], sidewalks: [], stops: [], props: [], actors: [q] }, { look: "game" }); return [...r.fills, ...r.strokes].filter((op) => bboxOf([op]).w < SIZE.w * 0.9); })()).h);
    check(Math.min(...lows) >= PERSON_MIN_PX, `and at zoom 2.6, 4, 8, 20 and 40 px/m: ${lows.map((x) => x.toFixed(1)).join(", ")} px`);
    /* a walking person shows it: the paint changes with the sim's clock */
    const at0 = { ...hz[0].scene, roads: [], junctions: [], sidewalks: [], stops: [], props: [], actors: [q] };
    const t0 = draw({ ...at0, t: 10 }, { look: "game" }).raw.join("\n"), t1 = draw({ ...at0, t: 10.2 }, { look: "game" }).raw.join("\n"), t2 = draw({ ...at0, t: 10 }, { look: "game" }).raw.join("\n");
    check(t0 !== t1 && t0 === t2, "the stride and the bob come from scene.t: a person painted at two clock times differs, at the same time does not");
    const lie = { ...q, struck: true }, ls = draw({ ...at0, actors: [lie], t: 10 }, { look: "game" }), ls2 = draw({ ...at0, actors: [lie], t: 10.6 }, { look: "game" });
    check(ls.fills.length > 0 && ls.fills.some((f) => f.style !== ls2.fills.find((g) => g.at === f.at)?.style), "a struck person still lies and flashes (its colour changes with the clock)");
    /* depth: a person is layer 1, so a car in front hides them: the audit tags say so */
    const au = drawFrame(recorder().ctx, SIZE, hz[0].scene, { audit: true, look: "game" });
    const first1 = au.order.findIndex((o) => o.kind === "ped" || o.kind === "car");
    check(au.order.some((o) => o.kind === "ped") && first1 >= 0, "EXPOSURE: the audited game frame carries people and cars as depth-sorted items");
  }

  /* ---- 3. signs ---- */
  console.log("\n  20.3 SIGNS ARE THEIR SHAPES");
  {
    const inView = (sc, k) => { const view = viewOf(sc.scene.k, sc.scene.cam, sc.scene.rot, SIZE); return junctionsOf(sc.world.course).filter((j) => j.surface.length && view.onScreen(j.at.x, j.at.y, j.at.z ?? 0, 40 * (k ?? sc.scene.k))); };
    const counts = {}, bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };
    const sizes = [];
    for (const sc of [...hz, ...plain, tm1, loop, signs]) {
      const g = draw(sc.scene, { look: "game" });
      const js = inView(sc), exp = {};
      for (const j of js) for (const s of j.signs) exp[s.kind] = (exp[s.kind] ?? 0) + 1;
      const allWay = js.reduce((n, j) => n + j.signs.filter((s) => s.kind === "stop" && s.allWay).length, 0);
      /* STOP: an 8-vertex path filled red, "STOP" text, at least 26 px across */
      const oct = g.fills.filter((f) => f.style === RED && f.pts.length === 8);
      const stopTexts = g.texts.filter((t) => t.s === "STOP");
      if ((exp.stop ?? 0) > 0) {
        for (const o of oct) { const bb = bboxOf([o]); sizes.push(["stop", Math.max(bb.w, bb.h)]); }
        check(oct.length === exp.stop && stopTexts.length === exp.stop, `${scName(sc)}: every stop sign (${exp.stop}) paints an 8-vertex red face with the text STOP (${oct.length} faces, ${stopTexts.length} texts)`);
        check(g.texts.filter((t) => t.s === "ALL WAY").length === allWay, `${scName(sc)}: the ALL WAY plate is painted under exactly the all-way stop signs (${allWay})`);
        for (let i = 0; i < exp.stop; i++) bump("stop");
      } else check(oct.length === 0, `${scName(sc)}: no octagon where no stop sign stands (cases: ${js.length} intersections in view)`);
      /* SPEED LIMIT: a portrait white board with MAXIMUM and the number */
      if (exp["speed-limit"]) {
        const nums = js.flatMap((j) => j.signs.filter((s) => s.kind === "speed-limit").map((s) => String(s.kmh)));
        const max = g.texts.filter((t) => t.s === "MAXIMUM"), got = g.texts.filter((t) => nums.includes(t.s) && t.style === "#16171a");
        const boards = g.fills.filter((f) => f.rect && f.style === WHITE && f.rect.h > f.rect.w * 1.1);
        for (const b of boards) sizes.push(["speed", Math.max(b.rect.w, b.rect.h)]);
        check(max.length === exp["speed-limit"] && got.length >= nums.length && boards.length === exp["speed-limit"], `${scName(sc)}: every speed-limit sign (${exp["speed-limit"]}) paints a white portrait board, MAXIMUM and its number (${boards.length} boards, ${max.length} MAXIMUM, numbers ${got.length}/${nums.length})`);
        for (let i = 0; i < exp["speed-limit"]; i++) bump("speed-limit");
      }
      if (exp.yield) {
        const tri = g.fills.filter((f) => f.style === RED && f.pts.length === 3);
        for (const o of tri) { const bb = bboxOf([o]); sizes.push(["yield", Math.max(bb.w, bb.h)]); }
        check(tri.length === exp.yield && !g.texts.some((t) => t.s === "YIELD"), `${scName(sc)}: every yield sign (${exp.yield}) is a red triangle, point down, with no text (${tri.length})`);
        check(tri.every((o) => o.pts[2][1] > o.pts[0][1]), "the triangle's point is below its base on the screen");
        for (let i = 0; i < exp.yield; i++) bump("yield");
      }
      if (exp["do-not-enter"]) {
        const discs = g.fills.filter((f) => f.style === RED && f.pts.length === 1 && f.pts[0].arc);
        for (const o of discs) sizes.push(["do-not-enter", 2 * o.pts[0].arc[2]]);
        check(discs.length >= exp["do-not-enter"], `${scName(sc)}: every do-not-enter sign (${exp["do-not-enter"]}) is a red disc (${discs.length}) with a white bar`);
        for (let i = 0; i < exp["do-not-enter"]; i++) bump("do-not-enter");
      }
      if (exp["one-way"]) {
        const bd = g.fills.filter((f) => f.rect && f.style === "#16171a" && f.rect.w > f.rect.h * 1.5), words = g.texts.filter((t) => t.s === "ONE WAY");
        for (const b of bd) sizes.push(["one-way", Math.max(b.rect.w, b.rect.h)]);
        check(bd.length === exp["one-way"] && words.length === exp["one-way"], `${scName(sc)}: every one-way sign (${exp["one-way"]}) is a black board with an arrow and the words ONE WAY (${bd.length}, ${words.length})`);
        for (let i = 0; i < exp["one-way"]; i++) bump("one-way");
      }
      /* SIGNAL: a housing with three lenses, exactly the one lightAt returns bright */
      if (exp.signal) {
        const housings = g.fills.filter((f) => f.style === HOUSING);
        const sigs = js.flatMap((j) => j.signs.filter((s) => s.kind === "signal").map((s) => ({ j, s })));
        check(housings.length === sigs.length, `${scName(sc)}: every signal head (${sigs.length}) paints a housing (${housings.length})`);
        let litOk = 0, threeOk = 0, arrowOk = 0, arrowHeads = 0, tall = 0;
        const dispo = (sig) => ({ lit: lightAt(sig.j.signal, sig.s.base, sc.scene.t ?? 0, sc.scene.lights?.[sig.j.k]?.live), arrow: sig.j.signal?.arrows?.[sig.s.base] ? arrowAt(sig.j.signal, sig.s.base, sc.scene.t ?? 0, sc.scene.lights?.[sig.j.k]?.live) : undefined, has: !!sig.j.signal?.arrows?.[sig.s.base] });
        const byAt = [...housings].sort((x, y) => x.at - y.at);
        const view = viewOf(sc.scene.k, sc.scene.cam, sc.scene.rot, SIZE);
        for (const sig of sigs) {
          /* the face stands on its post: its housing's bottom edge is the post top's screen point (a signal's post is 2.6 m, restated here) and it is centred on it */
          let pt = view.P(sig.s.at.x, sig.s.at.y, (sig.s.at.z ?? 0) + 2.6);
          /* a face moved off the road has a leader from the post's foot to the face's bottom edge */
          const foot = view.P(sig.s.at.x, sig.s.at.y, sig.s.at.z ?? 0), lead = g.strokes.find((q) => q.style === LEADER && Math.hypot(q.pts[0][0] - foot[0], q.pts[0][1] - foot[1]) < 0.6);
          if (lead) pt = lead.pts[1];
          const h = byAt.find((q) => { const bb = bboxOf([q]); return Math.abs((bb.x0 + bb.x1) / 2 - pt[0]) < 0.6 && Math.abs(bb.y1 - pt[1]) < 0.6; });
          if (!h) continue;
          const next = byAt[byAt.indexOf(h) + 1]?.at ?? Infinity, bb = bboxOf([h]);
          const lenses = g.fills.filter((f) => f.at > h.at && f.at < next && f.pts.length === 1 && f.pts[0].arc && (Object.values(LENS).includes(f.style) || Object.values(DARK).includes(f.style)));
          const main = lenses.filter((f) => Math.abs(f.pts[0].arc[0] - (bb.x0 + bb.x1) / 2) < 0.5).sort((x, y) => x.pts[0].arc[1] - y.pts[0].arc[1]);
          if (bb.h >= SIGN_MIN_PX) tall++;
          sizes.push(["signal", Math.max(bb.w, bb.h)]);
          const top3 = main.slice(0, 3);
          if (top3.length === 3) threeOk++;
          const lit = top3.filter((f) => Object.values(LENS).includes(f.style)), d = dispo(sig);
          if (lit.length === 1 && top3.indexOf(lit[0]) === ["red", "amber", "green"].indexOf(d.lit) && lit[0].style === LENS[d.lit]) litOk++;
          if (d.has) { arrowHeads++; const a = main[3]; if (a && a.style === (d.arrow ? LENS[d.arrow] : DARK.green)) arrowOk++; }
        }
        check(threeOk === sigs.length, `${scName(sc)}: every signal face has three lenses (${threeOk} of ${sigs.length})`);
        check(litOk === sigs.length, `${scName(sc)}: on every signal face exactly the lens lightAt returns is bright, at its own position (${litOk} of ${sigs.length}); the others are the dim colour`);
        if (arrowHeads) check(arrowOk === arrowHeads, `${scName(sc)}: a protected-left head carries its fourth lens in arrowAt's colour (${arrowOk} of ${arrowHeads})`);
        else console.log(`        ${scName(sc)}: no protected-left head in view`);
        check(tall === sigs.length, "every signal face is at least 26 px across (its height)");
        for (let i = 0; i < sigs.length; i++) bump("signal");
      }
    }
    const kinds = [...new Set(sizes.map((s) => s[0]))];
    console.log(`        [M, this run] sign faces painted, per kind: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    console.log(`        [M, this run] face size (px across, the larger of width and height) per kind: ${kinds.map((k) => { const v = sizes.filter((s) => s[0] === k).map((s) => s[1]); return `${k} ${Math.min(...v).toFixed(1)}-${Math.max(...v).toFixed(1)}`; }).join(", ")}`);
    check(["stop", "speed-limit", "signal", "yield", "do-not-enter", "one-way"].every((k) => counts[k] > 0), `EXPOSURE: every kind arose (${Object.keys(counts).join(", ")}); no-left-turn has no map, see its own line below`);
    const nonSpeed = sizes.filter((x) => x[0] !== "speed"), speeds = sizes.filter((x) => x[0] === "speed");
    check(nonSpeed.every(([, v]) => v >= SIGN_MIN_PX - 0.01), `every stop, yield, signal and prohibition face in view is at least ${SIGN_MIN_PX} px across (smallest ${Math.min(...nonSpeed.map((s) => s[1])).toFixed(1)} px, of ${nonSpeed.length} faces)`);
    check(speeds.length >= 20 && speeds.every(([, v]) => v <= SPEED_MAX_PX + 0.01), `EXPOSURE: ${speeds.length} speed-limit faces, and every one is at most ${SPEED_MAX_PX} px tall (tallest ${Math.max(...speeds.map((s) => s[1])).toFixed(1)} px)`);
    /* the zoom clamp, on a stop sign at both ends */
    const j0 = junctionsOf(plain[0].world.course)[0], stopSc = { ...plain[0].scene, cam: { x: j0.at.x, y: j0.at.y, z: 0, id: null }, rot: 0 };
    const widths = [1, 3, 11, 30, 80].map((k) => { const r = draw({ ...stopSc, k }, { look: "game" }); const o = r.fills.filter((f) => f.style === RED && f.pts.length === 8).map((f) => bboxOf([f]).w); return o.length ? Math.max(...o) : null; });
    check(widths.slice(1).every((w) => w != null) && Math.min(...widths.slice(1)) >= SIGN_MIN_PX - 0.01 && Math.max(...widths.slice(1)) <= SIGN_MAX_PX + 0.01 && Math.abs(widths[3] - widths[4]) < 0.01, `a stop sign is clamped to ${SIGN_MIN_PX}-${SIGN_MAX_PX} px across the zoom range: ${widths.map((w) => (w == null ? "-" : w.toFixed(1))).join(", ")} px at 1, 3, 11, 30 and 80 px/m (px/m 1 is the far view, painted by the default code)`);
    check(signPx(2) === SIGN_MIN_PX && signPx(100) === SIGN_MAX_PX, "the size rule (restated: 3 px per px/m between the bounds)");
    /* NO LEFT TURN: no test map carries one; one is placed on a real junction */
    const nl = JSON.parse(JSON.stringify({ at: { x: tm1.j.at.x + 3, y: tm1.j.at.y + 3 } }));
    const jn = { ...tm1.j, signs: [{ kind: "no-left-turn", at: { x: nl.at.x, y: nl.at.y, z: 0 }, heading: 0 }], signal: null, lines: [], arrows: [] };
    const nlr = draw({ ...tm1.scene, junctions: [jn] }, { look: "game" });
    const sq = nlr.fills.filter((f) => f.rect && f.style === WHITE && Math.abs(f.rect.w - f.rect.h) < 0.01), ring = nlr.strokes.filter((s) => s.style === RED && s.pts.some((p) => p.arc));
    check(sq.length === 1 && ring.length >= 1 && sq[0].rect.w >= SIGN_MIN_PX - 0.01, `a no-left-turn sign (placed on a real junction: none of the maps carries one) is a white square (${sq[0]?.rect.w.toFixed(1)} px) with a red ring and slash`);
    /* the cache */
    const made = [];
    class OC { constructor(w, h) { this.w = w; this.h = h; const r = recorder(); this.r = r; made.push(this); } getContext() { return this.r.ctx; } }
    globalThis.OffscreenCanvas = OC;
    try {
      const sc = { ...plain[0].scene, k: 12.34 };
      const f1 = draw(sc, { look: "game" }), built1 = spriteStats.built, nMade1 = made.length;
      const f2 = draw(sc, { look: "game" });
      const glyphs = (r) => r.texts.filter((t) => t.s === "STOP").length;
      const inSprites = made.reduce((n, o) => n + o.r.texts.filter((t) => t.s === "STOP").length, 0);
      check(built1 > 0 && spriteStats.built === built1 && made.length === nMade1, `the face cache: frame 1 built ${built1} sprites (stop with and without ALL WAY, speed limits), frame 2 built none (${spriteStats.built - built1} new, ${made.length - nMade1} new canvases)`);
      check(glyphs(f1) === 0 && glyphs(f2) === 0 && inSprites >= 1 && inSprites <= 2 && f2.images.length >= 4, `STOP is built once per variant into a sprite (${inSprites} builds in all) and is blitted on every frame after (${f2.images.length} drawImage calls in frame 2, no STOP text on the frame)`);
    } finally { delete globalThis.OffscreenCanvas; }
  }

  const allScenes = [...hz.map((x) => ({ ...x, decision: true })), ...plain.map((x) => ({ ...x, decision: true })), tm1, loop, signs];
  await faceChecks(check, allScenes);

  /* ---- 4. the intersection ---- */
  console.log("\n  20.4 THE INTERSECTION");
  {
    let corners = 0, cornersWant = 0, bars = 0, barsWant = 0, minBar = Infinity, lines = 0, linesWant = 0, minLine = Infinity, worstR = 0, shortest = Infinity;
    for (const sc of [...hz, ...plain]) {
      const view = viewOf(sc.scene.k, sc.scene.cam, sc.scene.rot, SIZE);
      const js = junctionsOf(sc.world.course).filter((j) => j.surface.length && view.onScreen(j.at.x, j.at.y, 0, 40 * sc.scene.k));
      const g = draw(sc.scene, { look: "game" });
      const au = drawFrame(recorder().ctx, SIZE, sc.scene, { audit: true, look: "game" });
      /* a crossroads of four legs has four corners (stated here, not read from the module) */
      cornersWant += 4 * js.length;
      const tags = au.order.filter((o) => o.kind === "curb-return");
      corners += tags.length;
      const arcs = g.strokes.filter((s) => s.style === CURB && s.pts.length === 9);
      check(arcs.length === 4 * js.length, `${scName(sc)}: a curb-return arc is painted at each of the ${4 * js.length} corners (${arcs.length})`);
      for (const c of cornersOf(sc.scene.sidewalks)) { worstR = Math.max(worstR, c.r); }
      const zebra = js.reduce((n, j) => n + j.lines.filter((l) => l.kind === "zebra").length, 0), zs = g.strokes.filter((s) => s.style === ZEBRA);
      barsWant += zebra; bars += zs.length; for (const s of zs) minBar = Math.min(minBar, s.lw);
      const stops = js.reduce((n, j) => n + j.lines.filter((l) => l.kind === "stop").length, 0), ss = g.strokes.filter((s) => s.style === STOPLINE);
      linesWant += stops; lines += ss.length; for (const s of ss) minLine = Math.min(minLine, s.lw);
      /* paint order: every game floor item before every item with height */
      const order = au.order, lastFloor = Math.max(...order.map((o, i) => (o.layer === 0.5 ? i : -1))), firstTall = order.findIndex((o) => ["car", "ped", "sign", "prop", "stop"].includes(o.kind));
      check(lastFloor >= 0 && firstTall > lastFloor, `${scName(sc)}: every layer-0.5 game item (curbs, returns: ${order.filter((o) => o.layer === 0.5).length}) is painted before every car, person and sign (last at ${lastFloor}, first with height at ${firstTall})`);
    }
    console.log(`        [M, this run] ${corners} curb returns tagged, radius at most ${worstR.toFixed(2)} m; ${bars} crosswalk bars, thinnest ${minBar.toFixed(2)} px; ${lines} stop-line strokes, thinnest ${minLine.toFixed(2)} px`);
    check(corners === cornersWant && corners >= 8, `at least one curb return per corner in view: ${corners} of ${cornersWant} corners, over ${hz.length + plain.length} scenes`);
    check(worstR <= RETURN_R + 1e-9 && worstR > 1, `no return is larger than ${RETURN_R} m, and the radius is a real one (the case arose: largest ${worstR.toFixed(2)} m)`);
    check(barsWant >= 10 && bars === barsWant, `EXPOSURE: ${barsWant} crosswalk bars of the sim's lines are in view, and each is painted once (${bars})`);
    check(minBar >= BAR_MIN_PX, `every crosswalk bar is at least ${BAR_MIN_PX} px wide (thinnest ${minBar.toFixed(2)} px)`);
    check(linesWant >= 4 && lines === linesWant && minLine >= STOP_MIN_PX, `every stop line (${linesWant}) is a solid bar at least ${STOP_MIN_PX} px deep (thinnest ${minLine.toFixed(2)} px)`);
    /* the corner does not depend on a junction's lines: where the lines are the sim's own, the crosswalk bars lie where the sim put them */
    const j = hz[0].scene.junctions[0], zl = j.lines.filter((l) => l.kind === "zebra"), v = viewOf(hz[0].scene.k, hz[0].scene.cam, hz[0].scene.rot, SIZE), gg = draw(hz[0].scene, { look: "game" }), zz = gg.strokes.filter((s) => s.style === ZEBRA);
    const near = zl.every((l, i) => { const a = v.P(l.a.x, l.a.y, l.a.z ?? 0), b = v.P(l.b.x, l.b.y, l.b.z ?? 0), p = zz[i]?.pts; return p && Math.hypot(p[0][0] - a[0], p[0][1] - a[1]) < 0.01 && Math.hypot(p[1][0] - b[0], p[1][1] - b[1]) < 0.01; });
    check(zl.length > 0 && near, `each crosswalk bar is painted exactly on the sim's own line (${zl.length} lines of ${hz[0].type}), none elsewhere`);
    /* the shark's teeth */
    const sg = signs, gy = draw(sg.scene, { look: "game" }), yl = sg.j ? junctionsOf(sg.world.course).flatMap((q) => q.lines.filter((l) => l.kind === "yield").map((l) => ({ q, l }))) : [];
    const teeth = gy.fills.filter((f) => f.style === STOPLINE && f.pts.length >= 3 && !f.rect);
    check(yl.length >= 2 && teeth.length >= 2, `EXPOSURE: ${yl.length} yield lines on the signs map, each painted as a row of white triangles (${teeth.length} fills)`);
    /* each tooth points away from the intersection's middle: its tip is on the far side of its line from the centre (an affine view keeps sides) */
    const vv = viewOf(sg.scene.k, sg.scene.cam, sg.scene.rot, SIZE);
    let ok = 0, all = 0;
    for (const f of teeth) for (let t = 0; t + 2 < f.pts.length; t += 3) {
      const [p0, p1, tip] = f.pts.slice(t, t + 3), mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      for (const { q, l } of yl) {
        const a = vv.P(l.a.x, l.a.y, l.a.z ?? 0), b = vv.P(l.b.x, l.b.y, l.b.z ?? 0), c = vv.P(q.at.x, q.at.y, q.at.z ?? 0);
        const side = (pp) => (b[0] - a[0]) * (pp[1] - a[1]) - (b[1] - a[1]) * (pp[0] - a[0]);
        if (Math.abs(side(mid)) > 1.5) continue;
        all++; if (side(tip) * side(c) < 0) ok++;
      }
    }
    check(all >= 6 && ok === all, `every tooth's point is on the far side of its line from the intersection's middle: ${ok} of ${all} teeth`);
    void shortest;
  }
}


/* Penetration depth of an axis-aligned rectangle into a convex polygon, by separating axes: 0 when they do not overlap. Written here, apart from the module's own test (the restated check). */
function depthOf(poly, r) {
  const R = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
  let least = Infinity;
  const axes = [[1, 0], [0, 1]];
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1; axes.push([nx / l, ny / l]); }
  for (const [nx, ny] of axes) {
    let pmin = Infinity, pmax = -Infinity, rmin = Infinity, rmax = -Infinity;
    for (const q of poly) { const d = q[0] * nx + q[1] * ny; pmin = Math.min(pmin, d); pmax = Math.max(pmax, d); }
    for (const q of R) { const d = q[0] * nx + q[1] * ny; rmin = Math.min(rmin, d); rmax = Math.max(rmax, d); }
    const o = Math.min(pmax, rmax) - Math.max(pmin, rmin);
    if (o <= 0) return 0;
    least = Math.min(least, o);
  }
  return least;
}
/* Every road ribbon segment and junction surface of a scene, as screen polygons. */
function roadPolys(scene) {
  const v = viewOf(scene.k, scene.cam, scene.rot, SIZE), out = [];
  for (const j of scene.junctions) if (j.surface.length) out.push(j.surface.map((q) => v.P(q.x, q.y, q.z ?? 0)));
  for (const { road } of scene.roads) for (let i = 0; i + 1 < (road.left?.length ?? 0); i++) { const q = [road.left[i], road.left[i + 1], road.right[i + 1], road.right[i]]; out.push(q.map((p) => v.P(p.x, p.y, p.z ?? 0))); }
  return out;
}

export async function faceChecks(check, scenes) {
  console.log("\n  20.5 SIGN FACES NEVER COVER THE ROAD OR A CAR");
  let faces = 0, moved = 0, worst = 0, worstWhere = "", pairs = 0, stacked = 0;
  const decision = scenes.filter((x) => x.decision);
  for (const sc of scenes) {
    const g = draw(sc.scene, { look: "game" }), polys = roadPolys(sc.scene);
    const face = g.groups.map((gr) => { const f = g.fills.filter((q) => q.at > gr.start && q.at <= gr.end); return f.length ? bboxOf(f) : null; }).filter(Boolean);
    moved += g.strokes.filter((q) => q.style === LEADER).length;
    const inView = face.filter((b) => !(b.x1 < 0 || b.x0 > SIZE.w || b.y1 < 0 || b.y0 > SIZE.h));
    for (let i = 0; i < inView.length; i++) for (let m = i + 1; m < inView.length; m++) { pairs++; const u = inView[i], v = inView[m]; if (!(u.x1 <= v.x0 || v.x1 <= u.x0 || u.y1 <= v.y0 || v.y1 <= u.y0)) stacked++; }
    for (const b of face) { if (b.x1 < 0 || b.x0 > SIZE.w || b.y1 < 0 || b.y0 > SIZE.h) continue; faces++; for (const p of polys) { const d = depthOf(p, { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }); if (d > worst) { worst = d; worstWhere = sc.type ?? ""; } } }
  }
  console.log(`        [M, this run] ${faces} sign faces in view on ${scenes.length} scenes; worst overlap of a face's painted rectangle with a junction surface or road ribbon polygon: ${worst.toFixed(2)} px${worst > 0 ? ` (${worstWhere})` : ""}`);
  check(faces >= 100 && decision.length >= 10, `EXPOSURE: ${faces} faces on ${scenes.length} scenes (${decision.length} decision scenes), ${moved} of them moved off the road by the search and given a leader`);
  check(moved >= 8, `EXPOSURE: at least 8 faces stood over the road at their post and were moved (${moved}), so the overlap line is not true for want of a case`);
  check(worst === 0, "no sign face overlaps a junction surface or a road ribbon, on any scene (worst overlap 0 px)");
  check(pairs >= 100 && stacked === 0, `no two sign faces overlap each other (${stacked} of ${pairs} pairs in view overlap)`);
  /* every face before every car and person */
  let fCount = 0, cCount = 0, pCount = 0, bad = 0;
  for (const sc of scenes) {
    const au = drawFrame(recorder().ctx, SIZE, sc.scene, { audit: true, look: "game" });
    const lastFace = Math.max(...au.order.map((o, i) => (o.kind === "sign-face" ? i : -1))), firstMover = au.order.findIndex((o) => o.kind === "car" || o.kind === "ped");
    const nf = au.order.filter((o) => o.kind === "sign-face").length, nc = au.order.filter((o) => o.kind === "car").length, np = au.order.filter((o) => o.kind === "ped").length;
    fCount += nf; cCount += nc; pCount += np;
    if (nf && firstMover >= 0 && lastFace > firstMover) bad++;
    if (nf && au.order.some((o) => o.kind === "sign-face" && o.layer !== 0.75)) bad++;
  }
  console.log(`        [M, this run] ${fCount} faces painted before ${cCount} cars and ${pCount} people (over ${scenes.length} scenes)`);
  check(fCount >= 100 && cCount >= 30 && pCount >= 20, `EXPOSURE: faces ${fCount}, cars ${cCount}, people ${pCount} in the audited frames`);
  check(bad === 0, "every sign face (layer 0.75) is painted before every car and every person, on every scene: no vehicle or person is hidden by a sign");
  /* ALL WAY */
  let plates = 0, minPx = Infinity, narrow = 0;
  for (const sc of scenes.filter((x) => x.decision)) {
    const g = draw(sc.scene, { look: "game" });
    for (const t of g.texts.filter((q) => q.s === "ALL WAY")) { plates++; minPx = Math.min(minPx, parseFloat(/([\d.]+)px/.exec(t.font)[1])); }
    const oct = g.fills.filter((f) => f.style === RED && f.pts.length === 8).map((f) => bboxOf([f]).w), pl = g.fills.filter((f) => f.rect && f.style === RED);
    for (const p of pl) if (!oct.some((w) => Math.abs(w - p.rect.w) < 0.01)) narrow++;
  }
  console.log(`        [M, this run] ${plates} ALL WAY plates; text size min ${minPx} px`);
  check(plates >= 8, `EXPOSURE: ${plates} ALL WAY plates painted on the decision scenes`);
  check(minPx >= PLATE_TEXT_MIN_PX, `the ALL WAY text is at least ${PLATE_TEXT_MIN_PX} px (smallest ${minPx} px)`);
  check(narrow === 0, "every ALL WAY plate is as wide as its octagon");

  /* THE PLACEMENT CACHE (the perf pass): a camera that has not moved gets its answer without a search, and one that has moved gets a new one that is still clear of the road. */
  console.log("\n  20.6 THE PLACEMENT IS CACHED AGAINST THE CAMERA, AND A MOVED CAMERA IS PLACED AGAIN");
  {
    const base = scenes.find((x) => x.decision && x.type && x.type.includes("hazard")).scene, faceBoxes = (sc) => { const g = draw(sc, { look: "game" }); return { g, boxes: g.groups.map((gr) => { const f = g.fills.filter((q) => q.at > gr.start && q.at <= gr.end); return f.length ? bboxOf(f) : null; }).filter(Boolean) }; };
    const overlap = (sc, boxes) => { const polys = roadPolys(sc); let w = 0; for (const b of boxes) { if (b.x1 < 0 || b.x0 > SIZE.w || b.y1 < 0 || b.y0 > SIZE.h) continue; for (const p of polys) w = Math.max(w, depthOf(p, b)); } return w; };
    const A = faceBoxes(base);                                  // warms the cache for this camera
    const s0 = pushStats.searches, h0 = pushStats.hits, t0 = pushStats.tests;
    const A2 = faceBoxes(base);
    const nFaces = A2.boxes.length;
    check(nFaces >= 8 && A.boxes.some((b, i) => A.g.strokes.length >= 0 && b), `EXPOSURE: ${nFaces} faces on the decision scene`);
    check(pushStats.searches === s0 && pushStats.tests === t0 && pushStats.hits - h0 >= nFaces, `a camera that has not moved does no search: the second identical frame ran ${pushStats.searches - s0} searches and ${pushStats.tests - t0} rectangle tests, and took ${pushStats.hits - h0} cached placements for ${nFaces} faces`);
    check(A.g.raw.join("\n") === A2.g.raw.join("\n"), "and paints exactly what the searched frame painted (call for call)");
    const moves = [["zoomed 1.4x", { ...base, k: base.k * 1.4 }], ["panned 4 m", { ...base, cam: { ...base.cam, x: base.cam.x + 3, y: base.cam.y + 3 } }], ["turned 25 degrees", { ...base, rot: base.rot + 25 }]];
    for (const [name, sc] of moves) {
      const a = pushStats.searches, B = faceBoxes(sc), ov = overlap(sc, B.boxes);
      const shifted = B.boxes.some((b, i) => A.boxes[i] && (Math.abs(b.x0 - A.boxes[i].x0) > 1 || Math.abs(b.y0 - A.boxes[i].y0) > 1));
      check(pushStats.searches > a && ov === 0 && shifted, `a camera ${name} is placed again (${pushStats.searches - a} searches), every face is clear of the road (worst overlap ${ov.toFixed(2)} px) and the faces are not where the old camera left them`);
    }
    /* a pan, frame by frame: every frame clear, and what each costs */
    let worst = 0, tests = 0, searches = 0, n = 0; const kept0 = pushStats.kept;
    for (let i = 1; i <= 40; i++) {
      const sc = { ...base, cam: { ...base.cam, x: base.cam.x + i * 0.12, y: base.cam.y + i * 0.07 }, k: base.k * (1 + 0.002 * i), t: base.t + i * 0.05 };
      const a = pushStats.tests, b = pushStats.searches, B = faceBoxes(sc);
      worst = Math.max(worst, overlap(sc, B.boxes)); tests += pushStats.tests - a; searches += pushStats.searches - b; n++;
    }
    console.log(`        [M, this run] a 40-frame pan and zoom: ${(searches / n).toFixed(1)} searches and ${(tests / n).toFixed(0)} rectangle tests a frame (${pushStats.kept - kept0} placements kept while still clear); worst overlap ${worst.toFixed(2)} px`);
    check(searches >= 2 * 8 && pushStats.kept - kept0 >= 100 && worst === 0, `EXPOSURE: on the moving camera the search ran again for ${searches} placements and ${pushStats.kept - kept0} were kept while still clear, in ${n} frames of 8 faces, and no frame left a face over the road (worst overlap 0 px)`);
  }
}

function scName(sc) { return sc.type ? `${sc.type}#${sc.seed ?? ""}` : sc.j ? `map@${sc.j.node}` : "plain"; }
