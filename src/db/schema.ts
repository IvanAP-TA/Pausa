import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now);
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());

/* ───────────── Auth (Better Auth: core + anonymous + magic link) ───────────── */

export const user = sqliteTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  isAnonymous: integer("is_anonymous", { mode: "boolean" }).default(false),
  locale: text("locale"), // "it" | "en" | "es", null = follow browser
  country: text("country"), // ISO 3166-1 alpha-2, for streaming availability (TMDB watch region)
  /** Opt-in daily email with what happened while you were away, for people who have no push on any device. */
  emailDigest: integer("email_digest", { mode: "boolean" }).notNull().default(false),
  digestSentAt: integer("digest_sent_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable("session", {
  id: id(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("session_user_idx").on(t.userId)]);

export const account = sqliteTable("account", {
  id: id(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("account_user_idx").on(t.userId)]);

export const verification = sqliteTable("verification", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Better Auth's rate limiter, kept in D1 so every Worker instance shares the same counters. */
export const rateLimit = sqliteTable("rate_limit", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(), // ms since epoch
});

/* ───────────── Cerchie ───────────── */

export const circle = sqliteTable("circle", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  /** One of the preset covers in lib/core/settings.ts (no uploads: nothing to host, nothing to moderate). */
  cover: text("cover"),
  /** Admin switch: when off, nobody in the Cerchia sees or is told "X is watching episode N". */
  liveWatching: integer("live_watching", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: createdAt(),
});

/** Invite links: many per Cerchia, each with an optional expiry and use limit, and revocable by an admin. */
export const invite = sqliteTable("invite", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circle.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => user.id),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  maxUses: integer("max_uses"),
  uses: integer("uses").notNull().default(0),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
}, (t) => [index("invite_circle_idx").on(t.circleId)]);

