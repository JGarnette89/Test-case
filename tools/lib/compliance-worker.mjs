/* A worker thread for verify-compliance's section 3: its share of the runs, in order, added up (compliance-runs.mjs). */
import { workerData, parentPort } from "node:worker_threads";
import { runOne, merge } from "./compliance-runs.mjs";

const results = workerData.map(([mapName, cars, seed]) => runOne(mapName, cars, seed));
const m = merge(results);
parentPort.postMessage({ tally: m.tally, byDriver: [...m.byDriver.entries()] });
