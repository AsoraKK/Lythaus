export interface EnvBindings {
  DB_APP_FRESH?: { connectionString: string };
  DB_ADMIN_FRESH?: { connectionString: string };
  DB_JOBS_FRESH?: { connectionString: string };
  DB_PRIVACY_FRESH?: { connectionString: string };
  MEDIA_QUARANTINE?: R2Bucket;
  MEDIA_APPROVED?: R2Bucket;
  PRIVATE_EXPORTS?: R2Bucket;
  AUDIT_ARCHIVE?: R2Bucket;
  MODERATION_QUEUE?: Queue;
  FEED_QUEUE?: Queue;
  PRIVACY_QUEUE?: Queue;
  AUDIT_QUEUE?: Queue;
  NOTIFICATIONS_QUEUE?: Queue;
  MEDIA_QUEUE?: Queue;
  IMAGES?: ImagesBindingLike;
  MODERATION_DLQ?: Queue;
  FEED_DLQ?: Queue;
  NOTIFICATIONS_DLQ?: Queue;
  MEDIA_DLQ?: Queue;
  PRIVACY_DLQ?: Queue;
  AUDIT_DLQ?: Queue;
  LYTHAUS_CONFIG?: KVNamespaceLike;
  HIVE_API_KEY?: string;
  HIVE_API_URL?: string;
  HIVE_MODEL_VERSION?: string;
  PAID_AI_DETECTION_ENABLED?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  MEDIA_QUOTA_BYTES?: string;
  MEDIA_UPLOADS_ENABLED?: string;
  MEDIA_PROCESSING_ENABLED?: string;
  MEDIA_QUARANTINE_BUCKET?: string;
  MEDIA_APPROVED_BUCKET?: string;
  AUTH_PASSWORD_PEPPER_V1?: string;
  PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK?: string;
  JWT_PRIVATE_KEY?: string;
  JWT_KEY_ID?: string;
  JWT_PUBLIC_JWKS?: string;
  PII_ENCRYPTION_KEY_V1?: string;
  PII_HMAC_KEY_V1?: string;
  EMAIL_PROVIDER_URL?: string;
  EMAIL_PROVIDER_TOKEN?: string;
  EMAIL_PROVIDER_MODE?: 'cloudflare' | 'fallback' | 'disabled';
  EMAIL_FROM?: string;
  EMAIL_VERIFICATION_BASE_URL?: string;
  EMAIL_PASSWORD_RESET_BASE_URL?: string;
  EMAIL?: SendEmailLike;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  GOOGLE_JWKS_URL?: string;
  ACCESS_SUBJECT_HMAC_KEY?: string;
  ENVIRONMENT?: string;
  CORS_ALLOWED_ORIGINS?: string;
  EXPECTED_HOSTNAMES?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  ACCESS_JWKS_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_REQUIRED?: string;
  EXTERNAL_BACKUP_HEALTHCHECK_URL?: string;
  EXTERNAL_BACKUP_HEALTHCHECK_TOKEN?: string;
  DATABASE_READINESS_TOKEN?: string;
  EXPECTED_DATABASE_TARGET?: string;
  EXPECTED_DATABASE_SCHEMA_FINGERPRINT?: string;
  EXPECTED_DATABASE_RELATION_COUNT?: string;
  EXPECTED_DATABASE_SCHEMA_VERSION?: string;
  EXPECTED_DATABASE_ROLE_CLASS?: string;
  EXPECTED_DATABASE_BUDGET_LEDGER_APPLIED?: string;
  AUTHENTICATED_ACCEPTANCE_PROVEN?: string;
  COST_BUDGET_ENABLED?: string;
  COST_BUDGET_LIMIT_USD?: string;
  COST_BUDGET_WARNING_USD?: string;
  COST_BUDGET_OPTIONAL_ANALYSIS_USD?: string;
  COST_BUDGET_ESSENTIAL_ONLY_USD?: string;
  COST_BUDGET_DEEP_SCAN_STOP_USD?: string;
  COST_HIVE_TEXT_ESTIMATE_USD?: string;
  COST_HIVE_IMAGE_ESTIMATE_USD?: string;
  AI?: WorkersAiBinding;
  AI_GATEWAY_ID?: string;
}

export interface SendEmailLike {
  send(message: { to: string; from: string; subject: string; html: string }): Promise<void>;
}

export interface R2ObjectLike {
  key: string;
  size: number;
  httpEtag: string;
  checksums?: { sha256?: ArrayBuffer };
}

export interface R2Bucket {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | Uint8Array, options?: Record<string, unknown>): Promise<R2ObjectLike>;
  delete(key: string): Promise<void>;
}

export interface R2ObjectBody extends R2ObjectLike {
  body: ReadableStream;
  httpMetadata?: Record<string, string>;
}

export interface Queue {
  send(body: unknown, options?: { contentType?: string }): Promise<void>;
}

export interface ImagesBindingLike {
  info(stream: ReadableStream<Uint8Array>): Promise<{ format: string; fileSize?: number; width?: number; height?: number }>;
  input(stream: ReadableStream<Uint8Array>): {
    output(options: { format: 'image/webp'; quality?: number }): Promise<{
      contentType(): string;
      image(): ReadableStream<Uint8Array>;
    }>;
  };
}

export interface KVNamespaceLike {
  get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<unknown>;
  put(key: string, value: string, options?: { expiration?: number; expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface WorkersAiBinding {
  run(model: string, input: unknown, options?: {
    gateway?: { id: string; skipCache?: boolean; cacheTtl?: number };
    collectLog?: boolean;
    metadata?: Record<string, string>;
  }): Promise<unknown>;
}
