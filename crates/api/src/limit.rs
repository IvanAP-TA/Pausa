//! Rate limit counters in D1: one atomic statement per check (`pausa_core::limits::hit` is its reference).

use crate::http::{now_ms, Fail, R};
use pausa_core::limits::Rule;
use serde::Deserialize;
use worker::*;

#[derive(Deserialize)]
struct Row {
    count: i64,
    window_start: i64,
}

/// Counts one hit on `key` and fails with 429 when the rule is exceeded. A refused hit stays at `max + 1`.
pub async fn check(db: &D1Database, key: &str, rule: Rule) -> R<()> {
    let now = now_ms();
    let row = db
        .prepare(
            "INSERT INTO rate_limit(key, count, window_start) VALUES (?1, 1, ?2) \
             ON CONFLICT(key) DO UPDATE SET \
               count = CASE WHEN ?2 - window_start >= ?3 THEN 1 WHEN count > ?4 THEN count ELSE count + 1 END, \
               window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END \
             RETURNING count, window_start",
        )
        .bind(&[key.into(), (now as f64).into(), (rule.window_ms as f64).into(), (rule.max as f64).into()])?
        .first::<Row>(None)
        .await?
        .ok_or_else(Fail::internal)?;
    if row.count > rule.max {
        let left = (row.window_start + rule.window_ms - now).max(0);
        return Err(Fail::rate_limited(((left + 999) / 1000) as u32));
    }
    Ok(())
}
