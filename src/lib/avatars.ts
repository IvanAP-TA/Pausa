/**
 * Pictures without photos. Guests pick one of the first eight on joining a Serata; members pick any of them on their
 * profile. Stored in user.image as "emoji:<glyph>", so every query that already carries `image` carries the avatar too.
 */
export const GUEST_AVATARS = ["🦊", "🐙", "🦉", "🐸", "🦄", "🐧", "🦋", "🐢"] as const;
export const AVATARS = [...GUEST_AVATARS, "🍿", "🎬", "📼", "🎞️", "👽", "🤖", "🧛", "🦖", "🐱", "🐶", "🦁", "🐼", "🌙", "🌵", "🍕", "🍩"] as const;
export type AvatarGlyph = (typeof AVATARS)[number];

const PREFIX = "emoji:";

export const isGuestAvatar = (v: unknown): v is (typeof GUEST_AVATARS)[number] => (GUEST_AVATARS as readonly unknown[]).includes(v);
export const isAvatar = (v: unknown): v is AvatarGlyph => (AVATARS as readonly unknown[]).includes(v);
export const toAvatarImage = (glyph: AvatarGlyph) => PREFIX + glyph;

/** The glyph if this image value is an emoji avatar; anything else is a real image URL. */
export function emojiOf(image: string | null | undefined) {
  if (!image?.startsWith(PREFIX)) return null;
  const glyph = image.slice(PREFIX.length);
  return isAvatar(glyph) ? glyph : null;
}
