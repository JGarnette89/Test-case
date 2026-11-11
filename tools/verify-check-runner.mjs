/* Register the runner regression test in the normal suite.
 * These files are executed/copied by the test rather than imported as code.
 * Explicit inputs keep runner changes visible to both affected modes.
 */
// check-input: ./check.mjs
// check-input: ./affected.mjs
// check-input: ./check-policy.mjs
import "./check-runner-test.mjs";
