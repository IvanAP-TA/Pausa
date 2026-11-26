//! The Serata: a group decides what to watch tonight. Pure state machine, no I/O: time and randomness are passed in, so every rule is
//! unit-tested natively. The Durable Object (`crates/api/src/serata_room.rs`) only stores this `Room`, runs its alarm and fans
//! the views out over WebSockets.
//!
//! Engine rules are v1's (`lib/serata/engine.ts`): *Torneo lampo* is single elimination, 2..8 titles, byes to the top seeds, a
//! tie is drawn; *Tavolo* gives everyone exactly 3 dots and one veto, most dots among the non-vetoed wins (all vetoed: vetoes are
//! ignored), a tie is drawn. What changes (docs/rebuild/GAPS.md): the **server** closes a round at its deadline (an alarm, not a
//! client), joining closes when voting starts, a host who leaves hands the room over, a draw is recorded, an idle lobby expires.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use ts_rs::TS;

pub const DOTS: u32 = 3;
pub const MIN_CANDIDATES: usize = 2;
pub const MAX_CANDIDATES: usize = 8;
pub const MAX_PARTICIPANTS: usize = 30;
pub const CODE_LEN: usize = 6;
/// Same 32-symbol alphabet as invite codes (no 0 O 1 I).
pub const CODE_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/// A six-character room code from six random bytes (32 symbols and a 5-bit mask: no modulo bias).
pub fn room_code(bytes: &[u8; CODE_LEN]) -> String {
    bytes
        .iter()
        .map(|b| CODE_ALPHABET[(b & 31) as usize] as char)
        .collect()
}

pub fn normalize_code(raw: &str) -> Option<String> {
    let c = raw.trim().to_uppercase();
    (c.len() == CODE_LEN && c.bytes().all(|b| CODE_ALPHABET.contains(&b))).then_some(c)
}

/// How long things last. Stored in the room so a deployment can change them without touching rooms already running.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Timing {
    pub match_ms: i64,
    pub table_ms: i64,
    /// A lobby nobody started expires after this long.
    pub lobby_ttl_ms: i64,
}

impl Default for Timing {
    fn default() -> Self {
        Timing {
            match_ms: 30_000,
            table_ms: 60_000,
            lobby_ttl_ms: 2 * 3_600_000,
        }
    }
}

