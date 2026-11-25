/** `next` is only honoured when it is a path inside this site: never a full URL, never `//host`, never a backslash trick. */
export function safeNext(next: string | string[] | undefined, fallback: string): string {
  const v = Array.isArray(next) ? next[0] : next;
  return v && /^\/(?!\/)[^\\\s]*$/.test(v) ? v : fallback;
}

/** An invite arrives as a bare code or as a whole link (`https://host/it/join/ABCD2345?x=1`): the code is the last path segment. */
export function inviteCodeFrom(input: string): string {
  const noQuery = input.trim().split(/[?#]/)[0].replace(/\/+$/, "");
  const last = noQuery.split("/").pop() ?? "";
  return last.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
