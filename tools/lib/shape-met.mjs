/* Cars met a minute on the endless highway, shaped and unshaped, over seeds, in worker threads (verify-shaping section 3; the drive is shape-drive.mjs, the check's own). A worker that dies rejects: a run that did not happen must fail the check, never shrink its sample. */
import { Worker } from "node:worker_threads";

export function metAll(seeds, workers) {
  const jobs = seeds.flatMap((seed) => [true, false].map((shape) => ({ seed, shape })));
  let next = 0;
  const one = () => new Promise((resolve, reject) => {
    const j = jobs[next++];
    if (!j) return resolve();
    const wk = new Worker(new URL("./shape-met-worker.mjs", import.meta.url), { workerData: j });
    wk.once("message", (r) => { j.met = r; });
    wk.once("error", reject);
    wk.once("exit", (code) => { if (code !== 0 || j.met == null) return reject(new Error(`shaping run seed ${j.seed} shape ${j.shape}: worker exited ${code}`)); one().then(resolve, reject); });
  });
  return Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, one)).then(() => ({ on: jobs.filter((j) => j.shape).map((j) => j.met), off: jobs.filter((j) => !j.shape).map((j) => j.met) }));
}
