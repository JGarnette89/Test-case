/* =====================================================================
   MONEY AND THE TAXI (sim/money.js, sim/jobs.js; PLAN.md phase 3, items
   8 and 9). THE ECONOMY PAYS FOR SKILL, NOT TIME (DAY-NIGHT.md).

   1. THE FARE, as properties any correct fare would have: a clean drive
      is paid the base and the tip, and only a clean drive is tipped;
      every fault the game can raise costs, and costs its own severity,
      never pays; praise costs nothing; contact pays nothing; time over
      the limit costs, to its cap; taking longer never pays more; nothing
      is ever below zero; the base is the task's -- the route as planned.
   2. THE WALLET: credits add up to the balance, the ledger keeps its last
      entries, and it comes back through the storage adapter as it went in.
   3. A FARE DRIVEN, on #/map's test map 1, by a player who does only what
      the screen says: offered, picked up, ridden, dropped, paid into the
      wallet -- and the same fare driven over the limit pays less.
   ===================================================================== */
import { worldFor } from "../src/sim/scene.js";
import { step } from "../src/sim/crossing.js";
import { stepDriver, stopFor, withDriver } from "../src/sim/drive.js";
import { placesOf, routeTo, alongTo, ARRIVED_WITHIN } from "../src/sim/route.js";
import { noticeTick } from "../src/sim/session.js";
import { postedAt } from "../src/sim/graph.js";
import { DT, stoppingRoom } from "../src/sim/traffic.js";
import { TRIGGERS } from "../src/sim/events.js";
import { newMeter, meterTick, fareFor, credit, newWallet, saveWallet, loadWallet, TARIFF, PER_SEVERITY, OVER_CAP, OVER_GRACE, TIP, KEEP } from "../src/sim/money.js";
import { offerFare, accept, BOARD } from "../src/sim/jobs.js";
import { goodStep } from "./lib/good-driver.mjs";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

const { loaded, world: w0, me: m0 } = worldFor(1, 50, null, "drive");
const course = w0.course;
const places = placesOf(course, loaded);

console.log("\n1. THE FARE PAYS FOR SKILL, NOT TIME");
{
  const route = routeTo(course, m0, places.find((p) => (routeTo(course, m0, p)?.length ?? 0) > 800));
  const m = newMeter({ length: route.length, course, route, t: 0 });
  const onTime = m.allowed * 0.6;
  const clean = fareFor(m, onTime);
  const base = TARIFF.flag + TARIFF.perKm * (route.length / 1000);
  check(Math.abs(clean.base - base) < 0.01 && clean.off.length === 0 && Math.abs(clean.total - Math.round(base * (1 + TIP) * 100) / 100) < 0.011,
    `a clean ${(route.length / 1000).toFixed(2)} km fare: the base for the route as planned ($${clean.base.toFixed(2)}) and the tip -- $${clean.total.toFixed(2)}`);
  const me = { ...m0, v: 0 };
  /* Stated without the module's constant -- a check that compared each
     cost with PER_SEVERITY passed with PER_SEVERITY set to nothing (the
     tip going was enough). A fault must take a share of the BASE, the same
     share for every point of severity whatever the fault. */
  let costs = true, praiseFree = true, worst = "";
  const perPoint = [];
  for (const [id, tr] of Object.entries(TRIGGERS)) {
    if (id === "collision" || id === "arrived") continue;
    const f = fareFor(meterTick(m, me, course, [{ id, t: 1, ...tr }]), onTime);
    if (tr.praise) { if (f.total !== clean.total) { praiseFree = false; worst = id; } }
    else {
      const taken = 1 - f.total / clean.base;   // of the base, the tip aside
      perPoint.push(taken / tr.severity);
      if (!(taken > 0.001 && !f.tip)) { costs = false; worst = id; }
    }
  }
  const even = Math.max(...perPoint) - Math.min(...perPoint) < 0.002;
  check(costs && even, `every fault the game can raise takes a share of the base itself, the same ${(perPoint[0] * 100).toFixed(1)}% for every point of its severity, and the tip${costs && even ? "" : ` -- not ${worst || "evenly"}`}`);
  check(praiseFree, `praise costs nothing${praiseFree ? "" : ` -- ${worst} did`}`);
  const hit = fareFor(meterTick(m, me, course, [{ id: "collision", t: 1, ...TRIGGERS.collision }]), onTime);
  check(hit.total === 0, "contact pays nothing");
  /* Over the limit: driven at 1.3 times it for n ticks. */
  const posted = postedAt(course, m0.k ?? 0, m0.route);
  const over = (n) => { let x = m; for (let i = 0; i < n; i++) x = meterTick(x, { ...m0, v: posted * 1.3 }, course, []); return fareFor(x, onTime).total; };
  const o = [0, 20, 100, 400, 2000].map(over);
  check(o[1] === o[0] && o.every((x, i) => i === 0 || x <= o[i - 1]) && o[2] < o[0] && o[4] >= Math.round(base * (1 - OVER_CAP) * 100) / 100 - 0.01,
    `a moment over the limit (${OVER_GRACE} s in the ride) costs nothing; past that it costs, more the longer, to its cap: ${o.map((x) => `$${x.toFixed(2)}`).join(", ")} for 0, 1, 5, 20 and 100 s`);
  const times = [0.2, 0.6, 1, 1.3, 2, 5].map((k) => fareFor(m, m.allowed * k).total);
  check(times.every((x, i) => i === 0 || x <= times[i - 1]), `taking longer never pays more: ${times.map((x) => `$${x.toFixed(2)}`).join(", ")} arriving at 0.2 to 5 times the allowance`);
  let x = m;
  for (const [id, tr] of Object.entries(TRIGGERS)) if (!tr.praise && id !== "collision") for (let i = 0; i < 4; i++) x = meterTick(x, { ...m0, v: posted * 2 }, course, [{ id, t: i, ...tr }]);
  const floor = fareFor(x, m.allowed * 10);
  check(floor.total >= 0 && floor.quality >= 0, `and nothing is ever below zero: every fault four times, far over the limit, very late -- $${floor.total.toFixed(2)}`);
}

