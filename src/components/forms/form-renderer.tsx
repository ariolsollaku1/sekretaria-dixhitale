"use client";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { FileUpload } from "@/components/files/file-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HONEYPOT_FIELD, visibleFields } from "@/lib/forms/answers";
import { localize, type FormDefinitionJson, type FormField } from "@/lib/forms/definition";
import { submitFormAction, submitPublicFormAction } from "@/lib/forms/submission.actions";

type Raw = Record<string, string | number | boolean>;

/**
 * PLT-15 AC-5: renders a definition and submits it. The server validates again; field errors come
 * back as catalog codes under `forms.errors.*`. `preview` renders without submitting.
 */
export function FormRenderer({
  formKey,
  definition,
  locale,
  mode,
  upload,
}: {
  formKey: string;
  definition: FormDefinitionJson;
  locale: string;
  mode: "public" | "authenticated" | "preview";
  upload?: {
    purpose: string;
    maxBytes: number;
    mimeTypes: readonly string[];
    typeLabels: readonly string[];
  };
}) {
  const t = useTranslations("forms");
  const id = useId();
  const [values, setValues] = useState<Raw>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const set = (key: string, v: string | number | boolean) =>
    setValues((cur) => ({ ...cur, [key]: v }));
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.invalid");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "preview") return;
    setPending(true);
    setErrors({});
    setFormError(null);
    try {
      if (mode === "public") {
        const r = await submitPublicFormAction(formKey, values);
        if (r.ok) setReference(r.reference);
        else if (r.code === "VALIDATION") setErrors(r.errors);
        else setFormError(t(r.code === "RATE_LIMITED" ? "rateLimited" : "notAvailable"));
      } else {
        const r = await submitFormAction({ key: formKey, answers: values });
        if (r.ok) setReference(r.data.reference);
        else if (r.error.fieldErrors)
          setErrors(
            Object.fromEntries(
              Object.entries(r.error.fieldErrors).map(([k, v]) => [k, v[0] ?? "invalid"]),
            ),
          );
        else setFormError(t("notAvailable"));
      }
    } finally {
      setPending(false);
    }
  }

  if (reference)
    return (
      <div
        role="status"
        className="rounded-card border-success/40 bg-success-bg max-w-xl border p-4"
      >
        <h2 className="mb-2 text-xl font-semibold">{t("thanks")}</h2>
        <p className="text-sm">{t("yourReference")}</p>
        <p className="font-tabular my-2 text-2xl font-bold">{reference}</p>
        <p className="text-muted-foreground text-sm">{t("keepReference")}</p>
      </div>
    );

  const fieldInput = (f: FormField) => {
    const fid = `${id}-${f.key}`;
    const described = errors[f.key] ? `${fid}-err` : f.help ? `${fid}-help` : undefined;
    const common = { id: fid, "aria-invalid": !!errors[f.key], "aria-describedby": described };
    const value = values[f.key];
    switch (f.type) {
      case "textarea":
        return (
          <Textarea
            {...common}
            rows={5}
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
          <div role="radiogroup" aria-labelledby={`${fid}-label`} className="flex flex-col gap-1">
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
              {...{ "aria-describedby": described }}
            />
            {localize(f.label, locale)}
          </label>
        );
      case "file":
        return upload ? (
          <FileUpload
            {...upload}
            label={localize(f.label, locale)}
            onUploaded={(file) => set(f.key, file.id)}
          />
        ) : (
          <p className="text-muted-foreground text-sm">{t("filesUnavailable")}</p>
        );
      default: {
        const type =
          f.type === "email"
            ? "email"
            : f.type === "number"
              ? "number"
              : f.type === "date"
                ? "date"
                : f.type === "phone"
                  ? "tel"
                  : "text";
        return (
          <Input
            {...common}
            type={type}
            value={String(value ?? "")}
            onChange={(e) => set(f.key, e.target.value)}
            {...(f.type === "number"
              ? { step: f.integer ? 1 : "any", min: f.min, max: f.max }
              : {})}
          />
        );
      }
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
          {fieldInput(f)}
          {f.help && (
            <p id={`${id}-${f.key}-help`} className="text-muted-foreground text-[13px]">
              {localize(f.help, locale)}
            </p>
          )}
          {errors[f.key] && (
            <p
              id={`${id}-${f.key}-err`}
              role="alert"
              className="text-danger text-[13px] font-semibold"
            >
              {errorText(errors[f.key]!)}
            </p>
          )}
        </div>
      ))}
      {/* AC-6: bots fill every input; people never see this one */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          {HONEYPOT_FIELD}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            name={HONEYPOT_FIELD}
            value={String(values[HONEYPOT_FIELD] ?? "")}
            onChange={(e) => set(HONEYPOT_FIELD, e.target.value)}
          />
        </label>
      </div>
      {formError && (
        <p role="alert" className="text-danger text-sm font-semibold">
          {formError}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || mode === "preview"}>
          {t("submit")}
        </Button>
        {mode === "preview" && (
          <span className="text-muted-foreground ml-3 text-sm">{t("previewNote")}</span>
        )}
      </div>
    </form>
  );
}
