import type { RoomView } from "@pausa/api-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { API_URL } from "@/api";
import { ApiFailure } from "@/api/errors";
import { serataApi } from "@/api/serata";
import { getToken } from "@/api/token";
import { backoffMs, clockOffset, newer, socketUrl } from "./room-logic";

export type Connection = "connecting" | "live" | "polling";

/** How often the room is asked for while the WebSocket is down (and the socket keeps being retried meanwhile). */
export const POLL_MS = 3000;
const PING_MS = 25_000;

type Socket = {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
};

/**
 * Opens the room's WebSocket. Web: the browser sends the session cookie with the upgrade. Native: no cookie jar, so the Bearer token
 * goes as a header option (React Native's WebSocket takes `{ headers }` as its third argument; browsers do not have that argument).
 */
async function openSocket(code: string): Promise<Socket> {
  const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : null;
  const url = socketUrl(API_URL, origin, code);
  if (Platform.OS === "web") return new WebSocket(url) as unknown as Socket;
  const token = await getToken();
  const Native = WebSocket as unknown as new (url: string, protocols: string[] | null, options: { headers: Record<string, string> }) => Socket;
  return new Native(url, null, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

const isFinal = (v: RoomView) => v.status === "done" || v.status === "expired";
const isGone = (e: unknown) => e instanceof ApiFailure && (e.code === "not_found" || e.code === "unauthorized" || e.code === "forbidden");

/**
 * The room as this person sees it, kept live. The view arrives over the WebSocket (one push per change, already shaped for this
 * person). If the socket fails or closes, `GET /api/serate/:code` is polled every 3 s and the socket is retried with a growing wait
 * until it comes back, so a flaky connection costs seconds, not the Serata. The device never decides when a round ends: it
 * only shows the server's deadline against the server's clock (`offset`).
 */
export function useRoom(code: string, enabled: boolean) {
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [offset, setOffset] = useState(0);
  const latest = useRef<RoomView | null>(null);

  /** Takes a view from any source (push, poll, the answer to my own action). */
  const accept = useCallback((next: RoomView) => {
    latest.current = newer(latest.current, next);
    setOffset(clockOffset(next));
    setView(latest.current);
    setError(null);
  }, []);

  /** Shows a view that is not from the server (an optimistic vote); the next real one replaces it. */
  const preview = useCallback((next: RoomView) => {
    latest.current = next;
    setView(next);
  }, []);

  /** Puts back what was shown before an optimistic change that failed. */
  const rollback = useCallback((previous: RoomView) => {
    latest.current = previous;
    setView(previous);
  }, []);

  const refresh = useCallback(async () => {
    try {
      accept(await serataApi.room(code));
    } catch (e) {
      if (isGone(e)) setError(e);
    }
  }, [accept, code]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let socket: Socket | null = null;
    let poller: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let pinger: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const stopPolling = () => {
      if (poller) clearInterval(poller);
      poller = null;
    };
    const startPolling = () => {
      if (poller || stopped) return;
      setConnection("polling");
      void refresh();
      poller = setInterval(() => void refresh(), POLL_MS);
    };
    const closeSocket = () => {
      if (pinger) clearInterval(pinger);
      pinger = null;
      const s = socket;
      socket = null;
      if (s) {
        s.onopen = s.onmessage = s.onerror = s.onclose = null;
        try {
          s.close();
        } catch {
          // already closed
        }
      }
    };
    const lost = () => {
      closeSocket();
      if (stopped || (latest.current && isFinal(latest.current))) return;
      startPolling();
      retry = setTimeout(() => void connect(), backoffMs(attempt++));
    };

    const connect = async () => {
      if (stopped) return;
      let s: Socket;
      try {
        s = await openSocket(code);
      } catch {
        lost();
        return;
      }
      if (stopped) {
        s.close();
        return;
      }
      socket = s;
      s.onopen = () => {
        attempt = 0;
        stopPolling();
        setConnection("live");
        pinger = setInterval(() => {
          try {
            s.send("ping");
          } catch {
            // the close handler follows
          }
        }, PING_MS);
      };
      s.onmessage = (e) => {
        if (typeof e.data !== "string" || e.data === "pong") return;
        try {
          const next = JSON.parse(e.data) as RoomView;
          accept(next);
          if (isFinal(next)) {
            stopPolling();
            closeSocket();
          }
        } catch {
          // not a view: ignore
        }
      };
      s.onerror = lost;
      s.onclose = lost;
    };

    // The first view comes from a plain GET so the screen never waits on the socket; the socket then keeps it fresh.
    void refresh();
    void connect();
    return () => {
      stopped = true;
      stopPolling();
      if (retry) clearTimeout(retry);
      closeSocket();
    };
  }, [code, enabled, accept, refresh]);

  return { view, error, connection, offset, accept, preview, rollback, refresh };
}
