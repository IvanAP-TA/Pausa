-- 0003: stable genres and the people behind a title (director / creator / original author).
CREATE TABLE media_genre (
  media_id TEXT NOT NULL REFERENCES media_entity(id) ON DELETE CASCADE,
  genre TEXT NOT NULL,
  PRIMARY KEY (media_id, genre)
) WITHOUT ROWID;
CREATE INDEX media_genre_by_genre ON media_genre(genre, media_id);

CREATE TABLE person (
  id TEXT PRIMARY KEY,
  tmdb_id INTEGER,
  anilist_id INTEGER,
  name TEXT NOT NULL,
  profile_path TEXT,                  -- TMDB path or AniList https URL
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX person_tmdb_uq ON person(tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE UNIQUE INDEX person_anilist_uq ON person(anilist_id) WHERE anilist_id IS NOT NULL;

CREATE TABLE media_person (
  media_id TEXT NOT NULL REFERENCES media_entity(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('director', 'creator', 'author')),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (media_id, person_id, role)
) WITHOUT ROWID;
CREATE INDEX media_person_by_person ON media_person(person_id);

-- NULL = genres/people never fetched for this title (titles stored before 0003): filled lazily and by the admin backfill.
ALTER TABLE media_entity ADD COLUMN catalog_v2_at INTEGER;
-- The backfill walks the titles still to fill, oldest first (`WHERE catalog_v2_at IS NULL ORDER BY created_at`), and counts them:
-- a partial index keeps both off a full scan, and shrinks to nothing once the backfill is done.
CREATE INDEX media_entity_v2_todo ON media_entity(created_at) WHERE catalog_v2_at IS NULL;
