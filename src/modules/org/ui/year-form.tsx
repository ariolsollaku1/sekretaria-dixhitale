"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { yearSchema, type YearFormInput } from "../domain/schemas";
import { createYearAction, updateYearAction } from "../server/year.actions";

type Props = { mode: "create" } | { mode: "edit"; yearId: string };

const EMPTY: YearFormInput = {
  startDate: "",
  endDate: "",
  semester1: { start: "", end: "" },
  semester2: { start: "", end: "" },
};

/** AC-3/AC-8: one form for creating and editing a year with its two semesters. */
export function YearForm(props: Props & { defaults?: YearFormInput }) {
  const t = useTranslations("org");
  const router = useRouter();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const form = useForm<YearFormInput>({
    resolver: zodResolver(yearSchema),
    defaultValues: props.defaults ?? EMPTY,
  });

  const message = (key: string) =>
    t.has(`errors.${key}` as never) ? t(`errors.${key}` as never) : t("errors.generic");

  const submit: SubmitHandler<YearFormInput> = async (values) => {
    setPending(true);
    setServerErrors({});
    try {
      const result =
        props.mode === "create"
          ? await createYearAction(values)
          : await updateYearAction({ ...values, yearId: props.yearId });
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`/org/years/${result.data.yearId}`);
        router.refresh();
      } else if (result.error.fieldErrors) {
        setServerErrors(result.error.fieldErrors);
      } else {
        toast.error(message(result.error.message));
      }
    } finally {
      setPending(false);
    }
  };

  const dateField = (
    name:
      | "startDate"
      | "endDate"
      | "semester1.start"
      | "semester1.end"
      | "semester2.start"
      | "semester2.end",
    label: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      render={({ field, ...a11y }) => <Input type="date" {...field} {...a11y} />}
    />
  );
  const errorsFor = (field: string) =>
    serverErrors[field]?.length ? (
      <ul role="alert" className="text-danger text-[13px] font-semibold">
        {serverErrors[field]!.map((code) => (
          <li key={code}>{message(code)}</li>
        ))}
      </ul>
    ) : null;

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-2xl flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t("form.year")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {dateField("startDate", t("form.startDate"))}
          {dateField("endDate", t("form.endDate"))}
        </div>
        {errorsFor("startDate")}
        {errorsFor("endDate")}
      </fieldset>
      {([1, 2] as const).map((n) => (
        <fieldset key={n} className="flex flex-col gap-3">
          <legend className="mb-1 text-lg font-semibold">
            {t("form.semester", { number: n })}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {dateField(`semester${n}.start`, t("form.startDate"))}
            {dateField(`semester${n}.end`, t("form.endDate"))}
          </div>
          {errorsFor(`semester${n}`)}
        </fieldset>
      ))}
      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "form.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
