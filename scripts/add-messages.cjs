/* One-off helper: merges new message groups into messages/{it,en,es}.json (deep, keeps key order, existing keys untouched). */
const fs = require("fs");
const path = require("path");

const merge = (target, add) => {
  for (const [k, v] of Object.entries(add)) {
    if (v && typeof v === "object") merge((target[k] ??= {}), v);
    else if (!(k in target)) target[k] = v;
  }
};

const file = process.argv[2];
const add = JSON.parse(fs.readFileSync(file, "utf8"));
for (const loc of ["it", "en", "es"]) {
  const p = path.join(__dirname, "..", "messages", `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(p, "utf8"));
  merge(json, add[loc]);
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
}
console.log("merged", file);
