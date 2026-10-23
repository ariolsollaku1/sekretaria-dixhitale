"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { categorySchema } from "../domain/schemas";
import {
  createCategoryAction,
  deactivateCategoryAction,
  reactivateCategoryAction,
  updateCategoryAction,
} from "../server/course.actions";

type Category = { id: string; code: string; nameSq: string; nameEn: string; active: boolean };
type Values = { code: string; nameSq: string; nameEn: string };

/** AC-2: the administrator-maintained category list (Q-28). Everyone with read access sees it. */
export function CategoryManager({
  categories,
  canWrite,
}: {
  categories: Category[];
  canWrite: boolean;
}) {
  const t = useTranslations("cur");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<Category | null>(null);
  const [reasonFor, setReasonFor] = useState<Category | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(categorySchema as never) as never,
    defaultValues: { code: "", nameSq: "", nameEn: "" },
  });
  const message = (key: string | undefined) =>
    key && t.has(`errors.${key}` as never) ? t(`errors.${key}` as never) : t("errors.generic");
  const fieldError = (m: string) => (t.has(`errors.${m}` as never) ? t(`errors.${m}` as never) : m);

  const submit: SubmitHandler<Values> = async (values) => {
    const result = editing
      ? await updateCategoryAction({ ...values, categoryId: editing.id } as never)
      : await createCategoryAction(values as never);
    if (result.ok) {
      toast.success(t(editing ? "actions.saved" : "actions.created"));
      setEditing(null);
      form.reset({ code: "", nameSq: "", nameEn: "" });
      router.refresh();
      return;
    }
    const fields = result.error.fieldErrors ?? {};
    for (const [name, keys] of Object.entries(fields))
      form.setError(name as keyof Values, { message: message(keys[0]) });
    if (Object.keys(fields).length === 0) toast.error(message(result.error.message));
  };

  async function toggle(c: Category) {
    const result = await (c.active ? deactivateCategoryAction : reactivateCategoryAction)({
      id: c.id,
      reason,
    } as never);
    if (result.ok) {
      setReasonFor(null);
      setReason("");
      router.refresh();
    } else if (result.error.fieldErrors?.reason) setReasonError(true);
    else toast.error(message(result.error.message));
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-2">
        {categories.length === 0 && (
          <li className="text-muted-foreground text-sm">{t("category.empty")}</li>
        )}
        {categories.map((c) => (
          <li
            key={c.id}
            className="rounded-control border-border bg-card flex flex-wrap items-center justify-between gap-3 border px-3 py-2"
          >
            <span>
              <span className="font-tabular font-semibold">{c.code}</span> —{" "}
              {locale === "en" ? c.nameEn : c.nameSq}
            </span>
            <span className="flex items-center gap-2">
              <StatusBadge
                tone={c.active ? "success" : "neutral"}
                label={t(c.active ? "status.active" : "status.inactive")}
              />
              {canWrite && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditing(c);
                      form.reset({ code: c.code, nameSq: c.nameSq, nameEn: c.nameEn });
                    }}
                  >
                    {tc("edit")}
                  </Button>
                  <Dialog
                    open={reasonFor?.id === c.id}
                    onOpenChange={(o) => {
                      setReasonFor(o ? c : null);
                      setReason("");
                      setReasonError(false);
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button type="button" variant="ghost">
                        {t(c.active ? "actions.deactivate" : "actions.reactivate")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent closeLabel={tc("close")}>
                      <DialogTitle className="text-lg font-semibold">
                        {t("category.statusTitle", { code: c.code })}
                      </DialogTitle>
                      <DialogDescription className="text-muted-foreground mt-2 text-sm">
                        {t("category.statusBody")}
                      </DialogDescription>
                      <div className="mt-4 flex flex-col gap-1.5">
                        <Label htmlFor={`reason-${c.id}`}>{t("actions.reason")}</Label>
                        <Textarea
                          id={`reason-${c.id}`}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          aria-invalid={reasonError}
                        />
                        {reasonError && (
                          <p role="alert" className="text-danger text-[13px] font-semibold">
                            {t("errors.reasonRequired")}
                          </p>
                        )}
                      </div>
                      <div className="mt-6 flex justify-end gap-2">
                        <DialogClose asChild>
                          <Button variant="secondary">{tc("cancel")}</Button>
                        </DialogClose>
                        <Button onClick={() => toggle(c)}>
                          {t(c.active ? "actions.deactivate" : "actions.reactivate")}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {canWrite && (
        <form
          onSubmit={form.handleSubmit(submit)}
          noValidate
          className="rounded-card border-border bg-card flex max-w-xl flex-col gap-3 border p-4"
        >
          <h2 className="font-semibold">
            {editing ? t("category.edit", { code: editing.code }) : t("category.new")}
          </h2>
          <FormField
            control={form.control}
            name="code"
            label={t("course.code")}
            formatError={fieldError}
            render={({ field, ...a11y }) => (
              <Input {...field} {...a11y} autoCapitalize="characters" />
            )}
          />
          <FormField
            control={form.control}
            name="nameSq"
            label={t("category.nameSq")}
            formatError={fieldError}
            render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
          />
          <FormField
            control={form.control}
            name="nameEn"
            label={t("category.nameEn")}
            formatError={fieldError}
            render={({ field, ...a11y }) => <Input {...field} {...a11y} />}
          />
          <div className="flex gap-2">
            <Button type="submit">{editing ? t("form.save") : t("category.create")}</Button>
            {editing && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  form.reset({ code: "", nameSq: "", nameEn: "" });
                }}
              >
                {tc("cancel")}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
