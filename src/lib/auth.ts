import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins/anonymous";
import { magicLink } from "better-auth/plugins/magic-link";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sendMagicLinkEmail } from "./email";

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

async function createAuth() {
  const db = await getDb();
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    // Dev only: 127.0.0.1 has its own cookie jar, handy for testing a second person (e.g. a Serata guest).
    trustedOrigins: process.env.NODE_ENV === "development" ? ["http://127.0.0.1:3000"] : [],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification, rateLimit: schema.rateLimit },
    }),
    // Abuse limits, counted per IP in D1: sign-in emails cost money and guests pile up as rows.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/magic-link": { window: 600, max: 5 },
        "/sign-in/anonymous": { window: 3600, max: 10 },
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] } },
    socialProviders: googleEnabled()
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } }
      : {},
    // cookieCache: the session is cached in a signed cookie for 5 min, so most requests (and every
    // Serata poll) skip the D1 session lookup. Trade-off: a revoked session can live up to 5 more minutes.
    session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 5 * 60 } },
    plugins: [
      // Guests (Serata, Phase 2) start anonymous; when they save an account, keep what they joined.
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          const from = anonymousUser.user.id;
          const to = newUser.user.id;
          // An account created from an email link has no name yet: keep the one they picked as a guest.
          if (!newUser.user.name?.trim() && anonymousUser.user.name) {
            await db.update(schema.user).set({ name: anonymousUser.user.name }).where(eq(schema.user.id, to));
          }
          const memberships = await db.select().from(schema.circleMember).where(eq(schema.circleMember.userId, from));
          for (const m of memberships) {
            await db.insert(schema.circleMember).values({ ...m, userId: to }).onConflictDoNothing();
          }
          await db.update(schema.log).set({ userId: to }).where(eq(schema.log.userId, from));
          // Keep the guest's Serate (participation + votes) on the saved account.
          const seats = await db.select().from(schema.serataParticipant).where(eq(schema.serataParticipant.userId, from));
          for (const p of seats) {
            await db.insert(schema.serataParticipant).values({ ...p, userId: to, name: newUser.user.name || p.name, isGuest: false }).onConflictDoNothing();
          }
          await db.update(schema.serataVote).set({ userId: to }).where(eq(schema.serataVote.userId, from));
        },
      }),
      magicLink({
        expiresIn: 60 * 15,
        // Resend when RESEND_API_KEY is set; in dev without a key the link is printed to the server log.
        sendMagicLink: async ({ email, url }) => sendMagicLinkEmail(email, url),
      }),
      nextCookies(),
    ],
  });
}

/** One auth instance per request (D1 is request-bound on Workers). */
export const getAuth = cache(createAuth);

export const getSession = cache(async () => {
  const auth = await getAuth();
  return auth.api.getSession({ headers: await headers() });
});