/** Who joined through whose invite: the basis for "people you brought to Pausa". One row per person per invite. */
export const inviteUse = sqliteTable("invite_use", {
  inviteId: text("invite_id").notNull().references(() => invite.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  usedAt: integer("used_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [primaryKey({ columns: [t.inviteId, t.userId] })]);

export const circleMember = sqliteTable("circle_member", {
  circleId: text("circle_id").notNull().references(() => circle.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  /** Personal: no notifications or push from this Cerchia. */
  muted: integer("muted", { mode: "boolean" }).notNull().default(false),
  /** Personal: do not show or notify me about what others are watching live in this Cerchia. */
  hideWatching: integer("hide_watching", { mode: "boolean" }).notNull().default(false),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [primaryKey({ columns: [t.circleId, t.userId] }), index("member_user_idx").on(t.userId)]);

/* ───────────── Media (canonical: TMDB + AniList + IMDb → internal UUID) ───────────── */

export const mediaEntity = sqliteTable("media_entity", {
  id: id(),
  kind: text("kind", { enum: ["movie", "tv", "anime"] }).notNull(),
  tmdbId: integer("tmdb_id"),
  anilistId: integer("anilist_id"),
  malId: integer("mal_id"), // MyAnimeList id, from MAL exports
  letterboxdUri: text("letterboxd_uri"), // https://boxd.it/..., from Letterboxd exports
  imdbId: text("imdb_id"),
  originalTitle: text("original_title").notNull(),
  year: integer("year"),
  runtimeMin: integer("runtime_min"),
  /** Episodes in total for series without seasons (AniList anime); seasons have their own rows in media_season. */
  episodesTotal: integer("episodes_total"),
  /** When episode counts were last looked up (TMDB / AniList), so a title is not asked again for a month. */
  detailsCheckedAt: integer("details_checked_at", { mode: "timestamp_ms" }),
  posterPath: text("poster_path"), // TMDB path ("/abc.jpg") or a full https URL (AniList covers)
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("media_tmdb_uq").on(t.kind, t.tmdbId),
  uniqueIndex("media_anilist_uq").on(t.anilistId),
  uniqueIndex("media_mal_uq").on(t.malId),
  uniqueIndex("media_letterboxd_uq").on(t.letterboxdUri),
]);

/** How many episodes each season has (TMDB). Season 0 (specials) is never stored. */
export const mediaSeason = sqliteTable("media_season", {
  mediaId: text("media_id").notNull().references(() => mediaEntity.id, { onDelete: "cascade" }),
  season: integer("season").notNull(),
  episodes: integer("episodes").notNull(),
}, (t) => [primaryKey({ columns: [t.mediaId, t.season] })]);

/** Localized titles as TMDB returns them per language. Fallback: original_title. */
export const mediaTitle = sqliteTable("media_title", {
  mediaId: text("media_id").notNull().references(() => mediaEntity.id, { onDelete: "cascade" }),
  locale: text("locale").notNull(),
  title: text("title").notNull(),
}, (t) => [primaryKey({ columns: [t.mediaId, t.locale] })]);

/* ───────────── Streaming availability (TMDB watch providers, via JustWatch) ───────────── */

/** The services a person subscribes to. */
export const userProvider = sqliteTable("user_provider", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  providerId: integer("provider_id").notNull(),
  name: text("name").notNull(),
  logoPath: text("logo_path"),
}, (t) => [primaryKey({ columns: [t.userId, t.providerId] })]);

/** Where a title streams (flat-rate) in a country; cached, refreshed when older than a week. */
export const mediaProvider = sqliteTable("media_provider", {
  mediaId: text("media_id").notNull().references(() => mediaEntity.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
  providerId: integer("provider_id").notNull(),
  name: text("name").notNull(),
  logoPath: text("logo_path"),
}, (t) => [primaryKey({ columns: [t.mediaId, t.country, t.providerId] })]);

/** Records that availability was looked up, so a title on no service is not asked again for a week. */
export const mediaAvailabilityCheck = sqliteTable("media_availability_check", {
  mediaId: text("media_id").notNull().references(() => mediaEntity.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [primaryKey({ columns: [t.mediaId, t.country] })]);

/* ───────────── Diario ───────────── */

/** A log is visible to every Cerchia its author belongs to. */
export const log = sqliteTable("log", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  mediaId: text("media_id").notNull().references(() => mediaEntity.id),
  watchedOn: text("watched_on").notNull(), // ISO date, YYYY-MM-DD
  rating: integer("rating"), // half stars: 1..10 (= 0.5..5), null = not rated
  review: text("review"),
  containsSpoilers: integer("contains_spoilers", { mode: "boolean" }).notNull().default(false),
  platform: text("platform"),
  season: integer("season"), // which season of a series/anime this log is about; null = the whole thing or a film
  episode: integer("episode"), // a single episode (with `season`): the episode-level diary; null = not an episode log
  isRewatch: integer("is_rewatch", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("log_user_idx").on(t.userId, t.createdAt), index("log_media_idx").on(t.mediaId)]);

export const logWatchedWith = sqliteTable("log_watched_with", {
  logId: text("log_id").notNull().references(() => log.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.logId, t.userId] })]);

export const reaction = sqliteTable("reaction", {
  logId: text("log_id").notNull().references(() => log.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.logId, t.userId, t.emoji] })]);

export const comment = sqliteTable("comment", {
  id: id(),
  logId: text("log_id").notNull().references(() => log.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  isSpoiler: integer("is_spoiler", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("comment_log_idx").on(t.logId, t.createdAt)]);

/** "Sto guardando…": one row per user. */
export const nowWatching = sqliteTable("now_watching", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  mediaId: text("media_id").notNull().references(() => mediaEntity.id),
  progress: text("progress"), // legacy free label, e.g. "S3·E4"; superseded by season/episode
  season: integer("season"),
  episode: integer("episode"),
  updatedAt: updatedAt(),
});

/* ───────────── Liste ───────────── */

/** Personal list: circle_id null. Group list: circle_id set. */
export const list = sqliteTable("list", {
  id: id(),
  circleId: text("circle_id").references(() => circle.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["watchlist", "list", "ranking"] }).notNull().default("list"),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: createdAt(),
}, (t) => [index("list_circle_idx").on(t.circleId), index("list_owner_idx").on(t.ownerId)]);

export const listItem = sqliteTable("list_item", {
  listId: text("list_id").notNull().references(() => list.id, { onDelete: "cascade" }),
  mediaId: text("media_id").notNull().references(() => mediaEntity.id),
  position: integer("position").notNull().default(0),
  addedBy: text("added_by").notNull().references(() => user.id),
  note: text("note"),
  addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [primaryKey({ columns: [t.listId, t.mediaId] })]);

/* ───────────── Serata (decision engine) ───────────── */

/** One decision session. `state` is the engine's JSON (see lib/serata/engine.ts); `version` bumps on every change. */
export const serata = sqliteTable("serata", {
  id: id(),
  code: text("code").notNull().unique(),
  circleId: text("circle_id").references(() => circle.id, { onDelete: "set null" }),
  hostId: text("host_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  mode: text("mode", { enum: ["bracket", "table"] }).notNull(),
  status: text("status", { enum: ["lobby", "voting", "done"] }).notNull().default("lobby"),
  state: text("state", { mode: "json" }),
  winnerMediaId: text("winner_media_id").references(() => mediaEntity.id),
  version: integer("version").notNull().default(0),
  createdAt: createdAt(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
}, (t) => [index("serata_circle_idx").on(t.circleId, t.createdAt)]);

export const serataCandidate = sqliteTable("serata_candidate", {
  serataId: text("serata_id").notNull().references(() => serata.id, { onDelete: "cascade" }),
  mediaId: text("media_id").notNull().references(() => mediaEntity.id),
  seed: integer("seed").notNull(),
}, (t) => [primaryKey({ columns: [t.serataId, t.mediaId] })]);

export const serataParticipant = sqliteTable("serata_participant", {
  serataId: text("serata_id").notNull().references(() => serata.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isGuest: integer("is_guest", { mode: "boolean" }).notNull().default(false),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [primaryKey({ columns: [t.serataId, t.userId] })]);

/** Bracket: one `pick` per user per match. Tavolo: `dot` rows (weight = dots) + at most one `veto`. */
export const serataVote = sqliteTable("serata_vote", {
  serataId: text("serata_id").notNull().references(() => serata.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  round: integer("round").notNull().default(0),
  match: integer("match").notNull().default(0),
  kind: text("kind", { enum: ["pick", "dot", "veto"] }).notNull(),
  mediaId: text("media_id").notNull().references(() => mediaEntity.id),
  weight: integer("weight").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.serataId, t.userId, t.round, t.match, t.kind, t.mediaId] })]);

/* ───────────── Notifiche ───────────── */

export const notification = sqliteTable("notification", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["log", "comment", "reaction", "now_watching", "serata_invite", "circle_join"] }).notNull(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "cascade" }),
  circleId: text("circle_id").references(() => circle.id, { onDelete: "cascade" }),
  logId: text("log_id").references(() => log.id, { onDelete: "cascade" }),
  /** The title a notice is about when there is no log (e.g. "now watching"). */
  mediaId: text("media_id").references(() => mediaEntity.id),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
}, (t) => [index("notification_user_idx").on(t.userId, t.createdAt)]);

/* ───────────── Web Push ───────────── */

/** One browser/device that agreed to push notifications. Dead endpoints (404/410) are deleted when a send fails. */
export const pushSubscription = sqliteTable("push_subscription", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  locale: text("locale").notNull().default("it"),
  createdAt: createdAt(),
}, (t) => [index("push_user_idx").on(t.userId)]);

/* ───────────── Metrics events (only what the database cannot already tell us) ───────────── */

export const event = sqliteTable("event", {
  id: id(),
  name: text("name", { enum: ["card_shared", "invite_shared"] }).notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  serataId: text("serata_id").references(() => serata.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [index("event_name_idx").on(t.name, t.createdAt)]);

/* ───────────── Moderation ───────────── */

/** A member flags a comment or a log for the operators. Open until an operator dismisses it or removes the content. */
export const report = sqliteTable("report", {
  id: id(),
  reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["comment", "log"] }).notNull(),
  targetId: text("target_id").notNull(),
  circleId: text("circle_id").references(() => circle.id, { onDelete: "cascade" }),
  reason: text("reason", { enum: ["spam", "abuse", "privacy", "other"] }).notNull().default("other"),
  note: text("note"),
  /** Snapshot of the reported text, so a report still makes sense after the author edits or deletes it. */
  excerpt: text("excerpt"),
  createdAt: createdAt(),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  resolution: text("resolution", { enum: ["dismissed", "removed"] }),
}, (t) => [index("report_open_idx").on(t.resolvedAt, t.createdAt), uniqueIndex("report_once_uq").on(t.reporterId, t.kind, t.targetId)]);

/** Notification types a person switched off (default is on, so no row = on). Applies to the inbox and to push. */
export const notificationOff = sqliteTable("notification_off", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.type] })]);
