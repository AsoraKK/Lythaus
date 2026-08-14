import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function fail(message) {
  throw new Error(message);
}

export function routeForPattern(routes, pattern) {
  if (!Array.isArray(routes)) {
    fail("Cloudflare route response did not contain an array of routes.");
  }

  const matches = routes.filter((route) => route?.pattern === pattern);
  if (matches.length > 1) {
    fail(`Cloudflare returned multiple routes for ${pattern}.`);
  }

  return matches[0] ?? null;
}

export function restorePlan(beforeRoute, currentRoute) {
  if (!beforeRoute && !currentRoute) {
    return { method: "none" };
  }

  if (!beforeRoute) {
    return { method: "delete", routeId: currentRoute.id };
  }

  if (!currentRoute) {
    return {
      method: "create",
      body: {
        pattern: beforeRoute.pattern,
        script: beforeRoute.script ?? null,
      },
    };
  }

  return {
    method: "update",
    routeId: currentRoute.id,
    body: { pattern: beforeRoute.pattern, script: beforeRoute.script ?? null },
  };
}

async function main() {
  const [operation, evidencePath, pattern, expectedScript] =
    process.argv.slice(2);
  if (
    !["snapshot", "verify", "restore"].includes(operation) ||
    !evidencePath ||
    !pattern
  ) {
    fail(
      "Usage: manage-cloudflare-worker-route.mjs <snapshot|verify|restore> <evidence-path> <route-pattern> [expected-script]",
    );
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!apiToken || !zoneId) {
    fail("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required.");
  }

  const routesPath = `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`;
  async function request(path = "", init = {}) {
    const response = await fetch(`${routesPath}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${apiToken}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) {
      fail(
        `Cloudflare Workers route request failed with HTTP ${response.status}.`,
      );
    }
    return payload.result;
  }
  const currentRoute = async () => routeForPattern(await request(), pattern);

  if (operation === "snapshot") {
    await writeFile(
      evidencePath,
      JSON.stringify({ route: await currentRoute() }, null, 2),
    );
    return;
  }
  if (operation === "verify") {
    if (!expectedScript) {
      fail("An expected Worker script is required to verify a route.");
    }
    const route = await currentRoute();
    if (route?.script !== expectedScript) {
      fail(`Cloudflare did not publish ${pattern} to ${expectedScript}.`);
    }
    await writeFile(evidencePath, JSON.stringify({ route }, null, 2));
    return;
  }

  const snapshot = JSON.parse(await readFile(evidencePath, "utf8"));
  const beforeRoute = snapshot?.route ?? null;
  if (beforeRoute && beforeRoute.pattern !== pattern) {
    fail(
      "Route rollback snapshot pattern does not match the configured route.",
    );
  }
  const plan = restorePlan(beforeRoute, await currentRoute());
  if (plan.method === "delete") {
    await request(`/${plan.routeId}`, { method: "DELETE" });
  } else if (plan.method === "create") {
    await request("", { method: "POST", body: JSON.stringify(plan.body) });
  } else if (plan.method === "update") {
    await request(`/${plan.routeId}`, {
      method: "PUT",
      body: JSON.stringify(plan.body),
    });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
