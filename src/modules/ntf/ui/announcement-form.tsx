"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch, type SubmitHandler } from "react-hook-form";
import { FileUpload } from "@/components/files/file-upload";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { AUDIENCES, announcementSchema, type AnnouncementFormInput } from "../domain/schemas";
import {
  createAnnouncementAction,
  removeAttachmentAction,
  updateAnnouncementAction,
} from "../server/announcement.actions";

type Attachment = { id: string; fileName: string };
type Props = ({ mode: "create" } | { mode: "edit"; announcementId: string }) & {
  defaults?: AnnouncementFormInput;
  programs: { id: string; label: string }[];
  attachments?: Attachment[];
  upload: {
    purpose: string;
    maxBytes: number;
    mimeTypes: readonly string[];
    typeLabels: readonly string[];
  };
};

const EMPTY: AnnouncementFormInput = {
  title: "",
  body: "",
  audience: "ALL",
  cycle: null,
  programId: null,
  publishDate: "",
  expiresDate: "",
  pinned: false,
  emailPush: false,
};

/** AC-1/AC-2/AC-9: one form for writing and editing a notice, with its attachments. */
export function AnnouncementForm(props: Props) {
  const t = useTranslations("ntf");
  const router = useRouter();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [uploaded, setUploaded] = useState<Attachment[]>([]);
  const [existing, setExisting] = useState<Attachment[]>(props.attachments ?? []);
  const form = useForm<AnnouncementFormInput>({
    resolver: zodResolver(announcementSchema),
    defaultValues: props.defaults ?? EMPTY,
  });
  const audience = useWatch({ control: form.control, name: "audience" });
  const pushAllowed = audience !== "CYCLE" && audience !== "PROGRAM";

  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);
  const serverError = (field: string) =>
    serverErrors[field]?.length ? (
      <ul role="alert" className="text-danger text-[13px] font-semibold">
        {serverErrors[field]!.map((code) => (
          <li key={code}>{fieldError(code)}</li>
        ))}
      </ul>
    ) : null;

  const submit: SubmitHandler<AnnouncementFormInput> = async (values) => {
    setPending(true);
    setServerErrors({});
    try {
      const fileIds = uploaded.map((f) => f.id);
      const result =
        props.mode === "create"
          ? await createAnnouncementAction({ ...values, fileIds })
          : await updateAnnouncementAction({
              ...values,
              fileIds,
              announcementId: props.announcementId,
            });
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`/announcements/${result.data.announcementId}`);
        router.refresh();
      } else if (result.error.fieldErrors) setServerErrors(result.error.fieldErrors);
      else
        toast.error(
          fieldError(
            result.error.code === "FORBIDDEN" ? "audienceNotAllowed" : result.error.message,
          ),
        );
    } finally {
      setPending(false);
    }
  };

  async function removeExisting(file: Attachment) {
    if (props.mode !== "edit") return;
    const result = await removeAttachmentAction({
      announcementId: props.announcementId,
      fileId: file.id,
    });
    if (result.ok) setExisting((list) => list.filter((f) => f.id !== file.id));
    else toast.error(t("errors.generic"));
  }

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
        render={({ field, ...a11y }) => <Textarea rows={8} {...field} {...a11y} />}
      />
      <FormField
        control={form.control}
        name="audience"
        label={t("form.audience")}
        formatError={fieldError}
        render={({ field, ...a11y }) => (
          <Select {...field} {...a11y}>
            {AUDIENCES.map((v) => (
              <option key={v} value={v}>
                {t(`audience.${v}`)}
              </option>
            ))}
          </Select>
        )}
      />
      {audience === "CYCLE" && (
        <FormField
          control={form.control}
          name="cycle"
          label={t("form.cycle")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Select {...field} value={field.value ?? ""} {...a11y}>
              <option value="">—</option>
              <option value="FIRST">{t("cycle.FIRST")}</option>
              <option value="SECOND">{t("cycle.SECOND")}</option>
            </Select>
          )}
        />
      )}
      {audience === "PROGRAM" && (
        <>
          <FormField
            control={form.control}
            name="programId"
            label={t("form.program")}
            formatError={fieldError}
            render={({ field, ...a11y }) => (
              <Select {...field} value={field.value ?? ""} {...a11y}>
                <option value="">—</option>
                {props.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            )}
          />
          {serverError("programId")}
        </>
      )}
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
          <input
            type="checkbox"
            className="size-4"
            disabled={!pushAllowed}
            {...form.register("emailPush")}
          />
          {t("form.emailPush")}
        </label>
        <p className="text-muted-foreground text-[13px]">
          {t(pushAllowed ? "form.emailPushHint" : "form.emailPushUnavailable")}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-lg font-semibold">{t("form.attachments")}</legend>
        <ul className="flex flex-col gap-1 text-sm">
          {existing.map((f) => (
            <li key={f.id} className="flex items-center gap-3">
              <span>{f.fileName}</span>
              <Button type="button" variant="ghost" onClick={() => removeExisting(f)}>
                {t("form.removeFile")} <span className="sr-only">{f.fileName}</span>
              </Button>
            </li>
          ))}
          {uploaded.map((f) => (
            <li key={f.id}>{f.fileName}</li>
          ))}
        </ul>
        {existing.length + uploaded.length < 5 && (
          <FileUpload
            {...props.upload}
            label={t("form.addFile")}
            onUploaded={(file) =>
              setUploaded((list) => [...list, { id: file.id, fileName: file.fileName }])
            }
          />
        )}
        {serverError("fileIds")}
      </fieldset>

      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "form.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
