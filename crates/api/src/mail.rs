//! Transactional email through Resend (free plan: 100/day, 3 000/month: sign-in links come first, see BUDGET.md §3).

use pausa_core::dto::Locale;
use serde_json::json;
use worker::*;

/// Subject and plain-text body of the sign-in email, same tone as the app ("tu", direct).
pub fn magic_link_text(locale: Locale, link: &str) -> (String, String) {
    match locale {
        Locale::It => (
            "Il tuo link per entrare in Pausa".into(),
            format!("Apri questo link per entrare in Pausa. Vale 15 minuti e si usa una volta sola:\n\n{link}\n\nSe non l'hai chiesto tu, ignora questa email."),
        ),
        Locale::En => (
            "Your link to sign in to Pausa".into(),
            format!("Open this link to sign in to Pausa. It works once and expires in 15 minutes:\n\n{link}\n\nIf you didn't ask for it, ignore this email."),
        ),
        Locale::Es => (
            "Tu enlace para entrar en Pausa".into(),
            format!("Abre este enlace para entrar en Pausa. Vale 15 minutos y se usa una sola vez:\n\n{link}\n\nSi no lo pediste tú, ignora este correo."),
        ),
    }
}

/// Subject and body of the email that confirms a new sign-in address.
pub fn email_change_text(locale: Locale, link: &str) -> (String, String) {
    match locale {
        Locale::It => (
            "Conferma il nuovo indirizzo di Pausa".into(),
            format!("Apri questo link, dal dispositivo dove sei già dentro, per usare questo indirizzo per entrare in Pausa. Vale 15 minuti e si usa una volta sola:

{link}

Se non l'hai chiesto tu, ignora questa email: nulla cambia."),
        ),
        Locale::En => (
            "Confirm your new Pausa address".into(),
            format!("Open this link, on the device where you are already signed in, to use this address to sign in to Pausa. It works once and expires in 15 minutes:

{link}

If you didn't ask for it, ignore this email: nothing changes."),
        ),
        Locale::Es => (
            "Confirma tu nueva dirección de Pausa".into(),
            format!("Abre este enlace, desde el dispositivo donde ya has entrado, para usar esta dirección al entrar en Pausa. Vale 15 minutos y se usa una sola vez:

{link}

Si no lo pediste tú, ignora este correo: no cambia nada."),
        ),
    }
}

/// Sends one email. Errors are logged, never shown to the person: whether an address exists must not leak.
pub async fn send(env: &Env, to: &str, subject: &str, text: &str) -> Result<()> {
    let key = env.secret("RESEND_API_KEY")?.to_string();
    let from = env.var("EMAIL_FROM")?.to_string();
    let headers = Headers::new();
    headers.set("Authorization", &format!("Bearer {key}"))?;
    headers.set("Content-Type", "application/json")?;
    let payload = json!({ "from": from, "to": [to], "subject": subject, "text": text }).to_string();
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(payload.into()));
    let req = Request::new_with_init("https://api.resend.com/emails", &init)?;
    let res = Fetch::Request(req).send().await?;
    if res.status_code() >= 300 {
        console_error!("resend answered {}", res.status_code());
        return Err(Error::RustError("email provider refused".into()));
    }
    Ok(())
}
