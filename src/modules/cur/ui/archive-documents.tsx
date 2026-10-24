"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FileUpload } from "@/components/files/file-upload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toaster";
import {
  addArchiveDocumentAction,
  updateArchiveDocumentAction,
  withdrawArchiveDocumentAction,
} from "../server/archive.actions";

const KINDS = ["DIPLOMA_FORM", "DIPLOMA_SUPPLEMENT", "DECISION", "OTHER"] as const;
type Kind = (typeof KINDS)[number];

export type ArchiveDocView = {
  id: string;
  kind: Kind;
  title: string;
  decisionRef: string | null;
  decisionDate: string | null;
  fileId: string;
  fileName: string;
  templateId: string | null;
  templateLabel: string | null;
  notes: string | null;
  status: "ACTIVE" | "WITHDRAWN";
  withdrawReason: string | null;
};
export type Option = { id: string; label: string };

const MAX_BYTES = 10 * 1024 * 1024;

/** AC-2/AC-3: add a document (with its scan) or edit the details of an active one. */
export function ArchiveDocumentDialog({
  yearId,
  templates,
  doc,
  programId,
}: {
  yearId: string;
  templates: Option[];
  doc?: ArchiveDocView;
  /** the program the document belongs to; null = the whole institution */
  programId: string | null;
}) {
  const t = useTranslations("cur.archive");
  const tc = useTranslations("common");
  const router = useRouter();
  const editing = !!doc;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileId, setFileId] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>(doc?.kind ?? "DIPLOMA_FORM");
  const [title, setTitle] = useState(doc?.title ?? "");
  const [decisionRef, setDecisionRef] = useState(doc?.decisionRef ?? "");
  const [decisionDate, setDecisionDate] = useState(doc?.decisionDate ?? "");
  const [templateId, setTemplateId] = useState(doc?.templateId ?? "");
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const uid = doc?.id ?? "new";

  async function save() {
    setBusy(true);
    try {
      const common = {
        title,
        decisionRef: decisionRef || null,
        decisionDate: decisionDate || null,
        notes: notes || null,
        templateId: templateId || null,
      };
      const r = editing
        ? await updateArchiveDocumentAction({ documentId: doc.id, ...common })
        : await addArchiveDocumentAction({
            kind,
            academicYearId: yearId,
            programId,
            fileId: fileId!,
            ...common,
          });
      if (r.ok) {
        toast.success(editing ? t("updated") : t("added"));
        setOpen(false);
        router.refresh();
      } else toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">{editing ? t("edit") : t("add")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">
          {editing ? t("editTitle") : t("addTitle")}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {editing ? t("editBody") : t("addBody")}
        </DialogDescription>
        <div className="mt-4 flex max-h-[60vh] flex-col gap-4 overflow-y-auto p-1">
          {!editing && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`kind-${uid}`}>{t("fields.kind")}</Label>
                <Select
                  id={`kind-${uid}`}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Kind)}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kind.${k}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <FileUpload
                purpose="approved-document"
                maxBytes={MAX_BYTES}
                mimeTypes={["application/pdf", "image/jpeg", "image/png"]}
                typeLabels={["PDF", "JPEG", "PNG"]}
                label={t("fields.file")}
                onUploaded={(f) => setFileId(f.id)}
              />
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`title-${uid}`}>{t("fields.title")}</Label>
            <Input
              id={`title-${uid}`}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ref-${uid}`}>{t("fields.decisionRef")}</Label>
            <Input
              id={`ref-${uid}`}
              value={decisionRef}
              maxLength={100}
              onChange={(e) => setDecisionRef(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`date-${uid}`}>{t("fields.decisionDate")}</Label>
            <Input
              id={`date-${uid}`}
              type="date"
              value={decisionDate}
              onChange={(e) => setDecisionDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`tpl-${uid}`}>{t("fields.template")}</Label>
            <Select
              id={`tpl-${uid}`}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">—</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`notes-${uid}`}>{t("fields.notes")}</Label>
            <Input
              id={`notes-${uid}`}
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{tc("cancel")}</Button>
          </DialogClose>
          <Button disabled={busy || !title.trim() || (!editing && !fileId)} onClick={save}>
            {tc("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** AC-4: withdraw with a reason. */
function WithdrawDialog({ doc }: { doc: ArchiveDocView }) {
  const t = useTranslations("cur.archive");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await withdrawArchiveDocumentAction({ documentId: doc.id, reason });
      if (r.ok) {
        toast.success(t("withdrawn"));
        setOpen(false);
        router.refresh();
      } else toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t("withdraw")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">
          {t("withdrawTitle", { title: doc.title })}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {t("withdrawBody")}
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor={`reason-${doc.id}`}>{t("fields.reason")}</Label>
          <Input
            id={`reason-${doc.id}`}
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{tc("cancel")}</Button>
          </DialogClose>
          <Button variant="destructive" disabled={busy || !reason.trim()} onClick={run}>
            {t("withdraw")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** AC-5: the documents of one program (or the institution) in the selected year. */
export function ArchiveDocumentTable({
  docs,
  yearId,
  writable,
  templates,
  fixedProgramId,
}: {
  docs: ArchiveDocView[];
  yearId: string;
  writable: boolean;
  templates: Option[];
  fixedProgramId: string | null;
}) {
  const t = useTranslations("cur.archive");
  if (docs.length === 0) return <p className="text-muted-foreground text-sm">{t("noDocuments")}</p>;
  return (
    <div className="rounded-card border-border bg-card overflow-x-auto border">
      <table className="w-full min-w-[44rem] text-sm">
        <thead>
          <tr className="border-border border-b text-left">
            {["title", "kind", "decision", "file", "actions"].map((c) => (
              <th key={c} scope="col" className="p-3 font-semibold">
                {t(`columns.${c}` as never)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-border border-b align-top last:border-0">
              <th scope="row" className="p-3 text-left font-semibold">
                {d.title}
                {d.status === "WITHDRAWN" && (
                  <div className="mt-1">
                    <StatusBadge tone="neutral" label={t("statusWithdrawn")} />
                    <p className="text-muted-foreground mt-1 text-[13px] font-normal">
                      {d.withdrawReason}
                    </p>
                  </div>
                )}
              </th>
              <td className="p-3">{t(`kind.${d.kind}`)}</td>
              <td className="font-tabular p-3">
                {[d.decisionRef, d.decisionDate].filter(Boolean).join(" · ") || "—"}
                {d.templateLabel && (
                  <p className="text-muted-foreground text-[13px]">{d.templateLabel}</p>
                )}
              </td>
              <td className="p-3">
                <a
                  href={`/api/files/${d.fileId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {d.fileName || t("download")}
                </a>
              </td>
              <td className="p-3">
                {writable && d.status === "ACTIVE" && (
                  <div className="flex flex-wrap gap-2">
                    <ArchiveDocumentDialog
                      yearId={yearId}
                      templates={templates}
                      doc={d}
                      programId={fixedProgramId}
                    />
                    <WithdrawDialog doc={d} />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
