"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { updateUserSchema } from "../domain/schemas";
import { updateUserAction } from "../server/user.actions";
import { errorMessage } from "./messages";

type FormValues = z.input<typeof updateUserSchema>;

/** AC-8: change name or email; Keycloak is updated by the service. */
export function UserEditForm({ defaults }: { defaults: FormValues }) {
  const t = useTranslations("iam");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: defaults,
  });

  const submit: SubmitHandler<FormValues> = async (values) => {
    setPending(true);
    try {
      const result = await updateUserAction(values);
      if (result.ok) {
        toast.success(t("actions.saved"));
        router.refresh();
        return;
      }
      const fields = result.error.fieldErrors ?? {};
      for (const [name, keys] of Object.entries(fields))
        form.setError(name as keyof FormValues, { message: errorMessage(t, keys[0]) });
      if (Object.keys(fields).length === 0) toast.error(errorMessage(t, result.error.code));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-xl flex-col gap-4">
      <FormField
        control={form.control}
        name="email"
        label={t("form.email")}
        render={({ field, ...a11y }) => <Input type="email" {...field} {...a11y} />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="firstName"
          label={t("form.firstName")}
          render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
        />
        <FormField
          control={form.control}
          name="lastName"
          label={t("form.lastName")}
          render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
        />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {t("form.save")}
        </Button>
      </div>
    </form>
  );
}
