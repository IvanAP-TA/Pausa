import { sql } from "drizzle-orm";
import { log, logShare } from "../../db/schema";

/**
 * The one rule for "does this log show in this Cerchia" (its author's membership is checked by the caller's join):
 * a log open to the author's Cerchie, or a private one that was shared with this Cerchia.
 */
export const visibleIn = (circleId: string) =>
  sql`(${log.scope} = 'circles' or exists (select 1 from ${logShare} where ${logShare.logId} = ${log.id} and ${logShare.circleId} = ${circleId}))`;

/** When the log reached this Cerchia: the moment it was shared, or when it was written. The feed is ordered by it. */
export const arrivedIn = (circleId: string) =>
  sql<number>`coalesce((select ${logShare.createdAt} from ${logShare} where ${logShare.logId} = ${log.id} and ${logShare.circleId} = ${circleId}), ${log.createdAt})`;
