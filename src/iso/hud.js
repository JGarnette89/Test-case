/* =====================================================================
   THE CONTROLS, DRAWN ON THE CANVAS -- for every screen that drives.

   One drawing for the slider, the wheel bar and the indicators, laid
   out from the same constants controls.js maps touches with, so what
   is drawn is what is touched. Drawn after the world, so it is always
   on top; no DOM changes while the world moves (CLAUDE.md,
   Conventions).
   ===================================================================== */
import { SLIDER_W, SLIDER_TOP, SIGNAL_ZONE } from "./controls.js";
import { NEUTRAL } from "../sim/player.js";

const FONT = "600 10px system-ui, sans-serif";

/* The slider: its track, the neutral band, and the thumb coloured by
   what it is doing. */
export function drawSlider(ctx, size, slider) {
  const margin = 24, x = size.w - SLIDER_W / 2, top = SLIDER_TOP, bottom = size.h - margin, mid = (top + bottom) / 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  const band = (NEUTRAL * (bottom - top)) / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath(); ctx.moveTo(x, mid - band); ctx.lineTo(x, mid + band); ctx.stroke();
  const y = mid - (slider * (bottom - top)) / 2;
  ctx.fillStyle = slider > NEUTRAL ? "#6cc070" : slider < -NEUTRAL ? "#e0574f" : "#cfd3da";
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.font = FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(slider > NEUTRAL ? "GO" : slider < -NEUTRAL ? "BRK" : "--", x, y);
}

/* The wheel: a bar along the bottom left that fills left or right of
   centre. */
export function drawWheelBar(ctx, size, steer) {
  const wx = 24, wy = size.h - 22, ww = Math.min(180, size.w * 0.4);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy); ctx.stroke();
  ctx.strokeStyle = "#cfd3da";
  ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2 + (steer * ww) / 2, wy); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = FONT; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
  ctx.fillText("steer: drag here", wx, wy - 8);
}

/* THE INDICATORS: a chevron in each top corner, lit and blinking when
   that signal is on, the way the one on the dash is. `now` in ms. */
export function drawSignals(ctx, size, signal, now, { label = true } = {}) {
  const on = signal && Math.floor(now / 400) % 2 === 0;
  for (const side of ["left", "right"]) {
    const lit = signal === side && on, armed = signal === side;
    const cx = side === "left" ? SIGNAL_ZONE.w / 2 : size.w - SIGNAL_ZONE.w / 2, cy = SIGNAL_ZONE.h / 2;
    ctx.fillStyle = lit ? "#f2b84b" : armed ? "rgba(242,184,75,0.35)" : "rgba(255,255,255,0.14)";
    const d = side === "left" ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + d * 22, cy); ctx.lineTo(cx - d * 4, cy - 16); ctx.lineTo(cx - d * 4, cy - 6); ctx.lineTo(cx - d * 22, cy - 6);
    ctx.lineTo(cx - d * 22, cy + 6); ctx.lineTo(cx - d * 4, cy + 6); ctx.lineTo(cx - d * 4, cy + 16); ctx.closePath(); ctx.fill();
    if (label) {
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = FONT; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(side === "left" ? "signal left" : "signal right", cx, cy + 20);
    }
  }
}

/* A line of readout at the top left, small and steady. */
export function drawReadout(ctx, text, x = 8, y = 6) {
  ctx.fillStyle = "rgba(230,232,236,0.85)"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}
