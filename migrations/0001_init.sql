-- Rekod Boss — skema awal (Cloudflare D1 / SQLite)
-- Semua nombor akaun / rujukan disimpan sebagai TEXT (kekal sifar di hadapan).

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  last_login  TEXT
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL CHECK (role IN ('owner','partner','viewer')),
  spaces   TEXT NOT NULL,           -- JSON array ruang dibenarkan
  status   TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  attempts   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ua         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS pay_sources (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  short    TEXT NOT NULL,
  kind     TEXT NOT NULL,
  currency TEXT,
  color    TEXT NOT NULL,
  ink      TEXT NOT NULL,
  custom   INTEGER NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  entity      TEXT NOT NULL,
  scope       TEXT NOT NULL,
  currency    TEXT NOT NULL CHECK (currency IN ('MYR','IDR')),
  amount      REAL,
  day         INTEGER,
  start       TEXT,
  end_month   TEXT,
  frequency   TEXT NOT NULL CHECK (frequency IN ('monthly','quarterly','yearly','once')),
  category    TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('expense','income')),
  note        TEXT NOT NULL DEFAULT '',
  pay_source  TEXT,
  pay_method  TEXT,
  vehicle_id  TEXT,
  source      TEXT NOT NULL,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  created_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_entity ON items(entity);
CREATE INDEX IF NOT EXISTS idx_items_source ON items(source);

CREATE TABLE IF NOT EXISTS payments (
  key           TEXT PRIMARY KEY,          -- '<itemId>:<YYYY-MM>' UNIQUE → tiada pendua
  item_id       TEXT NOT NULL,
  month         TEXT NOT NULL,
  date          TEXT NOT NULL,
  amount        REAL NOT NULL,
  currency      TEXT NOT NULL,
  reference     TEXT NOT NULL DEFAULT '',
  name_snapshot TEXT NOT NULL,
  pay_source    TEXT,
  pay_method    TEXT,
  payroll       TEXT,
  source        TEXT NOT NULL,
  created_by    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_month ON payments(month);

CREATE TABLE IF NOT EXISTS payment_splits (
  payment_key       TEXT NOT NULL,
  n                 INTEGER NOT NULL,
  recipient         TEXT NOT NULL,
  channel           TEXT NOT NULL,
  account           TEXT,
  amount            REAL NOT NULL,
  received_currency TEXT NOT NULL,
  received_amount   REAL,
  date              TEXT NOT NULL,
  reference         TEXT,
  PRIMARY KEY (payment_key, n)
);

CREATE TABLE IF NOT EXISTS documents (
  id                 TEXT PRIMARY KEY,
  item_id            TEXT NOT NULL,
  month              TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('invoice','receipt')),
  recipient          TEXT NOT NULL DEFAULT '',
  name               TEXT NOT NULL,
  mime               TEXT NOT NULL,
  size               INTEGER NOT NULL,
  sha256             TEXT NOT NULL,
  storage_key        TEXT NOT NULL,
  original_object_id TEXT UNIQUE,
  uploaded_at        TEXT NOT NULL,
  uploaded_by        TEXT
);
CREATE INDEX IF NOT EXISTS idx_docs_item ON documents(item_id, month);

-- Sandaran storan fail jika binding R2 tidak tersedia (kekal persendirian; hanya melalui API bersesi)
CREATE TABLE IF NOT EXISTS document_blobs (
  id    TEXT PRIMARY KEY,
  bytes BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  plate                 TEXT NOT NULL,
  entity                TEXT NOT NULL,
  currency              TEXT NOT NULL,
  linked_item_id        TEXT,
  roadtax_expiry        TEXT,
  roadtax_amount        REAL,
  insurance_expiry      TEXT,
  insurance_amount      REAL,
  insurer               TEXT NOT NULL DEFAULT '',
  ready_days            INTEGER NOT NULL DEFAULT 30,
  service_interval_months INTEGER NOT NULL DEFAULT 3,
  last_service_date     TEXT,
  last_service_km       REAL,
  service_estimate      REAL,
  note                  TEXT NOT NULL DEFAULT '',
  source                TEXT NOT NULL DEFAULT 'app',
  deleted_at            TEXT,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_history (
  id         TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('roadtax','insurance','service')),
  date       TEXT NOT NULL,
  amount     REAL NOT NULL,
  expiry     TEXT,
  km         REAL,
  workshop   TEXT,
  provider   TEXT,
  note       TEXT,
  item_id    TEXT,
  month      TEXT
);
CREATE INDEX IF NOT EXISTS idx_vh_vehicle ON vehicle_history(vehicle_id);

CREATE TABLE IF NOT EXISTS fx_rate (
  user_scope  TEXT PRIMARY KEY,
  idr_per_myr REAL NOT NULL,
  set_on      TEXT NOT NULL,
  set_by      TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY,
  user_id   TEXT,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT,
  before    TEXT,
  after     TEXT,
  at        TEXT NOT NULL,
  ip        TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

