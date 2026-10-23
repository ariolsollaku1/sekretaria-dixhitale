"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { messageContentSchema, type MessageContentInput } from "../domain/message-schemas";
import { createTemplateAction, sendMessageAction } from "../server/message.actions";

type Template = { id: string; name: string; subject: string; body: string };

/** AC-3/AC-4/AC-5: compose the wording (optionally from a template) and send it to the list. */
export function MessageForm({
  tableId,
  filters,
  recipientCount,
  templates,
}: {
  tableId: string;
  filters: Record<string, string>;
  recipientCount: number;
  templates: Template[];
}) {
  const t = useTranslations("msg");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const form = useForm<MessageContentInput>({
    resolver: zodResolver(messageContentSchema),
    defaultValues: { subject: "", body: "" },
  });
  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);

  const send: SubmitHandler<MessageContentInput> = async (values) => {
    setPending(true);
    setRecipientError(null);
    try {
      const result = await sendMessageAction({ ...values, tableId, filters });
      if (result.ok) {
        toast.success(t("compose.sent"));
        router.push(`/messages/${result.data.messageId}`);
        router.refresh();
      } else if (result.error.fieldErrors?.recipients)
        setRecipientError(fieldError(result.error.fieldErrors.recipients[0]!));
      else if (result.error.fieldErrors)
        for (const [name, codes] of Object.entries(result.error.fieldErrors))
          form.setError(name as keyof MessageContentInput, { message: codes[0] });
      else toast.error(fieldError(result.error.code === "FORBIDDEN" ? "forbidden" : "generic"));
    } finally {
      setPending(false);
    }
  };

  async function saveTemplate() {
    const values = form.getValues();
    const result = await createTemplateAction({ ...values, name: templateName });
    if (result.ok) {
      toast.success(t("templates.saved"));
      setTemplateName("");
      router.refresh();
    } else if (result.error.fieldErrors) {
      const first = Object.values(result.error.fieldErrors)[0]?.[0] ?? "generic";
      toast.error(fieldError(first));
    } else toast.error(fieldError("generic"));
  }

  function pick(id: string) {
    const template = templates.find((x) => x.id === id);
    if (!template) return;
    form.setValue("subject", template.subject, { shouldValidate: true });
    form.setValue("body", template.body, { shouldValidate: true });
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="flex max-w-2xl flex-col gap-4">
      {templates.length > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="msg-template" className="text-sm font-semibold">
            {t("compose.template")}
          </label>
          <Select id="msg-template" defaultValue="" onChange={(e) => pick(e.target.value)}>
            <option value="">—</option>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <FormField
        control={form.control}
        name="subject"
        label={t("compose.subject")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
      />
      <FormField
        control={form.control}
        name="body"
        label={t("compose.body")}
        description={t("compose.bodyHint")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Textarea rows={10} {...field} {...a11y} />}
      />
      {recipientError && (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {recipientError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <ConfirmDialog
          trigger={
            <Button type="button" disabled={pending}>
              {t("compose.send")}
            </Button>
          }
          title={t("compose.confirmTitle")}
          description={t("compose.confirmBody", { count: recipientCount })}
          confirmLabel={t("compose.confirm")}
          onConfirm={async () => {
            if (await form.trigger()) await form.handleSubmit(send)();
          }}
        />
      </div>

      <fieldset className="border-border flex flex-col gap-2 border-t pt-4">
        <legend className="text-sm font-semibold">{t("templates.saveAs")}</legend>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="msg-template-name" className="text-sm">
              {t("templates.name")}
            </label>
            <Input
              id="msg-template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              maxLength={100}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!templateName.trim()}
            onClick={saveTemplate}
          >
            {t("templates.save")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
