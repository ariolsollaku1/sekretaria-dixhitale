#!/usr/bin/env node
// Feature registry tool. Reads docs/03-features/FEATURES.md and docs/04-open-questions.md,
// validates them, and computes each feature's readiness from its dependencies and open
// blocking questions.
//
//   node scripts/features.mjs            print report (validation + readiness + impact)
//   node scripts/features.mjs --write    also rewrite Readiness cells and the Summary block
//   node scripts/features.mjs --check    exit 1 if validation fails or FEATURES.md is stale (CI)
//   node scripts/features.mjs --ready    print only the IDs that are ready to start, in order

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES = join(root, "docs/03-features/FEATURES.md");
const QUESTIONS = join(root, "docs/04-open-questions.md");

const STATUSES = ["todo", "specced", "in-progress", "done"];
const READINESS = {
  done: "✅ done",
  ready: "🟢 ready",
  waiting: "🟡 waiting",
  blocked: "🔴 blocked",
  "blocked-dep": "🟠 blocked-dep",
};
const PHASES = ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];

const args = new Set(process.argv.slice(2));
const errors = [];

// ---------- parsing ----------

const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const list = (cell) => (!cell || cell === "—" || cell === "-" ? [] : cell.split(",").map((s) => s.trim()).filter(Boolean));

// Parses every Markdown table whose header contains `ID`; returns rows whose ID matches `idPattern`.
function parseTables(text, idPattern) {
  const lines = text.split("\n");
  const rows = [];
  let header = null;
  lines.forEach((line, index) => {
    if (!line.trim().startsWith("|")) {
      header = null;
      return;
    }
    const cells = splitRow(line);
    if (cells[0] === "ID") {
      header = cells;
      return;
    }
    if (!header || /^-+$/.test(cells[0].replace(/:/g, ""))) return;
    if (!idPattern.test(cells[0])) return;
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
    rows.push({ row, cells, header, index });
  });
  return rows;
}

const featuresText = readFileSync(FEATURES, "utf8");
const questionsText = readFileSync(QUESTIONS, "utf8");

const questions = new Map();
for (const { row } of parseTables(questionsText, /^Q-\d{2,3}$/)) {
  if (questions.has(row.ID)) errors.push(`Duplicate question ${row.ID}`);
  const blocking = row.Blocking?.toLowerCase();
  const status = row.Status?.toLowerCase();
  if (!["yes", "no"].includes(blocking)) errors.push(`${row.ID}: Blocking must be yes|no, got "${row.Blocking}"`);
  if (!["open", "answered"].includes(status)) errors.push(`${row.ID}: Status must be open|answered, got "${row.Status}"`);
  questions.set(row.ID, { id: row.ID, topic: row.Topic, blocking: blocking === "yes", open: status === "open" });
}

const featureRows = parseTables(featuresText, /^[A-Z]{2,4}-\d{2}$/);
const features = new Map();
for (const { row, index } of featureRows) {
  if (features.has(row.ID)) errors.push(`Duplicate feature ${row.ID}`);
  const title = row.Feature.replace(/^\[(.*)\]\(.*\)$/, "$1");
  const specMatch = row.Spec?.match(/\]\((.*)\)/);
  features.set(row.ID, {
    id: row.ID,
    title,
    phase: row.Phase,
    status: row.Status,
    deps: list(row["Depends on"]),
    questions: list(row.Questions),
    spec: specMatch ? specMatch[1] : null,
    line: index,
    readinessCell: row.Readiness,
  });
}

// ---------- validation ----------

