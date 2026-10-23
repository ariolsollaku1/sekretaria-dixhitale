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
import { EVENT_TYPES, eventSchema, type EventFormInput } from "../domain/schemas";
import { createEventAction, updateEventAction } from "../server/event.actions";

type Props = ({ mode: "create"; yearId: string } | { mode: "edit"; eventId: string }) & {
  defaults?: EventFormInput;
  programs: { id: string; label: string }[];
};

const EMPTY: EventFormInput = {
  title: "",
  type: "EVENT",
  startDate: "",
  endDate: "",
  description: "",
  audience: "ALL",
  cycle: null,
  programId: null,
};

/** AC-1..AC-3: one form for creating and editing an event. */
export function EventForm(props: Props) {
  const t = useTranslations("cal");
  const router = useRouter();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  // Validate the editable fields; the ids are added on submit (edit forms have no id field).
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
          ? await createEventAction({ ...values, academicYearId: props.yearId })
          : await updateEventAction({ ...values, eventId: props.eventId });
      if (result.ok) {
        toast.success(t(props.mode === "create" ? "actions.created" : "actions.saved"));
        router.push(`/calendar/events/${result.data.eventId}`);
        router.refresh();
      } else if (result.error.fieldErrors) setServerErrors(result.error.fieldErrors);
      else toast.error(fieldError(result.error.message));
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
        name="type"
        label={t("form.type")}
        formatError={fieldError}
        render={({ field, ...a11y }) => (
          <Select {...field} {...a11y}>
            {EVENT_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`type.${v}`)}
              </option>
            ))}
          </Select>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="startDate"
          label={t("form.startDate")}
          formatError={fieldError}
          render={({ field, ...a11y }) => <Input type="date" {...field} {...a11y} />}
        />
        <FormField
          control={form.control}
          name="endDate"
          label={t("form.endDate")}
          formatError={fieldError}
          render={({ field, ...a11y }) => <Input type="date" {...field} {...a11y} />}
        />
      </div>
      {serverError("startDate")}
      <FormField
        control={form.control}
        name="description"
        label={t("form.description")}
        formatError={fieldError}
        render={({ field, ...a11y }) => <Textarea {...field} value={field.value ?? ""} {...a11y} />}
      />
      <FormField
        control={form.control}
        name="audience"
        label={t("form.audience")}
        formatError={fieldError}
        render={({ field, ...a11y }) => (
          <Select {...field} {...a11y}>
            {(["ALL", "CYCLE", "PROGRAM"] as const).map((v) => (
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
      <div>
        <Button type="submit" disabled={pending}>
          {t(props.mode === "create" ? "form.create" : "form.save")}
        </Button>
      </div>
    </form>
  );
}
