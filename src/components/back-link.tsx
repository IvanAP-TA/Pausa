import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";

/** The way back from a page reached from another one: always the same, at the top left of the content, with a chevron. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 pr-3 text-sm text-ink-2 transition-colors duration-150 hover:text-ink">
      <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
      {label}
    </Link>
  );
}