console.log("\n2. THE WALLET");
{
  let w = newWallet();
  let sum = 0;
  for (let i = 0; i < KEEP + 20; i++) { const a = Math.round(((i * 37) % 23) * 1.37 * 100) / 100; sum += a; w = credit(w, { what: "taxi", amount: a, at: i }); }
  check(Math.abs(w.balance - Math.round(sum * 100) / 100) < 0.011 && w.entries.length === KEEP && w.entries.at(-1).at === KEEP + 19, `${KEEP + 20} fares credited: the balance is their sum ($${w.balance.toFixed(2)}), the ledger the last ${KEEP}`);
  await saveWallet(w);
  const back = await loadWallet();
  check(back.balance === w.balance && back.entries.length === w.entries.length, "and it comes back through the storage adapter as it went in");
}

console.log("\n3. A FARE DRIVEN, PICKED UP, DROPPED AND PAID -- AND THE SAME FARE DRIVEN OVER THE LIMIT PAYS LESS");
{
  /* A good driver (tools/lib/good-driver.mjs): the slider where the
     screen's marker says, the turn and lane the directions say, keeping
     right, never dawdling -- cruising at `pace` times the limit. */
  const drive = (offer, pace) => {
    let me = m0, w = { ...w0, actors: [], every: 1e9, nextAt: 1e9 };
    w = withDriver(w, me);
    const sc = { me, args: [1], saveWallet: false, wallet: newWallet() };
    const r = accept(offer);
    sc.job = r.job; sc.dest = r.dest;
    const states = new Set();
    let paidAt = null;
    for (let n = 0; n < 600 / DT && paidAt == null; n++) {
      const prev = { me, world: w };
      me = goodStep(me, w, sc, { pace });
      w = step(withDriver(w, me));
      noticeTick(sc, prev, { me, world: w });
      sc.me = me;
      if (sc.job) states.add(sc.job.state);
      if (process.env.TRACE) for (const f of sc.job?.meter?.faults ?? []) if (f.t === w.t) console.log('   fault', f.id, 'at', f.t.toFixed(1), 'k', me.k, me.route, me.s.toFixed(1), me.v.toFixed(1));
      if (sc.receipt) paidAt = n * DT;
      if (process.env.TRACE && n % 100 === 0) console.log(n * DT, sc.job?.state, me.k, me.route, me.s?.toFixed(1), me.v?.toFixed(1), sc.navText, sc.dest?.id);
    }
    return { sc, states, paidAt, fare: sc.receipt?.fare ?? null };
  };
  let offer = null;
  for (let s = 1; s < 40 && !offer; s++) { const o = offerFare(course, m0, places, s); if (o && o.length >= 900) offer = o; }
  check(!!offer, offer ? `dispatch offers a fare: pick up ${offer.toPickup.toFixed(0)} m away, ride ${offer.length.toFixed(0)} m, about $${offer.estimate.toFixed(2)} driven clean` : "dispatch offers a fare");
  if (offer) {
    const calm = drive(offer, 0.95), fast = drive(offer, 1.3);
    const seen = ["toPickup", "boarding", "toDropoff", "alighting"].every((x) => calm.states.has(x));
    check(seen && calm.fare && !calm.fare.off.length && calm.fare.tip > 0 && calm.sc.job == null && calm.sc.wallet.balance === calm.fare.total && calm.sc.wallet.entries.length === 1,
      `driven well, just under the limit: to the pickup, ${BOARD} s getting in, the ride, ${BOARD} s getting out, and paid -- $${calm.fare?.total.toFixed(2)} at ${calm.fare ? Math.round(calm.fare.quality * 100) : "-"}% in ${calm.paidAt?.toFixed(0)} s${calm.fare?.off.length ? ` (${calm.fare.off.map((o) => o.why).join(", ")})` : ", tipped"}, into the wallet`);
    check(fast.fare && fast.fare.total < calm.fare.total && fast.fare.off.some((o) => /over the limit/.test(o.why)),
      `the same fare driven at 1.3 times the limit: $${fast.fare?.total.toFixed(2)} (${fast.fare?.off.map((o) => o.why).join(", ")}) -- arriving sooner paid less`);
  }
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
