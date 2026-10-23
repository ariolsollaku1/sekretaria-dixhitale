"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import {
  archiveTemplateAction,
  createTemplateAction,
  discardTemplateAction,
  publishTemplateAction,
  updateTemplateAction,
} from "@/lib/documents/actions";

type Initial = {
  language: string;
  validFrom: string;
  validTo: string;
  html: string;
  notes: string;
};
type Props =
  | { mode: "create"; type: string; types: { type: string; label: string }[] }
  | { mode: "edit"; templateId: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" };

const SKELETON = `<!doctype html>
<html lang="sq">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: sans-serif; font-size: 12pt; }
  .qr svg { width: 28mm; height: 28mm; }
</style>
</head>
<body>
  <h1>{{title}}</h1>
  <p>{{name}}</p>
  <p>Nr. {{number}} · {{issuedDate}}</p>
  <div class="qr">{{{qr}}}</div>
  <p><small>{{verifyUrl}}</small></p>
</body>
</html>
`;

/** AC-10: HTML editor with the draft / preview / publish / archive actions. */
export function TemplateEditor(props: Props & { initial?: Initial }) {
  const t = useTranslations("documents.admin");
  const router = useRouter();
  const [type, setType] = useState(props.mode === "create" ? props.type : "");
  const [v, setV] = useState<Initial>(
    props.initial ?? {
      language: "sq",
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: "",
      html: SKELETON,
      notes: "",
    },
  );
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const editable = props.mode === "create" || props.status === "DRAFT";
  const set = (k: keyof Initial) => (e: { target: { value: string } }) => {
    setV((cur) => ({ ...cur, [k]: e.target.value }));
    setErrors({});
  };
  const say = (code: string) =>
    t.has(`errors.${code.split(":")[0]}` as never)
      ? t(`errors.${code.split(":")[0]}` as never) +
        (code.includes(":") ? ` (${t("line")} ${code.split(":")[1]})` : "")
      : code;
  const fail = (r: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    if (r.error.fieldErrors) setErrors(r.error.fieldErrors);
    else toast.error(r.error.message);
  };
  const payload = {
    language: v.language,
    validFrom: v.validFrom,
    validTo: v.validTo || null,
    html: v.html,
    notes: v.notes || null,
  };

  async function save() {
    setBusy(true);
    try {
      const r =
        props.mode === "create"
          ? await createTemplateAction({ ...payload, type })
          : await updateTemplateAction({ ...payload, templateId: props.templateId });
      if (r.ok) {
        toast.success(t("saved"));
        if (props.mode === "create")
          router.push(`/admin/documents/${(r.data as { templateId: string }).templateId}`);
        router.refresh();
      } else fail(r);
    } finally {
      setBusy(false);
    }
  }
  async function step(
    run: () => ReturnType<typeof publishTemplateAction>,
    done: string,
    then?: string,
  ) {
    const r = await run();
    if (r.ok) {
      toast.success(done);
      if (then) router.push(then);
      router.refresh();
    } else fail(r);
  }
  const id = props.mode === "edit" ? props.templateId : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        {props.mode === "create" && (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="doc-type">{t("type")}</Label>
            <Select id="doc-type" value={type} onChange={(e) => setType(e.target.value)}>
              {props.types.map((x) => (
                <option key={x.type} value={x.type}>
                  {x.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-lang">{t("language")}</Label>
          <Select id="doc-lang" value={v.language} disabled={!editable} onChange={set("language")}>
            <option value="sq">Shqip</option>
            <option value="en">English</option>
          </Select>
          {errors.language && <p className="text-danger text-[13px]">{say(errors.language[0]!)}</p>}
        </div>
        <div />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-from">{t("validFrom")}</Label>
          <Input
            id="doc-from"
            type="date"
            value={v.validFrom}
            disabled={!editable}
            onChange={set("validFrom")}
          />
          {errors.validFrom && (
            <p className="text-danger text-[13px]">{say(errors.validFrom[0]!)}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-to">{t("validTo")}</Label>
          <Input
            id="doc-to"
            type="date"
            value={v.validTo}
            disabled={!editable}
            onChange={set("validTo")}
          />
          {errors.validTo && <p className="text-danger text-[13px]">{say(errors.validTo[0]!)}</p>}
        </div>
      </div>
      <div className="flex max-w-3xl flex-col gap-1.5">
        <Label htmlFor="doc-html">{t("html")}</Label>
        <p className="text-muted-foreground text-[13px]">
          {t("htmlHint", {
            vars: "{{number}}, {{issuedDate}}, {{verifyUrl}}, {{{qr}}}",
            blocks: "{{#if x}}…{{/if}}, {{#each x}}…{{/each}}",
          })}
        </p>
        <Textarea
          id="doc-html"
          rows={24}
          className="font-mono text-[13px]"
          value={v.html}
          readOnly={!editable}
          onChange={set("html")}
          aria-describedby="doc-html-errors"
        />
        <div id="doc-html-errors" aria-live="polite">
          {errors.html && (
            <ul className="text-danger text-[13px] font-semibold">
              {errors.html.map((e) => (
                <li key={e}>{say(e)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex max-w-3xl flex-col gap-1.5">
        <Label htmlFor="doc-notes">{t("notes")}</Label>
        <Input
          id="doc-notes"
          value={v.notes}
          disabled={!editable}
          onChange={set("notes")}
          maxLength={500}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {editable && (
          <Button
            type="button"
            disabled={busy || (props.mode === "create" && !type)}
            onClick={save}
          >
            {t("saveDraft")}
          </Button>
        )}
        {props.mode === "edit" && (
          <a
            className="border-border inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold underline"
            href={`/api/documents/preview/${id}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("preview")}
          </a>
        )}
        {props.mode === "edit" && props.status === "DRAFT" && (
          <>
            <ConfirmDialog
              trigger={<Button variant="secondary">{t("publish")}</Button>}
              title={t("publishTitle")}
              description={t("publishBody")}
              confirmLabel={t("publish")}
              onConfirm={() =>
                step(() => publishTemplateAction({ templateId: id }), t("published"))
              }
            />
            <ConfirmDialog
              trigger={<Button variant="destructive">{t("discard")}</Button>}
              title={t("discardTitle")}
              description={t("discardBody")}
              confirmLabel={t("discard")}
              destructive
              onConfirm={() =>
                step(
                  () => discardTemplateAction({ templateId: id }),
                  t("discarded"),
                  "/admin/documents",
                )
              }
            />
          </>
        )}
        {props.mode === "edit" && props.status === "PUBLISHED" && (
          <ConfirmDialog
            trigger={<Button variant="destructive">{t("archive")}</Button>}
            title={t("archiveTitle")}
            description={t("archiveBody")}
            confirmLabel={t("archive")}
            destructive
            onConfirm={() => step(() => archiveTemplateAction({ templateId: id }), t("archived"))}
          />
        )}
      </div>
    </div>
  );
}
