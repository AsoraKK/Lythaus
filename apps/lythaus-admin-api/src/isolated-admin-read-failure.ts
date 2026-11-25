import { classifyDatabaseIdentityError, DatabaseBindingError, type DatabaseQueryStage } from '@lythaus/db';

const stages = {
  subject_hmac: 'subject_hmac',
  binding_access: 'db_binding',
  binding: 'db_binding',
  client: 'db_binding',
  connect: 'db_connect',
  query: 'membership_query',
  close: 'db_close',
} as const;

const sqlCategories = {
  connection_failure: 'connection_failure',
  database_identity_query_failed: 'unclassified',
  insufficient_privilege: 'permission_denied',
  invalid_catalog: 'invalid_catalog',
  invalid_password: 'authentication_failed',
  query_canceled: 'query_canceled',
  undefined_column: 'missing_column',
  undefined_table: 'missing_relation',
} as const;

type Stage = DatabaseQueryStage | 'subject_hmac' | 'binding_access';

function category(stage: Stage, error: unknown) {
  if (stage === 'subject_hmac') return 'unclassified';
  if (stage === 'binding_access') return 'binding_unavailable';
  if (stage === 'binding') {
    if (error instanceof DatabaseBindingError) {
      if (error.category === 'binding_missing') return 'binding_missing';
      if (error.category === 'binding_unavailable') return 'binding_unavailable';
    }
    return 'invalid_binding';
  }
  if (stage === 'client') return 'client_initialization_failed';
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code : '';
  if (/^08[0-9A-Z]{3}$/.test(code)) return 'connection_failure';
  switch (code) {
    case '58000':
      // Hyperdrive also forwards origin SQLSTATEs. Match only documented wire messages.
      switch (error instanceof Error ? error.message : '') {
        case 'Failed to acquire a connection from the pool.': return 'pool_acquire_failed';
        case 'Server connection attempt failed: connection_refused': return 'server_connection_refused';
        case 'Internal error.': return 'upstream_internal_error';
        default: return 'database_system_error';
      }
    case 'ECONNREFUSED': case 'ECONNRESET': case 'ETIMEDOUT': case 'ENOTFOUND':
    case 'EAI_AGAIN': case 'ENETUNREACH': case 'EHOSTUNREACH': case 'EPIPE':
      return 'connection_failure';
    case 'CERT_HAS_EXPIRED': case 'ERR_TLS_CERT_ALTNAME_INVALID': case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY': case 'SELF_SIGNED_CERT_IN_CHAIN': case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      return 'tls_verification_failed';
    case '28000':
      return 'authentication_failed';
    default:
      return sqlCategories[classifyDatabaseIdentityError(error)];
  }
}

export class IsolatedAdminReadFailure extends Error {
  readonly diagnostic;

  constructor(stage: Stage, error: unknown) {
    super('admin_request_failed');
    this.diagnostic = { stage: stages[stage], category: category(stage, error) };
  }
}
