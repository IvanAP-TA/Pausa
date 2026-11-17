"use client";

import { useEffect } from "react";

/** Registers the service worker once (offline page and push). It caches nothing but the offline page. */
export function RegisterSw() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
