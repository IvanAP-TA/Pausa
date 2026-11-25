import type { NotificationDto } from "@pausa/api-types";

/** Where a notice leads: the thread it is about, the title, the Serata room, or the Cerchia. */
export function noticeHref(n: NotificationDto, href: (p?: string) => string): string {
  if (n.type === "serata_invite" && n.serataCode) return href(`/s/${n.serataCode}`);
  if ((n.type === "log" || n.type === "comment" || n.type === "reaction" || n.type === "mention") && n.circleId && n.logId) return href(`/c/${n.circleId}/log/${n.logId}`);
  if (n.type === "now_watching" && n.media) return href(`/t/${n.media.id}`);
  if (n.circleId) return href(`/c/${n.circleId}`);
  return href("/home");
}
