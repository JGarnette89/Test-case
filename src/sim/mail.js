/* =====================================================================
   THE MAIL (DECISIONS 10.52): delayed consequences. It keeps the moment of
   impact free of menus, it fits the analog setting, and it is one channel
   for anything that should not land instantly. A hospital bill and an
   insurance payout are the first two kinds of letter.

   THERE IS NO DAY IN THE GAME YET (DAY-NIGHT.md is design), so a "day" here
   is minutes of DRIVING, carried across drives and reloads. When a clock
   exists MAIL_DAY goes and `dueAt` reads it; nothing else need change.

   Pure but for the mailbox's storage, which goes through src/storage.js.
   ===================================================================== */
import { readJSON, writeJSON } from "../storage.js";

/* Flagged design constants, THE MAINTAINER'S TO SET: every amount here is a
   placeholder against fares of about ten dollars. */
export const MAIL_DAY = 300;           // s of driving standing in for a day
export const REPAIR_BASE = 150;        // dollars, any knock
export const REPAIR_PER_DAMAGE = 2500; // dollars across the whole of the damage scale
export const INSURED_SHARE = 0.7;      // of a repair, when it was not the player's fault
export const HOSPITAL = 4000;          // dollars
export const TOW = 150;                // dollars
export const KEEP = 50;                // letters kept

export const newMailbox = () => ({ driven: 0, n: 0, items: [] });

/* WHAT A CONTACT PUTS IN THE POST. A repair is billed whoever was at fault,
   because there is no body shop to pay it at yet; the payout is a second
   letter, so being rear-ended can never be a way to earn. */
export function lettersFor(f, damaged) {
  if (f.kind === "person") return [{ kind: "hospital", title: "Hospital bill", amount: -HOSPITAL, days: 2, text: "For the person you struck." }];
  const repair = Math.round(REPAIR_BASE + REPAIR_PER_DAMAGE * damaged);
  const bill = { kind: "repair", title: "Repair bill", amount: -repair, days: 1, text: f.kind === "parked" ? "For the parked car, and yours." : "For the collision." };
  if (f.atFault) return [bill];
  return [bill, { kind: "insurance", title: "Insurance payout", amount: Math.round(repair * INSURED_SHARE), days: 1, text: "The other driver struck you. Part of the damage, covered." }];
}
export const towLetter = () => ({ kind: "tow", title: "Tow bill", amount: -TOW, days: 1, text: "Your car could not go on." });

/* Pure: the mailbox with one more letter on its way. */
export function post(box, letter, at) {
  const { days, ...rest } = letter;
  const item = { ...rest, id: box.n + 1, at, dueAt: box.driven + days * MAIL_DAY, arrived: false };
  return { ...box, n: box.n + 1, items: [...box.items, item].slice(-KEEP) };
}

/* Pure: dt more seconds of driving, and whatever arrives. A letter arrives once. */
export function mailTick(box, dt) {
  const driven = box.driven + dt;
  if (!box.items.some((i) => !i.arrived && i.dueAt <= driven)) return { box: { ...box, driven }, arrived: [] };
  const arrived = [];
  const items = box.items.map((i) => {
    if (i.arrived || i.dueAt > driven) return i;
    const got = { ...i, arrived: true };
    arrived.push(got);
    return got;
  });
  return { box: { ...box, driven, items }, arrived };
}

const KEY = "row.mail.v1";
export async function loadMailbox() {
  try { const b = await readJSON(KEY, null); if (b && typeof b.driven === "number" && Array.isArray(b.items)) return b; } catch { /* a fresh mailbox */ }
  return newMailbox();
}
export async function saveMailbox(box) {
  try { await writeJSON(KEY, box); } catch { /* kept for this visit only */ }
  return box;
}
