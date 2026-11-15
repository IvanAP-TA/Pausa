import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { signMagicToken } from "@/modules/auth/token";

const TTL_MS = 1000 * 60 * 15; // 15 minutes

export async function POST(req: NextRequest) {
  const e = env();
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.redirect(`${e.APP_URL}/?error=email`, 303);
  }

  const { token } = await signMagicToken(e.AUTH_SECRET, email, Date.now(), TTL_MS);
  const link = `${e.APP_URL}/api/auth/magic/verify?token=${encodeURIComponent(token)}`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${e.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Pausa <onboarding@resend.dev>",
      to: email,
      subject: "Il tuo link di accesso a Pausa",
      html: `<p>Entra in Pausa:</p><p><a href="${link}">Accedi</a></p><p>Il link scade tra 15 minuti.</p>`,
    }),
  });

  return NextResponse.redirect(`${e.APP_URL}/?sent=1`, 303);
}
