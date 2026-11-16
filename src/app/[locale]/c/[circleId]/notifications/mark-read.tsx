"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "@/lib/actions";

/** Marks everything read once the inbox has been seen (not during server render, so GETs stay side-effect free). */
export function MarkRead() {
  useEffect(() => {
    void markNotificationsRead();
  }, []);
  return null;
}
