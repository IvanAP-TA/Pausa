"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Plus, User, Users } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

type Labels = { open: string; title: string; personal: string; here: string; more: string };

/**
 * Where am I, and where else can I go: the name of the current place (a Cerchia, or my own space) is the button.
 * It opens every place the person can be in, one tap away from any page: their own space, each of their Cerchie,
 * and the page where they join or create another one.
 * A disclosure (a button and the list of links it opens), not a menu widget: links keep their own keyboard behaviour.
 * It closes on Escape, on a tap outside, and when the page changes.
 */
export function SpaceMenu({ circles, currentId, currentName, labels }: { circles: { id: string; name: string }[]; currentId: string | null; currentName: string; labels: Labels }) {
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
    `flex min-h-12 items-center gap-3 px-4 text-base transition-colors duration-150 hover:bg-paper-2 ${active ? "font-semibold text-ink" : "text-ink-2 hover:text-ink"}`;
  const Here = currentId === null ? User : Users;

  return (
    <div ref={root} className="flex min-w-0">
      <button ref={button} type="button" aria-expanded={open} aria-controls={panel} aria-label={`${currentName}: ${labels.open}`} onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 min-w-0 items-center gap-2 px-2 text-left transition-colors duration-150 hover:bg-paper-2 aria-expanded:bg-paper-2">
        <Here size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-muted" />
        <span className="min-w-0 truncate text-base font-semibold text-ink">{currentName}</span>
        <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" className={`shrink-0 text-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={panel} className="absolute inset-x-0 top-full z-[300] border-b border-rule bg-paper shadow-[0_24px_48px_-24px_var(--color-scrim)] [animation:unfold_var(--dur-short)_var(--ease-out)_backwards] motion-reduce:animate-none">
          <p className="px-4 pb-1 pt-4 text-sm text-muted">{labels.title}</p>
          <ul className="rows grid max-h-[min(70dvh,28rem)] overflow-y-auto overscroll-contain">
            {circles.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.id}`} aria-current={currentId === c.id ? "page" : undefined} className={item(currentId === c.id)} onClick={() => setOpen(false)}>
                  <Users size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {currentId === c.id && <Check size={18} strokeWidth={1.8} aria-label={labels.here} className="shrink-0 text-accent" />}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/me" aria-current={currentId === null ? "page" : undefined} className={item(currentId === null)} onClick={() => setOpen(false)}>
                <User size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{labels.personal}</span>
                {currentId === null && <Check size={18} strokeWidth={1.8} aria-label={labels.here} className="shrink-0 text-accent" />}
              </Link>
            </li>
            <li>
              <Link href="/me/circles" className={item(false)} onClick={() => setOpen(false)}>
                <Plus size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{labels.more}</span>
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
