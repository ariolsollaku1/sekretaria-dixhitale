"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toaster";
import {
  createGroupAction,
  deactivateGroupAction,
  reactivateGroupAction,
  updateGroupAction,
} from "../server/cohort.actions";
import { ReasonDialog } from "./reason-dialog";

export type GroupRowData = {
  id: string;
  academicYearId: string;
  academicYear: string;
  yearOfStudy: number;
  name: string;
  capacity: number | null;
  active: boolean;
};

function useExplain() {
  const t = useTranslations("org.group");
  const root = useTranslations();
  return (result: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    if (result.error.fieldErrors?.reason) return t("errors.reasonRequired");
    const code = result.error.fieldErrors
      ? Object.values(result.error.fieldErrors)[0]?.[0]
      : result.error.message.split(":")[0];
    if (code === "HAS_DEPENDENTS") {
      const names = (result.error.message.split(":")[1] ?? "")
        .split(",")
        .map((p) => p.split("="))
        .map(([k, n]) => `${root.has(k as never) ? root(k as never) : k} (${n})`);
      return t("errors.HAS_DEPENDENTS", { names: names.join(", ") });
    }
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  };
}

function GroupRow({ group, canWrite }: { group: GroupRowData; canWrite: boolean }) {
  const t = useTranslations("org.group");
  const tOrg = useTranslations("org");
  const router = useRouter();
  const explain = useExplain();
  const [name, setName] = useState(group.name);
  const [capacity, setCapacity] = useState(group.capacity?.toString() ?? "");
  const dirty = name !== group.name || capacity !== (group.capacity?.toString() ?? "");

  async function save() {
    const r = await updateGroupAction({
      groupId: group.id,
      name,
      capacity: capacity === "" ? null : Number(capacity),
    });
    if (r.ok) {
      toast.success(t("saved"));
      router.refresh();
    } else toast.error(explain(r));
  }

  return (
    <li className="rounded-control border-border bg-card flex flex-wrap items-end gap-3 border p-3">
      <span className="font-tabular w-16 text-sm font-semibold">
        {t("yearShort", { year: group.yearOfStudy })}
      </span>
      {canWrite ? (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${group.id}-name`} className="text-[12px]">
              {t("columns.name")}
            </Label>
            <Input id={`${group.id}-name`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex w-28 flex-col gap-1">
            <Label htmlFor={`${group.id}-cap`} className="text-[12px]">
              {t("columns.capacity")}
            </Label>
            <Input
              id={`${group.id}-cap`}
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <Button type="button" disabled={!dirty || !name.trim()} onClick={save}>
            {t("save")} <span className="sr-only">{group.name}</span>
          </Button>
        </>
      ) : (
        <span className="text-sm">
          {group.name}
          {group.capacity ? ` · ${group.capacity}` : ""}
        </span>
      )}
      <StatusBadge
        tone={group.active ? "success" : "neutral"}
        label={tOrg(group.active ? "status.active" : "status.inactive")}
      />
      {canWrite && (
        <ReasonDialog
          triggerLabel={t(group.active ? "deactivate" : "reactivate")}
          title={t(group.active ? "deactivateTitle" : "reactivateTitle")}
          description={t(group.active ? "deactivateBody" : "reactivateBody")}
          confirmLabel={t(group.active ? "deactivate" : "reactivate")}
          destructive={group.active}
          onSubmit={async (reason) => {
            const r = await (group.active ? deactivateGroupAction : reactivateGroupAction)({
              groupId: group.id,
              reason,
            } as never);
            if (r.ok) {
              router.refresh();
              return null;
            }
            return explain(r);
          }}
        />
      )}
    </li>
  );
}

/** AC-6..AC-8, AC-11: the cohort's groups by academic year, with the add form for writers. */
export function GroupManager({
  cohortId,
  durationYears,
  groups,
  years,
  canWrite,
  cohortActive,
}: {
  cohortId: string;
  durationYears: number;
  groups: GroupRowData[];
  years: { id: string; label: string }[];
  canWrite: boolean;
  cohortActive: boolean;
}) {
  const t = useTranslations("org.group");
  const router = useRouter();
  const explain = useExplain();
  const [yearId, setYearId] = useState(years[0]?.id ?? "");
  const [yearOfStudy, setYearOfStudy] = useState(1);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [pending, setPending] = useState(false);
  const byYear = new Map<string, GroupRowData[]>();
  for (const g of groups) byYear.set(g.academicYear, [...(byYear.get(g.academicYear) ?? []), g]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const r = await createGroupAction({
        cohortId,
        academicYearId: yearId,
        yearOfStudy,
        name,
        capacity: capacity === "" ? null : Number(capacity),
      });
      if (r.ok) {
        setName("");
        setCapacity("");
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {canWrite && cohortActive && (
        <form
          onSubmit={add}
          className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4 print:hidden"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-year">{t("form.year")}</Label>
            <Select id="g-year" value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor="g-yos">{t("form.yearOfStudy")}</Label>
            <Select
              id="g-yos"
              value={yearOfStudy}
              onChange={(e) => setYearOfStudy(Number(e.target.value))}
            >
              {Array.from({ length: durationYears }, (_, i) => i + 1).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-name">{t("form.name")}</Label>
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor="g-cap">{t("form.capacity")}</Label>
            <Input
              id="g-cap"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending || !name.trim() || !yearId}>
            {t("form.add")}
          </Button>
        </form>
      )}
      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        [...byYear.entries()].map(([year, list]) => (
          <section key={year} aria-labelledby={`gy-${year}`}>
            <h3 id={`gy-${year}`} className="mb-2 text-lg font-semibold">
              {year}
            </h3>
            <ul className="flex flex-col gap-2">
              {list.map((g) => (
                <GroupRow
                  key={`${g.id}-${g.name}-${g.capacity}-${g.active}`}
                  group={g}
                  canWrite={canWrite}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
