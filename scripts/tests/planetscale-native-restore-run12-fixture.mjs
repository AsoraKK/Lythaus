import { RUN12, RUN12_ARTIFACTS } from '../ci/planetscale-native-restore-run12-reconciliation.mjs';

export function syntheticRun12Metadata(repository = 'fixture-owner/Lythaus') {
  const human = repository.split('/')[0];
  const run = cleanup => ({ id: Number(cleanup ? RUN12.cleanupRunId : RUN12.runId), run_number: cleanup ? 2 : 12,
    run_attempt: 1, workflow_id: cleanup ? RUN12.cleanupWorkflowId : RUN12.workflowId,
    path: `.github/workflows/planetscale-native-restore-${cleanup ? 'cleanup' : 'check'}.yml`,
    event: 'workflow_dispatch', head_sha: RUN12.headSha, head_branch: 'main', status: 'completed',
    conclusion: cleanup ? 'success' : 'failure',
    display_title: cleanup ? `Native restore cleanup ${RUN12.runId}` : `Native restore execute ${RUN12.headSha}`,
    name: cleanup ? `Native restore cleanup ${RUN12.runId}` : `Native restore execute ${RUN12.headSha}`,
    repository: { id: 1010752912, full_name: repository }, head_repository: { id: 1010752912, full_name: repository }, pull_requests: [] });
  const responses = new Map();
  for (const cleanup of [false, true]) {
    const id = cleanup ? RUN12.cleanupRunId : RUN12.runId;
    responses.set(`/actions/runs/${id}`, run(cleanup));
    const required = cleanup ? [
      ['Persist pending deletion before any DELETE', 'success'], ['Download and verify durable pending attempt', 'success'],
      ['Delete original acknowledged target once after reviewed durable evidence', 'success'],
      ['Reconcile read-only without retrying deletion or qualification', 'skipped'], ['Retain separate sanitized cleanup receipt', 'success'],
    ] : [['Run fixed-target runner using only existing protected access', 'failure'],
      ['Finalize immutable qualification evidence without provider access', 'success'], ['Upload immutable qualification evidence', 'success']];
    const steps = required.map(([name, conclusion], index) => ({ name, number: index + 1, status: 'completed', conclusion }));
    while (steps.length < (cleanup ? 18 : 13)) steps.push({ name: `synthetic-reviewed-step-${steps.length}`,
      number: steps.length + 1, status: 'completed', conclusion: 'success' });
    responses.set(`/actions/runs/${id}/jobs?per_page=100`, { total_count: 1, jobs: [{
      id: cleanup ? RUN12.cleanupJobId : RUN12.jobId, run_id: Number(id), run_attempt: 1, head_sha: RUN12.headSha,
      name: cleanup ? 'Review evidence before single target cleanup' : 'Qualify isolated native restore without cleanup',
      status: 'completed', conclusion: cleanup ? 'success' : 'failure', runner_id: 1, steps,
    }] });
    responses.set(`/actions/runs/${id}/approvals`, [{ state: 'approved',
      user: { type: 'User', id: RUN12.humanId, login: human }, environments: [{ name: 'production' }] }]);
    const artifacts = RUN12_ARTIFACTS.filter(pin => pin.runId === id).map(pin => ({ id: pin.id, name: pin.name,
      size_in_bytes: pin.size, digest: pin.digest, expired: false,
      workflow_run: { id: Number(id), repository_id: 1010752912, head_repository_id: 1010752912, head_sha: RUN12.headSha } }));
    responses.set(`/actions/runs/${id}/artifacts?per_page=100`, { total_count: artifacts.length, artifacts });
  }
  responses.set(`/pulls/${RUN12.evidencePr}`, { number: RUN12.evidencePr, changed_files: 2,
    head: { sha: RUN12.evidenceHead, repo: { id: 1010752912, full_name: repository } },
    base: { ref: 'main', repo: { id: 1010752912, full_name: repository } } });
  responses.set(`/issues/comments/${RUN12.commentId}`, { id: RUN12.commentId,
    user: { type: 'User', id: RUN12.humanId, login: human }, created_at: RUN12.reviewedAt, updated_at: RUN12.reviewedAt,
    issue_url: `https://api.github.com/repos/${repository}/issues/${RUN12.evidencePr}`,
    body: `I reviewed unmerged native restore evidence ${RUN12.recordSha256} at PR head ${RUN12.evidenceHead}, `
      + `qualification bytes ${RUN12.qualificationSha256}, for target ${RUN12.targetId}. `
      + `I approve one cleanup attempt ${RUN12.cleanupWorkflowId}/2. Qualification outcome: FAILED. This does not certify recovery.` });
  const calls = [];
  const read = async suffix => {
    calls.push(suffix);
    if (!responses.has(suffix)) throw new Error('unexpected_synthetic_read');
    return structuredClone(responses.get(suffix));
  };
  return { responses, calls, read, run: run(false), repository, synthetic: true };
}
