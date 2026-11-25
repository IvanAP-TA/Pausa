/**
 * Controller and contact of the legal pages, read at BUILD time (the page is static HTML). PLAN D7: until the owner supplies
 * them the pages show a visible placeholder, and scripts/postexport.mjs prints a warning.
 * `EXPO_PUBLIC_` variants are accepted too, so a value set for the client bundle is honoured.
 */
export function legalContact(env: Record<string, string | undefined> = process.env): { entity: string | null; email: string | null } {
  const pick = (a?: string, b?: string) => {
    const v = (a ?? b ?? "").trim();
    return v === "" ? null : v;
  };
  return {
    entity: pick(env.LEGAL_ENTITY, env.EXPO_PUBLIC_LEGAL_ENTITY),
    email: pick(env.CONTACT_EMAIL, env.EXPO_PUBLIC_CONTACT_EMAIL),
  };
}
