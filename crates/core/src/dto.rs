//! API data shapes. Every type here is exported to TypeScript by `cargo test`.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Role {
    Owner,
    Admin,
    Member,
}

impl Role {
    /// The value stored in `circle_member.role`.
    pub fn from_db(s: &str) -> Option<Role> {
        match s {
            "owner" => Some(Role::Owner),
            "admin" => Some(Role::Admin),
            "member" => Some(Role::Member),
            _ => None,
        }
    }

    /// Who may promote and demote admins, transfer the Cerchia and delete it.
    pub fn is_owner(self) -> bool {
        self == Role::Owner
    }
    /// Who may invite, remove members and edit settings.
    pub fn can_manage(self) -> bool {
        matches!(self, Role::Owner | Role::Admin)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Locale {
    It,
    En,
    Es,
}

/// `GET /api/me`: the signed-in person.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Me {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    pub is_anonymous: bool,
    pub locale: Option<Locale>,
    pub circles: Vec<CircleSummary>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CircleSummary {
    pub id: String,
    pub name: String,
    pub cover: Option<String>,
    pub role: Role,
    pub muted: bool,
    pub unread: u32,
}

impl Locale {
    pub fn from_code(s: &str) -> Option<Locale> {
        match s {
            "it" => Some(Locale::It),
            "en" => Some(Locale::En),
            "es" => Some(Locale::Es),
            _ => None,
        }
    }
    /// `Accept-Language` or a bare code: the first supported language, Italian when none.
    pub fn negotiate(header: Option<&str>) -> Locale {
        header
            .into_iter()
            .flat_map(|h| h.split(','))
            .filter_map(|part| {
                Locale::from_code(
                    part.split(';')
                        .next()?
                        .trim()
                        .get(..2)?
                        .to_lowercase()
                        .as_str(),
                )
            })
            .next()
            .unwrap_or(Locale::It)
    }
}

/// `GET /api/circles/:id`. Everyone in the Cerchia sees the same people and the active invites.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CircleDetail {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub cover: Option<String>,
    pub live_watching: bool,
    pub my_role: Role,
    pub members: Vec<MemberDto>,
    pub invites: Vec<InviteDto>,
    /// Viewings shared here this (UTC) year by people still in the Cerchia: "4 membri, 37 visioni quest'anno".
    #[ts(type = "number")]
    pub logs_this_year: i64,
    /// "Sta guardando": each member's latest title in progress, most recent first. Empty when the Cerchia has it
    /// switched off or I hide it for myself; members who hide it are left out.
    pub watching: Vec<WatchingDto>,
}

/// `GET /api/circles/:id/extras`: what brings a Cerchia back, under the diary head (v1 retention.ts).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CircleExtras {
    /// "Per cominciare": I logged something, someone else is in the Cerchia, a Serata here ended with a winner.
    pub has_log: bool,
    pub has_company: bool,
    pub has_serata: bool,
    /// "Un anno fa… e oltre": up to three viewings shared here on this calendar day (±3) of earlier years.
    pub memories: Vec<MemoryDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MemoryDto {
    pub log_id: String,
    pub media: MediaDto,
    pub author: PersonDto,
    /// YYYY-MM-DD
    pub watched_on: String,
    #[ts(type = "number")]
    pub years_ago: i64,
    #[ts(type = "number | null")]
    pub rating: Option<i64>,
    /// Null when the review warns of spoilers: a memory is read in passing.
    pub review: Option<String>,
}

/// One entry of the "sta guardando" strip on a Cerchia's diary.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WatchingDto {
    pub user: PersonDto,
    pub media: MediaDto,
    #[ts(type = "number | null")]
    pub season: Option<i64>,
    #[ts(type = "number | null")]
    pub episode: Option<i64>,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MemberDto {
    pub user_id: String,
    pub name: String,
    pub image: Option<String>,
    pub role: Role,
    #[ts(type = "number")]
    pub joined_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InviteDto {
    pub id: String,
    pub code: String,
    #[ts(type = "number | null")]
    pub expires_at: Option<i64>,
    #[ts(type = "number | null")]
    pub max_uses: Option<i64>,
    #[ts(type = "number")]
    pub uses: i64,
}

/// One signed-in device (`GET /api/account/sessions`).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SessionInfo {
    pub id: String,
    pub kind: String,
    pub user_agent: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub last_seen_at: i64,
    pub current: bool,
}

/// A person as shown next to their content.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PersonDto {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
}

