export const incidentAggregateColumns = [
  { schema: 'identity', table: 'users', columns: ['status'] },
  { schema: 'identity', table: 'email_credentials', columns: ['verified_at'] },
  { schema: 'identity', table: 'email_verification_tokens', columns: ['created_at', 'consumed_at', 'expires_at'] },
  { schema: 'identity', table: 'account_events', columns: ['event_type', 'created_at'] },
  { schema: 'system', table: 'transactional_email_outbox', columns: ['purpose', 'created_at', 'state', 'provider_error_category', 'updated_at'] },
  { schema: 'system', table: 'audit_events', columns: ['action', 'created_at', 'reason_code'] },
  { schema: 'system', table: 'production_auth_acceptance_runs', columns: ['created_at', 'expires_at', 'status'] },
];

export async function verifyIncidentAggregatePrivileges(client) {
  for (const aggregate of incidentAggregateColumns) {
    const relation = `${aggregate.schema}.${aggregate.table}`;
    const privileges = await client.query(`SELECT
      bool_and(has_column_privilege(current_user, $1, column_name, 'SELECT')) AS allowed,
      has_table_privilege(current_user, $1, 'SELECT') AS table_wide
      FROM unnest($2::text[]) AS column_name`, [relation, aggregate.columns]);
    if (privileges.rows[0]?.allowed !== true || privileges.rows[0]?.table_wide !== false) {
      throw new Error(`dedicated schema verifier requires column-only incident grants: ${relation}`);
    }
  }
}

export async function captureIncidentDatabaseEvidence(client) {
  const readOnly = await client.query('SHOW transaction_read_only');
  if (readOnly.rows[0]?.transaction_read_only !== 'on') {
    throw new Error('PlanetScale incident audit did not enter a read-only transaction');
  }
  const users = await client.query(`
    SELECT status, COUNT(status)::int AS count
    FROM identity.users GROUP BY status ORDER BY status`);
  const credentials = await client.query(`
    SELECT verification_state, COUNT(verification_state)::int AS count
    FROM (
      SELECT CASE WHEN verified_at IS NULL THEN 'unverified' ELSE 'verified' END AS verification_state
      FROM identity.email_credentials
    ) categorized GROUP BY verification_state ORDER BY verification_state`);
  const verificationTokens = await client.query(`
    SELECT
      COUNT(created_at) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS created_24h,
      COUNT(created_at) FILTER (WHERE created_at >= now() - interval '24 hours' AND consumed_at IS NULL AND expires_at > now())::int AS active_unconsumed_24h,
      COUNT(created_at) FILTER (WHERE created_at >= now() - interval '24 hours' AND consumed_at IS NULL AND expires_at <= now())::int AS expired_unconsumed_24h,
      COUNT(created_at) FILTER (WHERE created_at >= now() - interval '24 hours' AND consumed_at IS NOT NULL)::int AS consumed_24h
    FROM identity.email_verification_tokens`);
  const recentEvents = await client.query(`
    SELECT event_type, COUNT(event_type)::int AS count FROM identity.account_events
    WHERE created_at >= now() - interval '24 hours'
      AND event_type IN ('email_registration_started', 'email_relink_started', 'email_verified', 'email_login', 'password_reset_completed')
    GROUP BY event_type ORDER BY event_type`);
  const emailOperations = await client.query(`
    SELECT purpose,state,provider_error_category,COUNT(purpose)::int AS count,
      max(EXTRACT(EPOCH FROM now()-created_at)) FILTER (WHERE state IN ('queued','processing'))::int AS oldest_pending_seconds,
      COUNT(purpose) FILTER (WHERE state IN ('queued','processing') AND created_at<now()-interval '2 minutes')::int AS pending_overdue,
      COUNT(purpose) FILTER (WHERE state='processing' AND updated_at<now()-interval '5 minutes')::int AS abandoned_leases,
      COUNT(purpose) FILTER (WHERE provider_error_category='configuration')::int AS configuration_failures
    FROM system.transactional_email_outbox WHERE created_at>=now()-interval '24 hours'
    GROUP BY purpose,state,provider_error_category`);
  const recoveryIntake = await client.query(`SELECT reason_code,COUNT(action)::int AS count
    FROM system.audit_events WHERE action='auth.recovery.intake' AND created_at>=now()-interval '24 hours'
    GROUP BY reason_code`);
  const acceptance = await client.query(`SELECT COUNT(created_at)::int AS expired_incomplete
    FROM system.production_auth_acceptance_runs WHERE expires_at<now() AND status IN ('pending','in_progress','expired','blocked')`);
  return {
    status: 'VERIFIED_READ_ONLY',
    transactionReadOnly: true,
    userStatusCounts: users.rows,
    emailCredentialCounts: credentials.rows,
    verificationTokenCounts24h: verificationTokens.rows[0] ?? {},
    authEventCounts24h: recentEvents.rows,
    emailOperations24h: emailOperations.rows,
    recoveryIntake24h: recoveryIntake.rows,
    acceptance: acceptance.rows[0],
    piiIncluded: false,
  };
}
