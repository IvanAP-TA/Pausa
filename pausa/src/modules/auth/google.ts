const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export function buildGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  return url.toString();
}

export async function exchangeGoogleCode(
  clientId: string,
  secret: string,
  code: string,
  redirectUri: string,
): Promise<{ access_token: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  return res.json();
}

export async function fetchGoogleUser(
  accessToken: string,
): Promise<{ email: string; name: string; picture?: string }> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo ${res.status}`);
  return res.json();
}
