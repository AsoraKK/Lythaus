# Foundation 001 human-only actions

The repository work is intentionally not a production launch approval. The
following actions remain owner/provider-controlled:

1. Review and approve ADR-003, the evidence contracts, dual-axis origin model,
   processing modes, and the separation of Safety, Forensics, and Judge.
2. Verify current Cloudflare account, zone, Worker, R2, Queue, Hyperdrive, and
   PlanetScale state against the resource registry; confirm no duplicate or
   new-cost resource is required.
3. Approve any live Container proof deployment, exact `lite` instance and
   `max_instances: 1` limit, expected cost, rollback, and emergency disable.
4. Provide or approve reliable Windows CPU-package telemetry. Run the staged
   5/10/15-minute thermal qualification, review the report, and decide whether
   any local workload may be attended or unattended. The repository does not
   enable unattended training automatically.
5. Approve dataset sources, licences, lineage, hashes, privacy classification,
   and the rule that ordinary Lythaus user content is not training data.
6. Complete independent image/video evaluation, calibration, subgroup and
   transformation-stability review, model cards, rollback rehearsal, and
   appeal testing for every future model.
7. Approve policy versions, legal/privacy retention and appeal operations, and
   any future deterministic enforcement change. No authenticity model has
   enforcement authority in Foundation 001.
8. Approve any commercial API customer policy, billing, quotas, or provider
   access. None are implemented here.

## WP002-only decisions

9. Provide a read-only Cloudflare credential or review the resulting
   `UNKNOWN` live-resource state. Approve no mutation merely by reviewing this
   report.
10. Review dataset/image rights, per-file provenance, privacy/consent status,
    and whether any candidate may be used for commercial training,
    distillation, or evaluation.
11. Review separate code, checkpoint, upstream foundation-model, and dataset
    licences for SAFE, GRIP CLIP, and any reconstruction candidate before
    materialisation or teacher use.
12. Approve the bounded Container proof only after reviewing the published-rate
    calculation, worst-case test budget, exact existing bindings, routed event,
    rollback, and emergency disable.
13. Execute the elevated LibreHardwareMonitor proof, if desired, and review
    the thermal qualification report. Unattended training remains disabled
    unless telemetry is valid and the owner explicitly approves it.
14. Decide whether WP003 may select a reconstruction candidate or acquire any
    permission-gated dataset. WP002 makes no production model or enforcement
    decision.
