// Prints a fresh sign-in link for a sample person (the API returns it as `devLink` on a local machine without a mail key).
//   node tools/dev-login.mjs http://localhost:8798 giulia@pausa.test [/it/home]
// Open the printed URL in the browser: it signs that browser in and lands on the given path. A link works once, for 15 minutes.
const [base = "http://localhost:8798", email = "giulia@pausa.test", next = "/it/home"] = process.argv.slice(2);
const res = await fetch(base.replace(/\/$/, "") + "/api/auth/magic-link", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, next, locale: "it" }),
});
const json = await res.json().catch(() => ({}));
if (!json.devLink) {
  console.error("no dev link (is the API local, without RESEND_API_KEY?)", res.status, JSON.stringify(json));
  process.exit(1);
}
console.log(json.devLink);
