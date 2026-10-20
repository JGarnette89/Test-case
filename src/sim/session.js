/* =====================================================================
   THE SESSION'S VOICE AND WAY: what the game notices each tick and says
   (sim/events.js, sim/voice.js), and where the player is going
   (sim/route.js) -- the screen's logic, moved out of MapRoad.jsx on 14
   October so a check can run it where a React screen cannot be.

   Everything lives on the scene object the screen already keeps (`sc`):
   the detectors' memory, the voice's state, the line said, the place sent
   to, its route, the line drawn along it and the words on the screen.
   ===================================================================== */
import { detect, newEventState, TRIGGERS } from "./events.js";
import { speak, newVoice } from "./voice.js";
import { LINES, SPEAKERS } from "../content/dialogue.js";
import { routeTo, nextTurn, alongTo, ARRIVED_WITHIN } from "./route.js";
import { poseOnGraph } from "./graph.js";
import { jobTick, jobText } from "./jobs.js";
import { newEncounters, encounterTick } from "./encounters.js";
import { credit, newWallet, saveWallet } from "./money.js";

/* WHAT THE GAME NOTICED THIS TICK, AND WHAT IS SAID (sim/events.js, sim/voice.js):
   the player and the world one tick apart, the detectors' memory kept on the
   scene, and the line spoken -- drawn on the canvas (hud.js drawCaption),
   never React state. Driving only. */
export function noticeTick(sc, prev, now) {
  if (!sc.me || !prev?.me) return;
  /* Pulling in at the place the player was sent to, or standing there for a fare. */
  const along = sc.dest ? alongTo(now.world.course, now.me, sc.dest) : null;
  const atPlace = (along != null && along > -PULL_IN && along <= ARRIVED_WITHIN) || sc.job?.state === "boarding" || sc.job?.state === "alighting";
  const r = detect(prev, { ...now, atPlace }, sc.ev ?? newEventState());
  sc.ev = r.state;
  /* WHAT THE PLAYER MEETS (encounters.js): traffic from the player's seat, not the world's workload. */
  sc.enc = encounterTick(sc.enc ?? newEncounters(), now.me, now.world);
  const events = r.events;
  const arrived = navigate(sc, now.me, now.world.course);
  /* A JOB (sim/jobs.js) owns what arriving means while it runs; a plain trip says "arrived". */
  if (sc.job) {
    const r = jobTick(sc.job, { arrived, me: now.me, t: now.world.t, course: now.world.course, events });
    sc.job = r.job;
    if (r.dest) { sc.dest = r.dest; sc.routeKey = null; }
    if (r.paid) {
      sc.wallet = credit(sc.wallet ?? newWallet(), { what: sc.job.kind, amount: r.paid.total, quality: Math.round(r.paid.quality * 100) / 100, at: now.world.t });
      if (sc.saveWallet !== false) saveWallet(sc.wallet);
      sc.receipt = { fare: r.paid, balance: sc.wallet.balance, at: (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000 };
      sc.job = null;
    }
    sc.jobText = jobText(sc.job, now.world.t);
  } else {
    sc.jobText = null;
    if (arrived) events.push({ id: "arrived", t: now.world.t, ...TRIGGERS.arrived });
  }
  const v = speak(sc.voice ?? newVoice(sc.args?.[0] ?? 1), events, now.world.t, LINES, { when: "day" });
  sc.voice = v.state;
  if (v.said) sc.said = { who: SPEAKERS[v.said.speaker] ?? v.said.speaker, text: v.said.text, at: (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000 };
}

/* GOING SOMEWHERE (sim/route.js): the route from where the player is to
   the place they were sent, worked out again only when they reach a new
   approach -- the line drawn along it, the next movement said on the
   screen. Returns true the tick they arrive: stopped at the curb within
   ARRIVED_WITHIN of the place. */
export const ROUTE_STEP = 4;
export const PULL_IN = 60;     // m short of a place where slowing to it is pulling in, not crawling   // m between the points of the drawn route
export function navigate(sc, me, course) {
  const dest = sc.dest;
  if (!dest) { sc.navText = null; sc.routePts = null; return false; }
  const along = alongTo(course, me, dest);
  if (along != null && Math.abs(along) <= ARRIVED_WITHIN && (me.v ?? 0) < 0.5) { sc.dest = null; sc.routePts = null; sc.navText = null; return true; }
  const path = course.at[me.k ?? 0].layout.paths[me.route];
  const key = `${me.k}|${path?.from}|${me.s > (path?.stopAt ?? 0)}`;
  if (key !== sc.routeKey) {
    sc.routeKey = key;
    sc.route = routeTo(course, me, dest);
  }
  const route = sc.route;
  if (!route) { sc.navText = "No way there from here"; sc.routePts = null; return false; }
  /* The line: the rest of this path to its line (or to the place, on its
     stretch), then each movement's, to the place -- rebuilt twice a second
     or when the route changes, never every tick. */
  if (key !== sc.ptsKey || (sc.ptsTick = (sc.ptsTick ?? 0) + 1) % 10 === 0) {
    sc.ptsKey = key;
    const meK = me.k ?? 0, steps = route.steps, segs = [];
    const scaled = (k, r) => dest.s * (course.at[k].layout.paths[r].stopAt / course.at[dest.k].layout.paths[dest.route].stopAt);
    if (!steps.length) segs.push([meK, me.route, me.s, dest.part === "in" ? scaled(meK, me.route) : dest.s]);
    else if (steps[0].k === meK && me.s <= path.stopAt) segs.push([meK, me.route, me.s, path.stopAt]);
    else segs.push([meK, me.route, me.s, Infinity]);
    steps.forEach((st, i) => {
      const p = course.at[st.k].layout.paths[st.route];
      const s0 = i === 0 && st.k === meK && me.s <= path.stopAt ? p.stopAt : 0;
      const s1 = i === steps.length - 1 && dest.part === "out" && st.k === dest.k ? dest.s : Infinity;
      segs.push([st.k, st.route, s0, s1]);
    });
    if (steps.length && dest.part === "in") segs.push([dest.k, dest.route, 0, dest.s]);
    const pts = [];
    for (const [k, r, s0, s1] of segs) { const p = course.at[k].layout.paths[r]; for (let s = Math.max(0, s0); s < Math.min(p.length, s1); s += ROUTE_STEP) pts.push(poseOnGraph(course, k, r, s)); }
    sc.routePts = pts;
  }
  const next = nextTurn(course, me, route);
  const far = route.length > 1000 ? `${(route.length / 1000).toFixed(1)} km` : `${Math.round(route.length / 10) * 10} m`;
  sc.navText = !next ? `Arriving -- pull in at the curb (${far})`
    : `${next.lane ? `Get in the ${next.lane < 0 ? "left" : "right"} lane -- ` : ""}${next.intent === "straight" ? "straight on" : `turn ${next.intent}`} at the next intersection${next.toLine != null && next.toLine > 0 ? `, ${Math.round(next.toLine)} m` : ""} -- ${far} to go`.replace(/^./, (c) => c.toUpperCase());
  sc.navLane = next?.lane ?? 0;
  return false;
}