for (const f of features.values()) {
  if (!STATUSES.includes(f.status)) errors.push(`${f.id}: unknown status "${f.status}" (use ${STATUSES.join(", ")})`);
  if (!PHASES.includes(f.phase)) errors.push(`${f.id}: unknown phase "${f.phase}"`);
  for (const d of f.deps) {
    const dep = features.get(d);
    if (!dep) errors.push(`${f.id}: depends on unknown feature ${d}`);
    else if (PHASES.indexOf(dep.phase) > PHASES.indexOf(f.phase))
      errors.push(`${f.id} (${f.phase}) depends on ${d} which is in a later phase (${dep.phase})`);
  }
  for (const q of f.questions) if (!questions.has(q)) errors.push(`${f.id}: unknown question ${q}`);
  if (f.spec && !existsSync(join(dirname(FEATURES), f.spec))) errors.push(`${f.id}: spec file not found: ${f.spec}`);
  if (["specced", "in-progress", "done"].includes(f.status) && !f.spec) errors.push(`${f.id}: status "${f.status}" requires a spec link`);
}

// Cycle detection (DFS).
{
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      errors.push(`Dependency cycle: ${[...path, id].join(" → ")}`);
      return;
    }
    state.set(id, "visiting");
    for (const d of features.get(id)?.deps ?? []) if (features.has(d)) visit(d, [...path, id]);
    state.set(id, "done");
  };
  for (const id of features.keys()) visit(id, []);
}

// ---------- readiness ----------

function computeReadiness(answeredOverride = new Set()) {
  const isOpenBlocking = (q) => {
    const question = questions.get(q);
    return question && question.blocking && question.open && !answeredOverride.has(q);
  };
  const memo = new Map();
  const readinessOf = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    const f = features.get(id);
    if (!f || seen.has(id)) return "waiting";
    seen.add(id);
    let r;
    if (f.status === "done") r = "done";
    else if (f.questions.some(isOpenBlocking)) r = "blocked";
    else {
      const depStates = f.deps.map((d) => readinessOf(d, seen));
      if (depStates.some((s) => s === "blocked" || s === "blocked-dep")) r = "blocked-dep";
      else if (depStates.every((s) => s === "done")) r = "ready";
      else r = "waiting";
    }
    memo.set(id, r);
    return r;
  };
  const result = new Map();
  for (const id of features.keys()) result.set(id, readinessOf(id));
  return result;
}

const readiness = computeReadiness();

// Features that depend (transitively) on `id`.
const dependents = new Map([...features.keys()].map((id) => [id, []]));
for (const f of features.values()) for (const d of f.deps) dependents.get(d)?.push(f.id);
function downstream(ids) {
  const out = new Set();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop();
    for (const next of dependents.get(id) ?? []) if (!out.has(next)) out.add(next), stack.push(next);
  }
  return out;
}

const impact = [...questions.values()]
  .filter((q) => q.blocking && q.open)
  .map((q) => {
    const direct = [...features.values()].filter((f) => f.status !== "done" && f.questions.includes(q.id)).map((f) => f.id);
    const affected = new Set([...direct, ...downstream(direct)]);
    const after = computeReadiness(new Set([q.id]));
    const unblocks = [...features.keys()].filter(
      (id) => ["blocked", "blocked-dep"].includes(readiness.get(id)) && !["blocked", "blocked-dep"].includes(after.get(id)),
    );
    return { ...q, direct, affected: [...affected], unblocks };
  })
  .filter((q) => q.direct.length > 0)
  .sort((a, b) => b.affected.length - a.affected.length || b.unblocks.length - a.unblocks.length || a.id.localeCompare(b.id));

const byPhaseOrder = (a, b) =>
  PHASES.indexOf(features.get(a).phase) - PHASES.indexOf(features.get(b).phase) || features.get(a).line - features.get(b).line;
const ids = (state) => [...features.keys()].filter((id) => readiness.get(id) === state).sort(byPhaseOrder);

// ---------- summary ----------

