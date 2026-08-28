/* =====================================================================
   FRAME
   The camera. Pure geometry, no React and no colour, so it can be tested
   the same headless way the engine is — the renderer is the only file
   that should be drawing anything.

   frameFor is the resting frame: board size derived from lane geometry
   alone (see f9c3f5b), the same for every frame of a run. Good enough
   for every scenario built so far, because every road user's approach
   fits inside it.

   A merge or a long lane change will not: the car worth reading is
   further out than the junction board reaches, and it has to be visible
   before the decision, not at it. cameraFor lets a scenario name which
   actors the camera should ease out to cover. How far is read off that
   actor's own spawn point — the engine already knows how far back its
   approach starts — never a picked pixel value. When is read off its
   arriveAt, the same clock everything else in the engine runs on.

   Pure zoom: the junction stays centred, only the extent grows. A frame
   that also panned could slide the intersection off-centre right when
   the player needs to be reading it — a problem worth solving once a
   real scenario needs it, not before.
   ===================================================================== */
import { M, W, CX, CY, movementOf } from "./engine/index.js";
import { roadHalf } from "./engine/road.js";

export function frameFor(spec) {
  const vx = roadHalf(spec, "vert", M(3.6));
  const hy = roadHalf(spec, "horiz", M(3.6));
  // Enough road either side of the junction to read an approach.
  const wanted = 2 * Math.max(vx, hy) + M(26);
  const size = Math.max(W, wanted);
  const half = size / 2;
  return { box: `${CX - half} ${CY - half} ${size} ${size}`, scale: size / W };
}

const smoothstep = (k) => k * k * (3 - 2 * k);

// 0 before `from`, 1 at and after `to`, eased between.
const easeWindow = (t, from, to) => {
  if (to <= from) return t >= to ? 1 : 0;
  return smoothstep(Math.max(0, Math.min(1, (t - from) / (to - from))));
};

/* `camera.track` is a list of { id, revealBy, rampFor, pad }:
     id        which actor (or "ego") the frame must widen to cover
     revealBy  the frame must be fully open this many seconds before the
               actor arrives — so it is read before the decision, not at it
     rampFor   how many seconds the zoom itself takes, ending at revealBy
     pad       world-unit clearance kept beyond the actor, past its spawn
   Absent `camera`, or an id with nothing to track, this is frameFor. */
export function cameraFor(spec, sim, t, camera) {
  const base = frameFor(spec);
  const tracks = camera?.track;
  if (!tracks || !tracks.length) return base;

  const half0 = (base.scale * W) / 2;
  let half = half0;
  for (const track of tracks) {
    const { id, revealBy = 3, rampFor = 2.5, pad = M(3) } = track;
    const p = id === "ego" ? sim.ego : sim.actors.find((a) => a.id === id);
    if (!p) continue;
    const mv = movementOf(p);
    if (!mv.spawn) continue;
    const reach = Math.max(Math.abs(mv.spawn.x - CX), Math.abs(mv.spawn.y - CY)) + pad;
    const readyAt = p.arriveAt - revealBy;
    const e = easeWindow(t, readyAt - rampFor, readyAt);
    half = Math.max(half, half0 + (reach - half0) * e);
  }
  const size = half * 2;
  return { box: `${CX - half} ${CY - half} ${size} ${size}`, scale: size / W };
}
