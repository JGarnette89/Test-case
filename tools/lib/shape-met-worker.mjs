/* A worker thread for verify-shaping section 3: one drive, its cars met a minute (shape-met.mjs). */
import { workerData, parentPort } from "node:worker_threads";
import { TEST_MAPS } from "../../src/map/samples.js";
import { drive } from "./shape-drive.mjs";

const r = drive({ raw: TEST_MAPS.find((m) => m.id === "test-loop").build(), cars: 160, seed: workerData.seed, secs: 180, shape: workerData.shape });
parentPort.postMessage(Number(r.enc.metPerMin));
