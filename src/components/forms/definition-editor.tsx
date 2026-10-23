"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { FormRenderer } from "@/components/forms/form-renderer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { validateDefinition } from "@/lib/forms/definition";
import {
  archiveAction,
  createDraftAction,
  deleteDraftAction,
  publishAction,
  updateDraftAction,
} from "@/lib/forms/definition.actions";

const ROLES = [
  "secretary",
  "student_affairs",
  "finance",
  "hr",
  "quality",
  "library",
  "administration",
  "head_of_department",
  "program_coordinator",
  "erasmus",
  "lecturer",
];

type Props =
  | { mode: "create" }
  | {
      mode: "edit";
      definitionId: string;
      formKey: string;
      status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    };

const TEMPLATE = JSON.stringify(
  {
    title: { sq: "Titulli i formularit", en: "Form title" },
    fields: [
      { key: "name", type: "text", label: { sq: "Emri dhe mbiemri" }, required: true, max: 100 },
    ],
    workflow: {
      initial: "new",
      states: [
        { key: "new", label: { sq: "E re", en: "New" } },
        { key: "done", label: { sq: "Mbyllur", en: "Closed" }, final: true },
      ],
      transitions: [{ from: "new", to: "done" }],
    },
  },
  null,
  2,
);

/** AC-11: JSON editor with live validation, preview, and the draft / publish / archive actions. */
export function DefinitionEditor(
  props: Props & {
    initial?: { audience: "PUBLIC" | "AUTHENTICATED"; ownerRoles: string[]; definition: string };
    locale: string;
  },
) {
  const t = useTranslations("forms.admin");
  const router = useRouter();
  const [key, setKey] = useState(props.mode === "edit" ? props.formKey : "");
  const [audience, setAudience] = useState<"PUBLIC" | "AUTHENTICATED">(
    props.initial?.audience ?? "PUBLIC",
  );
  const [roles, setRoles] = useState<string[]>(props.initial?.ownerRoles ?? ["secretary"]);
  const [text, setText] = useState(props.initial?.definition ?? TEMPLATE);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const editable = props.mode === "create" || props.status === "DRAFT";

  const check = useMemo(() => {
    try {
      const result = validateDefinition(JSON.parse(text), audience);
      return result.ok
        ? { ok: true as const, definition: result.definition }
        : { ok: false as const, errors: result.errors.map((e) => `${e.path || "—"}:${e.code}`) };
    } catch {
      return { ok: false as const, errors: ["—:invalidJson"] };
    }
  }, [text, audience]);

  const describe = (entry: string) => {
    const [path, code] = [
      entry.slice(0, entry.lastIndexOf(":")),
      entry.slice(entry.lastIndexOf(":") + 1),
    ];
    return `${path}: ${t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : code}`;
  };
  const explain = (r: { error: { message: string; fieldErrors?: Record<string, string[]> } }) => {
    if (r.error.fieldErrors?.definition) return setServerErrors(r.error.fieldErrors.definition);
    if (r.error.fieldErrors?.key) return setServerErrors([`key:${r.error.fieldErrors.key[0]}`]);
    if (r.error.fieldErrors?.reason) return toast.error(t("errors.reasonRequired"));
    setServerErrors([`—:${r.error.message}`]);
  };

  async function save() {
    setBusy(true);
    setServerErrors([]);
    try {
      const body = { audience, ownerRoles: roles, definition: text };
      const r =
        props.mode === "create"
          ? await createDraftAction({ ...body, key })
          : await updateDraftAction({ ...body, definitionId: props.definitionId });
      if (r.ok) {
        toast.success(t("saved"));
        router.push(`/admin/forms/${r.data.definitionId}`);
        router.refresh();
      } else explain(r);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (props.mode !== "edit") return;
    const r = await publishAction({ definitionId: props.definitionId });
    if (r.ok) {
      toast.success(t("published"));
      router.refresh();
    } else explain(r);
  }
  async function archive() {
    if (props.mode !== "edit") return;
    const r = await archiveAction({
      definitionId: props.definitionId,
      reason: "Archived from the editor",
    } as never);
    if (r.ok) {
      toast.success(t("archived"));
      router.refresh();
    } else explain(r);
  }
  async function remove() {
    if (props.mode !== "edit") return;
    const r = await deleteDraftAction({ definitionId: props.definitionId });
    if (r.ok) {
      router.push("/admin/forms");
      router.refresh();
    } else explain(r);
  }

  const errors = serverErrors.length > 0 ? serverErrors : check.ok ? [] : check.errors;
  return (
    <div className="flex flex-col gap-8">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        {props.mode === "create" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="form-key">{t("key")}</Label>
            <Input
              id="form-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="kerkese-bursa"
            />
            <p className="text-muted-foreground text-[13px]">{t("keyHint")}</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="form-audience">{t("audience")}</Label>
          <Select
            id="form-audience"
            value={audience}
            disabled={!editable}
            onChange={(e) => setAudience(e.target.value as never)}
          >
            <option value="PUBLIC">{t("audiencePublic")}</option>
            <option value="AUTHENTICATED">{t("audienceAuthenticated")}</option>
          </Select>
        </div>
      </div>
      <fieldset className="max-w-3xl" disabled={!editable}>
        <legend className="mb-1 font-semibold">{t("ownerRoles")}</legend>
        <p className="text-muted-foreground mb-2 text-[13px]">{t("ownerRolesHint")}</p>
        <div className="flex flex-wrap gap-x-4">
          {ROLES.map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={roles.includes(r)}
                onChange={(e) =>
                  setRoles((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)))
                }
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex max-w-3xl flex-col gap-1.5">
        <Label htmlFor="form-json">{t("definition")}</Label>
        <Textarea
          id="form-json"
          rows={22}
          className="font-mono text-[13px]"
          value={text}
          readOnly={!editable}
          onChange={(e) => {
            setText(e.target.value);
            setServerErrors([]);
          }}
          aria-describedby="form-json-errors"
        />
        <div id="form-json-errors" aria-live="polite">
          {errors.length > 0 ? (
            <ul className="text-danger text-[13px] font-semibold">
              {errors.map((e) => (
                <li key={e}>{describe(e)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-success text-[13px] font-semibold">{t("valid")}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {editable && (
          <Button
            type="button"
            disabled={busy || (props.mode === "create" && !key.trim())}
            onClick={save}
          >
            {t("saveDraft")}
          </Button>
        )}
        {props.mode === "edit" && props.status === "DRAFT" && (
          <>
            <ConfirmDialog
              trigger={<Button variant="secondary">{t("publish")}</Button>}
              title={t("publishTitle")}
              description={t("publishBody")}
              confirmLabel={t("publish")}
              onConfirm={publish}
            />
            <ConfirmDialog
              trigger={<Button variant="destructive">{t("deleteDraft")}</Button>}
              title={t("deleteTitle")}
              description={t("deleteBody")}
              confirmLabel={t("deleteDraft")}
              destructive
              onConfirm={remove}
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
            onConfirm={archive}
          />
        )}
      </div>
      {check.ok && (
        <section aria-labelledby="preview-title" className="rounded-card border-border border p-4">
          <h2 id="preview-title" className="mb-1 text-xl font-semibold">
            {t("preview")}
          </h2>
          <p className="text-muted-foreground mb-4 text-sm">{check.definition.title.sq}</p>
          <FormRenderer
            formKey={key || "preview"}
            definition={check.definition}
            locale={props.locale}
            mode="preview"
          />
        </section>
      )}
    </div>
  );
}
