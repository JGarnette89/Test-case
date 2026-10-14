/* The sim's worker: the shell around sim/remote.js `handle`, which is the
   whole protocol. Messages are handled in the order they arrive. */
import { handle } from "./remote.js";

let state = null;
self.onmessage = (e) => {
  try {
    const { state: next, reply } = handle(state, e.data);
    state = next;
    if (reply) self.postMessage(reply);
  } catch (err) {
    self.postMessage({ type: "error", seq: e.data?.seq, message: String(err?.stack ?? err) });
  }
};
