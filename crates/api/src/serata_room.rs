//! The Serata room as a Durable Object: one object per room code. All rules live in `pausa_core::serata::Room`; this file only
//! stores it, runs its alarm (the server closes a round at its deadline), pushes each person their own view over WebSockets, and
//! writes the finished room to D1 once.
//!
//! The Worker authenticates the caller and forwards to the room with `x-user-id`; the room is never reachable from outside.

use crate::http::random;
use pausa_core::dto::{ApiError, ErrorCode};
use pausa_core::serata::{Ballot, Participant, Room, RoomError, Status};
use serde::{Deserialize, Serialize};
use worker::wasm_bindgen::JsValue;
use worker::*;

const KEY: &str = "room";

#[durable_object]
pub struct SerataRoom {
    state: State,
    env: Env,
}

#[derive(Serialize, Deserialize)]
struct Attachment {
    user_id: String,
}

#[derive(Deserialize)]
struct VoteIn {
    #[serde(rename = "mediaId")]
    media_id: String,
}

fn rand01() -> f64 {
    let b = random::<4>();
    f64::from(u32::from_le_bytes(b)) / (f64::from(u32::MAX) + 1.0)
}

fn now_ms() -> i64 {
    Date::now().as_millis() as i64
}

fn error(code: ErrorCode, status: u16) -> Result<Response> {
    Ok(Response::from_json(&ApiError {
        code,
        retry_after: None,
    })?
    .with_status(status))
}

fn room_error(e: RoomError) -> Result<Response> {
    match e {
        RoomError::NotHost | RoomError::NotParticipant => error(ErrorCode::Forbidden, 403),
        RoomError::WrongStatus | RoomError::Full => error(ErrorCode::Conflict, 409),
        RoomError::Invalid => error(ErrorCode::Invalid, 400),
    }
}

impl SerataRoom {
    async fn load(&self) -> Result<Option<Room>> {
        self.state.storage().get::<Room>(KEY).await
    }

    /// Stores the room, sets the next alarm, tells everybody connected, and writes a finished room to D1 (once).
    async fn commit(&self, room: &mut Room) -> Result<()> {
        if matches!(room.status, Status::Done | Status::Expired) && !room.persisted {
            if self.write_result(room).await.is_ok() {
                room.persisted = true;
            } else {
                console_error!(
                    "serata {}: could not write the result to D1, will retry on the next alarm",
                    room.code
                );
            }
        }
        self.state.storage().put(KEY, &*room).await?;
        match room.next_alarm() {
            Some(at) => {
                self.state
                    .storage()
                    .set_alarm((at - now_ms()).max(1))
                    .await?
            }
            None if !room.persisted => self.state.storage().set_alarm(5_000_i64).await?, // retry the D1 write
            None => self.state.storage().delete_alarm().await?,
        }
        self.broadcast(room);
        Ok(())
    }

    fn broadcast(&self, room: &Room) {
        let now = now_ms();
        for ws in self.state.get_websockets() {
            let uid = ws
                .deserialize_attachment::<Attachment>()
                .ok()
                .flatten()
                .map(|a| a.user_id);
            let view = room.view(uid.as_deref(), now);
            if let Ok(json) = serde_json::to_string(&view) {
                let _ = ws.send_with_str(json);
            }
        }
    }

    /// The finished room becomes history: status, winner, result, and who took part (names as they were that night).
    async fn write_result(&self, room: &Room) -> Result<()> {
        let db = self.env.d1("DB")?;
        let status = match room.status {
            Status::Done => "done",
            _ => "expired",
        };
        let finished = room.finished_at.unwrap_or_else(now_ms) as f64;
        let winner: JsValue = room.winner.as_deref().map_or(JsValue::NULL, JsValue::from);
        let mut stmts = vec![db
            .prepare("UPDATE serata SET status = ?2, winner_media_id = ?3, result = ?4, finished_at = ?5, host_id = ?6 WHERE id = ?1")
            .bind(&[room.serata_id.as_str().into(), status.into(), winner, room.result_json().to_string().into(), finished.into(), room.host_id.as_str().into()])?];
        for p in &room.participants {
            stmts.push(
                db.prepare(
                    "INSERT OR IGNORE INTO serata_participant(serata_id, user_id, name, is_guest, joined_at) SELECT ?1, id, ?3, ?4, ?5 FROM user WHERE id = ?2",
                )
                .bind(&[room.serata_id.as_str().into(), p.user_id.as_str().into(), p.name.as_str().into(), (i64::from(p.is_guest) as f64).into(), finished.into()])?,
            );
        }
        db.batch(stmts).await?;
        Ok(())
    }

