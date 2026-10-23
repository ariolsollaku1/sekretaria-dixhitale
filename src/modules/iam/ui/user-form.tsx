"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, Controller, type SubmitHandler } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { createUserSchema } from "../domain/schemas";
import { createUserAction } from "../server/user.actions";
import type { RoleEditorOptions } from "../server/user.queries";
import { errorMessage } from "./messages";
import { RoleAssignmentsField, defaultAssignment } from "./role-assignments-field";

type FormValues = z.input<typeof createUserSchema>;

/** AC-2/AC-3: create a user; offers linking when the email exists only in Keycloak. */
export function UserForm({ options }: { options: RoleEditorOptions }) {
  const t = useTranslations("iam");
  const router = useRouter();
  const [offerLink, setOfferLink] = useState(false);
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      linkExisting: false,
      roles: [defaultAssignment("secretary", options)],
    },
  });

  const submit: SubmitHandler<FormValues> = async (values) => {
    setPending(true);
    try {
      const result = await createUserAction(values);
      if (result.ok) {
        toast.success(t("actions.created"));
        router.push(`/admin/users/${result.data.userId}`);
        return;
      }
      if (result.error.code === "CONFLICT" && result.error.message === "IDP_USER_EXISTS") {
        setOfferLink(true);
        return;
      }
      const fields = result.error.fieldErrors ?? {};
      for (const [name, keys] of Object.entries(fields)) {
        form.setError(name as keyof FormValues, { message: errorMessage(t, keys[0]) });
      }
      if (Object.keys(fields).length === 0)
        toast.error(
          errorMessage(
            t,
            result.error.code === "CONFLICT" ? result.error.message : result.error.code,
          ),
        );
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-w-2xl flex-col gap-5">
      <FormField
        control={form.control}
        name="email"
        label={t("form.email")}
        description={t("form.hint")}
        render={({ field, ...a11y }) => (
          <Input
            type="email"
            autoComplete="off"
            {...field}
            {...a11y}
            onChange={(e) => {
              setOfferLink(false);
              form.setValue("linkExisting", false);
              field.onChange(e);
            }}
          />
        )}
      />
      <div className="grid gap-5 sm:grid-cols-2">
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
      <Controller
        control={form.control}
        name="roles"
        render={({ field, fieldState }) => (
          <RoleAssignmentsField
            options={options}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error ? errorMessage(t, fieldState.error.message) : undefined}
          />
        )}
      />
      {offerLink && (
        <div role="alert" className="rounded-card border-info/40 bg-info-bg border p-4">
          <p className="font-semibold">{t("link.title")}</p>
          <p className="mt-1 text-sm">{t("link.body")}</p>
          <Button
            type="button"
            className="mt-3"
            onClick={() => {
              form.setValue("linkExisting", true);
              void form.handleSubmit(submit)();
            }}
          >
            {t("link.confirm")}
          </Button>
        </div>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {t("form.create")}
        </Button>
      </div>
    </form>
  );
}
