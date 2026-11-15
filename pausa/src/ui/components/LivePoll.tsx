"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Realtime mock: refresh the server component every few seconds so votes
// from other participants appear. Real build would use WebSocket/Durable Objects.
export function LivePoll({ intervalMs = 2500 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
