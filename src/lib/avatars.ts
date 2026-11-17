/** Guests have no photo: they pick one of these on joining a Serata. Stored in user.image as "emoji:<glyph>". */
export const GUEST_AVATARS = ["🦊", "🐙", "🦉", "🐸", "🦄", "🐧", "🦋", "🐢"] as const;

const PREFIX = "emoji:";

export const isGuestAvatar = (v: unknown): v is (typeof GUEST_AVATARS)[number] => (GUEST_AVATARS as readonly unknown[]).includes(v);
export const toAvatarImage = (glyph: (typeof GUEST_AVATARS)[number]) => PREFIX + glyph;

/** The glyph if this image value is an emoji avatar; anything else is a real image URL. */
export function emojiOf(image: string | null | undefined) {
  if (!image?.startsWith(PREFIX)) return null;
  const glyph = image.slice(PREFIX.length);
  return isGuestAvatar(glyph) ? glyph : null;
}
