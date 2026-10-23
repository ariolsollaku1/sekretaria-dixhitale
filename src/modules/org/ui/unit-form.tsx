"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  departmentSchema,
  facultySchema,
  updateDepartmentSchema,
  updateFacultySchema,
} from "../domain/schemas";
import {
  createDepartmentAction,
  createFacultyAction,
  updateDepartmentAction,
  updateFacultyAction,
} from "../server/unit.actions";

type Values = { code: string; name: string; nameEn?: string | null; facultyId?: string };

type Props =
  | { kind: "faculty"; mode: "create" }
  | { kind: "faculty"; mode: "edit"; id: string }
  | { kind: "department"; mode: "create"; faculties: { id: string; label: string }[] }
  | { kind: "department"; mode: "edit"; id: string };

/** AC-3: one form for faculties and departments; the department's faculty is chosen only on create. */
export function UnitForm(props: Props & { defaults?: Values }) {
  const t = useTranslations("org");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const schema =
    props.kind === "faculty"
      ? props.mode === "create"
        ? facultySchema
        : updateFacultySchema
      : props.mode === "create"
        ? departmentSchema
        : updateDepartmentSchema;
  const form = useForm<Values>({
    resolver: zodResolver(schema as never) as never,
    defaultValues: props.defaults ?? {
      code: "",
      name: "",
      nameEn: "",
      facultyId:
        props.kind === "department" && props.mode === "create" ? props.faculties[0]?.id : undefined,
    },
  });
  const message = (key: string | undefined) =>
    key && t.has(`errors.${key}` as never) ? t(`errors.${key}` as never) : t("errors.generic");
  /** Zod keys are translated; text already translated by the server error mapping passes through. */
  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);
  const base = props.kind === "faculty" ? "/org/faculties" : "/org/departments";

  const submit: SubmitHandler<Values> = async (values) => {
    setPending(true);
    try {
      const result =
        props.kind === "faculty"
          ? props.mode === "create"
            ? await createFacultyAction(values as never)
            : await updateFacultyAction({ ...values, facultyId: props.id } as never)
          : props.mode === "create"
            ? await createDepartmentAction(values as never)
            : await updateDepartmentAction({ ...values, departmentId: props.id } as never);
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`${base}/${(result.data as { id: string }).id}`);
        router.refresh();
        return;
      }
      const fields = result.error.fieldErrors ?? {};
      for (const [name, keys] of Object.entries(fields))
        form.setError(name as keyof Values, { message: message(keys[0]) });
      if (Object.keys(fields).length === 0) toast.error(message(result.error.message));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-xl flex-col gap-4">
      {props.kind === "department" && props.mode === "create" && (
        <FormField
          control={form.control}
          name="facultyId"
          label={t("unit.faculty")}
          render={({ field, ...a11y }) => (
            <Select {...field} value={field.value ?? ""} {...a11y}>
              {props.faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          )}
        />
      )}
      <FormField
        control={form.control}
        name="code"
        formatError={fieldError}
        label={t("unit.code")}
        description={t("unit.codeHint")}
        render={({ field, ...a11y }) => <Input {...field} {...a11y} autoCapitalize="characters" />}
      />
      <FormField
        control={form.control}
        name="name"
        formatError={fieldError}
        label={t("unit.name")}
        render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
      />
      <FormField
        control={form.control}
        name="nameEn"
        formatError={fieldError}
        label={t("unit.nameEn")}
        render={({ field, ...a11y }) => <Input {...field} value={field.value ?? ""} {...a11y} />}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "unit.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
