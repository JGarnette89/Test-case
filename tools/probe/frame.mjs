import { LANE, M, W } from '../../src/engine/index.js';
import { crossSpec, roadHalf } from '../../src/engine/road.js';
const m = (px) => Math.round(px / 20 * 10) / 10;
for (const lanes of [1, 2, 3]) {
  const spec = crossSpec('stop', lanes);
  const vx = roadHalf(spec, 'vert', LANE);
  const wanted = 2 * Math.max(vx, vx) + M(26);
  const size = Math.max(W, wanted);
  console.log(`${lanes} lane(s) each way: carriageway ${m(vx*2)}m, view ${m(size)}m, zoom x${(size/W).toFixed(2)}`);
}
