import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const circles = sqliteTable("circles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const circleMembers = sqliteTable("circle_members", {
  circleId: text("circle_id").notNull().references(() => circles.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.circleId, t.userId] }) }));

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  code: text("code").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  maxUses: integer("max_uses"),
  uses: integer("uses").notNull().default(0),
});

export const mediaEntities = sqliteTable("media_entities", {
  id: text("id").primaryKey(),
  tmdbId: integer("tmdb_id").notNull().unique(),
  imdbId: text("imdb_id"),
  anilistId: integer("anilist_id"),
  type: text("type", { enum: ["movie", "tv", "anime"] }).notNull(),
  title: text("title").notNull(),
  year: integer("year"),
  posterPath: text("poster_path"),
  overview: text("overview"),
  cachedAt: integer("cached_at", { mode: "timestamp" }).notNull(),
});

export const logEntries = sqliteTable("log_entries", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  userId: text("user_id").notNull().references(() => users.id),
  mediaEntityId: text("media_entity_id").notNull().references(() => mediaEntities.id),
  rating: real("rating"),
  watchedOn: integer("watched_on", { mode: "timestamp" }),
  platform: text("platform"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const logWatchedWith = sqliteTable("log_watched_with", {
  logId: text("log_id").notNull().references(() => logEntries.id),
  memberUserId: text("member_user_id").notNull().references(() => users.id),
}, (t) => ({ pk: primaryKey({ columns: [t.logId, t.memberUserId] }) }));

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  logId: text("log_id").notNull().references(() => logEntries.id),
  userId: text("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  isSpoiler: integer("is_spoiler", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const reactions = sqliteTable("reactions", {
  id: text("id").primaryKey(),
  targetType: text("target_type", { enum: ["log", "comment"] }).notNull(),
  targetId: text("target_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  emoji: text("emoji").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const lists = sqliteTable("lists", {
  id: text("id").primaryKey(),
  scope: text("scope", { enum: ["personal", "circle"] }).notNull(),
  ownerUserId: text("owner_user_id").references(() => users.id),
  circleId: text("circle_id").references(() => circles.id),
  name: text("name").notNull(),
  isRanked: integer("is_ranked", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const listItems = sqliteTable("list_items", {
  listId: text("list_id").notNull().references(() => lists.id),
  mediaEntityId: text("media_entity_id").notNull().references(() => mediaEntities.id),
  position: integer("position").notNull().default(0),
  addedBy: text("added_by").notNull().references(() => users.id),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.listId, t.mediaEntityId] }) }));

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull(),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/* --- Fase 2: Serata (motore di decisione) + Now Watching --- */

export const serate = sqliteTable("serate", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").references(() => circles.id),
  mode: text("mode", { enum: ["bracket", "tavolo"] }).notNull(),
  status: text("status", { enum: ["open", "done"] }).notNull().default("open"),
  createdBy: text("created_by").notNull().references(() => users.id),
  winnerMediaId: text("winner_media_id").references(() => mediaEntities.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const serataCandidates = sqliteTable("serata_candidates", {
  serataId: text("serata_id").notNull().references(() => serate.id),
  mediaEntityId: text("media_entity_id").notNull().references(() => mediaEntities.id),
  position: integer("position").notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.serataId, t.mediaEntityId] }) }));

export const serataParticipants = sqliteTable("serata_participants", {
  id: text("id").primaryKey(),
  serataId: text("serata_id").notNull().references(() => serate.id),
  userId: text("user_id").references(() => users.id),
  guestName: text("guest_name").notNull(),
  avatar: text("avatar"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
});

export const serataVotes = sqliteTable("serata_votes", {
  id: text("id").primaryKey(),
  serataId: text("serata_id").notNull().references(() => serate.id),
  participantId: text("participant_id").notNull().references(() => serataParticipants.id),
  mediaEntityId: text("media_entity_id").notNull().references(() => mediaEntities.id),
  kind: text("kind", { enum: ["dot", "veto", "pick"] }).notNull(),
  round: integer("round").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const nowWatching = sqliteTable("now_watching", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  circleId: text("circle_id").notNull().references(() => circles.id),
  mediaEntityId: text("media_entity_id").notNull().references(() => mediaEntities.id),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
});
