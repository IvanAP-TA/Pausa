"use client";

import { useEffect } from "react";

export const LAST_CIRCLE_COOKIE = "pausa-circle";

/** Remembers the Cerchia you were last in, so someone in two Cerchie lands in the right one next time. */
export function CircleMemory({ circleId }: { circleId: string }) {
  useEffect(() => {
    document.cookie = `${LAST_CIRCLE_COOKIE}=${circleId}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [circleId]);
  return null;
}