/// A title Pausa holds, in the viewer's language.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MediaDto {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub year: Option<i64>,
    pub poster_path: Option<String>,
}

/// A search result: nothing is stored until it is picked. `key` goes back to the API as `mediaKey`.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CandidateDto {
    pub key: String,
    pub kind: String,
    pub title: String,
    pub year: Option<i64>,
    pub poster_path: Option<String>,
}

/// A title with what the catalogue says about it, in the viewer's language.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MediaDetailDto {
    pub media: MediaDto,
    pub runtime_min: Option<i64>,
    pub episodes_total: Option<i64>,
    pub overview: Option<String>,
    pub genres: Vec<String>,
    pub cast: Vec<CastDto>,
    pub seasons: Vec<SeasonDto>,
    pub authors: Vec<AuthorDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AuthorDto {
    /// `tmdb:1` or `anilist:2`.
    pub key: String,
    pub name: String,
    /// `director`, `creator` or `author`.
    pub role: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PersonHitDto {
    pub key: String,
    pub name: String,
    pub profile_path: Option<String>,
    pub known_for: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PersonWorkDto {
    /// Catalogue key, for `POST /api/media/resolve` when `media_id` is null.
    pub work_key: String,
    /// Set when Pausa already holds the title.
    pub media_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub year: Option<i64>,
    pub poster_path: Option<String>,
    pub role: String,
    /// Cerchia average in half stars; null without a Cerchia or votes.
    pub avg: Option<f64>,
    pub ratings: Vec<PersonRating>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PersonPageDto {
    pub key: String,
    pub name: String,
    pub profile_path: Option<String>,
    pub born: Option<String>,
    pub died: Option<String>,
    pub place: Option<String>,
    pub bio: Option<String>,
    pub works: Vec<PersonWorkDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CastDto {
    pub name: String,
    pub role: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SeasonDto {
    pub season: i64,
    pub episodes: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReactionCount {
    pub emoji: String,
    pub count: u32,
    pub mine: bool,
}

/// One viewing. `review` is null when it contains spoilers and the viewer did not ask to see it (`review_hidden`): the text
/// does not travel to the client until requested.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LogDto {
    pub id: String,
    pub author: PersonDto,
    pub media: MediaDto,
    pub watched_on: String,
    pub rating: Option<u8>,
    pub review: Option<String>,
    pub review_hidden: bool,
    pub contains_spoilers: bool,
    pub platform: Option<String>,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub is_rewatch: bool,
    /// When it reached this Cerchia (the share), or when it was written for the personal diary.
    #[ts(type = "number")]
    pub arrived_at: i64,
    pub comment_count: u32,
    pub reactions: Vec<ReactionCount>,
    /// The Cerchie this viewing is shared with. Filled only in the author's own diary; empty in a Cerchia's feed.
    pub shared_in: Vec<String>,
    /// Minutes, from the catalogue (films; a series' runtime is per episode).
    #[ts(type = "number | null")]
    pub runtime_min: Option<i64>,
    /// Up to the catalogue's genres in the viewer's language.
    pub genres: Vec<String>,
    /// What the title is about, in the viewer's language (shown when the viewing has no review).
    pub overview: Option<String>,
    /// "Visto con": in a Cerchia only its members.
    pub watched_with: Vec<PersonDto>,
    /// The latest comment in this Cerchia (feed only), so the diary reads as a conversation.
    pub last_comment: Option<LastCommentDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LastCommentDto {
    pub author: PersonDto,
    /// Null when it is marked as a spoiler (the text does not travel), cut to 180 characters otherwise.
    pub body: Option<String>,
    pub is_spoiler: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LogPage {
    pub items: Vec<LogDto>,
    /// Pass back as `before` for the next page; null at the end.
    pub next: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommentDto {
    pub id: String,
    pub author: PersonDto,
    pub body: Option<String>,
    pub body_hidden: bool,
    pub is_spoiler: bool,
    pub parent_id: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    pub mine: bool,
}

/// `GET /api/circles/:id/logs/:logId`: the viewing and this Cerchia's thread under it.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LogThread {
    pub log: LogDto,
    pub comments: Vec<CommentDto>,
    pub watched_with: Vec<PersonDto>,
}

/// A series I am in the middle of ("continue watching").
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProgressDto {
    pub media: MediaDto,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    /// "watching" | "paused" | "done"
    pub status: String,
    #[ts(type = "number")]
    pub updated_at: i64,
    /// The episode after this one, when there is one.
    pub next: Option<ProgressNext>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProgressNext {
    pub season: i64,
    pub episode: i64,
}
/// `GET /api/me/settings`: my profile and my preferences in one answer.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MySettings {
    pub id: String,
    pub name: String,
    pub email: String,
    pub image: Option<String>,
    pub bio: Option<String>,
    pub genres: Vec<String>,
    pub favorites: Vec<MediaDto>,
    pub locale: Option<Locale>,
    pub country: Option<String>,
    pub email_digest: bool,
    /// Notification types switched off.
    pub notify_off: Vec<String>,
    pub circles: Vec<CircleMySettings>,
    /// All my viewings, and how many of them are only mine (shared with no Cerchia).
    pub logs: u32,
    pub private_logs: u32,
    /// People who joined through an invite I made (Fondatore from three).
    pub brought: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CircleMySettings {
    pub circle_id: String,
    pub name: String,
    pub muted: bool,
    pub hide_watching: bool,
}

/// Another member as the Cerchia sees them.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PersonProfile {
    pub person: PersonDto,
    pub bio: Option<String>,
    pub genres: Vec<String>,
    pub favorites: Vec<MediaDto>,
    /// Viewings of theirs shared in this Cerchia.
    pub logs: u32,
    /// Their average rating in this Cerchia, in half stars (1..10).
    pub avg_rating: Option<f64>,
    /// Titles they rated 8 or more here (at most 12).
    pub loved: Vec<MediaDto>,
    /// 0..1 similarity with the viewer; null until they share three rated titles.
    pub taste_match: Option<f64>,
    pub taste_common: u32,
    #[ts(type = "number")]
    pub joined_at: i64,
    /// Distinct titles they shared here.
    pub titles: u32,
    /// Distinct titles shared here per kind (movie / tv / anime), kinds with none left out.
    pub kinds: Vec<KindCount>,
    /// The rating (half stars, 1..10) behind each title of `loved`, in the same order.
    pub loved_ratings: Vec<u8>,
    /// What they are watching now; null when the Cerchia or either of you keeps live watching off.
    pub watching: Option<WatchingDto>,
}

/// How many distinct titles of one kind.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct KindCount {
    pub kind: String,
    pub count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NotificationDto {
    pub id: String,
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub kind: String,
    pub actor: Option<PersonDto>,
    pub circle_id: Option<String>,
    pub circle_name: Option<String>,
    pub log_id: Option<String>,
    pub media: Option<MediaDto>,
    /// For a Serata invitation: the room code, so the notice opens the room and not the Cerchia home.
    pub serata_code: Option<String>,
    pub read: bool,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NotificationPage {
    pub items: Vec<NotificationDto>,
    pub next: Option<String>,
    /// Unread, counted up to 100.
    pub unread: u32,
}
/// A list in an overview. `posters` are up to four cover paths for a collage.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ListSummary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub description: Option<String>,
    /// Null for a personal list.
    pub circle_id: Option<String>,
    pub owner_id: String,
    pub items: u32,
    pub posters: Vec<String>,
    /// Who made it (the name shown as "di {name}").
    pub owner_name: String,
    /// The first eight titles in order, for the strip of posters on a card.
    pub strip: Vec<ListStripItem>,
}

/// One title of a list card's strip.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ListStripItem {
    pub id: String,
    pub title: String,
    pub poster_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ListItemDto {
    pub media: MediaDto,
    pub note: Option<String>,
    /// Watchlist priority 0..3.
    pub priority: i64,
    pub added_by: Option<PersonDto>,
    pub position: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ListDetail {
    pub list: ListSummary,
    pub can_edit: bool,
    pub can_delete: bool,
    pub items: Vec<ListItemDto>,
}
/// A title in a Cerchia's ranking.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RankedDto {
    pub media: MediaDto,
    /// Average rating in half stars (1..10), null when nobody rated it.
    pub avg: Option<f64>,
    pub votes: u32,
    pub watchers: u32,
    pub last_watched: String,
    pub ratings: Vec<PersonRating>,
    /// Everyone in the Cerchia who logged it (rated or not): the ones missing from `ratings` saw it without a vote.
    pub watched_by: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PersonRating {
    pub user_id: String,
    pub rating: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RankingPage {
    pub items: Vec<RankedDto>,
    pub total: u32,
    pub page: u32,
    pub page_size: u32,
    pub year_min: Option<i64>,
    pub year_max: Option<i64>,
    /// Genre slugs present among the titles of the requested kind, sorted.
    pub genres: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PairDto {
    pub a: PersonDto,
    pub b: PersonDto,
    pub common: u32,
    /// 0..1, null until they share three rated titles.
    pub score: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Counted {
    pub key: String,
    pub count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct YearReview {
    pub year: i64,
    pub logs: u32,
    pub titles: u32,
    pub movies: u32,
    pub series: u32,
    pub anime: u32,
    /// Hours of films only (series and anime have no reliable runtime); a rewatch counts twice.
    pub movie_hours: f64,
    /// Average rating of rated viewings, in stars (0.5..5).
    pub avg_stars: Option<f64>,
    pub most_active: Option<PersonCount>,
    pub busiest_month: Option<Counted>,
    pub top_platform: Option<Counted>,
    pub title_of_the_year: Option<RankedDto>,
    /// The pair that watched the most together (each title and day counted once per pair), null when nobody logged "with".
    pub together_most: Option<TogetherDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TogetherDto {
    pub a: PersonDto,
    pub b: PersonDto,
    pub times: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PersonCount {
    pub person: PersonDto,
    pub count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Insights {
    pub agree: Vec<RankedDto>,
    pub split: Vec<RankedDto>,
    pub pairs: Vec<PairDto>,
    pub year: YearReview,
    pub years_with_logs: Vec<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Recommendation {
    pub media: MediaDto,
    /// Predicted rating for the people who have not seen it, 1..10.
    pub score: f64,
    pub unseen_by: Vec<PersonDto>,
    pub loved_by: Vec<LovedBy>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LovedBy {
    pub person: PersonDto,
    pub rating: u8,
}
/// `POST /api/auth/magic-link`: always `ok`; `dev_link` only on a local machine without a mail key.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MagicLinkSent {
    pub ok: bool,
    pub dev_link: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CircleCreated {
    pub id: String,
    pub invite_code: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JoinResult {
    pub circle_id: String,
    /// False when I was already a member.
    pub joined: bool,
}

/// `POST /api/auth/native/code`: a one-time code for the native app (3 minutes, single use).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NativeCode {
    pub code: String,
}

/// `POST /api/auth/native/exchange`, and `POST /api/auth/guest` with `native: true`: the app's own session token (Bearer).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NativeToken {
    pub token: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct IdOnly {
    pub id: String,
}

/// `GET /api/invites/:code` (no sign-in needed): enough to say "Marco invites you to Casa" before asking anyone to sign in.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InvitePreview {
    pub circle_name: String,
    pub members: u32,
    /// "active" | "revoked" | "expired" | "exhausted"
    pub state: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LogCreated {
    pub id: String,
    pub media_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ListItemAdded {
    pub media_id: String,
    /// False when the title was already in the list.
    pub added: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Removed {
    pub removed: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReactionToggled {
    /// True when the reaction is now on, false when it was taken off.
    pub on: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Position {
    pub season: i64,
    pub episode: i64,
}
/// One past Serata in a Cerchia's history.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SerataSummary {
    pub code: String,
    pub mode: String,
    /// "lobby" | "voting" | "done" | "expired"
    pub status: String,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number | null")]
    pub finished_at: Option<i64>,
    pub winner: Option<MediaDto>,
    pub people: u32,
    /// Somebody wrote "we watched it" in the diary for this Serata.
    pub watched: bool,
}

/// `GET /api/serate/:code/result`, no sign-in: what the share card shows. Never who voted what.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SerataPublicResult {
    pub code: String,
    pub winner: MediaDto,
    pub circle_name: Option<String>,
    pub mode: String,
    pub turns: u32,
    pub people: u32,
    pub drew: bool,
    #[ts(type = "number")]
    pub finished_at: i64,
    /// An open invitation to the Serata's Cerchia (for a guest who wants to join after the result); `None` when there is none.
    pub invite_code: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SerataCreated {
    pub code: String,
}

/// `GET /api/circles/:id/serate/services`: what the Cerchia can stream together (the services every member who set theirs has).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CircleServices {
    pub names: Vec<String>,
    /// How many members have said which services they have.
    pub set_by: u32,
    pub members: u32,
}

/// `GET /api/circles/:id/serate/suggest`: a roster the group would want (watchlist + what it would love, minus what most have seen
/// and what it cannot stream together), and for each title which of the shared services carry it.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SerataSuggest {
    pub titles: Vec<MediaDto>,
    pub on: std::collections::HashMap<String, Vec<String>>,
}
/// One import run (one press of "Importa", possibly resumed over several requests).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportBatchDto {
    pub id: String,
    pub source: String,
    pub circle_id: Option<String>,
    pub circle_name: Option<String>,
    /// "running" | "done" | "failed" | "cancelled"
    pub status: String,
    /// Rows handled so far: a resumed import starts again here.
    pub cursor: u32,
    pub total: Option<u32>,
    pub imported: u32,
    pub skipped: u32,
    pub new_titles: u32,
    pub lists: u32,
    pub failed_rows: u32,
    /// Viewings of this import that its Cerchia can still see (0 once it was taken out).
    pub in_circle: u32,
    /// Group lists of this import still in the Cerchia.
    pub lists_in_circle: u32,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number | null")]
    pub finished_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RejectedRow {
    /// Position of the row inside the chunk that was sent.
    pub index: u32,
    /// "title" | "kind" | "review"
    pub reason: String,
}

/// What one chunk did. `processed` is how many rows from the START of the chunk were handled: the rest were not (the Worker has a
/// limited number of outgoing requests per call) and must be sent again.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChunkResult {
    pub processed: u32,
    pub imported: u32,
    pub already: u32,
    pub new_titles: u32,
    pub skipped_undated: u32,
    pub rejected: Vec<RejectedRow>,
    /// The batch's cursor after this chunk.
    pub cursor: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ListChunkResult {
    pub list_id: String,
    pub processed: u32,
    pub added: u32,
    pub new_titles: u32,
    pub rejected: Vec<RejectedRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportUndone {
    /// Viewings taken out of the Cerchia, or deleted.
    pub viewings: u32,
    /// Group lists turned personal, or deleted.
    pub lists: u32,
}

/// What the server can do for an import.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportConfig {
    /// TMDB is on: films come with their poster. Off: they are imported without one.
    pub tmdb: bool,
}

/// The two tabs of the personal diary: everything, and what no Cerchia sees.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DiaryCounts {
    pub all: u32,
    pub private: u32,
}

/// A day (UTC) on which many viewings were added with no import run: older imports are only recognisable like this.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BulkDayDto {
    /// YYYY-MM-DD, UTC.
    pub day: String,
    pub logs: u32,
    /// How many of those viewings some Cerchia can still see.
    pub in_circles: u32,
}

/// What a bulk day lost: viewings taken out of the Cerchie (hide) or deleted.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BulkDayUndone {
    pub viewings: u32,
}
/// Every error body the API returns. `code` is stable and machine-readable; the client translates it.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ApiError {
    pub code: ErrorCode,
    /// Seconds to wait, only for `rate_limited`.
    pub retry_after: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ErrorCode {
    Unauthorized,
    Forbidden,
    /// Also returned for a Cerchia you do not belong to: its existence is not revealed.
    NotFound,
    Invalid,
    RateLimited,
    Conflict,
    InviteRevoked,
    InviteExpired,
    InviteExhausted,
    CircleFull,
    /// The owner must hand the Cerchia over before leaving it.
    MustTransfer,
    /// The catalogue (TMDB / AniList) is not configured or did not answer.
    CatalogUnavailable,
    Internal,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles_gate_management() {
        assert!(Role::Owner.is_owner() && Role::Owner.can_manage());
        assert!(!Role::Admin.is_owner() && Role::Admin.can_manage());
        assert!(!Role::Member.can_manage());
    }

    #[test]
    fn locale_negotiation() {
        assert_eq!(
            Locale::negotiate(Some("es-ES,es;q=0.9,en;q=0.8")),
            Locale::Es
        );
        assert_eq!(Locale::negotiate(Some("fr-FR, en;q=0.5")), Locale::En);
        assert_eq!(Locale::negotiate(Some("fr")), Locale::It);
        assert_eq!(Locale::negotiate(None), Locale::It);
        assert_eq!(Role::from_db("owner"), Some(Role::Owner));
        assert_eq!(Role::from_db("root"), None);
    }

    #[test]
    fn wire_format_is_stable() {
        let json = serde_json::to_string(&ApiError {
            code: ErrorCode::RateLimited,
            retry_after: Some(30),
        })
        .unwrap();
        assert_eq!(json, r#"{"code":"rate_limited","retryAfter":30}"#);
        assert_eq!(serde_json::to_string(&Role::Owner).unwrap(), r#""owner""#);
    }
}

/// One report in the operator queue.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AdminReport {
    pub id: String,
    pub kind: String,
    pub target_id: String,
    pub reason: String,
    pub note: Option<String>,
    pub excerpt: Option<String>,
    pub reporter_name: Option<String>,
    pub circle_name: Option<String>,
    pub created_at: f64,
    pub resolved_at: Option<f64>,
    pub resolution: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AdminReports {
    pub reports: Vec<AdminReport>,
}

/// Counts for the operator: nothing personal, no names.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AdminMetrics {
    pub users: f64,
    pub active_7d: f64,
    pub circles: f64,
    pub logs: f64,
    pub logs_7d: f64,
    pub serate: f64,
    pub open_reports: f64,
    pub cards_shared_7d: f64,
    pub invites_shared_7d: f64,
    /// The early success numbers (rates are 0..1; `null` = not enough data yet, which is not the same as zero).
    /// Share of people signed up 7+ days ago who created or joined a Cerchia within 7 days of signing up.
    pub circle_within_7d: Option<f64>,
    pub circle_within_7d_cohort: f64,
    /// Viewings per Cerchia per week, over the Cerchie that logged something that week (last 4 weeks).
    pub logs_per_active_circle_week: Option<f64>,
    /// Share of Cerchie with at least one group list.
    pub circles_using_lists: Option<f64>,
    /// Seconds from opening a Serata to its result: the median, the share under 120 s, and how many finished.
    pub serata_median_seconds: Option<f64>,
    pub serata_under_120: Option<f64>,
    pub serata_finished: f64,
    /// Share of finished Serate whose Card / invite link was shared at least once.
    pub serata_card_rate: Option<f64>,
    pub serata_invite_rate: Option<f64>,
    /// Share of Cerchie (old enough to measure) with activity in the week that starts 7 / 30 days after creation.
    pub retention_d7: Option<f64>,
    pub retention_d7_eligible: f64,
    pub retention_d30: Option<f64>,
    pub retention_d30_eligible: f64,
    /// Share of people in a Cerchia who ever used "Sto guardando".
    pub now_watching_rate: Option<f64>,
    pub now_watching_people: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BlockedUser {
    pub id: String,
    pub name: String,
    pub blocked_at: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BlockedUsers {
    pub blocked: Vec<BlockedUser>,
}

/// A title as one Cerchia sees it (title page inside a Cerchia): the original name, where its text came from, and what the
/// Cerchia's current ratings add up to.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CircleMediaDto {
    pub original_title: String,
    /// `tmdb`, `anilist`, `user` or `none`: who wrote the synopsis (decides the catalogue credit and "added by a member").
    pub source: String,
    /// Mean of the members' current ratings of the title, in half stars (1..10), rounded; `None` when nobody rated it.
    pub average: Option<i64>,
    pub rated: i64,
}
