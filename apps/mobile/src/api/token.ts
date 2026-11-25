// Web: the session is an HttpOnly cookie. The page cannot read it (that is the point), so there is no token to keep.
export async function getToken(): Promise<string | null> {
  return null;
}

export async function setToken(_token: string | null): Promise<void> {
  // nothing to store on web
}

export function onNativeSignIn(_listener: () => void): () => void {
  return () => {};
}
