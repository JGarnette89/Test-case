/* A worker thread for verify-keepright: one mode, one seed (keepright-runs.mjs). */
import { workerData, parentPort } from "node:worker_threads";
import { runOne } from "./keepright-runs.mjs";

parentPort.postMessage(runOne(workerData.mode, workerData.seed));
