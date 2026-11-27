//! Pausa API: one Cloudflare Worker (workers-rs).
//!
//! Rules (docs/rebuild/BUDGET.md §2): at most one D1 `batch()` per phase of a request, no UI or image rendering here, small
//! paginated JSON, no slow hashes. Authentication is a lookup of `SHA-256(token)`; see `session.rs`.

mod account;
mod achievements;
mod admin;
mod auth;
mod catalog;
mod circles;
mod cleanup;
mod diary;
mod email_change;
mod foryou;
mod google_oauth;
mod http;
mod imports;
mod limit;
mod lists;
mod mail;
mod manage;
mod media;
mod native_shell;
mod people_catalog;
mod profile;
mod push;
mod review;
mod serata;
mod serata_room;
mod session;
mod social;
mod stats;
mod streaming;
mod webpush;

use http::{finish, Fail};
use worker::*;

#[event(scheduled)]
pub async fn scheduled(event: ScheduledEvent, env: Env, _ctx: ScheduleContext) {
    // Four triggers (wrangler.jsonc): every minute (push), every hour (leaderboard), 17:00 UTC (email digest), 03:17 UTC (housekeeping).
    let result = match event.cron().as_str() {
        "* * * * *" => push::run_push(&env).await,
        "0 17 * * *" => push::run_digest(&env).await,
        "0 * * * *" => achievements::recompute(&env).await,
        _ => cleanup::run(&env).await,
    };
    if let Err(e) = result {
        console_error!("scheduled job {} failed: {e}", event.cron());
    }
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let origin = req.headers().get("origin").ok().flatten();
    let allowed = http::cors_allowed(&env, origin.as_deref());
    if let (Method::Options, Some(o)) = (req.method(), &allowed) {
        return http::preflight(o);
    }
    let (method, path) = (req.method().to_string(), req.path());
    let res = match route(req, env.clone()).await {
        Ok(mut res) => {
            if res.status_code() >= 500 {
                let detail = res.headers().get(http::ERROR_HEADER).ok().flatten();
                let _ = res.headers_mut().delete(http::ERROR_HEADER);
                http::report(
                    &env,
                    &method,
                    &path,
                    detail.as_deref().unwrap_or("internal error"),
                )
                .await;
            }
            res
        }
        // An error no handler turned into the contract (a `?` in the router itself): still a JSON 500, and reported.
        Err(e) => {
            http::report(&env, &method, &path, &e.to_string()).await;
            http::finish(Err(http::Fail::internal()))?
        }
    };
    let res = http::with_security(res);
    Ok(match allowed {
        Some(o) => http::with_cors(res, &o),
        None => res,
    })
}

