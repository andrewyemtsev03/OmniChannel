-- Users of the platform (admins, MLR reviewers, medical reps)
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'rep' CHECK (role IN ('admin', 'reviewer', 'rep')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Healthcare professionals. proxima_id links the record to Proxima CRM.
CREATE TABLE doctors (
  id          SERIAL PRIMARY KEY,
  proxima_id  TEXT UNIQUE,
  full_name   TEXT NOT NULL,
  specialty   TEXT,
  institution TEXT,
  city        TEXT,
  phone       TEXT,          -- digits only, international format, e.g. 77011234567
  email       TEXT,
  rep_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX doctors_name_idx ON doctors (lower(full_name));
CREATE INDEX doctors_rep_idx ON doctors (rep_id);

-- СОПД: consent to personal data processing, one row per consent given.
-- A consent is active when withdrawn_at IS NULL and (expires_at IS NULL OR expires_at > now()).
CREATE TABLE consents (
  id            SERIAL PRIMARY KEY,
  doctor_id     INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  purpose       TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'any' CHECK (channel IN ('any', 'whatsapp', 'email', 'portal')),
  method        TEXT NOT NULL CHECK (method IN ('written', 'egov', 'digital', 'other')),
  given_at      TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ,
  withdrawn_at  TIMESTAMPTZ,
  evidence_note TEXT,        -- where the signed form / confirmation is stored
  recorded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX consents_doctor_idx ON consents (doctor_id);

-- Uploaded HTML presentations (e.g. made with Claude) and their MLR approval state.
CREATE TABLE presentations (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  product       TEXT,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'archived')),
  version       INTEGER NOT NULL DEFAULT 1,
  file_name     TEXT NOT NULL,     -- stored file on disk (inside UPLOAD_DIR)
  original_name TEXT,
  slide_count   INTEGER,           -- learned from viewer tracking
  approval_code TEXT,              -- MLR approval number printed on materials
  review_comment TEXT,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A personal, tracked link: one presentation for one doctor.
CREATE TABLE links (
  id               SERIAL PRIMARY KEY,
  token            TEXT NOT NULL UNIQUE,
  presentation_id  INTEGER NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  doctor_id        INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  channel          TEXT NOT NULL CHECK (channel IN ('whatsapp', 'link')),
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  first_opened_at  TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX links_presentation_idx ON links (presentation_id);
CREATE INDEX links_doctor_idx ON links (doctor_id);

-- One viewing session of a link (one opening in one browser tab).
CREATE TABLE view_sessions (
  id            SERIAL PRIMARY KEY,
  link_id       INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  session_key   TEXT NOT NULL UNIQUE,
  user_agent    TEXT,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX view_sessions_link_idx ON view_sessions (link_id);

-- Time spent on each slide within a session (slide_index is 0-based).
CREATE TABLE slide_views (
  session_id  INTEGER NOT NULL REFERENCES view_sessions(id) ON DELETE CASCADE,
  slide_index INTEGER NOT NULL,
  seconds     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, slide_index)
);

-- Outbound messages (WhatsApp sends and dry runs).
CREATE TABLE messages (
  id                  SERIAL PRIMARY KEY,
  doctor_id           INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  link_id             INTEGER REFERENCES links(id) ON DELETE SET NULL,
  channel             TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('sent', 'dry_run', 'failed')),
  provider_message_id TEXT,
  error               TEXT,
  sent_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_doctor_idx ON messages (doctor_id);

-- Audit trail for compliance-relevant actions.
CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
