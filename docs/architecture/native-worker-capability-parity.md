# Native Worker capability parity

Status: complete in the repository. Production rollout remains gated by the
reviewed PlanetScale migrations and provider configuration.

Cloudflare Workers and PlanetScale PostgreSQL are the only current runtime.

| Capability | Native owner | Status |
| --- | --- | --- |
| Email and guest authentication | public API | Implemented |
| User and profile management | public API | Implemented with moderation events |
| Posts, comments, discovery, and feeds | public API and jobs | Implemented |
| Tier and editorial enforcement | contracts, public API, admin API | Implemented |
| Moderation, appeals, reputation, and rewards | all three Workers | Implemented |
| Notifications | public API and jobs | Implemented; delivery is provider-configured |
| Privacy export, deletion, and legal holds | public API, admin API, jobs | Implemented |
| Media processing | public API and jobs | Implemented behind default-off release gates |
| Administrative actions and audit logging | admin API and jobs | Implemented |
| Rate limits | public and admin APIs | Implemented using PostgreSQL atomic windows |

Authenticity evaluation always queues human review and cannot directly publish,
allow, block, or remove content.
