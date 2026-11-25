// A small implementation of Cloudflare's `_headers` file (Workers static assets), so the local server answers the way the asset host will:
//   - a rule is a path pattern on its own line, followed by indented `Name: value` lines (`#` starts a comment);
//   - `*` in a pattern matches anything (slashes included), `:name` matches one path segment;
//   - every rule that matches applies, top to bottom; a header set by more than one rule is JOINED with ", ";
//   - `! Name` (detach) removes a header that an earlier rule set.
// https://developers.cloudflare.com/workers/static-assets/headers/
// Not modelled: the 100 rule / 2000 characters per line limits (postexport's checks keep the file small), host/protocol patterns.

/** @returns {Array<{ pattern: string, set: Array<[string, string]>, detach: string[] }>} */
export function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    if (/^\s/.test(raw)) {
      if (!cur) throw new Error(`header line before any path pattern: ${raw}`);
      const line = raw.trim();
      if (line.startsWith("!")) cur.detach.push(line.slice(1).trim().toLowerCase());
      else {
        const i = line.indexOf(":");
        if (i < 1) throw new Error(`not a header line: ${raw}`);
        cur.set.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
      }
    } else {
      cur = { pattern: raw.trim(), set: [], detach: [] };
      rules.push(cur);
    }
  }
  return rules;
}

const toRegex = (pattern) =>
  new RegExp(
    "^" +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "(?:.*)")
        .replace(/:[A-Za-z_]\w*/g, "[^/]+") +
      "$",
  );

/** The headers to add for a URL path, as a plain object (names as written in the file, first spelling wins). */
export function headersFor(rules, pathname) {
  /** @type {Map<string, { name: string, values: string[] }>} */
  const out = new Map();
  for (const rule of rules) {
    if (!toRegex(rule.pattern).test(pathname)) continue;
    for (const name of rule.detach) out.delete(name);
    for (const [name, value] of rule.set) {
      const key = name.toLowerCase();
      const have = out.get(key);
      if (have) have.values.push(value);
      else out.set(key, { name, values: [value] });
    }
  }
  return Object.fromEntries([...out.values()].map((h) => [h.name, h.values.join(", ")]));
}
