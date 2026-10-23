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
import { personalSchema, REGISTRATION_TYPES, type PersonalFormInput } from "../domain/schemas";
import { registerStudentAction, updateStudentAction } from "../server/student.actions";

type Cohort = { id: string; programId: string; program: string; label: string };
type Props = ({ mode: "create"; cohorts: Cohort[] } | { mode: "edit"; studentId: string }) & {
  defaults?: PersonalFormInput;
};

const EMPTY: PersonalFormInput = {
  firstName: "",
  lastName: "",
  fatherName: "",
  gender: "FEMALE",
  birthDate: "",
  nationalId: "",
  phone: "",
  email: "",
  address: "",
  birthPlace: "",
  residence: "",
  nim: "",
};

/** AC-1/AC-5/AC-6: register a student (optionally with a first enrollment) or edit the personal data. */
export function StudentForm(props: Props) {
  const t = useTranslations("stu");
  const router = useRouter();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [enroll, setEnroll] = useState(props.mode === "create");
  const [cohortId, setCohortId] = useState(
    props.mode === "create" ? (props.cohorts[0]?.id ?? "") : "",
  );
  const [registrationType, setRegistrationType] =
    useState<(typeof REGISTRATION_TYPES)[number]>("FIRST_TIME");
  const [startedAt, setStartedAt] = useState("");
  // The editable fields are validated here; the ids are added on submit.
  const form = useForm<PersonalFormInput>({
    resolver: zodResolver(personalSchema),
    defaultValues: props.defaults ?? EMPTY,
  });

  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);
  const serverError = (field: string) =>
    serverErrors[field]?.length ? (
      <ul role="alert" className="text-danger text-[13px] font-semibold">
        {serverErrors[field]!.map((code) => (
          <li key={code}>{fieldError(code)}</li>
        ))}
      </ul>
    ) : null;

  const submit: SubmitHandler<PersonalFormInput> = async (values) => {
    setPending(true);
    setServerErrors({});
    try {
      let result;
      if (props.mode === "create") {
        const cohort = props.cohorts.find((c) => c.id === cohortId);
        result = await registerStudentAction({
          ...values,
          enrollment:
            enroll && cohort
              ? { programId: cohort.programId, cohortId: cohort.id, registrationType, startedAt }
              : null,
        });
      } else result = await updateStudentAction({ ...values, studentId: props.studentId });
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`/stu/students/${result.data.studentId}`);
        router.refresh();
      } else if (result.error.fieldErrors) setServerErrors(result.error.fieldErrors);
      else toast.error(fieldError(result.error.message));
    } finally {
      setPending(false);
    }
  };

  const text = (name: keyof PersonalFormInput, label: string, type = "text") => (
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

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-3xl flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t("form.person")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("firstName", t("form.firstName"))}
          {text("lastName", t("form.lastName"))}
          {text("fatherName", t("form.fatherName"))}
          <FormField
            control={form.control}
            name="gender"
            label={t("form.gender")}
            formatError={fieldError}
            render={({ field, ...a11y }) => (
              <Select {...field} {...a11y}>
                <option value="FEMALE">{t("gender.FEMALE")}</option>
                <option value="MALE">{t("gender.MALE")}</option>
              </Select>
            )}
          />
          {text("birthDate", t("form.birthDate"), "date")}
          {text("birthPlace", t("form.birthPlace"))}
          {text("nationalId", t("form.nationalId"))}
          {text("nim", t("form.nim"))}
          {text("phone", t("form.phone"))}
          {text("email", t("form.email"), "email")}
          {text("residence", t("form.residence"))}
        </div>
        {text("address", t("form.address"))}
      </fieldset>

      {props.mode === "create" && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-lg font-semibold">{t("form.enrollment")}</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={enroll}
              onChange={(e) => setEnroll(e.target.checked)}
            />
            {t("form.enrollNow")}
          </label>
          {enroll &&
            (props.cohorts.length === 0 ? (
              <p className="rounded-control border-border bg-muted border p-3 text-sm">
                {t("form.noCohorts")}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="e-cohort" className="text-sm font-semibold">
                    {t("form.cohort")}
                  </label>
                  <Select
                    id="e-cohort"
                    value={cohortId}
                    onChange={(e) => setCohortId(e.target.value)}
                  >
                    {props.cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.program} · {c.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="e-type" className="text-sm font-semibold">
                    {t("form.registrationType")}
                  </label>
                  <Select
                    id="e-type"
                    value={registrationType}
                    onChange={(e) => setRegistrationType(e.target.value as never)}
                  >
                    {REGISTRATION_TYPES.map((r) => (
                      <option key={r} value={r}>
                        {t(`registrationType.${r}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="e-start" className="text-sm font-semibold">
                    {t("form.startedAt")}
                  </label>
                  <Input
                    id="e-start"
                    type="date"
                    value={startedAt}
                    onChange={(e) => setStartedAt(e.target.value)}
                  />
                </div>
              </div>
            ))}
          {serverError("cohortId")}
          {serverError("programId")}
          {serverError("startedAt")}
        </fieldset>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "form.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