async fn route(req: Request, env: Env) -> Result<Response> {
    let path = req.path();
    let method = req.method();
    let segs: Vec<&str> = path.trim_matches('/').split('/').collect();
    match (method, segs.as_slice()) {
        (Method::Get, ["api", "health"]) => Response::ok("ok"),
        (Method::Get, ["api", "health", "db"]) => {
            let db = env.d1("DB")?;
            let row = db
                .prepare("SELECT 1 AS ok")
                .first::<serde_json::Value>(None)
                .await?;
            Response::from_json(&serde_json::json!({ "db": row.is_some() }))
        }
        (Method::Get, ["api", "me"]) => circles::me(req, env).await,

        (Method::Post, ["api", "auth", "magic-link"]) => auth::request_link(req, env).await,
        (Method::Get, ["api", "auth", "magic-link", "verify"]) => auth::verify_link(req, env).await,
        (Method::Get, ["api", "auth", "google", "status"]) => google_oauth::status(req, env),
        (Method::Get, ["api", "auth", "google", "start"]) => google_oauth::start(req, env).await,
        (Method::Get, ["api", "auth", "callback", "google"]) => {
            google_oauth::callback(req, env).await
        }
        (Method::Post, ["api", "auth", "guest"]) => auth::guest(req, env).await,
        (Method::Post, ["api", "auth", "logout"]) => auth::logout(req, env).await,
        (Method::Post, ["api", "auth", "native", "code"]) => auth::native_code(req, env).await,
        (Method::Post, ["api", "auth", "native", "exchange"]) => {
            auth::native_exchange(req, env).await
        }
        // v1's Tauri shell (still installed on phones): sign-in through the system browser.
        (Method::Get, ["api", "native", "start"]) => native_shell::start(req, env).await,
        (Method::Get, ["api", "native", "done"]) => native_shell::done(req, env).await,
        (Method::Get, ["api", "native", "exchange"]) => native_shell::exchange(req, env).await,

        (Method::Post, ["api", "circles"]) => circles::create(req, env).await,
        (Method::Post, ["api", "circles", "join"]) => circles::join(req, env).await,
        (Method::Get, ["api", "invites", code]) => circles::preview(req, env, code).await,
        (Method::Get, ["api", "circles", id]) => manage::detail(req, env, id).await,
        (Method::Get, ["api", "circles", id, "extras"]) => manage::extras(req, env, id).await,
        (Method::Patch, ["api", "circles", id]) => manage::update(req, env, id).await,
        (Method::Delete, ["api", "circles", id]) => manage::delete(req, env, id).await,
        (Method::Post, ["api", "circles", id, "invites"]) => {
            manage::create_invite(req, env, id).await
        }
        (Method::Post, ["api", "circles", id, "invites", invite, "revoke"]) => {
            manage::revoke_invite(req, env, id, invite).await
        }
        (Method::Put, ["api", "circles", id, "members", user, "role"]) => {
            manage::set_role(req, env, id, user).await
        }
        (Method::Delete, ["api", "circles", id, "members", user]) => {
            manage::remove_member(req, env, id, user).await
        }
        (Method::Post, ["api", "circles", id, "leave"]) => manage::leave(req, env, id).await,
        (Method::Post, ["api", "circles", id, "transfer"]) => manage::transfer(req, env, id).await,

        (Method::Get, ["api", "account", "export"]) => account::export(req, env).await,
        (Method::Delete, ["api", "account"]) => account::delete(req, env).await,
        (Method::Post, ["api", "account", "email"]) => email_change::request(req, env).await,
        (Method::Get, ["api", "account", "email", "confirm"]) => {
            email_change::confirm(req, env).await
        }
        (Method::Get, ["api", "account", "sessions"]) => account::sessions(req, env).await,
        (Method::Delete, ["api", "account", "sessions", id]) => {
            account::revoke_session(req, env, id).await
        }
        (Method::Get, ["api", "media", "search"]) => media::search(req, env).await,
        (Method::Post, ["api", "media", "resolve"]) => media::resolve(req, env).await,
        (Method::Get, ["api", "media", id]) => media::detail(req, env, id).await,
        (Method::Get, ["api", "people", "search"]) => people_catalog::search(req, env).await,
        (Method::Get, ["api", "people", key]) => people_catalog::page(req, env, key).await,
        (Method::Put, ["api", "media", id, "progress"]) => media::set(req, env, id).await,
        (Method::Post, ["api", "media", id, "progress", "advance"]) => {
            media::advance_one(req, env, id).await
        }
        (Method::Delete, ["api", "media", id, "progress"]) => media::clear(req, env, id).await,
        (Method::Get, ["api", "me", "progress"]) => media::list(req, env).await,
        (Method::Get, ["api", "me", "diary"]) => diary::my_diary(req, env).await,
        (Method::Get, ["api", "me", "diary", "counts"]) => diary::my_diary_counts(req, env).await,

        (Method::Post, ["api", "logs"]) => diary::create(req, env).await,
        (Method::Get, ["api", "logs", id]) => diary::get_own(req, env, id).await,
        (Method::Put, ["api", "logs", id]) => diary::update(req, env, id).await,
        (Method::Delete, ["api", "logs", id]) => diary::delete(req, env, id).await,
        (Method::Put, ["api", "logs", id, "shares"]) => diary::set_shares(req, env, id).await,
        (Method::Get, ["api", "circles", id, "feed"]) => diary::feed(req, env, id).await,
        (Method::Get, ["api", "circles", id, "media", media]) => {
            diary::circle_media(req, env, id, media).await
        }
        (Method::Get, ["api", "circles", id, "logs", log]) => {
            diary::thread(req, env, id, log).await
        }
        (Method::Post, ["api", "circles", id, "withdraw"]) => diary::withdraw(req, env, id).await,
        (Method::Post, ["api", "circles", id, "logs", log, "reactions"]) => {
            social::react(req, env, id, log).await
        }
        (Method::Post, ["api", "circles", id, "logs", log, "comments"]) => {
            social::add_comment(req, env, id, log).await
        }
        (Method::Patch, ["api", "comments", id]) => social::edit_comment(req, env, id).await,
        (Method::Delete, ["api", "comments", id]) => social::delete_comment(req, env, id).await,
        (Method::Post, ["api", "reports"]) => social::report(req, env).await,
        (Method::Get, ["api", "admin", "reports"]) => admin::reports(req, env).await,
        (Method::Post, ["api", "admin", "reports", id, "resolve"]) => {
            admin::resolve(req, env, id).await
        }
        (Method::Post, ["api", "admin", "catalog-backfill"]) => {
            admin::catalog_backfill(req, env).await
        }
        (Method::Get, ["api", "admin", "metrics"]) => admin::metrics(req, env).await,
        (Method::Get, ["api", "review"]) => review::status(env).await,
        (Method::Post, ["api", "review", "sign-in"]) => review::sign_in(req, env).await,
        (Method::Get, ["api", "me", "for-you"]) => foryou::for_you(req, env).await,
        (Method::Get, ["api", "providers"]) => streaming::catalogue(req, env).await,
        (Method::Get, ["api", "me", "providers"]) => streaming::mine(req, env).await,
        (Method::Put, ["api", "me", "providers"]) => streaming::save(req, env).await,
        (Method::Get, ["api", "media", id, "availability"]) => {
            streaming::availability(req, env, id).await
        }
        (Method::Get, ["api", "push", "key"]) => webpush::public_key(req, env).await,
        (Method::Post, ["api", "me", "push"]) => push::register(req, env).await,
        (Method::Delete, ["api", "me", "push"]) => push::unregister(req, env).await,
        (Method::Get, ["api", "me", "blocks"]) => admin::blocks(req, env).await,
        (Method::Put, ["api", "me", "blocks", user]) => admin::block(req, env, user).await,
        (Method::Delete, ["api", "me", "blocks", user]) => admin::unblock(req, env, user).await,
        (Method::Get, ["api", "me", "achievements"]) => achievements::mine(req, env).await,
        (Method::Get, ["api", "me", "stats"]) => achievements::stats(req, env).await,
        (Method::Put, ["api", "me", "leaderboard"]) => achievements::join(req, env).await,
        (Method::Delete, ["api", "me", "leaderboard"]) => achievements::leave(req, env).await,
        (Method::Get, ["api", "leaderboard"]) => achievements::board(req, env).await,
        (Method::Get, ["api", "u", handle]) => achievements::public_profile(req, env, handle).await,
        (Method::Get, ["api", "me", "settings"]) => profile::settings(req, env).await,
        (Method::Put, ["api", "me", "settings"]) => profile::save_settings(req, env).await,
        (Method::Put, ["api", "me", "profile"]) => profile::save_profile(req, env).await,
        (Method::Post, ["api", "me", "favorites"]) => profile::add_favorite(req, env).await,
        (Method::Delete, ["api", "me", "favorites", id]) => {
            profile::remove_favorite(req, env, id).await
        }
        (Method::Put, ["api", "circles", id, "me"]) => profile::circle_me(req, env, id).await,
        (Method::Get, ["api", "circles", id, "people", user]) => {
            profile::person(req, env, id, user).await
        }
        (Method::Get, ["api", "notifications"]) => profile::notifications(req, env).await,
        (Method::Post, ["api", "notifications", "read"]) => profile::mark_read(req, env).await,
        (Method::Get, ["api", "lists"]) => lists::overview(req, env).await,
        (Method::Post, ["api", "lists"]) => lists::create(req, env).await,
        (Method::Get, ["api", "lists", id]) => lists::detail(req, env, id).await,
        (Method::Patch, ["api", "lists", id]) => lists::update(req, env, id).await,
        (Method::Delete, ["api", "lists", id]) => lists::delete(req, env, id).await,
        (Method::Post, ["api", "lists", id, "items"]) => lists::add_item(req, env, id).await,
        (Method::Patch, ["api", "lists", id, "items", media]) => {
            lists::edit_item(req, env, id, media).await
        }
        (Method::Delete, ["api", "lists", id, "items", media]) => {
            lists::remove_item(req, env, id, media).await
        }
        (Method::Put, ["api", "lists", id, "order"]) => lists::reorder(req, env, id).await,
        (Method::Post, ["api", "lists", id, "duplicate"]) => lists::duplicate(req, env, id).await,
        (Method::Get, ["api", "circles", id, "ranking"]) => stats::ranking(req, env, id).await,
        (Method::Get, ["api", "circles", id, "insights"]) => stats::insights(req, env, id).await,
        (Method::Get, ["api", "circles", id, "recommendations"]) => {
            stats::recommendations(req, env, id).await
        }
        (Method::Post, ["api", "serate"]) => serata::create(req, env).await,
        (Method::Get, ["api", "serate", code]) => serata::state(req, env, code).await,
        (Method::Get, ["api", "serate", code, "ws"]) => serata::ws(req, env, code).await,
        (Method::Get, ["api", "og", "serata", code]) => serata::og_image(req, env, code).await,
        (Method::Get, ["api", "serate", code, "result"]) => {
            serata::public_result(req, env, code).await
        }
        (Method::Post, ["api", "serate", code, "join"]) => serata::join(req, env, code).await,
        (Method::Post, ["api", "serate", code, "events"]) => serata::event(req, env, code).await,
        (Method::Post, ["api", "serate", code, "repeat"]) => serata::repeat(req, env, code).await,
        (Method::Post, ["api", "serate", code, "watched"]) => serata::watched(req, env, code).await,
        (
            Method::Post,
            ["api", "serate", code, op @ ("start" | "vote" | "ballot" | "force" | "leave")],
        ) => serata::act(req, env, code, op).await,
        (Method::Get, ["api", "circles", id, "serate"]) => serata::history(req, env, id).await,
        (Method::Get, ["api", "circles", id, "serate", "services"]) => {
            serata::services(req, env, id).await
        }
        (Method::Get, ["api", "circles", id, "serate", "suggest"]) => {
            serata::suggest(req, env, id).await
        }
        (Method::Get, ["api", "imports"]) => imports::list(req, env).await,
        (Method::Get, ["api", "imports", "bulk-days"]) => imports::bulk_days(req, env).await,
        (Method::Get, ["api", "imports", "config"]) => imports::config(req, env).await,
        (Method::Post, ["api", "imports", "bulk-days", day, "hide"]) => {
            imports::hide_bulk_day(req, env, day).await
        }
        (Method::Delete, ["api", "imports", "bulk-days", day]) => {
            imports::delete_bulk_day(req, env, day).await
        }
        (Method::Post, ["api", "imports"]) => imports::start(req, env).await,
        (Method::Get, ["api", "imports", id]) => imports::status(req, env, id).await,
        (Method::Delete, ["api", "imports", id]) => imports::delete(req, env, id).await,
        (Method::Post, ["api", "imports", id, "rows"]) => imports::rows(req, env, id).await,
        (Method::Post, ["api", "imports", id, "lists"]) => imports::lists(req, env, id).await,
        (Method::Post, ["api", "imports", id, "finish"]) => {
            imports::finish_batch(req, env, id).await
        }
        (Method::Post, ["api", "imports", id, "remove-from-circle"]) => {
            imports::remove_from_circle(req, env, id).await
        }
        _ => serve_client(req, env).await,
    }
}

