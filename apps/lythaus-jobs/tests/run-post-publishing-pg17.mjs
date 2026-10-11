import { runPublicationSuites } from '../../../scripts/ci/run-publication-pg17.mjs';

const paths = process.argv.slice(2);
await runPublicationSuites(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '', {
  postReview: true,
  proposed: process.env.LYTHAUS_TEST_POST_REVIEW_CAPABILITY === 'proposed',
  suitePaths: paths.length ? paths : undefined,
}).catch(error => {
  console.error(`Post review PG17 suites failed (${error instanceof Error ? error.name : 'Error'}); inspect the preceding output.`);
  process.exitCode ||= 1;
});
