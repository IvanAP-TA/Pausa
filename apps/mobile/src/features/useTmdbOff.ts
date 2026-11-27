import { useEffect, useState } from "react";
import { importApi } from "@/api/import";

// One question per app session: whether the server has a TMDB key does not change while the app is open.
let asked: Promise<boolean> | null = null;

/**
 * True when the server has no TMDB key, so a search finds only the titles Pausa already holds (and AniList anime). The search
 * boxes say so under the field, as v1 did. False while unknown or when the question fails: no notice rather than a wrong one.
 */
export function useTmdbOff(): boolean {
  const [off, setOff] = useState(false);
  useEffect(() => {
    let live = true;
    asked ??= importApi.config().then(
      (c) => !c.tmdb,
      () => {
        asked = null;
        return false;
      },
    );
    void asked.then((v) => live && setOff(v));
    return () => {
      live = false;
    };
  }, []);
  return off;
}
