# Azure retirement — 6 August 2026

Azure was fully deleted on 6 August 2026. It was not paused, scaled down, retained for rollback, or left as a disaster-recovery backend.

The canonical Lythaus runtime is Cloudflare Workers with PlanetScale PostgreSQL through Hyperdrive. Active repository code, configuration, deployment workflows, credentials, and operational documentation must not depend on Azure.

Git history preserves the former implementation chronology. Historical commits are not rewritten because doing so would invalidate commit hashes and disrupt repository provenance.
