/**
 * Test setup — runs before every test file.
 *
 * The vitest config sets `environment: "happy-dom"`, which gives us
 * `localStorage`, `sessionStorage`, `document`, and friends. happy-dom
 * does NOT reset these between tests, so each test that touches storage
 * must clear at the right boundary. The drivers themselves expose a
 * `clear()` method we use in `beforeEach`/`afterEach` inside individual
 * tests.
 *
 * This file is intentionally tiny — it exists so that if we ever need
 * to register a global lifecycle hook (e.g. to reset the module-level
 * `configuration` between tests), there is already a place wired up
 * through `setupFiles` in the vitest config.
 */
import { beforeEach } from "vitest";

beforeEach(() => {
  // Wipe both Web Storage backends so a stray write from a previous
  // test cannot bleed into the current one. happy-dom keeps both
  // alive for the whole vitest run.
  if (typeof localStorage !== "undefined") localStorage.clear();
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});
