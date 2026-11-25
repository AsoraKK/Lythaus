using Workerd = import "/workerd/workerd.capnp";
# The external service overrides below must point to loopback only. The fixture also
# provides the sole possible HTTP destination, including the synthetic Access JWKS.
const config :Workerd.Config = (
  services = [
    (name = "wrapped", worker = (
      modules = [(name = "worker", esModule = embed "worker.mjs"), (name = "sealed.js", esModule = embed "sealed.js")],
      compatibilityDate = "2026-07-27", compatibilityFlags = ["nodejs_compat"],
      globalOutbound = "fixture", bindings = [
        (name = "DB", wrapped = (moduleName = "cloudflare-internal:hyperdrive-postgres-api",
          innerBindings = [(name = "fetcher", service = "postgres")])),
        (name = "FIXTURE", service = "fixture")
      ]
    )),
    (name = "postgres", external = (tcp = ())),
    (name = "fixture", external = (http = ()))
  ]
);
