"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, User, Users } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

type Labels = { open: string; title: string; personal: string; here: string };

/**
 * Every place the person can be in, one tap away from any page: their own space and each of their Cerchie.
 * A disclosure (a button and the list of links it opens), not a menu widget: links keep their own keyboard behaviour.
 * It closes on Escape, on a tap outside, and when the page changes.
 */
export function SpaceMenu({ circles, currentId, labels }: { circles: { id: string; name: string }[]; currentId: string | null; labels: Labels }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useId();
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) { setSeen(pathname); setOpen(false); } // arrived somewhere: the list has done its job

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);

  const item = (active: boolean) =>
    `flex min-h-12 items-center gap-3 px-4 text-sm transition-colors duration-150 hover:bg-paper-2 ${active ? "font-semibold text-ink" : "text-ink-2 hover:text-ink"}`;

  return (
    <div ref={root} className="flex">
      <button ref={button} type="button" aria-expanded={open} aria-controls={panel} aria-label={labels.open} onClick={() => setOpen((v) => !v)}
        className={`grid min-h-11 w-12 place-items-center border-b-2 border-l border-l-rule transition-colors duration-150 ${open ? "border-b-accent text-ink" : "border-b-transparent text-muted hover:text-ink"}`}>
        <ChevronDown size={20} strokeWidth={1.6} aria-hidden="true" className={`transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={panel} className="absolute inset-x-0 top-full z-[300] border-b border-rule bg-paper shadow-[0_24px_48px_-24px_var(--color-scrim)] [animation:unfold_var(--dur-short)_var(--ease-out)_backwards] motion-reduce:animate-none">
          <p className="px-4 pb-1 pt-4 text-xs uppercase tracking-wider text-muted">{labels.title}</p>
          <ul className="rows grid max-h-[min(70dvh,28rem)] overflow-y-auto">
            <li>
              <Link href="/me" aria-current={currentId === null ? "page" : undefined} className={item(currentId === null)} onClick={() => setOpen(false)}>
                <User size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{labels.personal}</span>
                {currentId === null && <Check size={18} strokeWidth={1.8} aria-label={labels.here} className="shrink-0 text-accent" />}
              </Link>
            </li>
            {circles.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.id}`} aria-current={currentId === c.id ? "page" : undefined} className={item(currentId === c.id)} onClick={() => setOpen(false)}>
                  <Users size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {currentId === c.id && <Check size={18} strokeWidth={1.8} aria-label={labels.here} className="shrink-0 text-accent" />}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
