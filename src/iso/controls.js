/* =====================================================================
   THE TWO CONTROLS, AS POINTER ARITHMETIC.

   Steering is a horizontal drag anywhere on the left of the canvas:
   deflection is how far the thumb has moved from where it landed, in
   pixels, and the wheel centres itself when the thumb lifts, as a
   wheel does. The slider is a vertical track on the right: the thumb's
   height on it is the value, top full throttle, bottom full brake, a
   neutral band in the middle (player.js NEUTRAL). It holds where it is
   left, so a set speed does not need a thumb on it -- one of two
   readings of "a slider"; the other, springing back to neutral, is a
   toggle for the maintainer to feel the difference.

   No React and no DOM here: `pointer` takes an event's kind and
   position and returns the new input, so the mapping can be checked in
   node and the screen only has to wire events.
   ===================================================================== */
export const STEER_TRAVEL = 110;   // px of drag for full lock: about a thumb's comfortable sweep
export const SLIDER_W = 64;        // px, the track's width, wider than a thumb
/* THE INDICATOR: two tap zones in the top corners of the canvas, left
   and right, like the two ways a stalk goes. A tap toggles that signal;
   tapping the other side switches it; a drag that starts there is
   steering, not a signal. The slider's track starts below the right
   zone (SLIDER_TOP). */
export const SIGNAL_ZONE = { w: 96, h: 72 };
export const SLIDER_TOP = SIGNAL_ZONE.h + 12;
const TAP_MS = 350, TAP_PX = 12;

export function controls({ spring = false } = {}) {
  const state = { steer: 0, slider: 0, signal: null, spring, touches: {} };
  return {
    state,
    /* `kind` is down | move | up; `id` the pointer; (x, y) in canvas
       pixels; `box` the canvas size; `now` in ms for telling a tap from
       a drag. Returns the current { steer, slider, signal }. */
    pointer(kind, id, x, y, box, now = 0) {
      const t = state.touches;
      if (kind === "down") {
        const zone = y < SIGNAL_ZONE.h ? (x < SIGNAL_ZONE.w ? "left" : x > box.w - SIGNAL_ZONE.w ? "right" : null) : null;
        const onSlider = !zone && x >= box.w - SLIDER_W;
        t[id] = onSlider ? { role: "slider" } : { role: "steer", x0: x, y0: y, at: now, zone };
        if (onSlider) state.slider = sliderValue(y, box);
      } else if (kind === "move" && t[id]) {
        if (t[id].role === "steer") {
          if (t[id].zone && Math.hypot(x - t[id].x0, y - t[id].y0) > TAP_PX) t[id].zone = null;   // a drag, not a tap
          state.steer = clamp((x - t[id].x0) / STEER_TRAVEL);
        } else state.slider = sliderValue(y, box);
      } else if (kind === "up" && t[id]) {
        if (t[id].role === "steer") {
          state.steer = 0;
          if (t[id].zone && now - t[id].at < TAP_MS) state.signal = state.signal === t[id].zone ? null : t[id].zone;
        } else if (state.spring) state.slider = 0;
        delete t[id];
      }
      return { steer: state.steer, slider: state.slider, signal: state.signal };
    },
    /* Keyboard, for a desk: arrows or WASD. Held keys ramp the wheel so
       a tap is a nudge and a hold is a turn. */
    keys(held, dt) {
      const want = (held.has("ArrowLeft") || held.has("a") ? -1 : 0) + (held.has("ArrowRight") || held.has("d") ? 1 : 0);
      state.steer = want === 0 ? state.steer * Math.max(0, 1 - 8 * dt) : clamp(state.steer + want * 4 * dt);
      if (held.has("ArrowUp") || held.has("w")) state.slider = clamp(state.slider + 1.5 * dt);
      if (held.has("ArrowDown") || held.has("s")) state.slider = clamp(state.slider - 1.5 * dt);
      if (held.has(" ")) state.slider = -1;
      return { steer: state.steer, slider: state.slider, signal: state.signal };
    },
    /* The indicator from a key: q left, e right, each a toggle. */
    signal(side) {
      state.signal = state.signal === side ? null : side;
      return state.signal;
    },
  };
}

/* The slider's value from a height on the track: the track spans the
   canvas with a margin, top is +1, bottom is -1. */
export function sliderValue(y, box, margin = 24) {
  const top = SLIDER_TOP, bottom = box.h - margin;
  return clamp(1 - (2 * (y - top)) / (bottom - top));
}

const clamp = (v) => Math.max(-1, Math.min(1, v));