function buildSummary() {
  const count = (state, phase) =>
    [...features.values()].filter((f) => (!phase || f.phase === phase) && readiness.get(f.id) === state).length;
  const total = features.size;
  const unblocked = count("ready") + count("waiting");
  const blocked = count("blocked") + count("blocked-dep");
  const out = [];
  out.push(`_Generated by \`node scripts/features.mjs --write\` — do not edit by hand._`, "");
  out.push(
    `**${total} features** — ✅ ${count("done")} done · 🟢 ${count("ready")} ready · 🟡 ${count("waiting")} waiting · 🔴 ${count("blocked")} blocked · 🟠 ${count("blocked-dep")} blocked by a dependency`,
    "",
    `**No blockers: ${unblocked}** (can be built in dependency order) · **Blocked: ${blocked}** (need an answer to an open question first)`,
    "",
  );
  out.push("| Phase | Total | ✅ Done | 🟢 Ready | 🟡 Waiting | 🔴 Blocked | 🟠 Blocked-dep |", "|---|---|---|---|---|---|---|");
  for (const p of PHASES) {
    const t = [...features.values()].filter((f) => f.phase === p).length;
    if (!t) continue;
    out.push(`| ${p} | ${t} | ${count("done", p)} | ${count("ready", p)} | ${count("waiting", p)} | ${count("blocked", p)} | ${count("blocked-dep", p)} |`);
  }
  out.push("", `**Ready to start now:** ${ids("ready").join(", ") || "—"}`, "");
  if (impact.length) {
    out.push(
      "**Open blocking questions by impact** — _affected_ = features blocked directly or through a dependency; _unblocks_ = features that become unblocked if only this question is answered.",
      "",
      "| Question | Topic | Affected | Unblocks alone | Directly blocks |",
      "|---|---|---|---|---|",
    );
    for (const q of impact) out.push(`| ${q.id} | ${q.topic} | ${q.affected.length} | ${q.unblocks.length} | ${q.direct.join(", ")} |`);
  }
  return out.join("\n");
}

function render() {
  const lines = featuresText.split("\n");
  for (const f of features.values()) {
    const cells = splitRow(lines[f.line]);
    const header = featureRows.find((r) => r.index === f.line).header;
    cells[header.indexOf("Readiness")] = READINESS[readiness.get(f.id)];
    lines[f.line] = `| ${cells.join(" | ")} |`;
  }
  let text = lines.join("\n");
  const start = "<!-- features:summary:start -->";
  const end = "<!-- features:summary:end -->";
  const re = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!re.test(text)) errors.push("Summary markers not found in FEATURES.md");
  text = text.replace(re, `${start}\n${buildSummary()}\n${end}`);
  return text;
}

// ---------- output ----------

if (args.has("--ready")) {
  console.log(ids("ready").join("\n"));
  process.exit(errors.length ? 1 : 0);
}

const rendered = render();

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
}

if (args.has("--check")) {
  const stale = rendered !== featuresText;
  if (stale) console.error("✗ FEATURES.md is out of date — run: node scripts/features.mjs --write");
  if (!errors.length && !stale) console.log("✓ Feature registry is valid and up to date.");
  process.exit(errors.length || stale ? 1 : 0);
}

if (args.has("--write")) {
  if (rendered !== featuresText) writeFileSync(FEATURES, rendered);
  console.log(`✓ Updated ${FEATURES.replace(root + "/", "")}`);
}

const show = (label, state) => {
  const list = ids(state);
  console.log(`\n${READINESS[state]} — ${label} (${list.length})`);
  for (const id of list) {
    const f = features.get(id);
    const why =
      state === "blocked"
        ? `  ← ${f.questions.filter((q) => questions.get(q)?.blocking && questions.get(q)?.open).join(", ")}`
        : state === "waiting" || state === "blocked-dep"
          ? `  ← ${f.deps.filter((d) => readiness.get(d) !== "done").join(", ")}`
          : "";
    console.log(`  ${f.phase}  ${id.padEnd(7)} ${f.title}${why}`);
  }
};

show("ready to start", "ready");
if (!args.has("--write")) {
  show("waiting on dependencies", "waiting");
  show("blocked by an open question", "blocked");
  show("blocked through a dependency", "blocked-dep");
}
if (impact.length) {
  console.log("\nOpen blocking questions by impact (affected / unblocks alone):");
  for (const q of impact) console.log(`  ${q.id.padEnd(5)} ${String(q.affected.length).padStart(3)} / ${String(q.unblocks.length).padStart(3)}  ${q.topic}`);
}
process.exit(errors.length ? 1 : 0);
