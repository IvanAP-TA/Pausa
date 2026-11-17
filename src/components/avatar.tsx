import { emojiOf } from "@/lib/avatars";

const TONES = ["#8A4B2E", "#2D6A4F", "#4B4F8A", "#6E5A2B", "#5A4B6E", "#2B5E6E"];

function toneFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

type Props = { user: { id: string; name: string; image?: string | null }; size?: number; className?: string };

export function Avatar({ user, size = 26, className = "" }: Props) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  const glyph = emojiOf(user.image);
  if (glyph) {
    return <span aria-hidden="true" style={{ ...style, fontSize: Math.round(size * 0.55), backgroundColor: toneFor(user.id) }} className={`grid shrink-0 place-items-center rounded-full ${className}`}>{glyph}</span>;
  }
  if (user.image) {
    // eslint-disable-next-line @next/next/no-img-element -- remote avatars (Google), tiny
    return <img src={user.image} alt="" style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, backgroundColor: toneFor(user.id) }}
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-[#F4F1EC] ${className}`}
    >
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
