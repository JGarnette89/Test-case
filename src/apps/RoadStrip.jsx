/* =====================================================================
   THE STRIP: the whole course at once, small.

   Kept and named as a COMPONENT rather than left as the debug view it
   started as, on the maintainer's instruction: "something we can use
   later on to display things to the user along the road."

   So it is not a minimap of the world. It is a place to put things the
   player needs to know about the road AHEAD that will not fit in the
   close view -- where the next instruction applies, where a hazard is,
   how much of the drive is left, what has been marked and where. The
   `marks` prop is that extension point and is the reason this file
   exists at all; everything else here is what the stage 3 screen already
   needed.

   TWO PROPERTIES IT HAS TO KEEP TO BE THAT.

   It shows the WHOLE COURSE, so nothing on it may be positioned relative
   to the camera -- the moment something is, it stops being a map of the
   drive and becomes a second, smaller view of wherever you happen to be.

   And it is read at a GLANCE, so what it carries has to be a handful of
   marks. A second rendering of the world at a twentieth of the size is
   not information, it is texture.
   ===================================================================== */
import React from "react";
import { C } from "../theme.js";
import { M, CAR } from "../sim/crossing.js";

export default function RoadStrip({
  course,
  cars = [],          // { id, x, y, mine }
  route = [],         // { k, reached } -- intersections the driver was told to visit
  marks = [],         // { x, y, kind, label } -- ANYTHING to say about a place on the road
  view = null,        // { x, y, half } -- where the close view is looking
  height = 64,
}) {
  const span = Math.max(...course.at.map((a) => a.at.x));
  const drop = Math.max(...course.at.map((a) => a.at.y));
  const edge = course.at[0].layout.place.reach;
  const box = { x: -edge, y: -edge, w: span + edge * 2, h: drop + edge * 2 };

  return (
    <div style={{ height, overflow: "hidden", borderRadius: 6 }}>
      <svg viewBox={`${M(box.x)} ${M(box.y)} ${M(box.w)} ${M(box.h)}`}
        style={{ width: "100%", height: "100%", display: "block" }}
        preserveAspectRatio="xMidYMid meet">
        <rect x={M(box.x)} y={M(box.y)} width={M(box.w)} height={M(box.h)} fill="#1b1e23" />

        {/* Every road, both axes. Drawn per intersection rather than per
            link because a road runs past the ones on it. */}
        {course.at.filter((a) => a.col === 0).map((spot) => (
          <rect key={"ew" + spot.k} x={M(box.x)} y={M(spot.at.y - 3.6)}
            width={M(box.w)} height={M(7.2)} fill="#2c3037" />
        ))}
        {course.at.filter((a) => a.row === 0).map((spot) => (
          <rect key={"ns" + spot.k} x={M(spot.at.x - 3.6)} y={M(box.y)}
            width={M(7.2)} height={M(box.h)} fill="#2c3037" />
        ))}
        {course.at.map((spot) => (
          <rect key={"box" + spot.k} x={M(spot.at.x - 3.6)} y={M(spot.at.y - 3.6)}
            width={M(7.2)} height={M(7.2)} fill="#343941" />
        ))}

        {/* WHERE THEY WERE TOLD TO GO, filling in as they get there, so
            the plan is visible beside the driving. */}
        {route.map((leg, i) => {
          const spot = course.at[leg.k];
          if (!spot) return null;
          return (
            <circle key={"route" + i} cx={M(spot.at.x)} cy={M(spot.at.y)} r={M(7)}
              fill="none" stroke={C.amber} strokeWidth={M(1.2)}
              opacity={leg.reached ? 0.85 : 0.28} />
          );
        })}

        {/* ANYTHING ELSE WORTH SAYING ABOUT A PLACE. Deliberately generic:
            this is the half of the component that does not exist yet. */}
        {marks.map((mark, i) => (
          <circle key={"mark" + i} cx={M(mark.x)} cy={M(mark.y)} r={M(mark.r ?? 4)}
            fill={mark.fill ?? "none"} stroke={mark.stroke ?? C.red}
            strokeWidth={M(1)} opacity={mark.opacity ?? 0.9} />
        ))}

        {cars.map((car) => (
          <rect key={car.id} x={M(car.x) - M(CAR.length) / 2} y={M(car.y) - M(1.6)}
            width={M(CAR.length)} height={M(3.2)}
            fill={car.mine ? C.amber : car.still ? "#4a5058" : "#69707b"} />
        ))}

        {view && (
          <rect x={M(view.x - view.half)} y={M(view.y - view.half)}
            width={M(view.half * 2)} height={M(view.half * 2)}
            fill="none" stroke={C.amber} strokeWidth={M(0.9)} opacity={0.7} />
        )}
      </svg>
    </div>
  );
}
