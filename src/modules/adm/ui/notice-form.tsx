"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { MAX_DOCUMENTS, noticeSchema, splitDocuments } from "../domain/schemas";
import { createNoticeAction, updateNoticeAction } from "../server/notice.actions";

// The checklist is typed one document per line; the schema receives the split array.
type FormValues = Omit<z.input<typeof noticeSchema>, "documents"> & { documentsText: string };
const formSchema = z.custom<FormValues>();

type Props = ({ mode: "create" } | { mode: "edit"; noticeId: string }) & {
  years: { id: string; label: string }[];
  programs: { id: string; label: string }[];
  defaults?: FormValues;
};

export const EMPTY_NOTICE: FormValues = {
  title: "",
  body: "",
  academicYearId: "",
  programId: "",
  registrationDeadline: "",
  documentsText: "",
  contractExcerpt: "",
  showFees: true,
  publishDate: "",
  expiresDate: "",
  pinned: false,
  emailPush: false,
};

/** AC-1/AC-2: one form for writing and editing a registration notice. */
export function NoticeForm(props: Props) {
  const t = useTranslations("adm");
  const router = useRouter();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    // validated by the shared schema below; the resolver only needs to pass the shape through
    resolver: async (values) => {
      const parsed = noticeSchema.safeParse({
        ...values,
        documents: splitDocuments(values.documentsText ?? ""),
      });
      if (parsed.success) return { values: formSchema.parse(values), errors: {} };
      const errors: Record<string, { type: string; message: string }> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === "documents" ? "documentsText" : String(issue.path[0]);
        errors[key] ??= { type: issue.code, message: issue.message };
      }
      return { values: {}, errors };
    },
    defaultValues: props.defaults ?? EMPTY_NOTICE,
  });

  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);

  const submit: SubmitHandler<FormValues> = async (values) => {
    setPending(true);
    setServerErrors({});
    try {
      const { documentsText, ...rest } = values;
      const payload = { ...rest, documents: splitDocuments(documentsText) };
      const result =
        props.mode === "create"
          ? await createNoticeAction(payload)
          : await updateNoticeAction({ ...payload, noticeId: props.noticeId });
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`/announcements/${result.data.announcementId}`);
        router.refresh();
      } else if (result.error.fieldErrors) {
        const errors = { ...result.error.fieldErrors };
        if (errors.documents) errors.documentsText = errors.documents;
        setServerErrors(errors);
      } else
        toast.error(
          fieldError(
            result.error.code === "FORBIDDEN" ? "audienceNotAllowed" : result.error.message,
          ),
        );
    } finally {
      setPending(false);
    }
  };

  const serverError = (field: string) =>
    serverErrors[field]?.length ? (
      <ul role="alert" className="text-danger text-[13px] font-semibold">
        {serverErrors[field]!.map((code) => (
          <li key={code}>{fieldError(code)}</li>
        ))}
      </ul>
    ) : null;

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-2xl flex-col gap-4">
      <FormField
        control={form.control}
        name="title"
        label={t("form.title")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
      />
      <FormField
        control={form.control}
        name="body"
        label={t("form.body")}
        description={t("form.bodyHint")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Textarea rows={5} {...field} {...a11y} />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="academicYearId"
          label={t("form.year")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Select {...field} {...a11y}>
              <option value="">—</option>
              {props.years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </Select>
          )}
        />
        <FormField
          control={form.control}
          name="programId"
          label={t("form.program")}
          description={t("form.programHint")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Select {...field} value={field.value ?? ""} {...a11y}>
              <option value="">{t("form.allPrograms")}</option>
              {props.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          )}
        />
      </div>
      {serverError("academicYearId")}
      {serverError("programId")}
      <FormField
        control={form.control}
        name="registrationDeadline"
        label={t("form.deadline")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Input type="date" {...field} {...a11y} />}
      />
      <FormField
        control={form.control}
        name="documentsText"
        label={t("form.documents")}
        description={t("form.documentsHint", { max: MAX_DOCUMENTS })}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Textarea rows={5} {...field} {...a11y} />}
      />
      {serverError("documentsText")}
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...form.register("showFees")} />
        {t("form.showFees")}
      </label>
      <FormField
        control={form.control}
        name="contractExcerpt"
        label={t("form.contract")}
        description={t("form.contractHint")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Textarea rows={6} {...field} {...a11y} />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="publishDate"
          label={t("form.publishDate")}
          description={t("form.publishHint")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Input type="date" {...field} value={field.value ?? ""} {...a11y} />
          )}
        />
        <FormField
          control={form.control}
          name="expiresDate"
          label={t("form.expiresDate")}
          description={t("form.expiresHint")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Input type="date" {...field} value={field.value ?? ""} {...a11y} />
          )}
        />
      </div>
      {serverError("expiresDate")}
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...form.register("pinned")} />
        {t("form.pinned")}
      </label>
      <div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...form.register("emailPush")} />
          {t("form.emailPush")}
        </label>
        <p className="text-muted-foreground text-[13px]">{t("form.emailPushHint")}</p>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "form.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
