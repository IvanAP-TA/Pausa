//! Lists: watchlist, ordinary lists and rankings, personal or shared with a Cerchia.

use crate::diary::{locale_of, num, query_param};
use crate::http::{body, finish, json, new_id, no_content, now_ms, Fail, R};
use crate::{catalog, session};
use pausa_core::catalog::Key;
use pausa_core::dto::{
    ErrorCode, IdOnly, ListDetail, ListItemAdded, ListItemDto, ListSummary, MediaDto, PersonDto,
};
use pausa_core::lists::{
    access, clean_description, clean_name, clean_note, valid_order, Access, Kind, MAX_ITEMS,
    MAX_PRIORITY,
};
use serde::Deserialize;
use worker::wasm_bindgen::JsValue;
use worker::*;

/// The columns of a list summary. `loc` is the placeholder (like `?3`) that carries the locale for the strip's titles.
fn summary_cols(loc: &str) -> String {
    format!(
        "l.id, l.name, l.kind, l.description, l.circle_id, l.owner_id,     (SELECT name FROM user WHERE id = l.owner_id) AS owner_name,     (SELECT COUNT(*) FROM list_item WHERE list_id = l.id) AS items,     (SELECT group_concat(poster_path, '|') FROM (SELECT e.poster_path FROM list_item i JOIN media_entity e ON e.id = i.media_id        WHERE i.list_id = l.id AND e.poster_path IS NOT NULL ORDER BY i.position LIMIT 4)) AS posters,     (SELECT json_group_array(json_object('id', id, 'title', title, 'posterPath', poster_path)) FROM        (SELECT e.id AS id, COALESCE(mt.title, e.original_title) AS title, e.poster_path AS poster_path FROM list_item i           JOIN media_entity e ON e.id = i.media_id LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = {loc}         WHERE i.list_id = l.id ORDER BY i.position, i.added_at LIMIT 8)) AS strip"
    )
}

#[derive(Deserialize)]
struct SummaryRow {
    id: String,
    name: String,
    kind: String,
    description: Option<String>,
    circle_id: Option<String>,
    owner_id: String,
    owner_name: Option<String>,
    items: i64,
    posters: Option<String>,
    strip: Option<String>,
}

impl SummaryRow {
    fn dto(self) -> ListSummary {
        ListSummary {
            id: self.id,
            name: self.name,
            kind: self.kind,
            description: self.description,
            circle_id: self.circle_id,
            owner_id: self.owner_id,
            owner_name: self.owner_name.unwrap_or_default(),
            items: self.items as u32,
            posters: self
                .posters
                .map(|p| p.split('|').map(str::to_string).collect())
                .unwrap_or_default(),
            strip: self
                .strip
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
        }
    }
}

/// `GET /api/lists?circle=<id>`: my personal lists, and that Cerchia's lists when `circle` is given (members only).
pub async fn overview(req: Request, env: Env) -> Result<Response> {
    finish(overview_inner(&req, &env).await)
}