/* ───────────── engine ───────────── */

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Match {
    pub a: Option<String>,
    pub b: Option<String>,
    pub w: Option<String>,
    pub votes: Option<(u32, u32)>,
    /// The match ended level and the winner was drawn.
    pub drew: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Bracket {
    pub rounds: Vec<Vec<Match>>,
    pub round: usize,
    pub match_ix: usize,
    pub deadline: Option<i64>,
    pub winner: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TableScore {
    pub media_id: String,
    pub dots: u32,
    pub vetoed: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Table {
    pub deadline: Option<i64>,
    pub scores: Option<Vec<TableScore>>,
    pub winner: Option<String>,
    pub drew: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Engine {
    Bracket(Bracket),
    Table(Table),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Ballot {
    pub dots: BTreeMap<String, u32>,
    pub veto: Option<String>,
}

const ORDER_2: [usize; 2] = [0, 1];
const ORDER_4: [usize; 4] = [0, 3, 1, 2];
const ORDER_8: [usize; 8] = [0, 7, 3, 4, 1, 6, 2, 5];

fn bracket_size(n: usize) -> Option<usize> {
    match n {
        MIN_CANDIDATES => Some(2),
        3..=4 => Some(4),
        5..=MAX_CANDIDATES => Some(8),
        _ => None,
    }
}

/// `seeds` are title ids, best seed first. Byes go to the top seeds; a match with one side only is resolved at once.
pub fn init_bracket(seeds: &[String], now: i64, timing: Timing) -> Option<Bracket> {
    let size = bracket_size(seeds.len())?;
    let order: &[usize] = match size {
        2 => &ORDER_2,
        4 => &ORDER_4,
        _ => &ORDER_8,
    };
    let slots: Vec<Option<String>> = order.iter().map(|&i| seeds.get(i).cloned()).collect();
    let blank = || Match {
        a: None,
        b: None,
        w: None,
        votes: None,
        drew: false,
    };
    let mut rounds: Vec<Vec<Match>> = vec![(0..size / 2)
        .map(|k| Match {
            a: slots[2 * k].clone(),
            b: slots[2 * k + 1].clone(),
            ..blank()
        })
        .collect()];
    let mut width = size / 2;
    while width > 1 {
        width /= 2;
        rounds.push((0..width).map(|_| blank()).collect());
    }
    Some(settle(
        Bracket {
            rounds,
            round: 0,
            match_ix: 0,
            deadline: None,
            winner: None,
        },
        now,
        timing,
    ))
}

/// Resolves byes from the pointer onward and sets the next deadline.
fn settle(mut s: Bracket, now: i64, timing: Timing) -> Bracket {
    while s.winner.is_none() {
        let (r, k) = (s.round, s.match_ix);
        if s.rounds[r][k].a.is_some() && s.rounds[r][k].b.is_some() {
            s.deadline = Some(now + timing.match_ms);
            return s;
        }
        let w = s.rounds[r][k]
            .a
            .clone()
            .or_else(|| s.rounds[r][k].b.clone());
        s.rounds[r][k].w = w;
        advance(&mut s);
    }
    s.deadline = None;
    s
}

fn advance(s: &mut Bracket) {
    let (r, k) = (s.round, s.match_ix);
    let w = s.rounds[r][k].w.clone();
    if r + 1 >= s.rounds.len() {
        s.winner = w;
        return;
    }
    let slot = &mut s.rounds[r + 1][k / 2];
    if k % 2 == 0 {
        slot.a = w;
    } else {
        slot.b = w;
    }
    if k + 1 < s.rounds[r].len() {
        s.match_ix += 1;
    } else {
        s.round += 1;
        s.match_ix = 0;
    }
}

pub fn current_match(s: &Bracket) -> Option<&Match> {
    if s.winner.is_some() {
        None
    } else {
        s.rounds.get(s.round).and_then(|r| r.get(s.match_ix))
    }
}

/// Closes the current match with the tally. `rand` in [0, 1) decides a level result.
pub fn close_match(
    prev: &Bracket,
    tally: (u32, u32),
    rand: f64,
    now: i64,
    timing: Timing,
) -> Bracket {
    let mut s = prev.clone();
    let (r, k) = (s.round, s.match_ix);
    let (Some(a), Some(b)) = (s.rounds[r][k].a.clone(), s.rounds[r][k].b.clone()) else {
        return s;
    };
    let drew = tally.0 == tally.1;
    s.rounds[r][k].votes = Some(tally);
    s.rounds[r][k].drew = drew;
    s.rounds[r][k].w = Some(if tally.0 > tally.1 {
        a
    } else if tally.1 > tally.0 {
        b
    } else if rand < 0.5 {
        a
    } else {
        b
    });
    advance(&mut s);
    settle(s, now, timing)
}

/// "final" | "semi" | "quarter", from how many matches the current round has.
pub fn round_name(s: &Bracket) -> &'static str {
    match s.rounds.get(s.round).map_or(1, Vec::len) {
        1 => "final",
        2 => "semi",
        _ => "quarter",
    }
}

/// Real (non-bye) matches done and in total, for "match 2 of 7".
pub fn match_progress(s: &Bracket) -> (u32, u32) {
    let (mut total, mut done) = (0, 0);
    for (r, round) in s.rounds.iter().enumerate() {
        for (k, m) in round.iter().enumerate() {
            if r == 0 && (m.a.is_none() || m.b.is_none()) {
                continue;
            }
            total += 1;
            if r < s.round || (r == s.round && k < s.match_ix) || s.winner.is_some() {
                done += 1;
            }
        }
    }
    (done, total)
}

pub fn valid_ballot(b: &Ballot, candidates: &[String]) -> bool {
    let known = |id: &String| candidates.contains(id);
    let mut spent: u32 = 0;
    for (id, n) in &b.dots {
        if !known(id) {
            return false;
        }
        spent = spent.saturating_add(*n);
    }
    spent == DOTS && b.veto.as_ref().is_none_or(known)
}

pub fn close_table(candidates: &[String], ballots: &[&Ballot], rand: f64) -> Table {
    let mut scores: Vec<TableScore> = candidates
        .iter()
        .map(|id| TableScore {
            media_id: id.clone(),
            dots: ballots
                .iter()
                .map(|b| b.dots.get(id).copied().unwrap_or(0))
                .sum(),
            vetoed: ballots.iter().any(|b| b.veto.as_ref() == Some(id)),
        })
        .collect();
    let eligible: Vec<&TableScore> = if scores.iter().any(|s| !s.vetoed) {
        scores.iter().filter(|s| !s.vetoed).collect()
    } else {
        scores.iter().collect()
    };
    let top = eligible.iter().map(|s| s.dots).max().unwrap_or(0);
    let tied: Vec<&&TableScore> = eligible.iter().filter(|s| s.dots == top).collect();
    let pick = ((rand * tied.len() as f64) as usize).min(tied.len().saturating_sub(1));
    let winner = tied.get(pick).map(|s| s.media_id.clone());
    let drew = tied.len() > 1;
    scores.sort_by_key(|s| std::cmp::Reverse(s.dots));
    Table {
        deadline: None,
        scores: Some(scores),
        winner,
        drew,
    }
}

/* ───────────── the room ───────────── */

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Mode {
    Bracket,
    Table,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Status {
    Lobby,
    Voting,
    Done,
    /// Nobody started it, or everybody left.
    Expired,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Candidate {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub year: Option<i64>,
    pub poster_path: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Participant {
    pub user_id: String,
    pub name: String,
    pub image: Option<String>,
    pub is_guest: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RoomError {
    NotHost,
    NotParticipant,
    /// The action does not fit the room's status (voting before start, starting twice, joining after the start...).
    WrongStatus,
    Invalid,
    Full,
}

/// Everything a new room needs (a struct, not eight arguments).
pub struct NewRoom {
    pub serata_id: String,
    pub code: String,
    pub mode: Mode,
    pub host: Participant,
    pub circle_id: Option<String>,
    pub candidates: Vec<Candidate>,
    pub timing: Timing,
    pub now: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Room {
    pub serata_id: String,
    pub code: String,
    pub mode: Mode,
    pub host_id: String,
    pub circle_id: Option<String>,
    pub candidates: Vec<Candidate>,
    pub participants: Vec<Participant>,
    pub status: Status,
    pub engine: Option<Engine>,
    /// Picks for the match being voted (user id → title id); cleared when the match closes.
    pub picks: BTreeMap<String, String>,
    pub ballots: BTreeMap<String, Ballot>,
    pub version: u64,
    pub timing: Timing,
    pub created_at: i64,
    pub finished_at: Option<i64>,
    pub winner: Option<String>,
    pub drew: bool,
    /// People counted when the room closed (what the public result shows).
    pub people: u32,
    /// How many rounds/matches were played.
    pub turns: u32,
    /// The finished room has been written to D1.
    pub persisted: bool,
}

impl Room {
    pub fn new(spec: NewRoom) -> Result<Room, RoomError> {
        let NewRoom {
            serata_id,
            code,
            mode,
            host,
            circle_id,
            candidates,
            timing,
            now,
        } = spec;
        if !(MIN_CANDIDATES..=MAX_CANDIDATES).contains(&candidates.len()) {
            return Err(RoomError::Invalid);
        }
        let mut ids: Vec<&String> = candidates.iter().map(|c| &c.id).collect();
        ids.sort();
        ids.dedup();
        if ids.len() != candidates.len() {
            return Err(RoomError::Invalid);
        }
        Ok(Room {
            serata_id,
            code,
            mode,
            host_id: host.user_id.clone(),
            circle_id,
            candidates,
            participants: vec![host],
            status: Status::Lobby,
            engine: None,
            picks: BTreeMap::new(),
            ballots: BTreeMap::new(),
            version: 1,
            timing,
            created_at: now,
            finished_at: None,
            winner: None,
            drew: false,
            people: 0,
            turns: 0,
            persisted: false,
        })
    }

    fn bump(&mut self) {
        self.version += 1;
    }

    fn is_participant(&self, user: &str) -> bool {
        self.participants.iter().any(|p| p.user_id == user)
    }

    fn candidate_ids(&self) -> Vec<String> {
        self.candidates.iter().map(|c| c.id.clone()).collect()
    }

    /// Joining is open only in the lobby. Somebody already in can rejoin (and rename) at any time.
    pub fn join(&mut self, p: Participant) -> Result<(), RoomError> {
        if let Some(existing) = self
            .participants
            .iter_mut()
            .find(|x| x.user_id == p.user_id)
        {
            if matches!(self.status, Status::Done | Status::Expired) {
                return Ok(());
            }
            *existing = p;
            self.bump();
            return Ok(());
        }
        if self.status != Status::Lobby {
            return Err(RoomError::WrongStatus);
        }
        if self.participants.len() >= MAX_PARTICIPANTS {
            return Err(RoomError::Full);
        }
        self.participants.push(p);
        self.bump();
        Ok(())
    }

    /// Leaving. In the lobby the host hands the room to whoever has been in it longest; with nobody left it expires. While voting
    /// the person's vote goes with them and the quorum is rechecked (they can no longer block the round).
    pub fn leave(&mut self, user: &str, now: i64, rand: f64) -> Result<(), RoomError> {
        if !self.is_participant(user) {
            return Err(RoomError::NotParticipant);
        }
        if matches!(self.status, Status::Done | Status::Expired) {
            return Ok(());
        }
        self.participants.retain(|p| p.user_id != user);
        self.picks.remove(user);
        self.ballots.remove(user);
        if self.participants.is_empty() {
            self.finish_without_winner(now);
        } else {
            if self.host_id == user {
                self.host_id = self.participants[0].user_id.clone();
            }
            self.bump();
            if self.status == Status::Voting {
                self.try_close(false, now, rand);
            }
        }
        Ok(())
    }

    fn finish_without_winner(&mut self, now: i64) {
        self.status = Status::Expired;
        self.finished_at = Some(now);
        self.people = self.participants.len() as u32;
        self.bump();
    }

    pub fn start(&mut self, user: &str, now: i64) -> Result<(), RoomError> {
        if self.host_id != user {
            return Err(RoomError::NotHost);
        }
        if self.status != Status::Lobby {
            return Err(RoomError::WrongStatus);
        }
        self.engine = Some(match self.mode {
            Mode::Bracket => Engine::Bracket(
                init_bracket(&self.candidate_ids(), now, self.timing).ok_or(RoomError::Invalid)?,
            ),
            Mode::Table => Engine::Table(Table {
                deadline: Some(now + self.timing.table_ms),
                scores: None,
                winner: None,
                drew: false,
            }),
        });
        self.status = Status::Voting;
        self.bump();
        // A bracket of byes only (cannot happen with 2+ titles) would already be decided.
        if let Some(Engine::Bracket(b)) = &self.engine {
            if let Some(w) = &b.winner {
                self.winner = Some(w.clone());
                self.status = Status::Done;
                self.finished_at = Some(now);
            }
        }
        Ok(())
    }

    pub fn vote(&mut self, user: &str, media: &str, now: i64, rand: f64) -> Result<(), RoomError> {
        if !self.is_participant(user) {
            return Err(RoomError::NotParticipant);
        }
        let Some(Engine::Bracket(b)) = &self.engine else {
            return Err(RoomError::WrongStatus);
        };
        if self.status != Status::Voting {
            return Err(RoomError::WrongStatus);
        }
        let m = current_match(b).ok_or(RoomError::WrongStatus)?;
        if m.a.as_deref() != Some(media) && m.b.as_deref() != Some(media) {
            return Err(RoomError::Invalid);
        }
        // A vote that arrives after the deadline is not counted: the round is closed first.
        if b.deadline.is_some_and(|d| now >= d) {
            self.try_close(false, now, rand);
            return Err(RoomError::WrongStatus);
        }
        self.picks.insert(user.to_string(), media.to_string());
        self.bump();
        self.try_close(false, now, rand);
        Ok(())
    }

    pub fn ballot(
        &mut self,
        user: &str,
        ballot: Ballot,
        now: i64,
        rand: f64,
    ) -> Result<(), RoomError> {
        if !self.is_participant(user) {
            return Err(RoomError::NotParticipant);
        }
        let Some(Engine::Table(t)) = &self.engine else {
            return Err(RoomError::WrongStatus);
        };
        if self.status != Status::Voting {
            return Err(RoomError::WrongStatus);
        }
        if !valid_ballot(&ballot, &self.candidate_ids()) {
            return Err(RoomError::Invalid);
        }
        if t.deadline.is_some_and(|d| now >= d) {
            self.try_close(false, now, rand);
            return Err(RoomError::WrongStatus);
        }
        self.ballots.insert(user.to_string(), ballot);
        self.bump();
        self.try_close(false, now, rand);
        Ok(())
    }

    /// The host closes the current match (or the table) with the votes there are, even none.
    pub fn force(&mut self, user: &str, now: i64, rand: f64) -> Result<(), RoomError> {
        if self.host_id != user {
            return Err(RoomError::NotHost);
        }
        if self.status != Status::Voting {
            return Err(RoomError::WrongStatus);
        }
        self.try_close(true, now, rand);
        Ok(())
    }

    /// Run by the alarm (and safe to call any time): closes a round past its deadline, expires an idle lobby. True if anything changed.
    pub fn tick(&mut self, now: i64, rand: f64) -> bool {
        let before = self.version;
        match self.status {
            Status::Voting => self.try_close(false, now, rand),
            Status::Lobby if now >= self.created_at + self.timing.lobby_ttl_ms => {
                self.finish_without_winner(now)
            }
            _ => {}
        }
        self.version != before
    }

    /// Closes when forced, when the deadline passed, or when everybody still in the room has voted.
    fn try_close(&mut self, force: bool, now: i64, rand: f64) {
        let people = self.participants.len();
        match self.engine.clone() {
            Some(Engine::Bracket(b)) => {
                let Some(m) = current_match(&b) else { return };
                let (Some(a), Some(bb)) = (m.a.clone(), m.b.clone()) else {
                    return;
                };
                let voters = self.picks.len();
                if !(force
                    || b.deadline.is_some_and(|d| now >= d)
                    || (people > 0 && voters >= people))
                {
                    return;
                }
                let tally = (
                    self.picks.values().filter(|v| **v == a).count() as u32,
                    self.picks.values().filter(|v| **v == bb).count() as u32,
                );
                let next = close_match(&b, tally, rand, now, self.timing);
                self.picks.clear();
                self.turns += 1;
                if let Some(w) = &next.winner {
                    self.winner = Some(w.clone());
                    self.drew = next.rounds.iter().flatten().any(|m| m.drew);
                    self.status = Status::Done;
                    self.finished_at = Some(now);
                    self.people = people as u32;
                }
                self.engine = Some(Engine::Bracket(next));
                self.bump();
            }
            Some(Engine::Table(t)) => {
                if t.winner.is_some() {
                    return;
                }
                let voters = self.ballots.len();
                if !(force
                    || t.deadline.is_some_and(|d| now >= d)
                    || (people > 0 && voters >= people))
                {
                    return;
                }
                let ballots: Vec<&Ballot> = self.ballots.values().collect();
                let next = close_table(&self.candidate_ids(), &ballots, rand);
                self.winner = next.winner.clone();
                self.drew = next.drew;
                self.turns = 1;
                self.status = Status::Done;
                self.finished_at = Some(now);
                self.people = people as u32;
                self.engine = Some(Engine::Table(next));
                self.bump();
            }
            None => {}
        }
    }

    /// When the room next needs the clock: the round's deadline while voting, the lobby's expiry before the start.
    pub fn next_alarm(&self) -> Option<i64> {
        match (&self.status, &self.engine) {
            (Status::Voting, Some(Engine::Bracket(b))) => b.deadline,
            (Status::Voting, Some(Engine::Table(t))) => t.deadline,
            (Status::Lobby, _) => Some(self.created_at + self.timing.lobby_ttl_ms),
            _ => None,
        }
    }

    pub fn view(&self, viewer: Option<&str>, now: i64) -> RoomView {
        let me = viewer.unwrap_or("");
        let voted = |id: &str| self.picks.contains_key(id) || self.ballots.contains_key(id);
        let bracket = match &self.engine {
            Some(Engine::Bracket(b)) if self.status == Status::Voting => {
                current_match(b).map(|m| {
                    let (done, total) = match_progress(b);
                    BracketView {
                        round_name: round_name(b).to_string(),
                        done,
                        total,
                        a: m.a.clone(),
                        b: m.b.clone(),
                        my_pick: self.picks.get(me).cloned(),
                        deadline: b.deadline,
                    }
                })
            }
            _ => None,
        };
        let table = match &self.engine {
            Some(Engine::Table(t)) if self.status == Status::Voting => Some(TableView {
                deadline: t.deadline,
                dots: DOTS,
                my_ballot: self.ballots.get(me).cloned(),
            }),
            _ => None,
        };
        let result = (self.status == Status::Done).then(|| ResultView {
            winner: self.winner.clone().unwrap_or_default(),
            turns: self.turns,
            people: self.people,
            drew: self.drew,
            scores: match &self.engine {
                Some(Engine::Table(t)) => t.scores.clone(),
                _ => None,
            },
        });
        RoomView {
            code: self.code.clone(),
            mode: self.mode,
            status: self.status,
            version: self.version,
            circle_id: self.circle_id.clone(),
            is_host: self.host_id == me,
            host_id: self.host_id.clone(),
            joined: self.is_participant(me),
            candidates: self.candidates.clone(),
            participants: self
                .participants
                .iter()
                .map(|p| ParticipantView {
                    id: p.user_id.clone(),
                    name: p.name.clone(),
                    image: p.image.clone(),
                    is_guest: p.is_guest,
                    voted: voted(&p.user_id),
                })
                .collect(),
            bracket,
            table,
            result,
            server_now: now,
        }
    }

    /// The final tally of a table or the per-match votes of a bracket, for the history (never who voted what).
    pub fn result_json(&self) -> serde_json::Value {
        serde_json::json!({ "winner": self.winner, "mode": self.mode, "turns": self.turns, "people": self.people, "drew": self.drew,
            "scores": match &self.engine { Some(Engine::Table(t)) => t.scores.clone(), _ => None } })
    }

    pub fn tally_of(&self) -> HashMap<String, u32> {
        let mut m = HashMap::new();
        for v in self.picks.values() {
            *m.entry(v.clone()).or_insert(0) += 1;
        }
        m
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ParticipantView {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    pub is_guest: bool,
    /// Has voted in the current round (never what).
    pub voted: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BracketView {
    /// "quarter" | "semi" | "final"
    pub round_name: String,
    pub done: u32,
    pub total: u32,
    pub a: Option<String>,
    pub b: Option<String>,
    pub my_pick: Option<String>,
    #[ts(type = "number | null")]
    pub deadline: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TableView {
    #[ts(type = "number | null")]
    pub deadline: Option<i64>,
    pub dots: u32,
    pub my_ballot: Option<Ballot>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResultView {
    pub winner: String,
    pub turns: u32,
    pub people: u32,
    /// The decision came from a draw.
    pub drew: bool,
    pub scores: Option<Vec<TableScore>>,
}

/// What a person sees of a room. The raw engine state (match tallies) never leaves the server.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RoomView {
    pub code: String,
    pub mode: Mode,
    pub status: Status,
    #[ts(type = "number")]
    pub version: u64,
    pub circle_id: Option<String>,
    pub is_host: bool,
    /// Who hosts now (it changes when the host leaves the lobby); match it with `participants[].id` to show the name.
    pub host_id: String,
    pub joined: bool,
    pub candidates: Vec<Candidate>,
    pub participants: Vec<ParticipantView>,
    pub bracket: Option<BracketView>,
    pub table: Option<TableView>,
    pub result: Option<ResultView>,
    #[ts(type = "number")]
    pub server_now: i64,
}

/// A title that can go on a suggested roster.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RosterTitle {
    pub id: String,
    pub score: i64,
}

/// "Fill the roster for us" (v1's `buildRoster`): recommendations (best first) and watchlist titles take turns, so one source cannot
/// crowd out the other; a title is dropped when half or more of the group has seen it, or when `blocked` says the shared services
/// are known not to carry it. At most `max`, no repeats. The caller supplies `seen_by` (people who logged each title).
pub fn build_roster(
    watchlist: &[String],
    recommended: &[RosterTitle],
    seen_by: &HashMap<String, u32>,
    people: u32,
    blocked: &dyn Fn(&str) -> bool,
    max: usize,
) -> Vec<String> {
    let too_seen = |id: &str| people > 0 && seen_by.get(id).copied().unwrap_or(0) * 2 >= people;
    let ok = |id: &str| !too_seen(id) && !blocked(id);
    let mut recs: Vec<&RosterTitle> = recommended.iter().collect();
    recs.sort_by(|a, b| b.score.cmp(&a.score));
    let recs: Vec<&str> = recs.into_iter().map(|r| r.id.as_str()).filter(|i| ok(i)).collect();
    let lists: Vec<&str> = watchlist.iter().map(String::as_str).filter(|i| ok(i)).collect();
    let mut out: Vec<String> = Vec::new();
    let mut take = |id: Option<&&str>| {
        if let Some(id) = id {
            if out.len() < max && !out.iter().any(|o| o == id) {
                out.push((*id).to_string());
            }
        }
    };
    let mut i = 0;
    while i < recs.len() || i < lists.len() {
        take(recs.get(i));
        take(lists.get(i));
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roster_alternates_sources_and_drops_what_is_seen_or_unstreamable() {
        let seen: HashMap<String, u32> = [("seen".to_string(), 2)].into();
        let recs = [
            RosterTitle { id: "r1".into(), score: 9 },
            RosterTitle { id: "seen".into(), score: 8 },
            RosterTitle { id: "r2".into(), score: 7 },
        ];
        let list: Vec<String> = ["w1", "r1", "no", "w2"].map(String::from).to_vec();
        let out = build_roster(&list, &recs, &seen, 4, &|id| id == "no", 8);
        assert_eq!(out, ["r1", "w1", "r2", "w2"]);
        let capped = build_roster(&list, &recs, &seen, 4, &|_| false, 2);
        assert_eq!(capped, ["r1", "w1"]);
    }

    const T: Timing = Timing {
        match_ms: 30_000,
        table_ms: 60_000,
        lobby_ttl_ms: 7_200_000,
    };
    fn ids(n: usize) -> Vec<String> {
        (1..=n).map(|i| format!("s{i}")).collect()
    }

    /* ── engine: ported from v1's engine.test.ts ── */

    #[test]
    fn eight_seeds_play_seven_matches_starting_at_the_quarters() {
        let b = init_bracket(&ids(8), 1000, T).unwrap();
        assert_eq!(b.rounds.len(), 3);
        assert_eq!(match_progress(&b), (0, 7));
        assert_eq!(round_name(&b), "quarter");
        let m = current_match(&b).unwrap();
        assert_eq!(
            (m.a.as_deref(), m.b.as_deref()),
            (Some("s1"), Some("s8")),
            "seed 1 meets seed 8"
        );
        assert_eq!(b.deadline, Some(31_000));
        let mut b = b;
        for _ in 0..7 {
            b = close_match(&b, (1, 0), 0.9, 0, T);
        }
        assert_eq!(
            b.winner.as_deref(),
            Some("s1"),
            "A wins every time: the top seed"
        );
        assert_eq!(b.deadline, None);
    }

    #[test]
    fn five_seeds_give_byes_to_the_top_three() {
        let b = init_bracket(&ids(5), 0, T).unwrap();
        assert_eq!(match_progress(&b).1, 4);
        let m = current_match(&b).unwrap();
        assert_eq!(
            (m.a.as_deref(), m.b.as_deref()),
            (Some("s4"), Some("s5")),
            "only s4 vs s5 is voted"
        );
        let first = &b.rounds[0];
        assert!(
            first
                .iter()
                .filter(|m| m.a.is_some() && m.b.is_some())
                .count()
                == 1
        );
        assert!(
            first.iter().all(|m| m.a.is_some() || m.b.is_some()),
            "never a bye against a bye"
        );
    }

    #[test]
    fn three_seeds_and_two_seeds() {
        let b = init_bracket(&ids(3), 0, T).unwrap();
        let m = current_match(&b).unwrap();
        assert_eq!(
            (m.a.as_deref(), m.b.as_deref()),
            (Some("s2"), Some("s3")),
            "s1 has the bye"
        );
        let b = close_match(&b, (1, 0), 0.0, 0, T);
        assert_eq!(round_name(&b), "final");
        let b = close_match(&b, (0, 1), 0.0, 0, T);
        assert!(b.winner.is_some() && b.deadline.is_none());
        let two = init_bracket(&ids(2), 0, T).unwrap();
        assert_eq!(match_progress(&two), (0, 1));
    }

    #[test]
    fn level_matches_are_drawn_and_the_draw_is_recorded() {
        let b = init_bracket(&ids(2), 0, T).unwrap();
        let a = close_match(&b, (0, 0), 0.2, 0, T);
        let c = close_match(&b, (2, 2), 0.8, 0, T);
        assert_eq!(a.winner.as_deref(), Some("s1"));
        assert_eq!(c.winner.as_deref(), Some("s2"));
        assert!(a.rounds[0][0].drew && c.rounds[0][0].drew);
        let clear = close_match(&b, (2, 1), 0.2, 0, T);
        assert!(!clear.rounds[0][0].drew);
    }

    #[test]
    fn closing_a_match_does_not_touch_the_previous_state() {
        let b = init_bracket(&ids(4), 0, T).unwrap();
        let before = b.clone();
        let _ = close_match(&b, (1, 0), 0.0, 5, T);
        assert_eq!(b, before);
    }

    #[test]
    fn a_bracket_needs_two_to_eight_titles() {
        assert!(init_bracket(&ids(1), 0, T).is_none());
        assert!(init_bracket(&ids(9), 0, T).is_none());
        assert!(init_bracket(&ids(8), 0, T).is_some());
    }

    fn ballot(dots: &[(&str, u32)], veto: Option<&str>) -> Ballot {
        Ballot {
            dots: dots.iter().map(|(k, v)| (k.to_string(), *v)).collect(),
            veto: veto.map(str::to_string),
        }
    }

    #[test]
    fn table_most_dots_wins_and_scores_are_sorted() {
        let c = ids(3);
        let (b1, b2) = (
            ballot(&[("s1", 2), ("s2", 1)], None),
            ballot(&[("s2", 3)], None),
        );
        let t = close_table(&c, &[&b1, &b2], 0.0);
        assert_eq!(t.winner.as_deref(), Some("s2"));
        assert_eq!(t.scores.as_ref().unwrap()[0].media_id, "s2");
        assert_eq!(t.scores.as_ref().unwrap()[0].dots, 4);
        assert!(!t.drew);
    }

    #[test]
    fn a_vetoed_title_cannot_win_and_all_vetoed_means_vetoes_are_ignored() {
        let c = ids(2);
        let (b1, b2) = (ballot(&[("s1", 3)], Some("s1")), ballot(&[("s1", 3)], None));
        assert_eq!(
            close_table(&c, &[&b1, &b2], 0.0).winner.as_deref(),
            Some("s2")
        );
        let (v1, v2) = (
            ballot(&[("s1", 3)], Some("s2")),
            ballot(&[("s1", 1), ("s2", 2)], Some("s1")),
        );
        assert_eq!(
            close_table(&c, &[&v1, &v2], 0.0).winner.as_deref(),
            Some("s1"),
            "everything vetoed: the most dots wins (4 vs 2)"
        );
    }

    #[test]
    fn a_table_tie_is_drawn_uniformly_and_recorded() {
        let c = ids(3);
        let (b1, b2, b3) = (
            ballot(&[("s1", 3)], None),
            ballot(&[("s2", 3)], None),
            ballot(&[("s3", 3)], None),
        );
        let pick = |r: f64| close_table(&c, &[&b1, &b2, &b3], r);
        assert_eq!(pick(0.0).winner.as_deref(), Some("s1"));
        assert_eq!(pick(0.5).winner.as_deref(), Some("s2"));
        assert_eq!(pick(0.999).winner.as_deref(), Some("s3"));
        assert!(pick(0.5).drew);
    }

    #[test]
    fn ballots_are_validated() {
        let c = ids(3);
        assert!(valid_ballot(
            &ballot(&[("s1", 2), ("s2", 1)], Some("s3")),
            &c
        ));
        assert!(!valid_ballot(&ballot(&[("s1", 4)], None), &c), "four dots");
        assert!(!valid_ballot(&ballot(&[("s1", 1)], None), &c), "one dot");
        assert!(
            !valid_ballot(&ballot(&[("zz", 3)], None), &c),
            "unknown title"
        );
        assert!(
            !valid_ballot(&ballot(&[("s1", 3)], Some("zz")), &c),
            "unknown veto"
        );
        assert!(
            !valid_ballot(&ballot(&[("s1", u32::MAX), ("s2", 4)], None), &c),
            "overflow does not wrap to three"
        );
    }

    /* ── the room ── */

    fn person(id: &str) -> Participant {
        Participant {
            user_id: id.into(),
            name: id.to_uppercase(),
            image: None,
            is_guest: false,
        }
    }

    fn cand(i: usize) -> Candidate {
        Candidate {
            id: format!("s{i}"),
            kind: "movie".into(),
            title: format!("Film {i}"),
            year: Some(2000 + i as i64),
            poster_path: None,
        }
    }

    fn room(mode: Mode, n: usize) -> Room {
        Room::new(NewRoom {
            serata_id: "id".into(),
            code: "ABC234".into(),
            mode,
            host: person("host"),
            circle_id: Some("circle".into()),
            candidates: (1..=n).map(cand).collect(),
            timing: T,
            now: 0,
        })
        .unwrap()
    }

    #[test]
    fn codes_use_the_32_symbol_alphabet() {
        assert_eq!(room_code(&[0; 6]), "AAAAAAAA"[..6]);
        let c = room_code(&[1, 2, 3, 30, 31, 255]);
        assert_eq!(c.len(), 6);
        assert!(c.bytes().all(|b| CODE_ALPHABET.contains(&b)));
        assert_eq!(normalize_code(" abc234 "), Some("ABC234".into()));
        for bad in ["", "ABC23", "ABC2345", "ABC1O0", "abc-23"] {
            assert_eq!(normalize_code(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_room_needs_two_to_eight_distinct_titles() {
        let mk = |c: Vec<Candidate>| {
            Room::new(NewRoom {
                serata_id: "i".into(),
                code: "ABC234".into(),
                mode: Mode::Table,
                host: person("h"),
                circle_id: None,
                candidates: c,
                timing: T,
                now: 0,
            })
        };
        assert!(mk(vec![cand(1)]).is_err());
        assert!(mk((1..=9).map(cand).collect()).is_err());
        assert!(mk(vec![cand(1), cand(1)]).is_err(), "no duplicates");
        assert!(mk(vec![cand(1), cand(2)]).is_ok());
    }

    #[test]
    fn joining_is_open_only_in_the_lobby() {
        let mut r = room(Mode::Bracket, 3);
        assert_eq!(r.join(person("ann")), Ok(()));
        assert_eq!(r.participants.len(), 2);
        let mut renamed = person("ann");
        renamed.name = "Anna".into();
        assert_eq!(r.join(renamed), Ok(()));
        assert_eq!(
            r.participants.len(),
            2,
            "same person: renamed, not duplicated"
        );
        assert_eq!(r.participants[1].name, "Anna");
        r.start("host", 0).unwrap();
        assert_eq!(
            r.join(person("late")),
            Err(RoomError::WrongStatus),
            "nobody joins once voting started (v1 let anyone in and raised the quorum)"
        );
        assert_eq!(
            r.join(person("ann")),
            Ok(()),
            "but somebody already in can come back"
        );
    }

    #[test]
    fn the_room_holds_at_most_thirty_people() {
        let mut r = room(Mode::Table, 2);
        for i in 1..MAX_PARTICIPANTS {
            r.join(person(&format!("p{i}"))).unwrap();
        }
        assert_eq!(r.participants.len(), MAX_PARTICIPANTS);
        assert_eq!(r.join(person("extra")), Err(RoomError::Full));
    }

    #[test]
    fn only_the_host_starts_and_only_once() {
        let mut r = room(Mode::Bracket, 2);
        r.join(person("ann")).unwrap();
        assert_eq!(r.start("ann", 0), Err(RoomError::NotHost));
        assert_eq!(
            r.vote("ann", "s1", 0, 0.0),
            Err(RoomError::WrongStatus),
            "no votes before the start"
        );
        assert_eq!(r.start("host", 0), Ok(()));
        assert_eq!(r.status, Status::Voting);
        assert_eq!(r.start("host", 0), Err(RoomError::WrongStatus));
    }

    #[test]
    fn a_bracket_round_closes_when_everybody_has_voted() {
        let mut r = room(Mode::Bracket, 2);
        r.join(person("ann")).unwrap();
        r.start("host", 0).unwrap();
        assert_eq!(r.vote("zed", "s1", 1, 0.0), Err(RoomError::NotParticipant));
        assert_eq!(
            r.vote("host", "s9", 1, 0.0),
            Err(RoomError::Invalid),
            "not one of the two in the match"
        );
        r.vote("host", "s1", 1, 0.0).unwrap();
        assert_eq!(r.status, Status::Voting);
        r.vote("host", "s2", 2, 0.0).unwrap();
        assert!(
            r.picks.get("host").map(String::as_str) == Some("s2"),
            "one can change their mind while it is open"
        );
        r.vote("ann", "s2", 3, 0.0).unwrap();
        assert_eq!(
            (
                r.status,
                r.winner.as_deref(),
                r.turns,
                r.people,
                r.finished_at
            ),
            (Status::Done, Some("s2"), 1, 2, Some(3))
        );
        assert!(!r.drew);
    }

    #[test]
    fn the_server_closes_a_round_at_the_deadline_and_a_late_vote_does_not_count() {
        let mut r = room(Mode::Bracket, 3);
        r.join(person("ann")).unwrap();
        r.join(person("bo")).unwrap();
        r.start("host", 0).unwrap();
        assert_eq!(r.next_alarm(), Some(30_000));
        r.vote("host", "s2", 10, 0.0).unwrap();
        assert!(!r.tick(29_999, 0.0), "before the deadline nothing happens");
        assert!(
            r.tick(30_000, 0.0),
            "at the deadline the round closes by itself: nobody has to keep the page open"
        );
        assert_eq!(r.turns, 1);
        assert_eq!(
            r.status,
            Status::Voting,
            "s2 beat s3, now the final against s1"
        );
        assert!(r.picks.is_empty());
        assert_eq!(
            r.next_alarm(),
            Some(60_000),
            "the next round has a new deadline"
        );
        assert_eq!(
            r.vote("ann", "s1", 60_000, 0.0),
            Err(RoomError::WrongStatus),
            "a vote at the deadline is too late"
        );
        assert_eq!(
            r.status,
            Status::Done,
            "and that attempt closed the round (zero votes: drawn)"
        );
        assert!(r.drew);
    }

    #[test]
    fn a_silent_room_still_finishes() {
        let mut r = room(Mode::Table, 2);
        r.join(person("ann")).unwrap();
        r.start("host", 0).unwrap();
        assert!(r.tick(60_000, 0.0));
        assert_eq!(r.status, Status::Done);
        assert!(
            r.winner.is_some() && r.drew,
            "nobody voted: every title ties at zero and one is drawn"
        );
        assert_eq!(r.next_alarm(), None);
    }

    #[test]
    fn the_host_can_force_a_round() {
        let mut r = room(Mode::Bracket, 4);
        r.join(person("ann")).unwrap();
        r.start("host", 0).unwrap();
        assert_eq!(r.force("ann", 1, 0.0), Err(RoomError::NotHost));
        r.vote("ann", "s4", 1, 0.0).unwrap();
        r.force("host", 2, 0.0).unwrap();
        assert_eq!(r.turns, 1);
        assert!(r.force("host", 2, 0.0).is_ok());
        assert_eq!(r.turns, 2);
        r.force("host", 3, 0.9).unwrap();
        assert_eq!(r.status, Status::Done);
    }

    #[test]
    fn table_flow_with_ballots_and_veto() {
        let mut r = room(Mode::Table, 3);
        r.join(person("ann")).unwrap();
        assert_eq!(
            r.ballot("ann", ballot(&[("s1", 3)], None), 0, 0.0),
            Err(RoomError::WrongStatus),
            "not started"
        );
        r.start("host", 0).unwrap();
        assert_eq!(
            r.ballot("ann", ballot(&[("s1", 1)], None), 1, 0.0),
            Err(RoomError::Invalid)
        );
        r.ballot("host", ballot(&[("s1", 3)], Some("s2")), 1, 0.0)
            .unwrap();
        assert_eq!(r.status, Status::Voting);
        r.ballot("ann", ballot(&[("s1", 1), ("s3", 2)], Some("s1")), 2, 0.0)
            .unwrap();
        assert_eq!(r.status, Status::Done);
        assert_eq!(
            r.winner.as_deref(),
            Some("s3"),
            "s1 has the most dots (4) but was vetoed; s3 beats s2 (vetoed)"
        );
        let v = r.view(Some("ann"), 5);
        assert_eq!(v.result.as_ref().unwrap().scores.as_ref().unwrap().len(), 3);
    }

    #[test]
    fn leaving_unblocks_the_round() {
        let mut r = room(Mode::Bracket, 2);
        r.join(person("ann")).unwrap();
        r.join(person("bo")).unwrap();
        r.start("host", 0).unwrap();
        r.vote("host", "s1", 1, 0.0).unwrap();
        r.vote("ann", "s1", 2, 0.0).unwrap();
        assert_eq!(r.status, Status::Voting, "bo has not voted");
        r.leave("bo", 3, 0.0).unwrap();
        assert_eq!(
            r.status,
            Status::Done,
            "with bo gone everybody left has voted: v1 would wait for the deadline"
        );
        assert_eq!(r.winner.as_deref(), Some("s1"));
        assert_eq!(r.people, 2);
    }

    #[test]
    fn a_host_who_leaves_hands_the_room_over_and_an_empty_room_expires() {
        let mut r = room(Mode::Table, 2);
        r.join(person("ann")).unwrap();
        r.join(person("bo")).unwrap();
        r.leave("host", 5, 0.0).unwrap();
        assert_eq!(r.host_id, "ann", "the longest-standing person takes over");
        assert_eq!(r.start("host", 6), Err(RoomError::NotHost));
        r.start("ann", 6).unwrap();
        let mut solo = room(Mode::Table, 2);
        solo.leave("host", 9, 0.0).unwrap();
        assert_eq!((solo.status, solo.finished_at), (Status::Expired, Some(9)));
        assert_eq!(solo.leave("host", 10, 0.0), Err(RoomError::NotParticipant));
    }

    #[test]
    fn an_idle_lobby_expires() {
        let mut r = room(Mode::Table, 2);
        assert_eq!(r.next_alarm(), Some(7_200_000));
        assert!(!r.tick(7_199_999, 0.0));
        assert!(r.tick(7_200_000, 0.0));
        assert_eq!(r.status, Status::Expired);
        assert_eq!(r.start("host", 7_200_001), Err(RoomError::WrongStatus));
        assert_eq!(r.join(person("late")), Err(RoomError::WrongStatus));
    }

    #[test]
    fn the_view_never_shows_who_voted_what_and_marks_my_own_choices() {
        let mut r = room(Mode::Bracket, 2);
        r.join(person("ann")).unwrap();
        r.start("host", 0).unwrap();
        r.vote("host", "s2", 1, 0.0).unwrap();
        let host_view = r.view(Some("host"), 2);
        let ann_view = r.view(Some("ann"), 2);
        assert_eq!(
            host_view.bracket.as_ref().unwrap().my_pick.as_deref(),
            Some("s2")
        );
        assert_eq!(ann_view.bracket.as_ref().unwrap().my_pick, None);
        assert!(
            ann_view
                .participants
                .iter()
                .find(|p| p.id == "host")
                .unwrap()
                .voted,
            "that host voted is visible"
        );
        assert!(
            !ann_view
                .participants
                .iter()
                .find(|p| p.id == "ann")
                .unwrap()
                .voted
        );
        assert!(host_view.is_host && !ann_view.is_host && ann_view.joined);
        let json = serde_json::to_string(&ann_view).unwrap();
        assert!(
            !json.contains("\"votes\"") && !json.contains("\"picks\""),
            "no tallies in the view"
        );
        let stranger = r.view(Some("nobody"), 2);
        assert!(!stranger.joined && !stranger.is_host);
        assert_eq!(
            stranger.candidates.len(),
            2,
            "a stranger with the code may look at the titles before joining"
        );
    }

    #[test]
    fn versions_move_on_every_change_and_only_then() {
        let mut r = room(Mode::Table, 2);
        let v0 = r.version;
        r.join(person("ann")).unwrap();
        assert_eq!(r.version, v0 + 1);
        let v1 = r.version;
        assert!(!r.tick(1, 0.0));
        assert_eq!(
            r.version, v1,
            "a tick that changes nothing keeps the version (clients stay quiet)"
        );
        r.start("host", 2).unwrap();
        assert!(r.version > v1);
    }

    #[test]
    fn a_room_survives_a_round_trip_through_json() {
        let mut r = room(Mode::Bracket, 5);
        r.join(person("ann")).unwrap();
        r.start("host", 0).unwrap();
        r.vote("ann", "s4", 1, 0.0).unwrap();
        let back: Room = serde_json::from_str(&serde_json::to_string(&r).unwrap()).unwrap();
        assert_eq!(back.version, r.version);
        assert_eq!(back.picks, r.picks);
        assert_eq!(back.engine, r.engine);
        assert_eq!(back.status, Status::Voting);
    }
}
