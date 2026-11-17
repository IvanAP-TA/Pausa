/* One-off: send a Web Push wherever a notification row is created. */
const fs = require("fs");
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error("MISSING in " + p + ": " + a.slice(0, 80)); continue; }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(p, s);
};

edit("src/lib/actions.ts", [
  [
    'await db.insert(s.notification).values(others.map((o) => ({ userId: o.userId, type: "circle_join" as const, actorId: user.id, circleId: res.circleId })));',
    'const rows = others.map((o) => ({ userId: o.userId, type: "circle_join" as const, actorId: user.id, circleId: res.circleId }));\n      await db.insert(s.notification).values(rows);\n      pushNotifications(rows);',
  ],
  [
    '  ]);\n\n  redirect(`/${localeFrom(formData.get("locale"))}/c/${input.circleId}`);',
    '  ]);\n  pushNotifications(notify.map((userId) => ({ userId, type: "log" as const, actorId: user.id, circleId: input.circleId, logId })));\n\n  redirect(`/${localeFrom(formData.get("locale"))}/c/${input.circleId}`);',
  ],
  [
    'await db.insert(s.notification).values({ userId: row.authorId, type: "reaction", actorId: user.id, logId });',
    'await db.insert(s.notification).values({ userId: row.authorId, type: "reaction", actorId: user.id, logId });\n      pushNotifications([{ userId: row.authorId, type: "reaction", actorId: user.id, logId }]);',
  ],
  [
    '  ]);\n  revalidatePath(`/[locale]/c/[circleId]/l/[logId]`, "page");\n}\n\n/* ───────────── Sto guardando',
    '  ]);\n  pushNotifications([...notify].map((userId) => ({ userId, type: "comment" as const, actorId: user.id, logId, circleId })));\n  revalidatePath(`/[locale]/c/[circleId]/l/[logId]`, "page");\n}\n\n/* ───────────── Sto guardando',
  ],
  [
    'await db.insert(s.notification).values(others.map((o) => ({ userId: o.userId, type: "now_watching" as const, actorId: user.id, circleId, mediaId })));',
    'const rows = others.map((o) => ({ userId: o.userId, type: "now_watching" as const, actorId: user.id, circleId, mediaId }));\n      await db.insert(s.notification).values(rows);\n      pushNotifications(rows);',
  ],
  ['import { getCircleForMember,', 'import { pushNotifications } from "./push";\nimport { getCircleForMember,'],
]);

edit("src/lib/serata/actions.ts", [
  [
    '  ]);\n  redirect(`/${locale}/s/${code}`);',
    '  ]);\n  pushNotifications(others.map((o) => ({ userId: o.userId, type: "serata_invite" as const, actorId: user.id, circleId, serataCode: code })));\n  redirect(`/${locale}/s/${code}`);',
  ],
  ['import { getCircleForMember } from "@/lib/data";', 'import { getCircleForMember } from "@/lib/data";\nimport { pushNotifications } from "@/lib/push";'],
]);

edit("src/lib/push.ts", [
  ["export type PushEvent = { userId: string; type: PushKind; actorId?: string | null; circleId?: string | null; logId?: string | null; mediaId?: string | null };",
   "export type PushEvent = { userId: string; type: PushKind; actorId?: string | null; circleId?: string | null; logId?: string | null; mediaId?: string | null; serataCode?: string | null };"],
]);

edit("src/lib/core/push.ts", [
  ["export function pushUrl(locale: PushLocale, ids: { circleId?: string | null; logId?: string | null }) {\n",
   "export function pushUrl(locale: PushLocale, ids: { circleId?: string | null; logId?: string | null; serataCode?: string | null }) {\n  if (ids.serataCode) return `/${locale}/s/${ids.serataCode}`;\n"],
  ["/** Where tapping the notification goes: the log if there is one,", "/** Where tapping the notification goes: the Serata if it is an invite, the log if there is one,"],
]);

edit("src/lib/core/push.test.ts", [
  ['    expect(pushUrl("es", {})).toBe("/es");', '    expect(pushUrl("es", {})).toBe("/es");\n    expect(pushUrl("it", { circleId: "c1", serataCode: "ABC123" })).toBe("/it/s/ABC123");'],
]);

edit("src/app/[locale]/account/page.tsx", [
  ['import { LogoutButton } from "@/components/logout-button";', 'import { LogoutButton } from "@/components/logout-button";\nimport { PushToggle } from "@/components/push-toggle";\nimport { pushEnabled } from "@/lib/push";'],
  ['      <section className="grid gap-3">\n        <div>\n          <h2 className="font-display text-lg">{td("title")}</h2>', '      {pushEnabled() ? <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!} /> : (\n        <p className="text-sm text-muted">{(await getTranslations("pushSettings"))("off")}</p>\n      )}\n\n      <section className="grid gap-3">\n        <div>\n          <h2 className="font-display text-lg">{td("title")}</h2>'],
]);
