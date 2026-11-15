import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface Env {
  DB: D1Database;
  TMDB_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  APP_URL: string;
  AUTH_SECRET: string;
  MOCK_MODE?: string;
}

export function isMockMode(): boolean {
  try {
    return env().MOCK_MODE === "1";
  } catch {
    return false;
  }
}

export function env(): Env {
  return getCloudflareContext().env as unknown as Env;
}
