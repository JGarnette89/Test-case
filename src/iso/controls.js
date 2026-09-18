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

export function controls({ spring = false } = {}) {
  const state = { steer: 0, slider: 0, spring, touches: {} };
  return {
    state,
    /* `kind` is down | move | up; `id` the pointer; (x, y) in canvas
       pixels; `box` the canvas size. Returns the current { steer,
       slider }. */
    pointer(kind, id, x, y, box) {
      const t = state.touches;
      if (kind === "down") {
        const onSlider = x >= box.w - SLIDER_W;
        t[id] = onSlider ? { role: "slider" } : { role: "steer", x0: x };
        if (onSlider) state.slider = sliderValue(y, box);
      } else if (kind === "move" && t[id]) {
        if (t[id].role === "steer") state.steer = clamp((x - t[id].x0) / STEER_TRAVEL);
        else state.slider = sliderValue(y, box);
      } else if (kind === "up" && t[id]) {
        if (t[id].role === "steer") state.steer = 0;
        else if (state.spring) state.slider = 0;
        delete t[id];
      }
      return { steer: state.steer, slider: state.slider };
    },
    /* Keyboard, for a desk: arrows or WASD. Held keys ramp the wheel so
       a tap is a nudge and a hold is a turn. */
    keys(held, dt) {
      const want = (held.has("ArrowLeft") || held.has("a") ? -1 : 0) + (held.has("ArrowRight") || held.has("d") ? 1 : 0);
      state.steer = want === 0 ? state.steer * Math.max(0, 1 - 8 * dt) : clamp(state.steer + want * 4 * dt);
      if (held.has("ArrowUp") || held.has("w")) state.slider = clamp(state.slider + 1.5 * dt);
      if (held.has("ArrowDown") || held.has("s")) state.slider = clamp(state.slider - 1.5 * dt);
      if (held.has(" ")) state.slider = -1;
      return { steer: state.steer, slider: state.slider };
    },
  };
}

/* The slider's value from a height on the track: the track spans the
   canvas with a margin, top is +1, bottom is -1. */
export function sliderValue(y, box, margin = 24) {
  const top = margin, bottom = box.h - margin;
  return clamp(1 - (2 * (y - top)) / (bottom - top));
}

const clamp = (v) => Math.max(-1, Math.min(1, v));
