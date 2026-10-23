"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { CATEGORIES, GENDERS, KINDS, staffSchema, type StaffFormInput } from "../domain/schemas";
import { createStaffAction, updateStaffAction } from "../server/staff.actions";

type Props = ({ mode: "create" } | { mode: "edit"; staffId: string }) & {
  defaults?: StaffFormInput;
  departments: { id: string; label: string }[];
};

const EMPTY: StaffFormInput = {
  firstName: "",
  lastName: "",
  fatherName: "",
  gender: "FEMALE",
  birthDate: "",
  nationalId: "",
  phone: "",
  email: "",
  address: "",
  kind: "ACADEMIC",
  category: "PAE",
  degree: "",
  title: "",
  departmentId: "",
  retired: false,
  primaryEmployer: "",
  contractStart: "",
  contractEnd: "",
};

/** AC-1/AC-2/AC-4: one form for registering and editing a staff member. */
export function StaffForm(props: Props) {
  const t = useTranslations("hr");
  const router = useRouter();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  // The editable fields are validated here; the ids are added on submit (edit forms have none).
  const form = useForm<StaffFormInput>({
    resolver: zodResolver(staffSchema),
    defaultValues: props.defaults ?? EMPTY,
  });
  const category = useWatch({ control: form.control, name: "category" });

  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);
  const serverError = (field: string) =>
    serverErrors[field]?.length ? (
      <ul role="alert" className="text-danger text-[13px] font-semibold">
        {serverErrors[field]!.map((code) => (
          <li key={code}>{fieldError(code)}</li>
        ))}
      </ul>
    ) : null;

  const submit: SubmitHandler<StaffFormInput> = async (values) => {
    setPending(true);
    setServerErrors({});
    try {
      const result =
        props.mode === "create"
          ? await createStaffAction(values)
          : await updateStaffAction({ ...values, staffId: props.staffId });
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`/hr/staff/${result.data.staffId}`);
        router.refresh();
      } else if (result.error.fieldErrors) setServerErrors(result.error.fieldErrors);
      else toast.error(fieldError(result.error.message));
    } finally {
      setPending(false);
    }
  };

  const text = (name: keyof StaffFormInput, label: string, type = "text") => (
    <div className="flex flex-col gap-1">
      <FormField
        control={form.control}
        name={name}
        label={label}
        formatError={fieldError}
        render={({ field, ...a11y }) => (
          <Input
            type={type}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={(field.value as string | null) ?? ""}
            {...a11y}
          />
        )}
      />
      {serverError(name)}
    </div>
  );
  const select = (
    name: "gender" | "kind" | "category",
    label: string,
    values: readonly string[],
    group: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      formatError={fieldError}
      render={({ field, ...a11y }) => (
        <Select {...field} {...a11y}>
          {values.map((v) => (
            <option key={v} value={v}>
              {t(`${group}.${v}` as never)}
            </option>
          ))}
        </Select>
      )}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-3xl flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t("form.person")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("firstName", t("form.firstName"))}
          {text("lastName", t("form.lastName"))}
          {text("fatherName", t("form.fatherName"))}
          {select("gender", t("form.gender"), GENDERS, "gender")}
          {text("birthDate", t("form.birthDate"), "date")}
          {text("nationalId", t("form.nationalId"))}
          {text("phone", t("form.phone"))}
          {text("email", t("form.email"), "email")}
        </div>
        {text("address", t("form.address"))}
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t("form.employment")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {select("kind", t("form.kind"), KINDS, "kind")}
          {select("category", t("form.category"), CATEGORIES, "category")}
          {text("degree", t("form.degree"))}
          {text("title", t("form.titleField"))}
          <FormField
            control={form.control}
            name="departmentId"
            label={t("form.department")}
            formatError={fieldError}
            render={({ field, ...a11y }) => (
              <Select {...field} value={field.value ?? ""} {...a11y}>
                <option value="">—</option>
                {props.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            )}
          />
          {category === "PAK" && text("primaryEmployer", t("form.primaryEmployer"))}
          {text("contractStart", t("form.contractStart"), "date")}
          {text("contractEnd", t("form.contractEnd"), "date")}
        </div>
        {serverError("departmentId")}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...form.register("retired")} />
          {t("form.retired")}
        </label>
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "form.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
