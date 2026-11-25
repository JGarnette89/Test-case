/* =====================================================================
   THE WORDS, PLAIN (GAME.md; WORK-game-slice1 section 5). Pure data.
   Jay will revise these. An id with no entry shows nothing as praise and
   the id itself as a fault, so a missing entry is visible, not hidden.
   ===================================================================== */
export const WORDS = {
  collision: "You hit another vehicle.",
  struckPerson: "You hit a person.",
  struckBy: "Another driver hit you. Not your fault.",
  ranRed: "You entered the intersection on a red light.",
  rolledStop: "You didn't come to a complete stop at the stop sign.",
  failedToYield: "You went when someone else had the right of way.",
  blockingBox: "You stopped inside the intersection.",
  harshBraking: "You braked hard to stop.",
  lateSignal: "Your turn signal came on less than two seconds before you turned.",
  noSignal: "You turned without signalling.",
  missedTurn: "You signalled a turn and didn't make it.",
  wrongTurn: "That wasn't the turn you were asked to make.",
  tightGap: "You changed lanes into a gap too small for the car behind.",
  honkedAt: "Another driver honked at you.",
  stoppedShort: "You stopped well short of the stop line.",
  dawdling: "The road was yours and you waited too long.",
  wideTurn: "You swung wide on the turn.",
  notKeepingRight: "You stayed out of the right lane without a reason.",
  underLimit: "You drove well under the limit on a clear road.",
  stoppedForPed: "You stopped for someone on foot.",
  letSomeoneIn: "You let someone in.",
  letIn: "A driver let you in.",
  /* The round's timing (WORK-game-slice2 section 6). */
  undueDelay: "You waited well after the road was yours.",
  early: "You went before a careful driver would have. It worked out this time.",
  missedGap: "There was an earlier gap you could have taken.",
  quick: "Right on time.",
};

/* Why a round ended without the player getting through. */
export const END_WORDS = {
  time: "Out of time.",
  edge: "You left the map.",
  contact: "Round over: contact.",
};

/* A fault's words: its entry, or the id itself so a gap shows. */
export const faultWords = (id) => WORDS[id] ?? id;
/* Praise's words, or null: an unknown praise says nothing. */
export const praiseWords = (id) => WORDS[id] ?? null;

/* The task in large words, on the intro. */
export const TASK_WORDS = { straight: "Go straight", left: "Turn left", right: "Turn right" };

/* THE DELAY, said: how long after the road became the player's they went. `delay` seconds, one decimal place. */
export function delayWords(delay, openAtFreeze) {
  const d = delay.toFixed(1);
  return openAtFreeze ? `The road was clear when you arrived; you went after ${d} s.` : `You went ${d} s after the road was clear.`;
}