/// Everything that is not the API is the web client, which lives in the static assets. Most of it never reaches the Worker (the
/// asset host answers directly); only the routes listed in `run_worker_first` come here: private deep links, which have no file of
/// their own, get the exported shell of their route, and anything unknown is passed on so the asset host gives its real 404 page.
async fn serve_client(req: Request, env: Env) -> Result<Response> {
    let path = req.path();
    if path.starts_with("/api/") || !matches!(req.method(), Method::Get | Method::Head) {
        return finish(Err(Fail::not_found()));
    }
    let Ok(assets) = env.assets("ASSETS") else {
        return finish(Err(Fail::not_found()));
    };
    let mut url = req.url()?;
    // Old app addresses (bookmarks, shared links, installed apps): a permanent redirect to where the page lives now.
    if let Some(to) = pausa_core::shell::legacy_redirect(&path) {
        let target = pausa_core::shell::with_query(&to, url.query());
        let mut res = Response::empty()?.with_status(301);
        res.headers_mut().set("Location", &target)?;
        return Ok(res);
    }
    let shell = pausa_core::shell::shell_path(&path);
    if let Some(shell) = &shell {
        url.set_path(shell);
    }
    let res = assets.fetch(url.to_string(), None).await?;
    // A shared Serata link: the shell is the same file for every room, so the preview tags (title, image) go in here.
    match pausa_core::shell::serata_code(&path) {
        Some((locale, code)) if res.status_code() == 200 => {
            with_serata_preview(res, &env, locale, code).await
        }
        _ => Ok(res),
    }
}

async fn with_serata_preview(
    mut res: Response,
    env: &Env,
    locale: &str,
    code: &str,
) -> Result<Response> {
    let loc = pausa_core::dto::Locale::from_code(locale).unwrap_or(pausa_core::dto::Locale::It);
    let Ok(db) = env.d1("DB") else { return Ok(res) };
    let preview = match serata::preview(&db, code, loc).await {
        Ok(Some(p)) => p,
        _ => return Ok(res),
    };
    let app = env
        .var("APP_URL")
        .map(|v| v.to_string())
        .unwrap_or_default();
    let meta = pausa_og::meta(&preview.card(), locale);
    let image = format!(
        "{app}/api/og/serata/{code}?locale={locale}&s={}",
        preview.state()
    );
    let html = res.text().await?;
    let tags = pausa_core::shell::preview_tags(&meta.title, &meta.description, &image);
    let Some(body) = pausa_core::shell::inject_head(&html, &tags) else {
        return Response::from_html(html);
    };
    let mut out = Response::from_html(body)?;
    // The tags change when the room decides: never cached as a static file.
    out.headers_mut().set("Cache-Control", "no-cache")?;
    Ok(out)
}
