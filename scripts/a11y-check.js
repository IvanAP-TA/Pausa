// Paste-able audit snippet (no dependencies): accessible names, labels, alt text, heading order, contrast, touch targets.
(() => {
  const out = { noName: [], noLabel: [], noAlt: [], small: [], contrast: [], headings: [], h1: document.querySelectorAll("h1").length, lang: document.documentElement.lang };
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent || el.textContent || el.getAttribute("title") || "").trim();
  const sel = (el) => (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : "")).slice(0, 70);

  document.querySelectorAll("a[href],button,[role=button]").forEach((el) => { if (vis(el) && !name(el) && !el.querySelector("img[alt]:not([alt=''])")) out.noName.push(sel(el)); });
  document.querySelectorAll("input:not([type=hidden]):not([type=submit]),select,textarea").forEach((el) => {
    if (!vis(el) && !el.classList.contains("sr-only")) return;
    const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
    if (!labelled) out.noLabel.push(sel(el));
  });
  document.querySelectorAll("img").forEach((el) => { if (!el.hasAttribute("alt")) out.noAlt.push(sel(el)); });
  document.querySelectorAll("a[href],button,select,input:not([type=hidden]):not([type=checkbox]):not([type=radio])").forEach((el) => {
    if (!vis(el)) return; const r = el.getBoundingClientRect();
    if (r.height < 36 || r.width < 36) out.small.push(sel(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
  });
  let last = 0;
  document.querySelectorAll("h1,h2,h3,h4").forEach((h) => { const n = Number(h.tagName[1]); if (last && n > last + 1) out.headings.push(`h${last}→h${n} "${h.textContent.trim().slice(0, 30)}"`); last = n; });

  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const seen = new Set();
  document.querySelectorAll("p,span,a,button,li,label,h1,h2,h3,summary,time,legend,small").forEach((el) => {
    if (!vis(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) return;
    const bg = bgOf(el); const a = fg.a; const mix = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
    const L1 = lum(mix), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700; const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < need) { const k = sel(el) + ratio.toFixed(1); if (!seen.has(k)) { seen.add(k); out.contrast.push(`${ratio.toFixed(2)}<${need} ${sel(el)} "${el.textContent.trim().slice(0, 28)}"`); } }
  });
  Object.keys(out).forEach((k) => { if (Array.isArray(out[k])) out[k] = out[k].slice(0, 8); });
  return JSON.stringify(out);
})()
