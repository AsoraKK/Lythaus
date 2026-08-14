import assert from "node:assert/strict";
import { test } from "node:test";
import {
  restorePlan,
  routeForPattern,
} from "../ci/manage-cloudflare-worker-route.mjs";

const pattern = "admin.lythaus.co/api/admin/*";

test("routeForPattern selects only the configured same-origin route", () => {
  assert.deepEqual(
    routeForPattern(
      [
        { id: "other", pattern: "admin.lythaus.co/*", script: "admin-ui" },
        { id: "admin-api", pattern, script: "lythaus-admin-api-development" },
      ],
      pattern,
    ),
    { id: "admin-api", pattern, script: "lythaus-admin-api-development" },
  );
  assert.equal(routeForPattern([], pattern), null);
  assert.throws(
    () => routeForPattern([{ pattern }, { pattern }], pattern),
    /multiple routes/,
  );
});

test("restorePlan returns only the mutation needed to restore the prior route", () => {
  const before = {
    id: "before",
    pattern,
    script: "lythaus-admin-api-development",
  };
  const current = {
    id: "current",
    pattern,
    script: "lythaus-admin-api-development",
  };

  assert.deepEqual(restorePlan(null, null), { method: "none" });
  assert.deepEqual(restorePlan(null, current), {
    method: "delete",
    routeId: "current",
  });
  assert.deepEqual(restorePlan(before, null), {
    method: "create",
    body: { pattern, script: "lythaus-admin-api-development" },
  });
  assert.deepEqual(restorePlan(before, current), {
    method: "update",
    routeId: "current",
    body: { pattern, script: "lythaus-admin-api-development" },
  });
});
