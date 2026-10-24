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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { eventSchema, type EventFormInput } from "../domain/event-schemas";
import { AUDIENCES } from "../domain/schemas";
import { createEventAction, updateEventAction } from "../server/event.actions";

type Props = ({ mode: "create" } | { mode: "edit"; eventId: string }) & {
  defaults?: EventFormInput;
  programs: { id: string; label: string }[];
  announcements: { id: string; label: string }[];
};

const EMPTY: EventFormInput = {
  title: "",
  description: "",
  location: "",
  startsAt: "",
  endsAt: "",
  capacity: "",
  registrationDeadline: "",
  audience: "ALL",
  cycle: null,
  programId: null,
  announcementId: null,
};

/** AC-1/AC-2: one form for creating and editing an event. Times are Europe/Tirane wall-clock. */
export function EventForm(props: Props) {
  const t = useTranslations("evt");
  const tn = useTranslations("ntf");
  const router = useRouter();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const form = useForm<EventFormInput>({
    resolver: zodResolver(eventSchema),
    defaultValues: props.defaults ?? EMPTY,
  });
  const audience = useWatch({ control: form.control, name: "audience" });

  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);
  const serverError = (field: string) =>
    serverErrors[field]?.length ? (
      <ul role="alert" className="text-danger text-[13px] font-semibold">
        {serverErrors[field]!.map((code) => (
          <li key={code}>{fieldError(code)}</li>
        ))}
      </ul>
    ) : null;

  const submit: SubmitHandler<EventFormInput> = async (values) => {
    setPending(true);
    setServerErrors({});
    try {
      const result =
        props.mode === "create"
          ? await createEventAction(values)
          : await updateEventAction({ ...values, eventId: props.eventId });
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`/events/${result.data.eventId}`);
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
        name="description"
        label={t("form.description")}
        description={t("form.descriptionHint")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Textarea rows={6} {...field} {...a11y} />}
      />
      <FormField
        control={form.control}
        name="location"
        label={t("form.location")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="startsAt"
          label={t("form.startsAt")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Input type="datetime-local" {...field} value={field.value ?? ""} {...a11y} />
          )}
        />
        <FormField
          control={form.control}
          name="endsAt"
          label={t("form.endsAt")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Input type="datetime-local" {...field} value={field.value ?? ""} {...a11y} />
          )}
        />
        <FormField
          control={form.control}
          name="registrationDeadline"
          label={t("form.deadline")}
          description={t("form.deadlineHint")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Input type="datetime-local" {...field} value={field.value ?? ""} {...a11y} />
          )}
        />
        <FormField
          control={form.control}
          name="capacity"
          label={t("form.capacity")}
          description={t("form.capacityHint")}
          formatError={fieldError}
          render={({ field, ...a11y }) => (
            <Input type="number" min={1} {...field} value={field.value ?? ""} {...a11y} />
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="audience"
        label={t("form.audience")}
        formatError={fieldError}
        render={({ field, ...a11y }) => (
          <Select {...field} {...a11y}>
            {AUDIENCES.map((v) => (
              <option key={v} value={v}>
                {tn(`audience.${v}`)}
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
              <option value="FIRST">{tn("cycle.FIRST")}</option>
              <option value="SECOND">{tn("cycle.SECOND")}</option>
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
      <FormField
        control={form.control}
        name="announcementId"
        label={t("form.announcement")}
        description={t("form.announcementHint")}
        formatError={fieldError}
        render={({ field, ...a11y }) => (
          <Select {...field} value={field.value ?? ""} {...a11y}>
            <option value="">—</option>
            {props.announcements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        )}
      />
      {serverError("announcementId")}
      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "form.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
