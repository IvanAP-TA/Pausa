import { API_URL } from "@/api";

export async function openGoogle(next: string, locale: string) {
  const params = new URLSearchParams({ next, locale });
  window.location.assign(`${API_URL}/api/auth/google/start?${params}`);
}

export async function googleVerifier(): Promise<string | null> {
  return null;
}
