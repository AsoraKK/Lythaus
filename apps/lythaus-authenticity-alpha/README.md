# Lythaus authenticity alpha boundary

This is a separately named, internal-only Cloudflare Container boundary for
the WP007F/WP007G authenticity evidence contract. It defaults to `SHADOW`, requires
an internal bearer secret for `/score`, bounds image payloads to 10 MiB, and
returns partial evidence when detector artifacts are not mounted. Missing
detector evidence is never converted to a Human-authored result.

The image intentionally contains no model weights. The current WP007F/WP007G
checkpoints have research-evaluation restrictions and the OpenAI CLIP model
card places deployment use outside its intended scope; a future deployment
requires a separate rights approval and an auditable model image build.

The service exposes the WP007G v2 evidence shape with explicit missingness and
no calibrated profile. The service is not a production authenticity
enforcement path. It grants no enforcement authority and is not deployed by
this change.
