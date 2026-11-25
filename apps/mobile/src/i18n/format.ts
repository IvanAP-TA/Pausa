// A small ICU MessageFormat subset, enough for packages/messages: {arg}, {n, plural, =0 {..} one {..} other {..}} with `#`,
// {x, select, ..}, nested options, and rich tags (<b>..</b>). Written instead of pulling intl-messageformat into the app
// shell (BUDGET: the entry bundle is tight). tests/i18n.test.ts compares it with intl-messageformat on every message.

export type Node =
  | { t: "text"; v: string }
  | { t: "arg"; name: string }
  | { t: "pound" }
  | { t: "plural"; name: string; offset: number; ordinal: boolean; options: Record<string, Node[]> }
  | { t: "select"; name: string; options: Record<string, Node[]> }
  | { t: "tag"; name: string; children: Node[] };

export class IcuSyntaxError extends Error {}

const cache = new Map<string, Node[]>();

/** Parses a message once and memoises the tree. */
export function parse(message: string): Node[] {
  let tree = cache.get(message);
  if (!tree) {
    const p = new Parser(message);
    tree = p.nodes(false, null);
    if (p.i < message.length) throw new IcuSyntaxError(`Unexpected "${message[p.i]}" at ${p.i} in: ${message}`);
    cache.set(message, tree);
  }
  return tree;
}

class Parser {
  i = 0;
  constructor(private readonly s: string) {}

