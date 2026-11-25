// Web: keeps document.title in step with the screen (WCAG 2.4.2 Page Titled: every private page used to be just "Pausa").
// The screen's first <h1> is the title ("<h1> · Pausa"); a screen without one yet (still loading) keeps the previous title.
// One MutationObserver rather than a hook in each of ~25 screens: one rule, and it follows the heading when its text arrives after the data.
import { useEffect } from "react";

const SUFFIX = " · Pausa";

export function useDocumentTitle(): void {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const h1 = document.querySelector("h1");
      const text = h1?.textContent?.replace(/\s+/g, " ").trim();
      if (!text) return;
      const next = text.toLowerCase() === "pausa" ? "Pausa" : text + SUFFIX;
      if (document.title !== next) document.title = next;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => {
      obs.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
