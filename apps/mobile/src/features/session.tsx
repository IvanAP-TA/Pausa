import type { Me } from "@pausa/api-types";
import { Redirect, usePathname } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, onUnauthorized } from "@/api";
import { ApiFailure } from "@/api/errors";
import { onNativeSignIn, setToken } from "@/api/token";
import { useI18n } from "@/i18n";
import { ErrorState, Loading } from "@/ui";
import { Screen } from "@/ui/Screen";

type State =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "error"; error: unknown }
  | { status: "ready"; me: Me };

type SessionValue = {
  state: State;
  /** Reload `/api/me` (after creating or leaving a Cerchia, so the list and the unread counts are right). */
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const me = await api.me();
      if (alive.current) setState({ status: "ready", me });
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiFailure && e.code === "unauthorized") setState({ status: "anonymous" });
      else setState({ status: "error", error: e });
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const offSignIn = onNativeSignIn(() => { void load(); });
    // Any call answering 401 means the session is gone (expired, revoked from another device, account closed).
    const off = onUnauthorized(() => {
      void setToken(null);
      if (alive.current) setState({ status: "anonymous" });
    });
    return () => {
      alive.current = false;
      off();
      offSignIn();
    };
  }, [load]);

  const value = useMemo<SessionValue>(
    () => ({
      state,
      reload: load,
      signOut: async () => {
        try {
          await api.logout();
        } catch {
          // offline or already signed out: the local session is dropped either way
        }
        await setToken(null);
        setState({ status: "anonymous" });
      },
    }),
    [state, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

/** The signed-in person; only call under `RequireSession`. */
export function useMe(): Me {
  const { state } = useSession();
  if (state.status !== "ready") throw new Error("useMe without a session");
  return state.me;
}

/**
 * Wraps a private screen: loading while the session is checked, an error with retry if the server is unreachable, and a
 * redirect to sign-in (remembering where the person was going) when there is no session.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { state, reload } = useSession();
  const { href } = useI18n();
  const path = usePathname();
  if (state.status === "loading")
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (state.status === "error")
    return (
      <Screen>
        <ErrorState error={state.error} onRetry={reload} />
      </Screen>
    );
  if (state.status === "anonymous") return <Redirect href={`${href("/sign-in")}?next=${encodeURIComponent(path)}` as never} />;
  return <>{children}</>;
}
