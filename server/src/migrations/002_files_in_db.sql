-- Presentation HTML is stored in PostgreSQL instead of on disk, so the platform works on hosts
-- with a temporary filesystem (e.g. Render free tier) and one database backup covers everything.
-- presentations.file_name points at presentation_files.name.
CREATE TABLE presentation_files (
  name       TEXT PRIMARY KEY,
  html       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
