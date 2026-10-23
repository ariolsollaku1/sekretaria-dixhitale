"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { courseSchema } from "../domain/schemas";
import { createCourseAction, updateCourseAction } from "../server/course.actions";

type Values = {
  code: string;
  name: string;
  nameEn?: string | null;
  defaultCredits: number | string;
  categoryId?: string | null;
  hoursLecture: number | string;
  hoursSeminar: number | string;
  hoursLab: number | string;
  departmentId: string;
};

type Props = ({ mode: "create" } | { mode: "edit"; id: string }) & {
  departments: { id: string; label: string }[];
  categories: { id: string; code: string; nameSq: string; nameEn: string; active: boolean }[];
  defaults?: Values;
};

/** AC-1/AC-3: create or edit a course; the department list holds only departments the user may write. */
export function CourseForm(props: Props) {
  const t = useTranslations("cur");
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<Values>({
    // Validates the course fields; the id of an edit is added when the action is called.
    resolver: zodResolver(courseSchema as never) as never,
    defaultValues: props.defaults ?? {
      code: "",
      name: "",
      nameEn: "",
      defaultCredits: "",
      categoryId: "",
      hoursLecture: 0,
      hoursSeminar: 0,
      hoursLab: 0,
      departmentId: props.departments[0]?.id ?? "",
    },
  });
  const message = (key: string | undefined) =>
    key && t.has(`errors.${key}` as never) ? t(`errors.${key}` as never) : t("errors.generic");
  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);

  const submit: SubmitHandler<Values> = async (values) => {
    setPending(true);
    try {
      const result =
        props.mode === "create"
          ? await createCourseAction(values as never)
          : await updateCourseAction({ ...values, courseId: props.id } as never);
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`/cur/courses/${(result.data as { id: string }).id}`);
        router.refresh();
        return;
      }
      const fields = result.error.fieldErrors ?? {};
      for (const [name, keys] of Object.entries(fields))
        form.setError(name as keyof Values, { message: message(keys[0]) });
      if (Object.keys(fields).length === 0)
        toast.error(
          result.error.code === "FORBIDDEN" ? t("errors.FORBIDDEN") : message(result.error.message),
        );
    } finally {
      setPending(false);
    }
  };

  const num = (
    name: "defaultCredits" | "hoursLecture" | "hoursSeminar" | "hoursLab",
    label: string,
    max: number,
  ) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      formatError={fieldError}
      render={({ field, ...a11y }) => (
        <Input type="number" min={0} max={max} inputMode="numeric" {...field} {...a11y} />
      )}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-2xl flex-col gap-4">
      <FormField
        control={form.control}
        name="departmentId"
        label={t("course.department")}
        formatError={fieldError}
        render={({ field, ...a11y }) => (
          <Select {...field} {...a11y}>
            {props.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <FormField
          control={form.control}
          name="code"
          label={t("course.code")}
          description={t("course.codeHint")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Input {...field} {...a11y} autoCapitalize="characters" />
          )}
        />
        <FormField
          control={form.control}
          name="name"
          label={t("course.name")}
          formatError={fieldError}
          render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
        />
      </div>
      <FormField
        control={form.control}
        name="nameEn"
        label={t("course.nameEn")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Input {...field} value={field.value ?? ""} {...a11y} />}
      />
      <FormField
        control={form.control}
        name="categoryId"
        label={t("course.category")}
        formatError={fieldError}
        render={({ field, ...a11y }) => (
          <Select {...field} value={field.value ?? ""} {...a11y}>
            <option value="">{t("course.noCategory")}</option>
            {props.categories
              .filter((c) => c.active || c.id === props.defaults?.categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {locale === "en" ? c.nameEn : c.nameSq}
                </option>
              ))}
          </Select>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-4">
        {num("defaultCredits", t("course.credits"), 60)}
        {num("hoursLecture", t("course.hoursLecture"), 500)}
        {num("hoursSeminar", t("course.hoursSeminar"), 500)}
        {num("hoursLab", t("course.hoursLab"), 500)}
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "course.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
