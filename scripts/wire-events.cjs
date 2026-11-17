/* One-off: record invite/card shares so the metrics can count them. */
const fs = require("fs");
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error("MISSING in " + p + ": " + a.slice(0, 80)); continue; }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(p, s);
};

edit("src/app/[locale]/s/[code]/room.tsx", [
  ['import { forceAdvance, startSerata, submitBallot, tick, voteBracket } from "@/lib/serata/actions";',
   'import { forceAdvance, startSerata, submitBallot, tick, voteBracket } from "@/lib/serata/actions";\nimport { trackEvent } from "@/lib/events";'],
  ['      try { await navigator.share({ title: "Pausa", text: t("shareText"), url }); return; } catch { return; }\n    }\n    try { await navigator.clipboard.writeText(url); setCopied(true);',
   '      try { await navigator.share({ title: "Pausa", text: t("shareText"), url }); void trackEvent("invite_shared", view.code); return; } catch { return; }\n    }\n    void trackEvent("invite_shared", view.code);\n    try { await navigator.clipboard.writeText(url); setCopied(true);'],
  ['      if (file && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text });\n      if (navigator.share) return await navigator.share({ title: "Pausa", text, url: cardUrl });\n    } catch { return; }\n    await navigator.clipboard.writeText(cardUrl).catch(() => {});',
   '      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); void trackEvent("card_shared", view.code); return; }\n      if (navigator.share) { await navigator.share({ title: "Pausa", text, url: cardUrl }); void trackEvent("card_shared", view.code); return; }\n    } catch { return; }\n    void trackEvent("card_shared", view.code);\n    await navigator.clipboard.writeText(cardUrl).catch(() => {});'],
]);
