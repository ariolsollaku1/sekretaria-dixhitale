"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { REGISTRATION_TYPES, type RegistrationType } from "../domain/enroll-rules";
import { enrollApplicationAction, enrollManyAction } from "../server/enroll.actions";
import { useExplain } from "./explain";

type Placement = {
  cohorts: { id: string; label: string; groups: { id: string; label: string }[] }[];
};

type Person = {
  firstName: string;
  lastName: string;
  fatherName: string | null;
  gender: "FEMALE" | "MALE";
  birthDate: string;
  birthPlace: string | null;
  nationalId: string | null;
  email: string;
  phone: string;
  address: string;
  residence: string | null;
  nim: string | null;
};

/** The cohort / group / type / start date block shared by the single and the bulk form. */
function PlacementFields({
  options,
  value,
  onChange,
  errors,
}: {
  options: Placement;
  value: {
    cohortId: string;
    groupId: string;
    registrationType: RegistrationType;
    startedAt: string;
  };
  onChange: (v: Partial<typeof value>) => void;
  errors: Record<string, string>;
}) {
  const t = useTranslations("adm.enroll");
  const ts = useTranslations("stu.registrationType");
  const cohort = options.cohorts.find((c) => c.id === value.cohortId);
  const err = (k: string) =>
    errors[k] ? (
      <p role="alert" className="text-danger text-[13px] font-semibold">
        {errors[k]}
      </p>
    ) : null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="en-type">{t("registrationType")}</Label>
        <Select
          id="en-type"
          value={value.registrationType}
          onChange={(e) => onChange({ registrationType: e.target.value as RegistrationType })}
        >
          {REGISTRATION_TYPES.map((r) => (
            <option key={r} value={r}>
              {ts(r)}
            </option>
          ))}
        </Select>
        {err("registrationType")}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="en-start">{t("startedAt")}</Label>
        <Input
          id="en-start"
          type="date"
          value={value.startedAt}
          onChange={(e) => onChange({ startedAt: e.target.value })}
        />
        {err("startedAt")}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="en-cohort">{t("cohort")}</Label>
        <Select
          id="en-cohort"
          value={value.cohortId}
          onChange={(e) => onChange({ cohortId: e.target.value, groupId: "" })}
        >
          <option value="">—</option>
          {options.cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        {err("cohortId")}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="en-group">{t("group")}</Label>
        <Select
          id="en-group"
          value={value.groupId}
          onChange={(e) => onChange({ groupId: e.target.value })}
        >
          <option value="">—</option>
          {(cohort?.groups ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
        {err("groupId")}
      </div>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** AC-2, AC-5, AC-9: confirm the data of one application and enroll it. */
export function EnrollForm({
  applicationId,
  person,
  options,
  missing,
}: {
  applicationId: string;
  person: Person;
  options: Placement;
  missing: number;
}) {
  const t = useTranslations("adm.enroll");
  const router = useRouter();
  const explain = useExplain();
  const [data, setData] = useState({
    ...person,
    fatherName: person.fatherName ?? "",
    birthPlace: person.birthPlace ?? "",
    nationalId: person.nationalId ?? "",
    residence: person.residence ?? "",
    nim: person.nim ?? "",
  });
  const [place, setPlace] = useState({
    cohortId: options.cohorts[0]?.id ?? "",
    groupId: "",
    registrationType: "FIRST_TIME" as RegistrationType,
    startedAt: today(),
  });
  const [allowMissing, setAllowMissing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    try {
      const r = await enrollApplicationAction({
        applicationId,
        person: data,
        ...place,
        allowMissingDocuments: allowMissing,
      });
      if (r.ok) {
        toast.success(t("done"));
        router.refresh();
      } else if (r.error.fieldErrors) {
        const next: Record<string, string> = {};
        for (const [field, codes] of Object.entries(r.error.fieldErrors))
          next[field] = explain({ error: { ...r.error, fieldErrors: { [field]: codes } } });
        setErrors(next);
      } else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }

  const field = (name: keyof typeof data, label: string, type = "text") => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`en-${name}`}>{label}</Label>
      <Input
        id={`en-${name}`}
        type={type}
        value={data[name] ?? ""}
        onChange={(e) => setData({ ...data, [name]: e.target.value })}
      />
      {errors[name] && (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-testid="enroll-form">
      <p className="text-muted-foreground text-sm">{t("hint")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("firstName", t("firstName"))}
        {field("lastName", t("lastName"))}
        {field("fatherName", t("fatherName"))}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="en-gender">{t("gender")}</Label>
          <Select
            id="en-gender"
            value={data.gender}
            onChange={(e) => setData({ ...data, gender: e.target.value as "FEMALE" | "MALE" })}
          >
            <option value="FEMALE">{t("female")}</option>
            <option value="MALE">{t("male")}</option>
          </Select>
        </div>
        {field("birthDate", t("birthDate"), "date")}
        {field("birthPlace", t("birthPlace"))}
        {field("nationalId", t("nationalId"))}
        {field("nim", t("nim"))}
        {field("phone", t("phone"))}
        {field("email", t("email"), "email")}
        {field("address", t("address"))}
        {field("residence", t("residence"))}
      </div>
      {options.cohorts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noCohorts")}</p>
      ) : (
        <PlacementFields
          options={options}
          value={place}
          onChange={(v) => setPlace({ ...place, ...v })}
          errors={errors}
        />
      )}
      {missing > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowMissing}
            onChange={(e) => setAllowMissing(e.target.checked)}
            className="mt-1"
          />
          <span>{t("allowMissing", { count: missing })}</span>
        </label>
      )}
      <div>
        <Button type="submit" disabled={pending || !place.cohortId || !place.groupId}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

type Row = {
  id: string;
  reference: string;
  name: string;
  cycle: string;
  status: string;
  missing: number;
};
type BulkItem = { applicationId: string; reference: string; ok: boolean; code?: string };

/** AC-7, AC-8: enroll a selection of candidates into one cohort and group. */
export function BulkEnroll({ rows, options }: { rows: Row[]; options: Placement }) {
  const t = useTranslations("adm.enroll");
  const ts = useTranslations("adm.status");
  const te = useTranslations("adm.errors");
  const router = useRouter();
  const explain = useExplain();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [place, setPlace] = useState({
    cohortId: options.cohorts[0]?.id ?? "",
    groupId: "",
    registrationType: "FIRST_TIME" as RegistrationType,
    startedAt: today(),
  });
  const [allowMissing, setAllowMissing] = useState(false);
  const [result, setResult] = useState<BulkItem[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    try {
      const r = await enrollManyAction({
        applicationIds: [...selected],
        ...place,
        allowMissingDocuments: allowMissing,
      });
      if (r.ok) {
        setResult(r.data.items as BulkItem[]);
        setSelected(new Set());
        toast.success(t("bulkDone", { count: r.data.enrolled }));
        router.refresh();
      } else if (r.error.fieldErrors) {
        const next: Record<string, string> = {};
        for (const [field, codes] of Object.entries(r.error.fieldErrors))
          next[field] = explain({ error: { ...r.error, fieldErrors: { [field]: codes } } });
        setErrors(next);
        toast.error(Object.values(next)[0] ?? te("generic"));
      } else toast.error(explain(r));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("none")}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5" data-testid="bulk-form">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="w-10 py-2" />
                <th>{t("reference")}</th>
                <th>{t("name")}</th>
                <th>{t("cycle")}</th>
                <th>{t("status")}</th>
                <th>{t("missing")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-border border-t">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      aria-label={r.reference}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="font-tabular">{r.reference}</td>
                  <td>{r.name}</td>
                  <td>{r.cycle}</td>
                  <td>{ts(r.status as never)}</td>
                  <td>{r.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {options.cohorts.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noCohorts")}</p>
          ) : (
            <PlacementFields
              options={options}
              value={place}
              onChange={(v) => setPlace({ ...place, ...v })}
              errors={errors}
            />
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowMissing}
              onChange={(e) => setAllowMissing(e.target.checked)}
              className="mt-1"
            />
            <span>{t("allowMissingBulk")}</span>
          </label>
          <p className="text-muted-foreground text-sm">{t("bulkHint")}</p>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending || selected.size === 0 || !place.groupId}>
              {t("bulkSubmit", { count: selected.size })}
            </Button>
            {errors.applicationIds && (
              <span role="alert" className="text-danger text-[13px] font-semibold">
                {errors.applicationIds}
              </span>
            )}
          </div>
        </form>
      )}
      {result && (
        <section data-testid="bulk-result" className="rounded-card border-border border p-4">
          <h2 className="mb-2 text-base font-semibold">{t("resultTitle")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {result.map((i) => (
              <li key={i.applicationId}>
                <span className="font-tabular">{i.reference}</span>
                {" — "}
                {i.ok
                  ? t("enrolled")
                  : te.has((i.code ?? "") as never)
                    ? te(i.code as never)
                    : te("generic")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
