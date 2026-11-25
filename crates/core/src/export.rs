//! The diary as a CSV file a person can open in a spreadsheet or bring to another service. Columns follow Letterboxd's diary
//! import (`Date, Name, Year, Rating, Rewatch, Review`), plus `Kind, Season, Episode, Platform` for series.

/// One diary entry as stored.
pub struct Entry<'a> {
    pub watched_on: &'a str,
    pub title: &'a str,
    pub year: Option<i64>,
    /// Stored scale 1..=10 (half stars); shown as 0.5..=5.
    pub rating: Option<i64>,
    pub rewatch: bool,
    pub review: Option<&'a str>,
    pub kind: &'a str,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub platform: Option<&'a str>,
}

/// One cell. Quotes when needed; a cell that starts like a formula gets a leading apostrophe so a spreadsheet never runs it.
pub fn cell(s: &str) -> String {
    let s = s.replace("\r\n", "\n").replace('\r', "\n");
    let guarded = if s.starts_with(['=', '+', '-', '@', '\t']) {
        format!("'{s}")
    } else {
        s
    };
    if guarded.contains([',', '"', '\n']) {
        format!("\"{}\"", guarded.replace('"', "\"\""))
    } else {
        guarded
    }
}

fn stars(r: i64) -> String {
    if r % 2 == 0 {
        (r / 2).to_string()
    } else {
        format!("{}.5", r / 2)
    }
}

pub const HEADER: &str = "Date,Name,Year,Rating,Rewatch,Review,Kind,Season,Episode,Platform";

pub fn diary_csv(entries: &[Entry]) -> String {
    let mut out = String::from(HEADER);
    out.push_str("\r\n");
    for e in entries {
        let row = [
            cell(e.watched_on),
            cell(e.title),
            e.year.map(|y| y.to_string()).unwrap_or_default(),
            e.rating
                .filter(|r| (1..=10).contains(r))
                .map(stars)
                .unwrap_or_default(),
            if e.rewatch {
                "Yes".into()
            } else {
                String::new()
            },
            cell(e.review.unwrap_or("")),
            cell(e.kind),
            e.season.map(|v| v.to_string()).unwrap_or_default(),
            e.episode.map(|v| v.to_string()).unwrap_or_default(),
            cell(e.platform.unwrap_or("")),
        ];
        out.push_str(&row.join(","));
        out.push_str("\r\n");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cells_are_quoted_and_formulas_defused() {
        assert_eq!(cell("plain"), "plain");
        assert_eq!(cell("a,b"), "\"a,b\"");
        assert_eq!(cell("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(cell("riga1\nriga2"), "\"riga1\nriga2\"");
        assert_eq!(cell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
        assert_eq!(cell("-2+3"), "'-2+3");
        assert_eq!(cell("@cmd"), "'@cmd");
    }

    #[test]
    fn rows_use_half_star_ratings() {
        let e = Entry {
            watched_on: "2026-09-12",
            title: "Se7en, il film",
            year: Some(1995),
            rating: Some(9),
            rewatch: true,
            review: Some("Cupo.\nBellissimo"),
            kind: "movie",
            season: None,
            episode: None,
            platform: None,
        };
        let csv = diary_csv(&[e]);
        let lines: Vec<&str> = csv.split("\r\n").collect();
        assert_eq!(lines[0], HEADER);
        assert!(lines[1].starts_with("2026-09-12,\"Se7en, il film\",1995,4.5,Yes,"));
        assert!(csv.ends_with("\r\n"));
        let bad = Entry {
            watched_on: "2026-01-01",
            title: "X",
            year: None,
            rating: Some(11),
            rewatch: false,
            review: None,
            kind: "tv",
            season: Some(2),
            episode: Some(5),
            platform: Some("Netflix"),
        };
        assert!(diary_csv(&[bad]).contains("2026-01-01,X,,,,,tv,2,5,Netflix"));
        assert_eq!(stars(10), "5");
        assert_eq!(stars(1), "0.5");
    }
}
