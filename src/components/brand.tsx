/**
 * The Pausa mark: one frame of film, sprocket holes down both edges, with the pause sign cut out of it.
 * Drawn in the signal colour; the cuts show whatever lies behind.
 */
export function PauseMark({ className = "h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={`w-auto shrink-0 ${className}`} aria-hidden="true">
      <path
        fill="var(--color-accent)"
        fillRule="evenodd"
        d="M0 0h28v28H0zM2.5 3h3v3.5h-3zM2.5 9.25h3v3.5h-3zM2.5 15.5h3v3.5h-3zM2.5 21.5h3v3.5h-3zM22.5 3h3v3.5h-3zM22.5 9.25h3v3.5h-3zM22.5 15.5h3v3.5h-3zM22.5 21.5h3v3.5h-3zM9.5 7h3.5v14H9.5zM15 7h3.5v14H15z"
      />
    </svg>
  );
}

/** The wordmark: the mark and the name in display capitals. `size` is a text-size class; the mark follows it. */
export function Wordmark({ size = "text-2xl", className = "" }: { size?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.32em] leading-none ${size} ${className}`}>
      <PauseMark className="h-[0.84em]" />
      <span className="font-display leading-none">Pausa</span>
    </span>
  );
}
