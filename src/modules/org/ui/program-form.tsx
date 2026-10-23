"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { programSchema } from "../domain/schemas";
import { createProgramAction, updateProgramAction } from "../server/program.actions";

type Values = {
  departmentId?: string;
  cycle: "FIRST" | "SECOND";
  subtype?: string | null;
  code: string;
  name: string;
  nameEn?: string | null;
  durationYears: number | string;
  totalCredits: number | string;
};

type Common = {
  /** Allowed durations per cycle from the settings (AC-3); the server re-checks. */
  durations: Record<"FIRST" | "SECOND", number[]>;
  subtypes: { code: string; nameSq: string; nameEn: string }[];
  defaults?: Values;
};
type Props = (
  { mode: "create"; departments: { id: string; label: string }[] } | { mode: "edit"; id: string }
) &
  Common;

/** AC-2/AC-5: one form for creating and editing a program. */
export function ProgramForm(props: Props) {
  const t = useTranslations("org");
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<Values>({
    // Edit validates the same fields minus the (fixed) department; the id is added on submit.
    resolver: zodResolver(
      (props.mode === "create"
        ? programSchema
        : programSchema.omit({ departmentId: true })) as never,
    ) as never,
    defaultValues: props.defaults ?? {
      departmentId: props.mode === "create" ? props.departments[0]?.id : undefined,
      cycle: "FIRST",
      subtype: "",
      code: "",
      name: "",
      nameEn: "",
      durationYears: props.durations.FIRST[0] ?? 3,
      totalCredits: "",
    },
  });
  const cycle = useWatch({ control: form.control, name: "cycle" });
  const message = (key: string | undefined) =>
    key && t.has(`errors.${key}` as never) ? t(`errors.${key}` as never) : t("errors.generic");
  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);

  const submit: SubmitHandler<Values> = async (values) => {
    setPending(true);
    try {
      const payload = {
        ...values,
        subtype: values.cycle === "SECOND" ? values.subtype || null : null,
      };
      const result =
        props.mode === "create"
          ? await createProgramAction(payload as never)
          : await updateProgramAction({ ...payload, programId: props.id } as never);
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`/org/programs/${(result.data as { id: string }).id}`);
        router.refresh();
        return;
      }
      const fields = result.error.fieldErrors ?? {};
      for (const [name, keys] of Object.entries(fields))
        form.setError(name as keyof Values, { message: message(keys[0]) });
      if (Object.keys(fields).length === 0)
        toast.error(
          result.error.message.startsWith("HAS_DEPENDENTS")
            ? t("errors.HAS_DEPENDENTS", { names: result.error.message.split(":")[1] ?? "" })
            : message(result.error.message),
        );
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-xl flex-col gap-4">
      {props.mode === "create" && (
        <FormField
          control={form.control}
          name="departmentId"
          label={t("unit.department")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Select {...field} value={field.value ?? ""} {...a11y}>
              {props.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          )}
        />
      )}
      <FormField
        control={form.control}
        name="cycle"
        label={t("program.cycle")}
        formatError={fieldError}
        render={({ field, ...a11y }) => (
          <Select
            {...field}
            {...a11y}
            onChange={(e) => {
              field.onChange(e);
              const next = e.target.value as "FIRST" | "SECOND";
              const allowed = props.durations[next];
              if (!allowed.includes(Number(form.getValues("durationYears"))))
                form.setValue("durationYears", allowed[0] ?? 1);
              if (next === "FIRST") form.setValue("subtype", "");
            }}
          >
            <option value="FIRST">{t("program.cycles.FIRST")}</option>
            <option value="SECOND">{t("program.cycles.SECOND")}</option>
          </Select>
        )}
      />
      {cycle === "SECOND" && props.subtypes.length > 0 && (
        <FormField
          control={form.control}
          name="subtype"
          label={t("program.subtype")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Select {...field} value={field.value ?? ""} {...a11y}>
              <option value="">{t("program.noSubtype")}</option>
              {props.subtypes.map((s) => (
                <option key={s.code} value={s.code}>
                  {locale === "en" ? s.nameEn : s.nameSq}
                </option>
              ))}
            </Select>
          )}
        />
      )}
      <FormField
        control={form.control}
        name="code"
        label={t("unit.code")}
        description={t("program.codeHint")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Input {...field} {...a11y} autoCapitalize="characters" />}
      />
      <FormField
        control={form.control}
        name="name"
        label={t("unit.name")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
      />
      <FormField
        control={form.control}
        name="nameEn"
        label={t("unit.nameEn")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Input {...field} value={field.value ?? ""} {...a11y} />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="durationYears"
          label={t("program.duration")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Select {...field} {...a11y}>
              {props.durations[cycle].map((y) => (
                <option key={y} value={y}>
                  {t("program.years", { count: y })}
                </option>
              ))}
            </Select>
          )}
        />
        <FormField
          control={form.control}
          name="totalCredits"
          label={t("program.credits")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Input type="number" min={1} max={600} inputMode="numeric" {...field} {...a11y} />
          )}
        />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "unit.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
