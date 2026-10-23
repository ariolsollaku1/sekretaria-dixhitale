"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { REGISTRATION_TYPES } from "../domain/schemas";
import {
  addEnrollmentAction,
  changeGroupAction,
  registerYearAction,
} from "../server/student.actions";

type CohortOption = { id: string; programId: string; program: string; label: string };
type GroupOption = { id: string; academicYearId: string; yearOfStudy: number; label: string };

function useExplain() {
  const t = useTranslations("stu");
  return (result: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    const code = result.error.fieldErrors
      ? Object.values(result.error.fieldErrors)[0]?.[0]
      : result.error.message;
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  };
}

/** AC-2/AC-3: enroll the student in another program or cohort. */
export function AddEnrollment({
  studentId,
  cohorts,
}: {
  studentId: string;
  cohorts: CohortOption[];
}) {
  const t = useTranslations("stu");
  const router = useRouter();
  const explain = useExplain();
  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? "");
  const [type, setType] = useState<(typeof REGISTRATION_TYPES)[number]>("SECOND_PROGRAM");
  const [startedAt, setStartedAt] = useState("");
  const [pending, setPending] = useState(false);
  const cohort = cohorts.find((c) => c.id === cohortId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cohort) return;
    setPending(true);
    try {
      const r = await addEnrollmentAction({
        studentId,
        programId: cohort.programId,
        cohortId,
        registrationType: type,
        startedAt,
      });
      if (r.ok) {
        toast.success(t("actions.enrolled"));
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }
  if (cohorts.length === 0)
    return <p className="text-muted-foreground text-sm">{t("form.noCohorts")}</p>;
  return (
    <form
      onSubmit={submit}
      className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4 print:hidden"
    >
      <div className="flex min-w-60 flex-col gap-1.5">
        <Label htmlFor="add-cohort">{t("form.cohort")}</Label>
        <Select id="add-cohort" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.program} · {c.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-type">{t("form.registrationType")}</Label>
        <Select id="add-type" value={type} onChange={(e) => setType(e.target.value as never)}>
          {REGISTRATION_TYPES.map((r) => (
            <option key={r} value={r}>
              {t(`registrationType.${r}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-start">{t("form.startedAt")}</Label>
        <Input
          id="add-start"
          type="date"
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending || !startedAt}>
        {t("actions.enroll")}
      </Button>
    </form>
  );
}

/** AC-7: register an active enrollment for an academic year in a year of study and group. */
export function RegisterYear({
  enrollmentId,
  durationYears,
  years,
  groups,
}: {
  enrollmentId: string;
  durationYears: number;
  years: { id: string; label: string }[];
  groups: GroupOption[];
}) {
  const t = useTranslations("stu");
  const router = useRouter();
  const explain = useExplain();
  const [yearId, setYearId] = useState(years[0]?.id ?? "");
  const [yearOfStudy, setYearOfStudy] = useState(1);
  const [groupId, setGroupId] = useState("");
  const [pending, setPending] = useState(false);
  const options = groups.filter(
    (g) => g.academicYearId === yearId && g.yearOfStudy === yearOfStudy,
  );
  const chosen = options.some((g) => g.id === groupId) ? groupId : (options[0]?.id ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const r = await registerYearAction({
        enrollmentId,
        academicYearId: yearId,
        yearOfStudy,
        groupId: chosen,
      });
      if (r.ok) {
        toast.success(t("actions.registered"));
        router.refresh();
      } else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`ry-${enrollmentId}`}>{t("form.academicYear")}</Label>
        <Select
          id={`ry-${enrollmentId}`}
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex w-28 flex-col gap-1.5">
        <Label htmlFor={`ryy-${enrollmentId}`}>{t("form.yearOfStudy")}</Label>
        <Select
          id={`ryy-${enrollmentId}`}
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
      <div className="flex min-w-40 flex-col gap-1.5">
        <Label htmlFor={`ryg-${enrollmentId}`}>{t("form.group")}</Label>
        {options.length === 0 ? (
          <p id={`ryg-${enrollmentId}`} className="text-muted-foreground text-sm">
            {t("form.noGroup")}
          </p>
        ) : (
          <Select
            id={`ryg-${enrollmentId}`}
            value={chosen}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {options.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        )}
      </div>
      <Button type="submit" disabled={pending || !chosen}>
        {t("actions.register")}
      </Button>
    </form>
  );
}

/** AC-8: move a yearly registration to another group of the same cohort, year and year of study. */
export function ChangeGroup({
  yearRegistrationId,
  groupId,
  options,
  label,
}: {
  yearRegistrationId: string;
  groupId: string;
  options: GroupOption[];
  label: string;
}) {
  const t = useTranslations("stu");
  const router = useRouter();
  const explain = useExplain();
  const [value, setValue] = useState(groupId);
  async function save() {
    const r = await changeGroupAction({ yearRegistrationId, groupId: value });
    if (r.ok) {
      toast.success(t("actions.saved"));
      router.refresh();
    } else toast.error(explain(r));
  }
  if (options.length <= 1) return null;
  return (
    <div className="flex items-end gap-2 print:hidden">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`cg-${yearRegistrationId}`} className="text-[12px]">
          {label}
        </Label>
        <Select
          id={`cg-${yearRegistrationId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          {options.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="button" variant="secondary" disabled={value === groupId} onClick={save}>
        {t("actions.changeGroup")}
      </Button>
    </div>
  );
}

export { type GroupOption };
