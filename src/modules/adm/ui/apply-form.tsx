"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { HONEYPOT_FIELD } from "../domain/schemas";
import { submitApplicationAction } from "../server/application.actions";

type Values = Record<string, string | boolean>;
type Option = { id: string; label: string };

// AC-3: four steps; the server validates everything again. `STEPS` lists the fields of each step
// so that a server error sends the candidate back to the step that holds the field.
const STEPS = [
  ["firstName", "lastName", "fatherName", "gender", "birthDate", "birthPlace", "nationalId"],
  ["email", "phone", "address", "residence"],
  ["schoolName", "schoolCity", "graduationYear", "averageGrade"],
  ["cycleId", "programId", "consent"],
] as const;
const REQUIRED = new Set([
  "firstName",
  "lastName",
  "gender",
  "birthDate",
  "email",
  "phone",
  "address",
  "schoolName",
  "graduationYear",
  "averageGrade",
  "cycleId",
  "programId",
]);

export function ApplyForm({
  cycles,
  programs,
  locale,
}: {
  cycles: Option[];
  programs: Option[];
  locale: string;
}) {
  const t = useTranslations("adm.apply");
  const te = useTranslations("adm.errors");
  const router = useRouter();
  const uid = useId();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({
    cycleId: cycles.length === 1 ? cycles[0]!.id : "",
    consent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: string, v: string | boolean) => setValues((cur) => ({ ...cur, [key]: v }));
  const errText = (code: string) => (te.has(code as never) ? te(code as never) : te("invalid"));

  function stepErrors(index: number) {
    const found: Record<string, string> = {};
    for (const key of STEPS[index]!) {
      const v = values[key];
      if (key === "consent") {
        if (v !== true) found[key] = "consentRequired";
      } else if (REQUIRED.has(key) && (typeof v !== "string" || v.trim() === ""))
        found[key] = "required";
    }
    return found;
  }

  function next() {
    const found = stepErrors(step);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep(step + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    const found = stepErrors(step);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    setFormError(null);
    try {
      const r = await submitApplicationAction({ ...values, locale });
      if (r.ok) {
        router.push(`/apply/status/${r.token}?new=${encodeURIComponent(r.reference)}`);
        return;
      }
      if (r.code === "RATE_LIMITED") setFormError(t("rateLimited"));
      else {
        setErrors(r.errors);
        const first = STEPS.findIndex((keys) => keys.some((k) => r.errors[k]));
        if (first >= 0) setStep(first);
        else setFormError(t("failed"));
      }
    } finally {
      setPending(false);
    }
  }

  const field = (
    key: string,
    label: string,
    props: { type?: string; inputMode?: "decimal" } = {},
  ) => (
    <div key={key} className="flex flex-col gap-1.5">
      <Label htmlFor={`${uid}-${key}`}>
        {label}
        {REQUIRED.has(key) && <span aria-hidden> *</span>}
      </Label>
      <Input
        id={`${uid}-${key}`}
        name={key}
        value={String(values[key] ?? "")}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `${uid}-${key}-err` : undefined}
        {...props}
      />
      {errors[key] && (
        <p id={`${uid}-${key}-err`} role="alert" className="text-danger text-[13px]">
          {errText(errors[key])}
        </p>
      )}
    </div>
  );

  const select = (key: string, label: string, options: Option[]) => (
    <div key={key} className="flex flex-col gap-1.5">
      <Label htmlFor={`${uid}-${key}`}>
        {label}
        {REQUIRED.has(key) && <span aria-hidden> *</span>}
      </Label>
      <Select
        id={`${uid}-${key}`}
        name={key}
        value={String(values[key] ?? "")}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `${uid}-${key}-err` : undefined}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
      {errors[key] && (
        <p id={`${uid}-${key}-err`} role="alert" className="text-danger text-[13px]">
          {errText(errors[key])}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {t("stepOf", { step: step + 1, total: STEPS.length })} ·{" "}
        {t((["step1", "step2", "step3", "step4"] as const)[step]!)}
      </p>
      {/* honeypot: hidden from people and from assistive technology */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          {HONEYPOT_FIELD}
          <input
            type="text"
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            value={String(values[HONEYPOT_FIELD] ?? "")}
            onChange={(e) => set(HONEYPOT_FIELD, e.target.value)}
          />
        </label>
      </div>

      {step === 0 && (
        <>
          {field("firstName", t("firstName"))}
          {field("lastName", t("lastName"))}
          {field("fatherName", t("fatherName"))}
          {select("gender", t("gender"), [
            { id: "FEMALE", label: t("female") },
            { id: "MALE", label: t("male") },
          ])}
          {field("birthDate", t("birthDate"), { type: "date" })}
          {field("birthPlace", t("birthPlace"))}
          {field("nationalId", t("nationalId"))}
        </>
      )}
      {step === 1 && (
        <>
          {field("email", t("email"), { type: "email" })}
          {field("phone", t("phone"), { type: "tel" })}
          {field("address", t("address"))}
          {field("residence", t("residence"))}
        </>
      )}
      {step === 2 && (
        <>
          <p className="text-muted-foreground text-sm">{t("educationHint")}</p>
          {field("schoolName", t("schoolName"))}
          {field("schoolCity", t("schoolCity"))}
          {field("graduationYear", t("graduationYear"), { inputMode: "decimal" })}
          {field("averageGrade", t("averageGrade"), { inputMode: "decimal" })}
        </>
      )}
      {step === 3 && (
        <>
          {cycles.length > 1 && select("cycleId", t("cycle"), cycles)}
          {select("programId", t("program"), programs)}
          <div className="flex flex-col gap-1.5">
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="consent"
                className="mt-1 size-4"
                checked={values.consent === true}
                onChange={(e) => set("consent", e.target.checked)}
                aria-invalid={!!errors.consent}
              />
              <span>{t("consent")}</span>
            </label>
            {errors.consent && (
              <p role="alert" className="text-danger text-[13px]">
                {errText(errors.consent)}
              </p>
            )}
          </div>
          <p className="text-muted-foreground text-[13px]">{t("documentsLater")}</p>
        </>
      )}
      {errors.cycleId && cycles.length === 1 && (
        <p role="alert" className="text-danger text-sm">
          {errText(errors.cycleId)}
        </p>
      )}
      {formError && (
        <p role="alert" className="text-danger text-sm">
          {formError}
        </p>
      )}
      <div className="flex gap-3">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
            {t("back")}
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next}>
            {t("next")}
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
        )}
      </div>
    </form>
  );
}
