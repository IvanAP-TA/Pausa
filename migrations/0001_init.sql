-- Pausa schema v2.
--
-- Starting point: src/db/schema.ts + drizzle/0000..0014 (v1). What changes, and why (see docs/rebuild/PLAN.md §2):
--   * Better Auth tables are gone: own sessions (hashed token), magic links, linked accounts, native one-time codes.
--   * circle_member.role gains `owner` (v1 had no owner: any admin could remove the creator).
--   * comment/reaction belong to a Cerchia (v1 showed one thread in every Cerchia of the log's author).
--   * Visibility: a log is visible only in the Cerchie it is shared with (log_share). No implicit "all my Cerchie" mode (see `log`).
--   * rating_current: one rating per (Cerchia, person, title), updated on write. Ranking, taste match and recommendations read it, so an
--     episode rating can no longer overwrite the rating of the whole series, a Cerchia only sees ratings it was shown, and reads stay
--     small (D1: 5 M rows read/day).
--   * watch_progress replaces now_watching: several series in progress per person, with history in the diary.
--   * serata: the live room lives in a Durable Object; D1 keeps only the finished result.
--   * notification.circle_id on every type (muting a Cerchia silences reactions too); push_subscription gains `kind`.
--   * moderation: user_block, user.disabled_at; import_batch is resumable (status + cursor).
--
-- Every index costs one extra written row per insert (D1 free: 100 000 written rows/day), so each one below is there for a
-- query that exists. Timestamps are milliseconds since epoch; booleans are 0/1.

PRAGMA foreign_keys = ON;

/* ───────────── Accounts and sessions ───────────── */

CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  locale TEXT CHECK (locale IN ('it', 'en', 'es')),
  country TEXT,                                   -- ISO 3166-1 alpha-2, for streaming availability
  email_digest INTEGER NOT NULL DEFAULT 0,
  digest_sent_at INTEGER,
  bio TEXT,
  favorite_genres TEXT NOT NULL DEFAULT '[]',     -- JSON array of strings
  disabled_at INTEGER,                            -- set by an operator: the account cannot sign in
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Only SHA-256(token) is stored. `last_seen_at` is written at most once a day, not on every request.
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'web' CHECK (kind IN ('web', 'native', 'review')),
  user_agent TEXT,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX session_user_idx ON session(user_id);

-- Sign-in methods linked to a user. No provider tokens are kept: we never call Google on the user's behalf.
CREATE TABLE account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'email')),
  provider_account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE (provider, provider_account_id)
);
CREATE INDEX account_user_idx ON account(user_id);

