// Pure template renderer for official documents (PLT-09 AC-2). No I/O, no logic beyond
// substitution, `if` and `each`. Every value is HTML-escaped unless written with triple braces.
export class TemplateError extends Error {
  constructor(
    readonly code: "unclosedBlock" | "unexpectedClose" | "badTag" | "tooDeep",
    readonly line: number,
  ) {
    super(`${code} at line ${line}`);
    this.name = "TemplateError";
  }
}

type Token =
  | { kind: "text"; text: string }
  | { kind: "var"; path: string; raw: boolean; line: number }
  | { kind: "if" | "each"; path: string; line: number }
  | { kind: "end"; of: "if" | "each"; line: number };

const TAG = /\{\{\{\s*([^{}]+?)\s*\}\}\}|\{\{\s*([^{}]+?)\s*\}\}/g;
const PATH = /^(this|@index|[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*)$/;
const MAX_DEPTH = 10;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of source.matchAll(TAG)) {
    const index = m.index ?? 0;
    const line = source.slice(0, index).split("\n").length;
    if (index > last) tokens.push({ kind: "text", text: source.slice(last, index) });
    last = index + m[0].length;
    const raw = m[1] !== undefined;
    const body = (m[1] ?? m[2])!.trim();
    if (!raw && body.startsWith("#")) {
      const [name, path] = body.slice(1).split(/\s+/, 2);
      if ((name !== "if" && name !== "each") || !path || !PATH.test(path))
        throw new TemplateError("badTag", line);
      tokens.push({ kind: name, path, line });
    } else if (!raw && body.startsWith("/")) {
      const name = body.slice(1).trim();
      if (name !== "if" && name !== "each") throw new TemplateError("badTag", line);
      tokens.push({ kind: "end", of: name, line });
    } else {
      if (!PATH.test(body)) throw new TemplateError("badTag", line);
      tokens.push({ kind: "var", path: body, raw, line });
    }
  }
  if (last < source.length) tokens.push({ kind: "text", text: source.slice(last) });
  return tokens;
}

type Node =
  | { kind: "text"; text: string }
  | { kind: "var"; path: string; raw: boolean }
  | { kind: "if" | "each"; path: string; children: Node[] };

function parse(source: string): Node[] {
  const root: Node[] = [];
  const stack: { node: Extract<Node, { children: Node[] }>; line: number }[] = [];
  const current = () => (stack.length ? stack[stack.length - 1]!.node.children : root);
  for (const t of tokenize(source)) {
    if (t.kind === "text") current().push(t);
    else if (t.kind === "var") current().push({ kind: "var", path: t.path, raw: t.raw });
    else if (t.kind === "end") {
      const top = stack.pop();
      if (!top || top.node.kind !== t.of) throw new TemplateError("unexpectedClose", t.line);
    } else {
      if (stack.length >= MAX_DEPTH) throw new TemplateError("tooDeep", t.line);
      const node = { kind: t.kind, path: t.path, children: [] as Node[] };
      current().push(node);
      stack.push({ node, line: t.line });
    }
  }
  if (stack.length) throw new TemplateError("unclosedBlock", stack[stack.length - 1]!.line);
  return root;
}

/** AC-2: throws a TemplateError for a template that cannot be rendered; used when a draft is saved. */
export function validateTemplate(source: string): void {
  parse(source);
}

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

type Scope = {
  item: unknown;
  index: number | null;
  parent: Scope | null;
  root: Record<string, unknown>;
};

function lookup(path: string, scope: Scope): unknown {
  if (path === "@index") {
    for (let s: Scope | null = scope; s; s = s.parent) if (s.index !== null) return s.index;
    return undefined;
  }
  if (path === "this") return scope.item;
  const parts = path.split(".");
  if (parts.some((p) => FORBIDDEN.has(p))) return undefined;
  const walk = (start: unknown) => {
    let v: unknown = start;
    for (const p of parts) {
      if (v === null || typeof v !== "object" || !Object.prototype.hasOwnProperty.call(v, p))
        return undefined;
      v = (v as Record<string, unknown>)[p];
    }
    return v;
  };
  // the current item first, then the enclosing scopes, then the root data
  for (let s: Scope | null = scope; s; s = s.parent) {
    if (s.item !== null && typeof s.item === "object") {
      const v = walk(s.item);
      if (v !== undefined) return v;
    }
  }
  return walk(scope.root);
}

export const escapeHtml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const text = (v: unknown): string =>
  v === null || v === undefined
    ? ""
    : v instanceof Date
      ? v.toISOString().slice(0, 10)
      : typeof v === "object"
        ? ""
        : String(v);

const truthy = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : !!v && v !== "false");

function render(nodes: Node[], scope: Scope): string {
  let out = "";
  for (const n of nodes) {
    if (n.kind === "text") out += n.text;
    else if (n.kind === "var") {
      const s = text(lookup(n.path, scope));
      out += n.raw ? s : escapeHtml(s);
    } else if (n.kind === "if") {
      if (truthy(lookup(n.path, scope))) out += render(n.children, scope);
    } else {
      const list = lookup(n.path, scope);
      if (Array.isArray(list))
        list.forEach(
          (item, index) =>
            (out += render(n.children, { item, index, parent: scope, root: scope.root })),
        );
    }
  }
  return out;
}

/** AC-2: `{{path}}` escaped, `{{{path}}}` raw, `{{#if path}}`, `{{#each path}}` with `this` and `@index`. */
export function renderTemplate(source: string, data: Record<string, unknown>): string {
  return render(parse(source), { item: null, index: null, parent: null, root: data });
}

/** AC-5: `PREFIX-YYYY-NNNNN`. */
export const PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
export function formatNumber(prefix: string, year: number, sequence: number): string {
  if (!PREFIX_PATTERN.test(prefix)) throw new Error(`Invalid number prefix "${prefix}"`);
  return `${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
}
