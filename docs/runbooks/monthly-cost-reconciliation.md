# Monthly cost reconciliation

The current known provisioned floor is approximately US$15/month:

| Component | Forecast floor |
|---|---:|
| Cloudflare Workers Paid account plan | US$5/month |
| PlanetScale `main` branch | approximately US$5/month |
| PlanetScale `development` branch | approximately US$5/month |
| Known provisioned floor | approximately US$15/month |

This is a forecast, not an invoice. Reconcile the actual account statement and variable usage monthly. Include Workers, Workers AI, AI Gateway, Hyperdrive, R2 storage and operations, Queues, Containers, and every PlanetScale branch/storage item. Existing GitHub, ChatGPT/Codex, and electricity costs are separate and must not be silently treated as zero.

Retain PlanetScale `development` until production origin routing, ADR 003 authentication, schema parity, and safe fixture export all pass. Branch deletion is a separate change requiring a data-retention review and a documented recreation procedure.

The application hard stop is US$100/month. At US$70 experiments stop, at US$80 optional analysis stops, at US$90 only essential work remains, at US$95 deep scans stop, and at US$100 all non-essential paid work fails closed. Cloudflare billing alerts are notifications only; the PlanetScale ledger is the admission control.
