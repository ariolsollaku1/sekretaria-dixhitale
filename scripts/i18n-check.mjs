// AC-5: compares message catalogs. Exits 1 when the default-locale catalog (sq) lacks a key that
// another catalog has, or when sq has empty values. Keys missing in other locales are only listed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT = "sq";
const OTHERS = ["en"];
// Optional first argument: catalog directory (used by tests).
const dir = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + "/") : new URL("../messages/", import.meta.url);

function flatten(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
}
const load = (locale) => new Map(flatten(JSON.parse(readFileSync(new URL(`${locale}.json`, dir), "utf8"))));

const base = load(DEFAULT);
let failed = false;

for (const [key, value] of base) {
  if (typeof value !== "string" || value.trim() === "") {
    console.error(`✗ ${DEFAULT}: empty value for "${key}"`);
    failed = true;
  }
}
for (const locale of OTHERS) {
  const other = load(locale);
  const missingInDefault = [...other.keys()].filter((k) => !base.has(k));
  const missingInOther = [...base.keys()].filter((k) => !other.has(k));
  for (const k of missingInDefault) {
    console.error(`✗ ${DEFAULT} is missing "${k}" (present in ${locale})`);
    failed = true;
  }
  for (const k of missingInOther) console.warn(`! ${locale} is missing "${k}"`);
}
if (failed) process.exit(1);
console.log(`i18n: ${base.size} keys in ${DEFAULT}; catalogs consistent.`);
