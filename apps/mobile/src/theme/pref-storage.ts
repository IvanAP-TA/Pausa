// Web: the theme choice lives in localStorage (private mode may refuse: then it lasts for the session).
export async function readStored(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeStored(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}
