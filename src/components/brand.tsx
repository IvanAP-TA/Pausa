/**
 * The pause mark: two amber bars. The one drawn mark of the brand (the app icon, the share cards and the splash use the
 * same bars through `src/lib/pause-mark.tsx`). Its height comes from the class; the width follows.
 */
export function PauseMark({ className = "h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 28" className={`w-auto shrink-0 ${className}`} aria-hidden="true">
      <rect x="1" y="1" width="6.5" height="26" fill="var(--color-accent)" />
      <rect x="12.5" y="1" width="6.5" height="26" fill="var(--color-accent)" />
    </svg>
  );
}

/** The wordmark: the pause mark beside the name in display capitals. `size` is the text size class. */
export function Wordmark({ size = "text-2xl", className = "" }: { size?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.32em] leading-none ${size} ${className}`}>
      <PauseMark className="h-[0.72em]" />
      <span className="font-display leading-none">Pausa</span>
    </span>
  );
}