-- Single-use sign-in links (15 minutes) and one-time codes handed from the system browser to the native app (pausa://auth).
CREATE TABLE login_token (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('magic_link', 'native_code', 'email_change')),
  email TEXT,                                     -- magic_link: the address to sign in; email_change: the NEW address
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE, -- native_code, email_change: who asked
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX login_token_expiry_idx ON login_token(expires_at);

-- Counters for sensitive actions only (sign-in, create, import); see BUDGET.md rule 6.
CREATE TABLE rate_limit (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

/* ───────────── Cerchie ───────────── */

CREATE TABLE circle (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cover TEXT,                                     -- one of the preset covers, no uploads
  live_watching INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL, -- informational: the owner is circle_member.role = 'owner'
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE circle_member (
  circle_id TEXT NOT NULL REFERENCES circle(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  muted INTEGER NOT NULL DEFAULT 0,               -- personal: no notifications or push from this Cerchia
  hide_watching INTEGER NOT NULL DEFAULT 0,       -- personal: do not show or notify "X is watching"
  joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (circle_id, user_id)
) WITHOUT ROWID;
CREATE INDEX member_user_idx ON circle_member(user_id);
-- Exactly one owner per Cerchia, enforced by the database.
CREATE UNIQUE INDEX member_one_owner_idx ON circle_member(circle_id) WHERE role = 'owner';

CREATE TABLE invite (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circle(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  expires_at INTEGER,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX invite_circle_idx ON invite(circle_id);

CREATE TABLE invite_use (
  invite_id TEXT NOT NULL REFERENCES invite(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  used_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (invite_id, user_id)
) WITHOUT ROWID;

/* ───────────── Media (canonical: TMDB + AniList + IMDb → internal id) ───────────── */

CREATE TABLE media_entity (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('movie', 'tv', 'anime')),
  tmdb_id INTEGER,
  anilist_id INTEGER,
  mal_id INTEGER,
  letterboxd_uri TEXT,
  imdb_id TEXT,
  original_title TEXT NOT NULL,
  year INTEGER,
  runtime_min INTEGER,
  episodes_total INTEGER,                         -- series without seasons (AniList anime)
  details_checked_at INTEGER,
  poster_path TEXT,                               -- TMDB path ("/abc.jpg") or a full https URL (AniList covers)
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX media_tmdb_uq ON media_entity(kind, tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE UNIQUE INDEX media_anilist_uq ON media_entity(anilist_id) WHERE anilist_id IS NOT NULL;
CREATE UNIQUE INDEX media_mal_uq ON media_entity(mal_id) WHERE mal_id IS NOT NULL;
CREATE UNIQUE INDEX media_letterboxd_uq ON media_entity(letterboxd_uri) WHERE letterboxd_uri IS NOT NULL;

CREATE TABLE media_season (
  media_id TEXT NOT NULL REFERENCES media_entity(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  episodes INTEGER NOT NULL,
  PRIMARY KEY (media_id, season)
) WITHOUT ROWID;

CREATE TABLE media_title (
  media_id TEXT NOT NULL REFERENCES media_entity(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  PRIMARY KEY (media_id, locale)
) WITHOUT ROWID;

-- Prefix search over titles (range scans, no full-table LIKE): see catalog::prefix_bounds.
CREATE INDEX media_title_search_idx ON media_title(title COLLATE NOCASE);
CREATE INDEX media_original_search_idx ON media_entity(original_title COLLATE NOCASE);

CREATE TABLE media_detail (
  media_id TEXT NOT NULL REFERENCES media_entity(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  overview TEXT,
  genres TEXT NOT NULL DEFAULT '[]',              -- JSON array
  cast TEXT NOT NULL DEFAULT '[]',                -- JSON array of {name, role}
  source TEXT NOT NULL DEFAULT 'none' CHECK (source IN ('tmdb', 'anilist', 'user', 'none')),
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (media_id, locale)
) WITHOUT ROWID;

CREATE TABLE favorite (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_entity(id),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, media_id)
) WITHOUT ROWID;

/* ───────────── Where to watch (TMDB watch providers, data by JustWatch: attribution required) ───────────── */

CREATE TABLE user_provider (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  logo_path TEXT,
  PRIMARY KEY (user_id, provider_id)
) WITHOUT ROWID;

CREATE TABLE media_provider (
  media_id TEXT NOT NULL REFERENCES media_entity(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  provider_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  logo_path TEXT,
  PRIMARY KEY (media_id, country, provider_id)
) WITHOUT ROWID;

CREATE TABLE media_availability_check (
  media_id TEXT NOT NULL REFERENCES media_entity(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (media_id, country)
) WITHOUT ROWID;

/* ───────────── Importazioni ───────────── */

-- One run of the import screen; resumable: `cursor` is the next row to process, `status` says where it stopped.
CREATE TABLE import_batch (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('letterboxd', 'anilist', 'mal', 'imdb', 'trakt', 'cinemaniac')),
  circle_id TEXT REFERENCES circle(id) ON DELETE SET NULL,  -- null = personal space
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed', 'cancelled')),
  cursor INTEGER NOT NULL DEFAULT 0,                 -- rows handled so far: where a resumed import starts again
  total INTEGER,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,               -- viewings added
  skipped INTEGER NOT NULL DEFAULT 0,                -- already there, or undated and left out
  new_titles INTEGER NOT NULL DEFAULT 0,
  lists INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  finished_at INTEGER
);
CREATE INDEX import_batch_user_idx ON import_batch(user_id, created_at);

/* ───────────── Diario ───────────── */

-- A log belongs to its author and is visible ONLY in the Cerchie it was shared with (log_share); with no share it is private.
-- (v1 also had an implicit 'visible in every Cerchia I belong to' mode: reading a feed then meant scanning every log of every member,
-- and a newly joined Cerchia saw years of history unasked. Explicit shares keep feed reads at ~20 rows and keep privacy by default.)
CREATE TABLE log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_entity(id),
  watched_on TEXT NOT NULL,                       -- YYYY-MM-DD
  rating INTEGER CHECK (rating BETWEEN 1 AND 10), -- half stars: 1..10 = 0.5..5, null = not rated
  review TEXT,
  contains_spoilers INTEGER NOT NULL DEFAULT 0,
  platform TEXT,
  season INTEGER,                                 -- null = whole title or a film
  episode INTEGER,                                -- with season: an episode log
  is_rewatch INTEGER NOT NULL DEFAULT 0,
  import_batch_id TEXT REFERENCES import_batch(id) ON DELETE SET NULL,
  idempotency_key TEXT,                           -- client-made, so a retried POST (offline queue, lost answer) creates the log once
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX log_idempotency_uq ON log(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Diary of one person (newest first) and "who saw this title". Batch lookups use the partial index: most logs have no batch.
CREATE INDEX log_user_idx ON log(user_id, watched_on DESC, created_at DESC);
CREATE INDEX log_media_idx ON log(media_id);
CREATE INDEX log_batch_idx ON log(import_batch_id) WHERE import_batch_id IS NOT NULL;

CREATE TABLE log_share (
  log_id TEXT NOT NULL REFERENCES log(id) ON DELETE CASCADE,
  circle_id TEXT NOT NULL REFERENCES circle(id) ON DELETE CASCADE,
  import_batch_id TEXT REFERENCES import_batch(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (log_id, circle_id)
) WITHOUT ROWID;
CREATE INDEX log_share_circle_idx ON log_share(circle_id, created_at DESC);
CREATE INDEX log_share_batch_idx ON log_share(import_batch_id) WHERE import_batch_id IS NOT NULL;

CREATE TABLE log_watched_with (
  log_id TEXT NOT NULL REFERENCES log(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  PRIMARY KEY (log_id, user_id)
) WITHOUT ROWID;

-- The rating that counts for a person and a whole title (not an episode) INSIDE one Cerchia: the latest rated whole-title log of
-- that person that is shared in that Cerchia. Ranking, taste match and recommendations read it, so they only ever see what the
-- Cerchia was shown. Maintained by the API after every log write, share, unshare or delete.
CREATE TABLE rating_current (
  circle_id TEXT NOT NULL REFERENCES circle(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_entity(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  rated_at INTEGER NOT NULL,
  PRIMARY KEY (circle_id, user_id, media_id)
) WITHOUT ROWID;
CREATE INDEX rating_user_idx ON rating_current(user_id, media_id);

-- Comments and reactions live in one Cerchia: the same log can have a different thread in each Cerchia that sees it.
CREATE TABLE comment (
  id TEXT PRIMARY KEY,
  log_id TEXT NOT NULL REFERENCES log(id) ON DELETE CASCADE,
  circle_id TEXT NOT NULL REFERENCES circle(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comment(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_spoiler INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX comment_thread_idx ON comment(log_id, circle_id, created_at);

CREATE TABLE reaction (
  log_id TEXT NOT NULL REFERENCES log(id) ON DELETE CASCADE,
  circle_id TEXT NOT NULL REFERENCES circle(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (log_id, circle_id, user_id, emoji)
) WITHOUT ROWID;

-- What a person is in the middle of: several titles at once, "continue watching", next episode.
CREATE TABLE watch_progress (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_entity(id),
  season INTEGER,
  episode INTEGER,
  status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('watching', 'paused', 'done')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, media_id)
) WITHOUT ROWID;
CREATE INDEX watch_progress_user_idx ON watch_progress(user_id, status, updated_at DESC);

/* ───────────── Liste ───────────── */

-- Personal list: circle_id null. Group list: circle_id set.
CREATE TABLE list (
  id TEXT PRIMARY KEY,
  circle_id TEXT REFERENCES circle(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'list' CHECK (kind IN ('watchlist', 'list', 'ranking')),
  name TEXT NOT NULL,
  description TEXT,
  import_batch_id TEXT REFERENCES import_batch(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX list_circle_idx ON list(circle_id) WHERE circle_id IS NOT NULL;
CREATE INDEX list_owner_idx ON list(owner_id);

CREATE TABLE list_item (
  list_id TEXT NOT NULL REFERENCES list(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_entity(id),
  position INTEGER NOT NULL DEFAULT 0,
  added_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  note TEXT,
  priority INTEGER NOT NULL DEFAULT 0,            -- watchlist priority
  added_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (list_id, media_id)
) WITHOUT ROWID;

/* ───────────── Serata: only the outcome is stored here; the live room is a Durable Object ───────────── */

CREATE TABLE serata (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  circle_id TEXT REFERENCES circle(id) ON DELETE SET NULL,
  host_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('bracket', 'table')),
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'voting', 'done', 'expired')),
  winner_media_id TEXT REFERENCES media_entity(id),
  result TEXT,                                    -- JSON: final tally, written when the room closes
  watched_log_id TEXT REFERENCES log(id) ON DELETE SET NULL, -- "we watched it": link to the diary
  repeated_from TEXT REFERENCES serata(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  finished_at INTEGER
);
CREATE INDEX serata_circle_idx ON serata(circle_id, created_at DESC);

CREATE TABLE serata_candidate (
  serata_id TEXT NOT NULL REFERENCES serata(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_entity(id),
  seed INTEGER NOT NULL,
  PRIMARY KEY (serata_id, media_id)
) WITHOUT ROWID;

CREATE TABLE serata_participant (
  serata_id TEXT NOT NULL REFERENCES serata(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_guest INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (serata_id, user_id)
) WITHOUT ROWID;

/* ───────────── Notifiche e push ───────────── */

CREATE TABLE notification (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('log', 'comment', 'reaction', 'now_watching', 'serata_invite', 'circle_join', 'mention')),
  actor_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  circle_id TEXT REFERENCES circle(id) ON DELETE CASCADE,
  log_id TEXT REFERENCES log(id) ON DELETE CASCADE,
  media_id TEXT REFERENCES media_entity(id),
  serata_code TEXT,                               -- so the in-app notice opens the room, not the Cerchia home
  read_at INTEGER,
  pushed_at INTEGER,                              -- NULL until the push job has handled it (sent, or nobody to send to)
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX notification_user_idx ON notification(user_id, created_at DESC);
CREATE INDEX notification_unpushed_idx ON notification(created_at) WHERE pushed_at IS NULL;

CREATE TABLE notification_off (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  PRIMARY KEY (user_id, type)
) WITHOUT ROWID;

-- One device that agreed to push: a Web Push endpoint (PWA) or an Expo push token (Android app).
CREATE TABLE push_subscription (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('webpush', 'expo')),
  endpoint TEXT NOT NULL UNIQUE,                  -- Web Push URL or ExponentPushToken[...]
  p256dh TEXT,
  auth TEXT,
  locale TEXT NOT NULL DEFAULT 'it',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX push_user_idx ON push_subscription(user_id);

/* ───────────── Metrics and moderation ───────────── */

CREATE TABLE event (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (name IN ('card_shared', 'invite_shared')),
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  serata_id TEXT REFERENCES serata(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX event_name_idx ON event(name, created_at);

CREATE TABLE report (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'log', 'user')),
  target_id TEXT NOT NULL,
  circle_id TEXT REFERENCES circle(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'other' CHECK (reason IN ('spam', 'abuse', 'privacy', 'other')),
  note TEXT,
  excerpt TEXT,                                   -- snapshot of the reported text
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  resolved_at INTEGER,
  resolution TEXT CHECK (resolution IN ('dismissed', 'removed', 'user_disabled'))
);
CREATE INDEX report_open_idx ON report(resolved_at, created_at);
CREATE UNIQUE INDEX report_once_uq ON report(reporter_id, kind, target_id);

CREATE TABLE user_block (
  blocker_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
) WITHOUT ROWID;
