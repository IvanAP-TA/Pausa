/** What the "my year" card says, already translated: both platforms draw the same lines. */
export type YearCard = {
  kicker: string;
  headline: string;
  stats: string[];
  best: { label: string; title: string } | null;
  extra: string[];
  brand: string;
  fileName: string;
  shareText: string;
};

/** "shared" = the system sheet took it; "saved" = the browser downloaded it. */
export type ShareOutcome = "shared" | "saved";