    fn viewer(req: &Request) -> Option<String> {
        req.headers()
            .get("x-user-id")
            .ok()
            .flatten()
            .filter(|s| !s.is_empty())
    }
}

impl DurableObject for SerataRoom {
    fn new(state: State, env: Env) -> Self {
        Self { state, env }
    }

    async fn fetch(&self, mut req: Request) -> Result<Response> {
        let op = req.path().rsplit('/').next().unwrap_or("").to_string();
        let user = Self::viewer(&req);

        if op == "init" {
            if self.load().await?.is_some() {
                return error(ErrorCode::Conflict, 409);
            }
            let mut room: Room = req.json().await?;
            self.commit(&mut room).await?;
            return Response::ok("ok");
        }
        let Some(mut room) = self.load().await? else {
            return error(ErrorCode::NotFound, 404);
        };
        let now = now_ms();

        match op.as_str() {
            "state" => return Response::from_json(&room.view(user.as_deref(), now)),
            "ws" => {
                if req.headers().get("upgrade")?.as_deref() != Some("websocket") {
                    return error(ErrorCode::Invalid, 400);
                }
                let pair = WebSocketPair::new()?;
                self.state.accept_web_socket(&pair.server);
                pair.server.serialize_attachment(Attachment {
                    user_id: user.clone().unwrap_or_default(),
                })?;
                pair.server
                    .send_with_str(serde_json::to_string(&room.view(user.as_deref(), now))?)?;
                return Response::from_websocket(pair.client);
            }
            _ => {}
        }

        let Some(me) = user else {
            return error(ErrorCode::Unauthorized, 401);
        };
        let outcome: std::result::Result<(), RoomError> = match op.as_str() {
            "join" => {
                let p: Participant = req.json().await?;
                if p.user_id != me {
                    return error(ErrorCode::Forbidden, 403);
                }
                room.join(p)
            }
            "leave" => room.leave(&me, now, rand01()),
            "start" => room.start(&me, now),
            "force" => room.force(&me, now, rand01()),
            "vote" => {
                let v: VoteIn = req.json().await?;
                room.vote(&me, &v.media_id, now, rand01())
            }
            "ballot" => {
                let b: Ballot = req.json().await?;
                room.ballot(&me, b, now, rand01())
            }
            _ => return error(ErrorCode::NotFound, 404),
        };
        // Even a refused vote can have closed a round (a late one does): always store what the room became.
        self.commit(&mut room).await?;
        match outcome {
            Ok(()) => Response::from_json(&room.view(Some(&me), now_ms())),
            Err(e) => room_error(e),
        }
    }

    async fn alarm(&self) -> Result<Response> {
        let Some(mut room) = self.load().await? else {
            return Response::ok("gone");
        };
        room.tick(now_ms(), rand01());
        self.commit(&mut room).await?;
        Response::ok("ok")
    }

    async fn websocket_message(
        &self,
        ws: WebSocket,
        message: WebSocketIncomingMessage,
    ) -> Result<()> {
        // Clients only listen; a text "ping" is answered so they can tell the line is alive. Anything else is ignored.
        if let WebSocketIncomingMessage::String(s) = message {
            if s == "ping" {
                let _ = ws.send_with_str("pong");
            }
        }
        Ok(())
    }

    async fn websocket_close(
        &self,
        ws: WebSocket,
        code: usize,
        _reason: String,
        _was_clean: bool,
    ) -> Result<()> {
        let code = if (1000..5000).contains(&code) && code != 1005 && code != 1006 {
            Some(code as u16)
        } else {
            Some(1000)
        };
        let _ = ws.close(code, Some("bye"));
        Ok(())
    }

    async fn websocket_error(&self, _ws: WebSocket, _error: Error) -> Result<()> {
        Ok(())
    }
}
