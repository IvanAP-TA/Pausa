-- 0004: the opt-in global leaderboard and the public profile page (crates/core/src/achievements.rs has the rules).
-- Nobody is on it until they join with a public name chosen for it; leaving deletes their member row and their scores.
CREATE TABLE leaderboard_member (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  public_name TEXT NOT NULL,
  public_profile INTEGER NOT NULL DEFAULT 0,      -- 1 = /u/:handle shows the name, milestones and score
  handle TEXT NOT NULL UNIQUE,                    -- random, not derived from the name or the account
  joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) WITHOUT ROWID;

-- Written only by the hourly cron. period = 'all' or 'YYYY-MM'.
CREATE TABLE leaderboard_score (
  period TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (period, user_id)
) WITHOUT ROWID;
CREATE INDEX leaderboard_score_rank ON leaderboard_score(period, score DESC);
