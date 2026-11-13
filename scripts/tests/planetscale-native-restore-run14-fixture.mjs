import { RUN14 } from '../ci/planetscale-native-restore-run14-reconciliation.mjs';

export function syntheticRun14Metadata(repository = 'AsoraKK/Lythaus') {
  const run = cleanup => {
    const id = cleanup ? RUN14.cleanupRunId : RUN14.runId;
    const runNumber = cleanup ? RUN14.cleanupRunNumber : RUN14.runNumber;
    const workflowId = cleanup ? RUN14.cleanupWorkflowId : RUN14.workflowId;
    const path = cleanup ? RUN14.cleanupWorkflowPath : RUN14.workflowPath;
    const headSha = cleanup ? RUN14.cleanupHeadSha : RUN14.headSha;
    const title = cleanup ? 'Native restore cleanup ' + RUN14.runId : 'Native restore execute ' + RUN14.headSha;
    return { id: Number(id), run_number: runNumber, run_attempt: 1, workflow_id: workflowId, path,
      event: 'workflow_dispatch', head_sha: headSha, head_branch: 'main', status: 'completed', conclusion: 'success',
      display_title: title, name: title,
      repository: { id: 1010752912, full_name: repository },
      head_repository: { id: 1010752912, full_name: repository }, pull_requests: [] };
  };
  const responses = new Map();
  for (const cleanup of [false, true]) {
    const runId = cleanup ? RUN14.cleanupRunId : RUN14.runId;
    const requiredSteps = cleanup ? [
      ['Prove exact reviewed evidence and immutable qualification upload', 'success'],
      ['Download immutable qualification artifact', 'success'],
      ['Verify unchanged qualification bytes and stage one-use pending intent', 'success'],
      ['Persist pending deletion before any DELETE', 'success'],
      ['Download and verify durable pending attempt', 'success'],
      ['Delete original acknowledged target once after reviewed durable evidence', 'success'],
      ['Reconcile read-only without retrying deletion or qualification', 'skipped'],
      ['Retain separate sanitized cleanup receipt', 'success'],
    ] : [
      ['Run fixed-target runner using only existing protected access', 'success'],
      ['Finalize immutable qualification evidence without provider access', 'success'],
      ['Upload immutable qualification evidence', 'success'],
    ];
    const steps = requiredSteps.map(([name, conclusion], index) => ({ name, number: index + 1,
      status: 'completed', conclusion }));
    while (steps.length < (cleanup ? 18 : 13)) steps.push({ name: 'synthetic-run14-step-' + steps.length,
      number: steps.length + 1, status: 'completed', conclusion: 'success' });
    responses.set('/actions/runs/' + runId, run(cleanup));
    responses.set('/actions/runs/' + runId + '/jobs?per_page=100', { total_count: 1, jobs: [{
      id: cleanup ? RUN14.cleanupJobId : RUN14.jobId, run_id: Number(runId), run_attempt: 1,
      head_sha: cleanup ? RUN14.cleanupHeadSha : RUN14.headSha,
      name: cleanup ? 'Review evidence before single target cleanup' : 'Qualify isolated native restore without cleanup',
      status: 'completed', conclusion: 'success', runner_id: 1, steps,
    }] });
    responses.set('/actions/runs/' + runId + '/approvals', [{ state: 'approved',
      user: { type: 'User', id: RUN14.operatorId, login: RUN14.operator }, environments: [{ name: 'production' }] }]);
    responses.set('/actions/runs/' + runId + '/artifacts?per_page=100', { total_count: 0, artifacts: [] });
  }
  const calls = [];
  const read = async suffix => {
    calls.push(suffix);
    if (!responses.has(suffix)) throw new Error('unexpected_synthetic_read');
    return structuredClone(responses.get(suffix));
  };
  return { responses, calls, read, run: run(false), cleanupRun: run(true), repository, synthetic: true };
}