  /** Parses until `}` (when `inOption`), until `</closing>`, or to the end. */
  nodes(inPlural: boolean, closing: string | null, inOption = false): Node[] {
    const out: Node[] = [];
    let text = "";
    const flush = () => {
      if (text) out.push({ t: "text", v: text });
      text = "";
    };
    const s = this.s;
    while (this.i < s.length) {
      const ch = s[this.i];
      if (ch === "}") {
        if (inOption) break;
        throw new IcuSyntaxError(`Unbalanced "}" in: ${s}`);
      }
      if (ch === "{") {
        flush();
        out.push(this.argument(inPlural));
        continue;
      }
      if (ch === "<") {
        const close = /^<\/([A-Za-z][\w-]*)>/.exec(s.slice(this.i));
        if (close) {
          if (close[1] === closing) break;
          throw new IcuSyntaxError(`Unexpected </${close[1]}> in: ${s}`);
        }
        const open = /^<([A-Za-z][\w-]*)>/.exec(s.slice(this.i));
        if (open) {
          flush();
          this.i += open[0].length;
          const children = this.nodes(inPlural, open[1], inOption);
          const end = `</${open[1]}>`;
          if (!s.startsWith(end, this.i)) throw new IcuSyntaxError(`Missing ${end} in: ${s}`);
          this.i += end.length;
          out.push({ t: "tag", name: open[1], children });
          continue;
        }
      }
      if (ch === "#" && inPlural) {
        flush();
        out.push({ t: "pound" });
        this.i++;
        continue;
      }
      if (ch === "'") {
        // ICU quoting: '' is a quote; ' before { } < # starts a quoted run up to the next '. Any other ' is literal.
        if (s[this.i + 1] === "'") {
          text += "'";
          this.i += 2;
          continue;
        }
        if (/[{}<#]/.test(s[this.i + 1] ?? "")) {
          const end = s.indexOf("'", this.i + 1);
          if (end > 0) {
            text += s.slice(this.i + 1, end).replace(/''/g, "'");
            this.i = end + 1;
            continue;
          }
        }
      }
      text += ch;
      this.i++;
    }
    flush();
    return out;
  }

  private ident(): string {
    const m = /^\s*([^\s,{}]+)\s*/.exec(this.s.slice(this.i));
    if (!m) throw new IcuSyntaxError(`Expected a name at ${this.i} in: ${this.s}`);
    this.i += m[0].length;
    return m[1];
  }

  private argument(inPlural: boolean): Node {
    this.i++; // {
    const name = this.ident();
    if (this.s[this.i] === "}") {
      this.i++;
      return { t: "arg", name };
    }
    if (this.s[this.i] !== ",") throw new IcuSyntaxError(`Expected "," or "}" at ${this.i} in: ${this.s}`);
    this.i++;
    const kind = this.ident();
    if (kind !== "plural" && kind !== "selectordinal" && kind !== "select")
      throw new IcuSyntaxError(`Unsupported argument type "${kind}" in: ${this.s}`);
    if (this.s[this.i] !== ",") throw new IcuSyntaxError(`Expected "," after ${kind} in: ${this.s}`);
    this.i++;
    let offset = 0;
    const om = /^\s*offset:\s*(\d+)/.exec(this.s.slice(this.i));
    if (om) {
      offset = Number(om[1]);
      this.i += om[0].length;
    }
    const options: Record<string, Node[]> = {};
    for (;;) {
      const ws = /^\s*/.exec(this.s.slice(this.i))![0].length;
      this.i += ws;
      if (this.s[this.i] === "}") {
        this.i++;
        break;
      }
      const sm = /^(=\d+|[^\s{}]+)\s*/.exec(this.s.slice(this.i));
      if (!sm) throw new IcuSyntaxError(`Expected an option at ${this.i} in: ${this.s}`);
      this.i += sm[0].length;
      if (this.s[this.i] !== "{") throw new IcuSyntaxError(`Expected "{" at ${this.i} in: ${this.s}`);
      this.i++;
      options[sm[1]] = this.nodes(kind !== "select" || inPlural, null, true);
      if (this.s[this.i] !== "}") throw new IcuSyntaxError(`Unclosed option "${sm[1]}" in: ${this.s}`);
      this.i++;
    }
    if (!("other" in options)) throw new IcuSyntaxError(`Missing "other" in: ${this.s}`);
    return kind === "select"
      ? { t: "select", name, options }
      : { t: "plural", name, offset, ordinal: kind === "selectordinal", options };
  }
}

export type Values = Record<string, string | number | boolean | null | undefined>;
export type TagRenderers<T> = Record<string, (children: Array<string | T>) => T>;

const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();
function rules(locale: string, ordinal: boolean) {
  const key = `${locale}/${ordinal}`;
  let r = pluralRules.get(key);
  if (!r) pluralRules.set(key, (r = new Intl.PluralRules(locale, { type: ordinal ? "ordinal" : "cardinal" })));
  return r;
}
function numberFormat(locale: string) {
  let f = numberFormats.get(locale);
  if (!f) numberFormats.set(locale, (f = new Intl.NumberFormat(locale)));
  return f;
}

/**
 * Renders a parsed message to parts: strings, and whatever the tag renderers return (React elements in the app).
 * A tag with no renderer keeps its children, so a missing handler degrades to plain text instead of dropping words.
 */
export function render<T = never>(nodes: Node[], locale: string, values: Values, tags?: TagRenderers<T>, pound?: number): Array<string | T> {
  const out: Array<string | T> = [];
  const push = (part: string | T) => {
    const last = out[out.length - 1];
    if (typeof part === "string" && typeof last === "string") out[out.length - 1] = last + part;
    else out.push(part);
  };
  for (const n of nodes) {
    switch (n.t) {
      case "text":
        push(n.v);
        break;
      case "pound":
        push(numberFormat(locale).format(pound ?? 0));
        break;
      case "arg": {
        if (!(n.name in values) || values[n.name] === undefined || values[n.name] === null) throw new Error(`Missing value for {${n.name}}`);
        const v = values[n.name];
        push(typeof v === "number" ? numberFormat(locale).format(v) : String(v));
        break;
      }
      case "plural": {
        const raw = values[n.name];
        if (typeof raw !== "number") throw new Error(`{${n.name}} must be a number`);
        const adjusted = raw - n.offset;
        const branch = n.options[`=${raw}`] ?? n.options[rules(locale, n.ordinal).select(adjusted)] ?? n.options.other;
        for (const p of render(branch, locale, values, tags, adjusted)) push(p);
        break;
      }
      case "select": {
        const branch = n.options[String(values[n.name])] ?? n.options.other;
        for (const p of render(branch, locale, values, tags, pound)) push(p);
        break;
      }
      case "tag": {
        const kids = render(n.children, locale, values, tags, pound);
        const fn = tags?.[n.name];
        if (fn) out.push(fn(kids));
        else for (const k of kids) push(k);
        break;
      }
    }
  }
  return out;
}

/** Plain-string formatting (tags keep their text). */
export function formatMessage(message: string, locale: string, values: Values = {}): string {
  return render<never>(parse(message), locale, values).join("");
}
