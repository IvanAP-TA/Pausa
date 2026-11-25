//! "Where can we watch it": each person says which streaming services they have, each title says where it streams (TMDB watch
//! providers, data by JustWatch: the client must show the attribution). Pure parts only; the Worker fetches and stores.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// Availability is re-read from TMDB at most once a week per title and country.
pub const AVAILABILITY_TTL_MS: i64 = 7 * 86_400_000;
/// A person can keep at most this many services.
pub const MAX_USER_PROVIDERS: usize = 40;
/// Countries Pausa offers (TMDB watch regions that matter for the three languages and their neighbours).
pub const COUNTRIES: [&str; 15] = [
    "IT", "ES", "GB", "US", "FR", "DE", "PT", "MX", "AR", "CO", "CL", "CH", "IE", "CA", "AU",
];

pub fn is_country(c: &str) -> bool {
    COUNTRIES.contains(&c)
}

pub fn default_country(locale: &str) -> &'static str {
    match locale {
        "es" => "ES",
        "en" => "GB",
        _ => "IT",
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Provider {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    pub logo_path: Option<String>,
}

fn provider(p: &Value) -> Option<Provider> {
    Some(Provider {
        id: p.get("provider_id")?.as_i64()?,
        name: p.get("provider_name")?.as_str()?.to_string(),
        logo_path: p
            .get("logo_path")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

fn priority(p: &Value, country: Option<&str>) -> i64 {
    country
        .and_then(|c| p.get("display_priorities")?.get(c)?.as_i64())
        .or_else(|| p.get("display_priority").and_then(Value::as_i64))
        .unwrap_or(999)
}

/// Flat-rate ("included in a subscription") services for a title in a country, in TMDB's display order.
pub fn parse_watch_providers(json: &Value, country: &str) -> Vec<Provider> {
    let mut list: Vec<&Value> = json["results"][country]["flatrate"]
        .as_array()
        .map(|a| a.iter().collect())
        .unwrap_or_default();
    list.sort_by_key(|p| priority(p, None));
    list.into_iter().filter_map(provider).collect()
}

/// The services worth offering in a country's settings: TMDB's list for that region, most prominent first.
pub fn parse_region_providers(json: &Value, country: &str, limit: usize) -> Vec<Provider> {
    let mut list: Vec<&Value> = json["results"]
        .as_array()
        .map(|a| a.iter().collect())
        .unwrap_or_default();
    list.sort_by_key(|p| priority(p, Some(country)));
    list.into_iter().filter_map(provider).take(limit).collect()
}

/// Which of `mine` carry the title.
pub fn on_my_services(title: &[Provider], mine: &[Provider]) -> Vec<Provider> {
    mine.iter()
        .filter(|m| title.iter().any(|t| t.id == m.id))
        .cloned()
        .collect()
}

/// Services every person who told us theirs has. People who set none are left out (nothing to filter on for them); if nobody set
/// any, there is nothing to filter on.
pub fn common_providers(sets: &[Vec<Provider>]) -> Vec<Provider> {
    let known: Vec<&Vec<Provider>> = sets.iter().filter(|s| !s.is_empty()).collect();
    let Some(first) = known.first() else {
        return Vec::new();
    };
    first
        .iter()
        .filter(|p| known.iter().all(|s| s.iter().any(|q| q.id == p.id)))
        .cloned()
        .collect()
}

/// One clean list from what a client sent: ids unique, names and logo paths bounded, at most [`MAX_USER_PROVIDERS`].
pub fn clean_providers(input: Vec<Provider>) -> Vec<Provider> {
    let mut seen = std::collections::HashSet::new();
    input
        .into_iter()
        .filter(|p| p.id > 0 && !p.name.trim().is_empty() && seen.insert(p.id))
        .map(|p| Provider {
            id: p.id,
            name: p.name.trim().chars().take(60).collect(),
            logo_path: p.logo_path.filter(|l| {
                l.starts_with('/') && !l.starts_with("//") && l.len() <= 80 && !l.contains("..")
            }),
        })
        .take(MAX_USER_PROVIDERS)
        .collect()
}

/// `PUT /api/me/providers` body.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProvidersIn {
    /// ISO country; `null` clears it (and the services).
    pub country: Option<String>,
    pub providers: Vec<Provider>,
}

/// `GET /api/me/providers`.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MyProviders {
    pub country: Option<String>,
    pub providers: Vec<Provider>,
}

/// `GET /api/providers?country=`: what a person can pick from in that country.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProviderCatalogue {
    pub country: String,
    pub providers: Vec<Provider>,
}

/// `GET /api/media/:id/availability`.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Availability {
    pub country: String,
    /// Subscription services that carry the title there.
    pub providers: Vec<Provider>,
    /// Of those, the ones you said you have.
    pub mine: Vec<Provider>,
    /// False when the catalogue could not be asked and nothing is stored: "unknown", not "nowhere".
    pub known: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn p(id: i64, name: &str) -> Provider {
        Provider {
            id,
            name: name.into(),
            logo_path: None,
        }
    }

    #[test]
    fn title_providers_are_flatrate_only_in_display_order() {
        let j = json!({"results": {"IT": {
            "flatrate": [
                {"provider_id": 8, "provider_name": "Netflix", "logo_path": "/n.jpg", "display_priority": 5},
                {"provider_id": 337, "provider_name": "Disney Plus", "display_priority": 1}],
            "rent": [{"provider_id": 2, "provider_name": "Apple TV", "display_priority": 0}]},
            "US": {"flatrate": [{"provider_id": 9, "provider_name": "Prime", "display_priority": 0}]}}});
        let got = parse_watch_providers(&j, "IT");
        assert_eq!(got.iter().map(|p| p.id).collect::<Vec<_>>(), vec![337, 8]);
        assert_eq!(got[1].logo_path.as_deref(), Some("/n.jpg"));
        assert!(parse_watch_providers(&j, "FR").is_empty());
        assert!(parse_watch_providers(&json!(null), "IT").is_empty());
    }

    #[test]
    fn region_list_uses_the_country_priority_and_a_limit() {
        let j = json!({"results": [
            {"provider_id": 1, "provider_name": "A", "display_priorities": {"IT": 9}, "display_priority": 1},
            {"provider_id": 2, "provider_name": "B", "display_priorities": {"IT": 2}},
            {"provider_id": 3, "provider_name": "C", "display_priority": 5}]});
        let got = parse_region_providers(&j, "IT", 2);
        assert_eq!(got.iter().map(|p| p.id).collect::<Vec<_>>(), vec![2, 3]);
    }

    #[test]
    fn common_services_ignore_people_who_set_none() {
        let sets = vec![
            vec![p(1, "A"), p(2, "B")],
            vec![],
            vec![p(2, "B"), p(3, "C")],
        ];
        assert_eq!(common_providers(&sets), vec![p(2, "B")]);
        assert!(common_providers(&[vec![], vec![]]).is_empty());
        assert!(common_providers(&[]).is_empty());
        assert_eq!(
            on_my_services(&[p(2, "B"), p(9, "Z")], &[p(1, "A"), p(2, "B")]),
            vec![p(2, "B")]
        );
    }

    #[test]
    fn a_clients_list_is_cleaned() {
        let long = "x".repeat(100);
        let input = vec![
            p(1, " Netflix "),
            p(1, "dup"),
            p(0, "zero"),
            p(2, "  "),
            Provider {
                id: 3,
                name: long,
                logo_path: Some("//evil/x".into()),
            },
            Provider {
                id: 4,
                name: "ok".into(),
                logo_path: Some("/ok.jpg".into()),
            },
        ];
        let got = clean_providers(input);
        assert_eq!(got.iter().map(|x| x.id).collect::<Vec<_>>(), vec![1, 3, 4]);
        assert_eq!(got[0].name, "Netflix");
        assert_eq!(got[1].name.chars().count(), 60);
        assert_eq!(got[1].logo_path, None);
        assert_eq!(got[2].logo_path.as_deref(), Some("/ok.jpg"));
        let many: Vec<Provider> = (1..=60).map(|i| p(i, "s")).collect();
        assert_eq!(clean_providers(many).len(), MAX_USER_PROVIDERS);
        assert!(is_country("IT") && !is_country("XX"));
        assert_eq!(default_country("en"), "GB");
    }
}
