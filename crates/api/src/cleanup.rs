//! Daily housekeeping (cron trigger). One batch, no per-row work in the Worker.

use crate::http::now_ms;
use worker::*;

const DAY_MS: i64 = 86_400_000;

/// Expired sessions and sign-in tokens, stale rate-limit counters, and anonymous guest accounts older than 30 days
/// (a guest only exists to join one Serata; their rows cascade).
pub async fn run(env: &Env) -> Result<()> {
    let db = env.d1("DB")?;
    let now = now_ms() as f64;
    let day = DAY_MS as f64;
    db.batch(vec![
        db.prepare("DELETE FROM session WHERE expires_at < ?1")
            .bind(&[now.into()])?,
        db.prepare("DELETE FROM login_token WHERE expires_at < ?1")
            .bind(&[(now - day).into()])?,
        db.prepare("DELETE FROM rate_limit WHERE window_start < ?1")
            .bind(&[(now - 2.0 * day).into()])?,
        // Old notifications nobody pushed (no device, or the job was down): stop them from lingering in the partial index.
        db.prepare("UPDATE notification SET pushed_at = created_at WHERE pushed_at IS NULL AND created_at < ?1")
            .bind(&[(now - 2.0 * 3_600_000.0).into()])?,
        db.prepare("DELETE FROM user WHERE is_anonymous = 1 AND created_at < ?1")
            .bind(&[(now - 30.0 * day).into()])?,
    ])
    .await?;
    Ok(())
}
