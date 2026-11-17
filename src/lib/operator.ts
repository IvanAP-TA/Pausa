/** Emails allowed into the operator pages (env ADMIN_EMAILS, comma-separated). In development the first seed person may. */
export function isOperator(email: string | null | undefined) {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? (process.env.NODE_ENV === "development" ? "giulia@pausa.test" : ""))
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
