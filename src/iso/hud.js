/* =====================================================================
   THE CONTROLS, DRAWN ON THE CANVAS -- for every screen that drives.

   One drawing for the slider, the wheel bar and the indicators, laid
   out from the same constants controls.js maps touches with, so what
   is drawn is what is touched. Drawn after the world, so it is always
   on top; no DOM changes while the world moves (CLAUDE.md,
   Conventions).
   ===================================================================== */
import { SLIDER_W, SLIDER_TOP, SIGNAL_ZONE } from "./controls.js";
import { NEUTRAL, holdBand } from "../sim/player.js";

const FONT = "600 10px system-ui, sans-serif";

/* The slider: its track, the neutral band, THE MAINTAIN BAND where
   the car is holding its speed -- drawn where holdBand puts it for
   this speed and grade, so it climbs as the car speeds up and as the
   road climbs, and finding it is a readable act rather than guesswork
   -- and the thumb coloured by what it is doing. `v` and `grade` are
   the car's; without them the band is not drawn. */
export function drawSlider(ctx, size, slider, v = null, grade = 0, stop = null) {
  const margin = 24, x = size.w - SLIDER_W / 2, top = SLIDER_TOP, bottom = size.h - margin, mid = (top + bottom) / 2;
  const yOf = (u) => mid - (u * (bottom - top)) / 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath(); ctx.moveTo(x, yOf(NEUTRAL)); ctx.lineTo(x, yOf(-NEUTRAL)); ctx.stroke();
  let holding = false, stopping = false;
  /* THE STOP MARKER takes the hold band's place when there is something
     to stop for (drive.js stopFor): the band is every pressure that
     brings the car to rest at the line, the white bar the pressure that
     puts it exactly there. Hold the thumb on the bar and the bar stays
     still; leave it late and the bar slides down the brake. */
  if (stop) {
    stopping = slider >= stop.lo - 0.005 && slider <= stop.hi + 0.005;
    const y0 = yOf(Math.min(1, stop.hi)), y1 = yOf(Math.max(-1, stop.lo));
    /* Orange to stop, teal to slow for a corner: the same mechanic, two
       reasons, told apart at a glance. */
    const hue = stop.kind === "corner" ? "76,208,190" : "255,138,76";
    ctx.strokeStyle = stopping ? `rgba(${hue},0.95)` : `rgba(${hue},0.6)`; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, Math.max(y0 + 2, y1)); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 16, yOf(stop.at)); ctx.lineTo(x + 16, yOf(stop.at)); ctx.stroke();
    ctx.fillStyle = `rgba(${hue},1)`; ctx.font = FONT; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(stop.kind === "corner" ? `corner ${Math.round(stop.vc * 3.6)}` : stop.line ? "stop at line" : "stop behind", x - 22, yOf(stop.at));
    if (!stop.can) {
      ctx.fillStyle = "#e0574f"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(stop.kind === "corner" ? "too fast" : "can't stop", x, bottom + 4);
    }
  } else if (v != null) {
    const band = holdBand(v, grade);
    holding = slider >= band.lo && slider <= band.hi;
    if (band.lo > 1) {
      /* The hill costs more than the engine has: the band is off the top. */
      ctx.fillStyle = "#f2b84b"; ctx.font = FONT; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText("can't hold", x, top - 4);
    } else {
      const y0 = yOf(Math.min(1, band.hi)), y1 = yOf(Math.max(-1, band.lo));
      ctx.strokeStyle = holding ? "rgba(111,182,255,0.9)" : "rgba(111,182,255,0.55)"; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, Math.max(y0 + 1, y1)); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 14, yOf(band.at)); ctx.lineTo(x + 14, yOf(band.at)); ctx.stroke();
      ctx.fillStyle = "rgba(111,182,255,0.9)"; ctx.font = FONT; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText("hold", x - 20, yOf(band.at));
    }
  }
  const y = yOf(slider);
  ctx.fillStyle = stopping ? (stop.kind === "corner" ? "#4cd0be" : "#ff8a4c") : holding ? "#6fb6ff" : slider > NEUTRAL ? "#6cc070" : slider < -NEUTRAL ? "#e0574f" : "#cfd3da";
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.font = FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(stopping ? (stop.kind === "corner" ? "SLOW" : "STOP") : holding ? "HOLD" : slider > NEUTRAL ? "GO" : slider < -NEUTRAL ? "BRK" : "--", x, y);
}

/* THE STOP, JUDGED (drive.js): manner before position, the maintainer's
   own rule -- a harsh stop is a braking fault wherever it ends; a
   controlled one in the wrong place is short or over the line. */
export function drawStop(ctx, size, y, last, age) {
  if (!last || age >= 3.5) return;
  const word = { clean: "clean stop", harsh: `harsh stop -- ${last.peak.toFixed(1)} m/s² braking`, short: `stopped ${(-last.err).toFixed(1)} m short`, over: `over the line by ${last.err.toFixed(1)} m` }[last.verdict];
  ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = { clean: "#6cc070", harsh: "#e0574f", short: "#f2b84b", over: "#e0574f" }[last.verdict];
  ctx.fillText(word, size.w / 2, y);
}

/* THE TURN, JUDGED: the corner's speed beside the car's while the turn
   is ahead, and how it went once it is done -- so the player learns
   what a corner wants from what it gave them. `last` is the car's
   `lastTurn`, `age` seconds since it was judged. */
export function drawCorner(ctx, size, y, kmh, cornerSpeed, last, age) {
  ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.font = "600 13px system-ui, sans-serif";
  if (cornerSpeed != null) {
    const want = Math.round(cornerSpeed * 3.6);
    ctx.fillStyle = kmh > want * 1.15 ? "#e0574f" : kmh > want ? "#f2b84b" : "#6cc070";
    ctx.fillText(`corner: ${want} km/h`, size.w / 2, y);
  } else if (last && age < 3.5) {
    const word = { clean: "clean turn", rough: `rough turn — scrubbed ${Math.round(last.scrubbed * 3.6)} km/h`, wide: "ran wide", cut: "cut the corner", slow: "crawled round" }[last.verdict];
    ctx.fillStyle = { clean: "#6cc070", rough: "#f2b84b", wide: "#e0574f", cut: "#e0574f", slow: "rgba(230,232,236,0.6)" }[last.verdict];
    ctx.fillText(word, size.w / 2, y);
  }
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
