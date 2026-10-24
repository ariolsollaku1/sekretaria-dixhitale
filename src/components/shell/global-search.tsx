"use client";
import { CornerDownLeft, File, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { matchMenu } from "@/lib/search/menu";
import { MIN_QUERY, type SearchGroup } from "@/lib/search/registry";
import { searchAction } from "@/lib/search/actions";
import type { NavSectionView } from "./nav-list";

type Row = { key: string; title: string; subtitle?: string; href: string; group: string };
type State = "idle" | "loading" | "done" | "error" | "rate";

const DEBOUNCE_MS = 200;

/** PLT-16: command palette in the top bar. Menu pages match locally, records come from the server. */
export function GlobalSearch({ sections }: { sections: NavSectionView[] }) {
  const t = useTranslations("shell.search");
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [state, setState] = useState<State>("idle");
  const [active, setActive] = useState(0);
  const request = useRef(0);

  // AC-1: Ctrl/⌘+K from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reset = useCallback(() => {
    request.current++;
    setQuery("");
    setGroups([]);
    setState("idle");
    setActive(0);
  }, []);

  function onQuery(value: string) {
    setQuery(value);
    setActive(0);
    const id = ++request.current; // AC-6: a newer keystroke makes older answers stale
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY) {
      setGroups([]);
      setState("idle");
      return;
    }
    setState("loading");
    setTimeout(async () => {
      if (id !== request.current) return;
      try {
        const result = await searchAction({ query: trimmed });
        if (id !== request.current) return;
        if (result.ok) {
          setGroups(result.groups);
          setState("done");
        } else {
          setGroups([]);
          setState(result.error === "RATE_LIMITED" ? "rate" : "error");
        }
      } catch {
        if (id === request.current) setState("error");
      }
    }, DEBOUNCE_MS);
  }

  const pages = matchMenu(
    sections.flatMap((s) =>
      s.items.map((i) => ({ id: i.id, label: i.label, href: i.href, section: s.heading })),
    ),
    query,
  );
  const rows: Row[] = [
    ...pages.map((p) => ({
      key: `page:${p.id}`,
      title: p.label,
      subtitle: p.section ?? undefined,
      href: p.href,
      group: "pages",
    })),
    ...groups.flatMap((g) =>
      g.hits.map((h) => ({
        key: `${g.id}:${h.id}`,
        title: h.title,
        subtitle: h.subtitle,
        href: h.href,
        group: g.groupKey,
      })),
    ),
  ];

  function go(row: Row) {
    setOpen(false);
    router.push(row.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length === 0) return;
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      const row = rows[active];
      if (row) {
        e.preventDefault();
        go(row);
      }
    }
  }

  const trimmed = query.trim();
  const message =
    trimmed.length === 0
      ? t("hint")
      : state === "loading"
        ? null
        : state === "error"
          ? t("error")
          : state === "rate"
            ? t("rateLimited")
            : trimmed.length < MIN_QUERY && rows.length === 0
              ? t("minChars", { count: MIN_QUERY })
              : rows.length === 0
                ? t("noResults", { query: trimmed })
                : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        className="rounded-control bg-card ring-border text-muted-foreground hover:bg-accent flex min-h-11 min-w-11 items-center justify-center gap-2 text-sm shadow-sm ring-1 md:w-full md:max-w-sm md:justify-start md:px-3"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden flex-1 text-left md:inline">{t("placeholder")}</span>
        <kbd className="bg-muted text-muted-foreground hidden rounded-md px-1.5 py-0.5 text-[13px] md:inline">
          Ctrl K
        </kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent
          closeLabel={t("close")}
          className="top-[10%] w-[calc(100%-1.5rem)] max-w-xl translate-y-0 overflow-hidden p-0"
        >
          <DialogTitle className="sr-only">{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("hint")}</DialogDescription>
          <div className="border-border flex items-center gap-3 border-b px-4">
            <Search className="text-muted-foreground size-5 shrink-0" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded={rows.length > 0}
              aria-controls={listId}
              aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              aria-label={t("title")}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={80}
              // The palette is a single-field dialog: the caret and the highlighted row show focus, and the
              // unlayered global ring would draw a box around the whole row.
              style={{ outline: "none" }}
              placeholder={t("placeholder")}
              className="placeholder:text-muted-foreground min-h-14 flex-1 bg-transparent pr-10 text-base outline-none focus-visible:outline-none"
            />
            {state === "loading" && (
              <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
            )}
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {state === "loading"
              ? t("loading")
              : rows.length > 0
                ? t("count", { count: rows.length })
                : message}
          </p>

          <ul
            id={listId}
            role="listbox"
            aria-label={t("results")}
            className="max-h-[60vh] overflow-y-auto p-2"
          >
            {rows.map((row, i) => (
              <li key={row.key} role="presentation">
                {(i === 0 || rows[i - 1]!.group !== row.group) && (
                  <p className="text-muted-foreground px-3 pt-3 pb-1 text-[13px] font-semibold tracking-wide uppercase">
                    {row.group === "pages" ? t("pages") : t(`groups.${row.group}` as never)}
                  </p>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(row)}
                  className={`rounded-control flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-accent text-accent-foreground" : ""}`}
                >
                  <File className="text-brand size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{row.title}</span>
                    {row.subtitle && (
                      <span className="text-muted-foreground block truncate text-[13px]">
                        {row.subtitle}
                      </span>
                    )}
                  </span>
                  {i === active && <CornerDownLeft className="size-4 shrink-0" aria-hidden />}
                </div>
              </li>
            ))}
          </ul>
          {message && <p className="text-muted-foreground px-6 pt-2 pb-6 text-sm">{message}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
