-- DigitalShield initial schema (D1 / SQLite).
-- All timestamps are ISO-8601 UTC strings. All ids are text (UUIDv4 or prefixed).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',           -- 'user' | 'admin'
  email_verified_at TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'locked' | 'deletion_pending'
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE email_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                          -- 'verify_email' | 'password_reset'
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_email_tokens_user ON email_tokens(user_id, kind);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE platform_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                      -- 'facebook' | 'instagram' | ...
  username TEXT,
  display_name TEXT,
  profile_url TEXT,
  account_id TEXT,
  recovery_email TEXT,
  recovery_phone_enc TEXT,                     -- envelope-encrypted at rest
  notes_enc TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_platform_accounts_user ON platform_accounts(user_id, platform);

CREATE TABLE digital_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform_account_id TEXT REFERENCES platform_accounts(id) ON DELETE SET NULL,
  platform TEXT,
  kind TEXT NOT NULL,                          -- photo|video|document|post|screenshot|other
  title TEXT,
  description TEXT,
  source TEXT NOT NULL,                        -- 'upload' | 'import' | 'manual'
  import_id TEXT,
  storage_key TEXT,                            -- R2 key (published prefix); NULL for metadata-only rows
  original_filename TEXT,
  content_hash TEXT,                           -- sha256 hex
  mime TEXT,
  size_bytes INTEGER,
  taken_at TEXT,                               -- when known (from archive metadata)
  is_important INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_assets_user_kind ON digital_assets(user_id, kind);
CREATE INDEX idx_assets_user_important ON digital_assets(user_id, is_important);
CREATE INDEX idx_assets_hash ON digital_assets(user_id, content_hash);

CREATE TABLE asset_tags (
  asset_id TEXT NOT NULL REFERENCES digital_assets(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (asset_id, tag)
);

CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',     -- received|scanning|parsing|completed|completed_with_warnings|failed
  original_filename TEXT,
  format TEXT,                                 -- detected format id, e.g. 'facebook-json-v1'
  files_total INTEGER NOT NULL DEFAULT 0,
  files_parsed INTEGER NOT NULL DEFAULT 0,
  files_skipped INTEGER NOT NULL DEFAULT 0,
  assets_created INTEGER NOT NULL DEFAULT 0,
  duplicates_skipped INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX idx_imports_user ON imports(user_id, started_at);

CREATE TABLE import_files (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,                        -- parsed | skipped | unsupported | error
  reason TEXT
);
CREATE INDEX idx_import_files_import ON import_files(import_id);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,                        -- queued | running | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE recovery_cases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_number TEXT NOT NULL UNIQUE,            -- DS-FB-2026-000184
  platform TEXT NOT NULL,
  problem_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',         -- open|investigating|user_action_required|submitted_to_platform|
                                               -- waiting_for_platform|resolved|closed
  discovered_at TEXT,
  last_known_login_at TEXT,
  changed_summary TEXT,
  context_notes TEXT,
  previous_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_cases_user ON recovery_cases(user_id, created_at);

CREATE TABLE recovery_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,                          -- note|status_change|evidence_added|attempt|platform_contact|resource_used
  actor TEXT NOT NULL DEFAULT 'user',          -- 'user' | 'system'
  title TEXT NOT NULL,
  body TEXT
);
CREATE INDEX idx_recovery_events_case ON recovery_events(case_id, at);

CREATE TABLE evidence_items (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,                        -- 'screenshot'|'email'|'notification'|'platform_message'|'document'|'other'
  category TEXT,
  description TEXT,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX idx_evidence_case ON evidence_items(case_id);

CREATE TABLE recovery_packages (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE platform_resources (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  purpose TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'global',
  status TEXT NOT NULL DEFAULT 'verified',     -- verified|unverified|retired
  last_verified_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_resources_platform ON platform_resources(platform, status);

CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                          -- login_success|login_failed|password_changed|session_revoked|rate_limited|...
  ip_hash TEXT,
  user_agent TEXT,
  details TEXT,                                -- JSON, redacted
  at TEXT NOT NULL
);
CREATE INDEX idx_security_events_user ON security_events(user_id, at);

CREATE TABLE scam_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,                       -- 'email'|'sms'|'dm'|'other'
  message_excerpt TEXT NOT NULL,
  indicators TEXT NOT NULL DEFAULT '[]',       -- JSON array of detected indicator ids
  reporter_notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                          -- backup_reminder|import_done|import_failed|security_alert|case_update|resource_update
  title TEXT NOT NULL,
  body TEXT,                                   -- never contains secrets/credentials
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at);

-- Append-only audit log. No UPDATE/DELETE path exists in application code.
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,                        -- USER_LOGIN, IMPORT_STARTED, ...
  target_type TEXT,
  target_id TEXT,
  ip_hash TEXT,
  details TEXT,                                -- JSON, redacted
  at TEXT NOT NULL
);
CREATE INDEX idx_audit_action ON audit_logs(action, at);
CREATE INDEX idx_audit_actor ON audit_logs(actor_user_id, at);

CREATE TABLE privacy_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                          -- 'export' | 'deletion'
  status TEXT NOT NULL DEFAULT 'requested',    -- requested|processing|completed|cancelled
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
