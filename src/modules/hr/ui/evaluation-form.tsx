"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { visibleFields } from "@/lib/forms/answers";
import { localize, type FormDefinitionJson, type FormField } from "@/lib/forms/definition";
import { submitEvaluationAction } from "../server/evaluation.actions";

type Raw = Record<string, string | number | boolean>;

/**
 * AC-4: the evaluator fills in the pinned questionnaire (PLT-15 definition). The server validates
 * again; field errors come back as catalog codes under `forms.errors.*`.
 */
export function EvaluationForm({
  evaluationId,
  definition,
  initial,
  locale,
}: {
  evaluationId: string;
  definition: FormDefinitionJson;
  initial: Raw;
  locale: string;
}) {
  const t = useTranslations("hrEvaluation");
  const tf = useTranslations("forms");
  const router = useRouter();
  const id = useId();
  const [values, setValues] = useState<Raw>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: string, v: string | number | boolean) =>
    setValues((cur) => ({ ...cur, [key]: v }));
  const errorText = (code: string) =>
    tf.has(`errors.${code}` as never) ? tf(`errors.${code}` as never) : tf("errors.invalid");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(null);
    try {
      const r = await submitEvaluationAction({ evaluationId, answers: values });
      if (r.ok) {
        toast.success(t("submitted"));
        router.push("/hr/evaluations/mine");
        router.refresh();
      } else if (r.error.fieldErrors)
        setErrors(
          Object.fromEntries(
            Object.entries(r.error.fieldErrors).map(([k, v]) => [k, v[0] ?? "invalid"]),
          ),
        );
      else
        setFormError(
          t.has(`errors.${r.error.message}` as never)
            ? t(`errors.${r.error.message}` as never)
            : t("errors.generic"),
        );
    } finally {
      setPending(false);
    }
  }

  const input = (f: FormField) => {
    const fid = `${id}-${f.key}`;
    const common = {
      id: fid,
      "aria-invalid": !!errors[f.key],
      "aria-describedby": errors[f.key] ? `${fid}-err` : undefined,
    };
    const value = values[f.key];
    switch (f.type) {
      case "textarea":
        return (
          <Textarea
            {...common}
            rows={4}
            value={String(value ?? "")}
            onChange={(e) => set(f.key, e.target.value)}
          />
        );
      case "select":
        return (
          <Select
            {...common}
            value={String(value ?? "")}
            onChange={(e) => set(f.key, e.target.value)}
          >
            <option value="">—</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {localize(o.label, locale)}
              </option>
            ))}
          </Select>
        );
      case "radio":
        return (
          <div role="radiogroup" aria-labelledby={`${fid}-label`} className="flex flex-wrap gap-4">
            {f.options?.map((o) => (
              <label key={o.value} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={fid}
                  className="size-4"
                  checked={value === o.value}
                  onChange={() => set(f.key, o.value)}
                />
                {localize(o.label, locale)}
              </label>
            ))}
          </div>
        );
      case "checkbox":
        return (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={value === true}
              onChange={(e) => set(f.key, e.target.checked)}
            />
            {localize(f.label, locale)}
          </label>
        );
      case "file":
        return null;
      default:
        return (
          <Input
            {...common}
            type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
            value={String(value ?? "")}
            onChange={(e) => set(f.key, e.target.value)}
            {...(f.type === "number"
              ? { step: f.integer ? 1 : "any", min: f.min, max: f.max }
              : {})}
          />
        );
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      {visibleFields(definition, values).map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          {f.type !== "checkbox" && f.type !== "file" && (
            <Label htmlFor={`${id}-${f.key}`} id={`${id}-${f.key}-label`}>
              {localize(f.label, locale)}
              {f.required && <span aria-hidden> *</span>}
            </Label>
          )}
          {input(f)}
          {f.help && (
            <p className="text-muted-foreground text-[13px]">{localize(f.help, locale)}</p>
          )}
          {errors[f.key] && (
            <p id={`${id}-${f.key}-err`} role="alert" className="text-destructive text-sm">
              {errorText(errors[f.key]!)}
            </p>
          )}
        </div>
      ))}
      {formError && (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
