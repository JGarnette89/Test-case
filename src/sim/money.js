/* =====================================================================
   MONEY (PLAN.md phase 3, item 8): what a job pays, and the balance.

   THE ECONOMY PAYS FOR SKILL, NOT TIME (DAY-NIGHT.md, constraint 3, the
   maintainer's direction): "a smooth fare pays more than a rough one; a
   clean delivery more than one that drew horns" -- measured against the
   standards the sim already holds the traffic to, never a second set
   written here.

   - THE BASE is the TASK: a flag fall and a rate per kilometre of the
     route as planned when the job was offered. Not the distance driven, so
     a detour pays nothing; not the time taken, so dawdling pays nothing.
   - THE DEDUCTIONS are the game's own verdicts on the drive: every fault
     the event stream raised during the job (sim/events.js) costs its own
     SEVERITY -- the one number that already says how bad each is, so there
     is no second table to drift from it -- and touching anything voids the
     fare. Time over the posted limit costs by the second (the limit is the
     road's own, graph.js `postedAt`). Arriving well past a reasonable time
     costs too: the taxi standard (DAY-NIGHT.md default 7) asks for
     arrival in reasonable time, and the allowance is the route's own
     driving time at its limits, padded for the intersections on it.
   - A TIP for a drive with nothing taken off: the genuinely good driver's
     reward, not a bonus for time spent.

   Smoothness beyond the stop (harsh acceleration, cornering) is the
   passenger-comfort item (PLAN.md 9a) and joins the fare when it lands.

   Pure but for the wallet's storage, which goes through src/storage.js.
   ===================================================================== */
import { readJSON, writeJSON } from "../storage.js";
import { postedAt } from "./graph.js";
import { DT } from "./traffic.js";

/* Flagged design constants: the taxi's tariff and what the standard costs. */
export const TARIFF = { flag: 4.5, perKm: 1.9 };   // dollars: a flag fall and a kilometre, in the range of real Ontario meters
export const PER_SEVERITY = 0.04;                  // of the base, per point of a fault's severity (sim/events.js TRIGGERS)
export const OVER_AT = 1.05;                       // of the posted limit: past this is over it
export const PER_SECOND_OVER = 0.01;               // of the base, a second over the limit
export const OVER_CAP = 0.3;                       // the most the limit can take
export const OVER_GRACE = 2;                       // s over the limit, in the whole ride, that cost nothing: a speedometer brushing it is not speeding
export const ALLOWANCE = 1.5;                      // reasonable time: the route's driving time at its limits, times this...
export const PER_NODE = 12;                        // ...plus this many seconds an intersection
export const LATE_PER_SECOND = 0.002;              // of the base, a second past reasonable
export const LATE_CAP = 0.2;
export const TIP = 0.15;                           // a clean drive
export const KEEP = 50;                            // ledger entries kept

/* THE ROUTE'S OWN TIME: each movement's length at its own posted limit. */
export function routeTime(course, route) {
  let s = 0;
  for (const st of route?.steps ?? []) {
    const p = course.at[st.k].layout.paths[st.route];
    s += p.length / (postedAt(course, st.k, st.route) ?? 13.9);
  }
  return s;
}

/* A METER for one job: started when the paid part begins. */
export const newMeter = ({ length, course, route, t }) => ({
  t0: t, length, allowed: ALLOWANCE * routeTime(course, route) + PER_NODE * (route?.steps?.length ?? 0) + 20,
  faults: [], overS: 0, hit: false,
});

/* One tick of the job: the events the game raised, and whether the player was over the limit. */
export function meterTick(m, me, course, events) {
  const out = { ...m };
  for (const e of events) {
    if (e.id === "collision") out.hit = true;
    else if (!e.praise && e.severity) out.faults = [...out.faults, { id: e.id, severity: e.severity, t: e.t }];
  }
  const posted = postedAt(course, me.k ?? 0, me.route);
  if (posted && (me.v ?? 0) > posted * OVER_AT) out.overS = m.overS + DT;
  return out;
}

/* THE FARE: the base for the task, and what the drive took off it, each named. */
export function fareFor(m, t) {
  const base = TARIFF.flag + TARIFF.perKm * (m.length / 1000);
  const off = [];
  if (m.hit) off.push({ why: "contact -- no fare", share: 1 });
  else {
    const by = new Map();
    for (const f of m.faults) by.set(f.id, (by.get(f.id) ?? 0) + f.severity * PER_SEVERITY);
    for (const [id, share] of by) off.push({ why: id, share });
    if (m.overS > OVER_GRACE) off.push({ why: `over the limit ${Math.round(m.overS)} s`, share: Math.min(OVER_CAP, (m.overS - OVER_GRACE) * PER_SECOND_OVER) });
    const late = t - m.t0 - m.allowed;
    if (late > 0) off.push({ why: `late ${Math.round(late)} s`, share: Math.min(LATE_CAP, late * LATE_PER_SECOND) });
  }
  const quality = Math.max(0, 1 - off.reduce((s, o) => s + o.share, 0));
  const tip = !off.length ? TIP * base : 0;
  const total = Math.round((base * quality + tip) * 100) / 100;
  return { base: Math.round(base * 100) / 100, quality, off, tip: Math.round(tip * 100) / 100, total, seconds: t - m.t0 };
}

/* THE WALLET: a balance and the last entries, through the storage adapter. */
const KEY = "row.wallet.v1";
export const newWallet = () => ({ balance: 0, entries: [] });
export async function loadWallet() {
  try { const w = await readJSON(KEY, null); if (w && typeof w.balance === "number" && Array.isArray(w.entries)) return w; } catch { /* a fresh wallet */ }
  return newWallet();
}
/* Pure: the wallet with one more entry. */
export function credit(wallet, entry) {
  const amount = Math.round((entry.amount ?? 0) * 100) / 100;
  return { balance: Math.round((wallet.balance + amount) * 100) / 100, entries: [...wallet.entries, { ...entry, amount }].slice(-KEEP) };
}
export async function saveWallet(wallet) {
  try { await writeJSON(KEY, wallet); } catch { /* kept for this visit only */ }
  return wallet;
}
