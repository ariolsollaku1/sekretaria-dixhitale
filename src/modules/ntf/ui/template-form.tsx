"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { templateSchema, type TemplateInput } from "../domain/message-schemas";
import { createTemplateAction } from "../server/message.actions";

/** AC-4: write a new template. */
export function TemplateForm() {
  const t = useTranslations("msg");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<TemplateInput>({
    resolver: zodResolver(templateSchema),
    defaultValues: { name: "", subject: "", body: "" },
  });
  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);

  const submit: SubmitHandler<TemplateInput> = async (values) => {
    setPending(true);
    try {
      const result = await createTemplateAction(values);
      if (result.ok) {
        toast.success(t("templates.saved"));
        form.reset();
        router.refresh();
      } else if (result.error.fieldErrors)
        for (const [name, codes] of Object.entries(result.error.fieldErrors))
          form.setError(name as keyof TemplateInput, { message: codes[0] });
      else toast.error(fieldError("generic"));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-2xl flex-col gap-4">
      <FormField
        control={form.control}
        name="name"
        label={t("templates.name")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
      />
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
        render={({ field, ...a11y }) => <Textarea rows={6} {...field} {...a11y} />}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {t("templates.create")}
        </Button>
      </div>
    </form>
  );
}