async fn overview_inner(req: &Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let circle = query_param(req, "circle");
    if let Some(c) = &circle {
        crate::manage::my_role(&db, c, &s.user_id).await?;
    }
    let rows = db
        .prepare(format!(
            "SELECT {} FROM list l WHERE (l.circle_id IS NULL AND l.owner_id = ?1) OR (l.circle_id IS NOT NULL AND l.circle_id = ?2) \
             ORDER BY (l.circle_id IS NOT NULL), CASE l.kind WHEN 'watchlist' THEN 0 ELSE 1 END, l.created_at DESC LIMIT 200",
            summary_cols("?3")
        ))
        .bind(&[
            s.user_id.as_str().into(),
            circle.as_deref().map_or(JsValue::NULL, JsValue::from),
            catalog::locale_code(locale_of(req)).into(),
        ])?
        .all()
        .await?
        .results::<SummaryRow>()?;
    json(
        &rows.into_iter().map(SummaryRow::dto).collect::<Vec<_>>(),
        200,
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateIn {
    name: String,
    kind: Option<String>,
    description: Option<String>,
    circle_id: Option<String>,
}

/// `POST /api/lists {name, kind?, description?, circleId?}`: personal unless `circleId` names a Cerchia I am in.
pub async fn create(mut req: Request, env: Env) -> Result<Response> {
    finish(create_inner(&mut req, &env).await)
}

async fn create_inner(req: &mut Request, env: &Env) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    let input: CreateIn = body(req).await?;
    let name = clean_name(&input.name).ok_or_else(Fail::invalid)?;
    let description = match input.description.as_deref() {
        Some(d) => clean_description(d).ok_or_else(Fail::invalid)?,
        None => None,
    };
    if let Some(c) = &input.circle_id {
        crate::manage::my_role(&db, c, &s.user_id).await?;
    }
    let id = new_id();
    db.prepare("INSERT INTO list(id, circle_id, owner_id, kind, name, description, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
        .bind(&[
            id.as_str().into(),
            input.circle_id.as_deref().map_or(JsValue::NULL, JsValue::from),
            s.user_id.as_str().into(),
            Kind::parse_lenient(input.kind.as_deref()).as_str().into(),
            name.into(),
            description.map_or(JsValue::NULL, JsValue::from),
            num(now_ms()),
        ])?
        .run()
        .await?;
    json(&IdOnly { id }, 201)
}

#[derive(Deserialize)]
struct CtxRow {
    owner_id: String,
    circle_id: Option<String>,
    my_role: Option<String>,
}

/// What I may do with a list, or 404 (a list I cannot see does not exist).
async fn context(db: &D1Database, list_id: &str, user_id: &str) -> R<Access> {
    let row = db
        .prepare(
            "SELECT l.owner_id, l.circle_id, (SELECT role FROM circle_member WHERE circle_id = l.circle_id AND user_id = ?2) AS my_role FROM list l WHERE l.id = ?1",
        )
        .bind(&[list_id.into(), user_id.into()])?
        .first::<CtxRow>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    let manage = matches!(row.my_role.as_deref(), Some("owner" | "admin"));
    access(
        row.circle_id.as_deref(),
        &row.owner_id,
        user_id,
        row.my_role.is_some(),
        manage,
    )
    .ok_or_else(Fail::not_found)
}

#[derive(Deserialize)]
struct ItemRow {
    id: String,
    kind: String,
    original_title: String,
    loc_title: Option<String>,
    year: Option<i64>,
    poster_path: Option<String>,
    note: Option<String>,
    priority: i64,
    position: i64,
    by_id: Option<String>,
    by_name: Option<String>,
    by_image: Option<String>,
}

/// `GET /api/lists/:id`: the list with its titles in order.
pub async fn detail(req: Request, env: Env, list_id: &str) -> Result<Response> {
    finish(detail_inner(&req, &env, list_id).await)
}

async fn detail_inner(req: &Request, env: &Env, list_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    let acc = context(&db, list_id, &s.user_id).await?;
    let loc = catalog::locale_code(locale_of(req));
    let res = db
        .batch(vec![
            db.prepare(format!("SELECT {} FROM list l WHERE l.id = ?1", summary_cols("?2"))).bind(&[list_id.into(), loc.into()])?,
            db.prepare(
                "SELECT e.id, e.kind, e.original_title, mt.title AS loc_title, e.year, e.poster_path, i.note, i.priority, i.position, \
                   u.id AS by_id, u.name AS by_name, u.image AS by_image FROM list_item i JOIN media_entity e ON e.id = i.media_id \
                   LEFT JOIN media_title mt ON mt.media_id = e.id AND mt.locale = ?2 LEFT JOIN user u ON u.id = i.added_by \
                 WHERE i.list_id = ?1 ORDER BY i.position, i.added_at",
            )
            .bind(&[list_id.into(), loc.into()])?,
        ])
        .await?;
    let list = res[0]
        .results::<SummaryRow>()?
        .into_iter()
        .next()
        .ok_or_else(Fail::not_found)?
        .dto();
    let items = res[1]
        .results::<ItemRow>()?
        .into_iter()
        .map(|r| ListItemDto {
            media: MediaDto {
                id: r.id,
                kind: r.kind,
                title: r.loc_title.unwrap_or(r.original_title),
                year: r.year,
                poster_path: r.poster_path,
            },
            note: r.note,
            priority: r.priority,
            added_by: r.by_id.map(|id| PersonDto {
                id,
                name: r.by_name.unwrap_or_default(),
                image: r.by_image,
            }),
            position: r.position,
        })
        .collect();
    json(
        &ListDetail {
            list,
            can_edit: acc.can_edit,
            can_delete: acc.can_delete,
            items,
        },
        200,
    )
}

#[derive(Deserialize)]
struct RenameIn {
    name: Option<String>,
    description: Option<String>,
}

/// `PATCH /api/lists/:id {name?, description?}`. Any member for a group list.
pub async fn update(mut req: Request, env: Env, list_id: &str) -> Result<Response> {
    finish(update_inner(&mut req, &env, list_id).await)
}

async fn update_inner(req: &mut Request, env: &Env, list_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    context(&db, list_id, &s.user_id).await?;
    let input: RenameIn = body(req).await?;
    let mut sets = Vec::new();
    let mut args: Vec<JsValue> = vec![list_id.into()];
    if let Some(n) = &input.name {
        args.push(clean_name(n).ok_or_else(Fail::invalid)?.into());
        sets.push("name");
    }
    if let Some(d) = &input.description {
        args.push(
            clean_description(d)
                .ok_or_else(Fail::invalid)?
                .map_or(JsValue::NULL, JsValue::from),
        );
        sets.push("description");
    }
    if sets.is_empty() {
        return Err(Fail::invalid());
    }
    let assignments: Vec<String> = sets
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{c} = ?{}", i + 2))
        .collect();
    db.prepare(format!(
        "UPDATE list SET {} WHERE id = ?1",
        assignments.join(", ")
    ))
    .bind(&args)?
    .run()
    .await?;
    no_content()
}

/// `DELETE /api/lists/:id`: the owner, or a manager of the Cerchia for a group list.
pub async fn delete(req: Request, env: Env, list_id: &str) -> Result<Response> {
    finish(delete_inner(&req, &env, list_id).await)
}

async fn delete_inner(req: &Request, env: &Env, list_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if !context(&db, list_id, &s.user_id).await?.can_delete {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    db.prepare("DELETE FROM list WHERE id = ?1")
        .bind(&[list_id.into()])?
        .run()
        .await?;
    no_content()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddIn {
    /// A search result's key (the title is created on first use) ...
    media_key: Option<String>,
    /// ... or a title Pausa already has.
    media_id: Option<String>,
    note: Option<String>,
    priority: Option<i64>,
}

#[derive(Deserialize)]
struct CountRow {
    n: i64,
    next: i64,
}

/// `POST /api/lists/:id/items {mediaKey | mediaId, note?, priority?}`: appends a title (once per list; again is fine).
pub async fn add_item(mut req: Request, env: Env, list_id: &str) -> Result<Response> {
    finish(add_item_inner(&mut req, &env, list_id).await)
}

async fn add_item_inner(req: &mut Request, env: &Env, list_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    context(&db, list_id, &s.user_id).await?;
    let input: AddIn = body(req).await?;
    let note = match input.note.as_deref() {
        Some(n) => clean_note(n).ok_or_else(Fail::invalid)?,
        None => None,
    };
    if input
        .priority
        .is_some_and(|p| !(0..=MAX_PRIORITY).contains(&p))
    {
        return Err(Fail::invalid());
    }
    let count = db
        .prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position) + 1, 0) AS next FROM list_item WHERE list_id = ?1")
        .bind(&[list_id.into()])?
        .first::<CountRow>(None)
        .await?
        .ok_or_else(Fail::internal)?;
    if count.n as usize >= MAX_ITEMS {
        return Err(Fail::new(ErrorCode::Conflict, 409));
    }
    let locale = locale_of(req);
    let media_id = match (&input.media_id, &input.media_key) {
        (Some(id), _) => Key::Local(id.clone()),
        (None, Some(k)) => Key::parse(k).ok_or_else(Fail::invalid)?,
        _ => return Err(Fail::invalid()),
    };
    let media_id = catalog::resolve(env, &db, &s.user_id, &media_id, locale).await?;
    let res = db
        .prepare("INSERT OR IGNORE INTO list_item(list_id, media_id, position, added_by, note, priority, added_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
        .bind(&[
            list_id.into(),
            media_id.as_str().into(),
            num(count.next),
            s.user_id.as_str().into(),
            note.map_or(JsValue::NULL, JsValue::from),
            num(input.priority.unwrap_or(0)),
            num(now_ms()),
        ])?
        .run()
        .await?;
    let added = res.meta()?.and_then(|m| m.changes).unwrap_or(0) == 1;
    json(
        &ListItemAdded { media_id, added },
        if added { 201 } else { 200 },
    )
}

#[derive(Deserialize)]
struct ItemPatch {
    note: Option<String>,
    priority: Option<i64>,
}

/// `PATCH /api/lists/:id/items/:mediaId {note?, priority?}`.
pub async fn edit_item(
    mut req: Request,
    env: Env,
    list_id: &str,
    media_id: &str,
) -> Result<Response> {
    finish(edit_item_inner(&mut req, &env, list_id, media_id).await)
}

async fn edit_item_inner(
    req: &mut Request,
    env: &Env,
    list_id: &str,
    media_id: &str,
) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    context(&db, list_id, &s.user_id).await?;
    let input: ItemPatch = body(req).await?;
    let mut sets = Vec::new();
    let mut args: Vec<JsValue> = vec![list_id.into(), media_id.into()];
    if let Some(n) = &input.note {
        args.push(
            clean_note(n)
                .ok_or_else(Fail::invalid)?
                .map_or(JsValue::NULL, JsValue::from),
        );
        sets.push("note");
    }
    if let Some(p) = input.priority {
        if !(0..=MAX_PRIORITY).contains(&p) {
            return Err(Fail::invalid());
        }
        args.push(num(p));
        sets.push("priority");
    }
    if sets.is_empty() {
        return Err(Fail::invalid());
    }
    let assignments: Vec<String> = sets
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{c} = ?{}", i + 3))
        .collect();
    let res = db
        .prepare(format!(
            "UPDATE list_item SET {} WHERE list_id = ?1 AND media_id = ?2",
            assignments.join(", ")
        ))
        .bind(&args)?
        .run()
        .await?;
    if res.meta()?.and_then(|m| m.changes).unwrap_or(0) == 0 {
        return Err(Fail::not_found());
    }
    no_content()
}

/// `DELETE /api/lists/:id/items/:mediaId`: removes it and closes the gap in the positions (one statement).
pub async fn remove_item(
    req: Request,
    env: Env,
    list_id: &str,
    media_id: &str,
) -> Result<Response> {
    finish(remove_item_inner(&req, &env, list_id, media_id).await)
}

async fn remove_item_inner(req: &Request, env: &Env, list_id: &str, media_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    context(&db, list_id, &s.user_id).await?;
    db.batch(vec![
        db.prepare("DELETE FROM list_item WHERE list_id = ?1 AND media_id = ?2").bind(&[list_id.into(), media_id.into()])?,
        db.prepare(
            "UPDATE list_item SET position = (SELECT COUNT(*) FROM list_item i2 WHERE i2.list_id = list_item.list_id AND i2.position < list_item.position) WHERE list_id = ?1",
        )
        .bind(&[list_id.into()])?,
    ])
    .await?;
    no_content()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderIn {
    media_ids: Vec<String>,
}

#[derive(Deserialize)]
struct MediaIdRow {
    media_id: String,
}

/// `PUT /api/lists/:id/order {mediaIds}`: the whole order at once (drag and drop), not step by step as in v1. Must name exactly
/// the titles the list holds.
pub async fn reorder(mut req: Request, env: Env, list_id: &str) -> Result<Response> {
    finish(reorder_inner(&mut req, &env, list_id).await)
}

async fn reorder_inner(req: &mut Request, env: &Env, list_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    context(&db, list_id, &s.user_id).await?;
    let input: OrderIn = body(req).await?;
    let current: Vec<String> = db
        .prepare("SELECT media_id FROM list_item WHERE list_id = ?1")
        .bind(&[list_id.into()])?
        .all()
        .await?
        .results::<MediaIdRow>()?
        .into_iter()
        .map(|r| r.media_id)
        .collect();
    if !valid_order(&current, &input.media_ids) {
        return Err(Fail::invalid());
    }
    let mut stmts = Vec::with_capacity(input.media_ids.len());
    for (i, m) in input.media_ids.iter().enumerate() {
        stmts.push(
            db.prepare("UPDATE list_item SET position = ?3 WHERE list_id = ?1 AND media_id = ?2")
                .bind(&[list_id.into(), m.as_str().into(), num(i as i64)])?,
        );
    }
    if !stmts.is_empty() {
        db.batch(stmts).await?;
    }
    no_content()
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DuplicateIn {
    name: Option<String>,
    /// Copy into this Cerchia (I must be a member); absent = a personal copy.
    circle_id: Option<String>,
}

/// `POST /api/lists/:id/duplicate {name?, circleId?}`: a copy I own, with the titles, notes and order.
pub async fn duplicate(mut req: Request, env: Env, list_id: &str) -> Result<Response> {
    finish(duplicate_inner(&mut req, &env, list_id).await)
}

#[derive(Deserialize)]
struct NameKind {
    name: String,
    kind: String,
    description: Option<String>,
}

async fn duplicate_inner(req: &mut Request, env: &Env, list_id: &str) -> R<Response> {
    let db = env.d1("DB")?;
    let s = session::require(req, &db).await?;
    if s.is_anonymous {
        return Err(Fail::new(ErrorCode::Forbidden, 403));
    }
    context(&db, list_id, &s.user_id).await?;
    let input: DuplicateIn = body(req).await.unwrap_or_default();
    if let Some(c) = &input.circle_id {
        crate::manage::my_role(&db, c, &s.user_id).await?;
    }
    let src = db
        .prepare("SELECT name, kind, description FROM list WHERE id = ?1")
        .bind(&[list_id.into()])?
        .first::<NameKind>(None)
        .await?
        .ok_or_else(Fail::not_found)?;
    let name = match input.name.as_deref() {
        Some(n) => clean_name(n).ok_or_else(Fail::invalid)?,
        None => clean_name(&format!("{} (copia)", src.name)).unwrap_or(src.name.clone()),
    };
    let id = new_id();
    let now = now_ms();
    db.batch(vec![
        db.prepare("INSERT INTO list(id, circle_id, owner_id, kind, name, description, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(&[
            id.as_str().into(),
            input.circle_id.as_deref().map_or(JsValue::NULL, JsValue::from),
            s.user_id.as_str().into(),
            src.kind.into(),
            name.into(),
            src.description.map_or(JsValue::NULL, JsValue::from),
            num(now),
        ])?,
        db.prepare(
            "INSERT INTO list_item(list_id, media_id, position, added_by, note, priority, added_at) \
             SELECT ?1, media_id, position, ?3, note, priority, ?4 FROM list_item WHERE list_id = ?2",
        )
        .bind(&[id.as_str().into(), list_id.into(), s.user_id.as_str().into(), num(now)])?,
    ])
    .await?;
    json(&IdOnly { id }, 201)
}
