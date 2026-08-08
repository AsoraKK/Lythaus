# Cost reconciliation baseline

Date: 2026-08-05

The current provisioned forecast is approximately US$15/month: Cloudflare Workers Paid plus PlanetScale `main` and `development` branches. Usage, invoice totals, existing GitHub/ChatGPT/Codex subscriptions, and electricity are not included in this baseline.

The development branch remains retained because Hyperdrive routing, authenticated acceptance, schema parity, and fixture export are not complete. No branch deletion was performed.

The production control is implemented in the new `system.cost_budget_*` tables and the jobs Worker admission path. It still requires the approved `0009_cost_budget_enforcement.sql` migration and a simulated US$100 exhaustion test before the gate can be marked complete.
