/* THE SCENE EVERY SECTION OF verify-contact AND verify-contact-escape BUILDS ON (11 November, DECISIONS 10.70): moved out of the one
   file when it was split, not copied, so there is one statement of the map, the world, and a tick as the screen runs it. */
import { emptyMap, road } from "../../src/map/format.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, poseOf, carFor } from "../../src/sim/crossing.js";
import { driver, DT } from "../../src/sim/traffic.js";
import { playerAt, playerOn, withDriver, stepDriver, driverPose } from "../../src/sim/drive.js";
import { worldFor } from "../../src/sim/scene.js";
import { playerContact, afterContact, towTick, TOW_AFTER, owedBy } from "../../src/sim/contact.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { movementLight } from "../../src/sim/signal.js";
import { touching, V_MAX, INOPERABLE, BACK_V } from "../../src/sim/player.js";
import { parkedPoses } from "../../src/sim/parking.js";
import { pedPose } from "../../src/sim/peds.js";
import { poseOnGraph } from "../../src/sim/graph.js";
import { noticeTick, contactTick } from "../../src/sim/session.js";
import { detect, newEventState, TRIGGERS } from "../../src/sim/events.js";
import { newMeter, meterTick, fareFor } from "../../src/sim/money.js";
import { newMailbox, post, mailTick, lettersFor, saveMailbox, loadMailbox, MAIL_DAY } from "../../src/sim/mail.js";
import { testCityReady, testPeds } from "../../src/map/samples.js";


export const P = (x, y) => ({ x, y, z: 0 });
export const m = emptyMap("contact");
m.bounds = { x: 0, y: 0, w: 4000, h: 400 };
m.roads.push(road({ id: "w", kind: "collector", lanes: 1, speed: 90, points: [P(0, 200), P(3000, 200)] }), road({ id: "e", kind: "collector", lanes: 1, speed: 90, points: [P(3000, 200), P(4000, 200)] }));
export const loaded = loadMap(m);
export const base = seedGraph(1, 50, loaded, { every: 1e9, target: 0, posted: true, trucks: 0, laneChanges: false, keepRight: false, brakeReaction: true });
export const L = base.course.at[0].layout;
export const route = Object.keys(L.paths).find((r) => L.legs[L.paths[r].from]?.road === "w" && L.paths[r].intent === "straight");
export const carAt = (w, id, s, v = 0, n = 7) => ({ ...carFor(w, n, 0, route, null, "car"), id, n, s, v, v0: Math.max(v, 1) });
export const playerHere = (s, v = 0, more = {}) => ({ ...playerAt(base.course, 0, route), s, v, a: 0, ...more });
/* One tick as the screen runs it. */
export function tick(sc, w, inp) {
  sc.me = stepDriver(sc.me, inp, w, DT);
  w = step(withDriver(w, sc.me));
  const c = playerContact(w, sc.me);
  const hit = contactTick(sc, c, c.world);
  return { w: withDriver(c.world, sc.me), c, hit };
}
export const scene = (me) => ({ me, args: [1], saveWallet: false });
/* A driver holding their line, against any pull, with their foot down. */
export const wrapped = (a) => Math.atan2(Math.sin(a ?? 0), Math.cos(a ?? 0));   // psi counts whole turns
export const holdLine = (me, slider = 1) => ({ steer: Math.max(-1, Math.min(1, -0.35 * (me.off ?? 0) - 1.2 * wrapped(me.psi))), slider });

export const strike = (me, other) => {
  const w = withDriver({ ...base, t: 100, actors: [other], crashes: [] }, me);
  return playerContact(w, me);
};
