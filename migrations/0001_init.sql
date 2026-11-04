-- The whole shop as one JSON document. A small shop's data stays far under
-- D1's row limit for years; `version` lets two saves at once both land safely.
CREATE TABLE shop (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recent requests per visitor address, for the booking and sign-in limits.
CREATE TABLE hits (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX hits_key_at ON hits (key, at);
