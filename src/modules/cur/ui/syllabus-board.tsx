"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FileUpload } from "@/components/files/file-upload";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toaster";
import {
  approveSyllabusAction,
  carryForwardAction,
  deleteSyllabusAction,
  uploadSyllabusAction,
} from "../server/syllabus.actions";

export type SyllabusRowView = {
  planCourseId: string;
  yearOfStudy: number;
  semester: number;
  code: string;
  name: string;
  state: "approved" | "draft" | "missing";
  approved: { id: string; fileId: string; version: number } | null;
  draft: { id: string; fileId: string; version: number } | null;
  versions: number;
};

const TONE: Record<string, StatusTone> = {
  approved: "success",
  draft: "warning",
  missing: "neutral",
};

const MAX_BYTES = 10 * 1024 * 1024;

function UploadDialog({
  row,
  yearId,
  replace,
}: {
  row: SyllabusRowView;
  yearId: string;
  replace: boolean;
}) {
  const t = useTranslations("cur.syllabi");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileId, setFileId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!fileId) return;
    setBusy(true);
    try {
      const r = await uploadSyllabusAction({
        planCourseId: row.planCourseId,
        academicYearId: yearId,
        fileId,
        notes: notes || null,
      });
      if (r.ok) {
        toast.success(t("uploaded"));
        setOpen(false);
        setFileId(null);
        setNotes("");
        router.refresh();
      } else toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">{replace ? t("newVersion") : t("upload")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle className="text-lg font-semibold">
          {t("uploadTitle", { code: row.code })}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-2 text-sm">
          {t("uploadBody")}
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-4">
          <FileUpload
            purpose="syllabus"
            maxBytes={MAX_BYTES}
            mimeTypes={["application/pdf"]}
            typeLabels={["PDF"]}
            label={t("file")}
            onUploaded={(f) => setFileId(f.id)}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`notes-${row.planCourseId}`}>{t("notes")}</Label>
            <Input
              id={`notes-${row.planCourseId}`}
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
          <Button disabled={!fileId || busy} onClick={save}>
            {t("saveDraft")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** AC-2..AC-4, AC-8: the courses of a plan with their syllabus state and, for writers, the actions. */
export function SyllabusBoard({
  rows,
  yearId,
  editable,
  staff,
}: {
  rows: SyllabusRowView[];
  yearId: string;
  editable: boolean;
  staff: boolean;
}) {
  const t = useTranslations("cur.syllabi");
  const router = useRouter();
  async function step(run: () => Promise<{ ok: boolean }>, done: string) {
    const r = await run();
    if (r.ok) {
      toast.success(done);
      router.refresh();
    } else toast.error(t("failed"));
  }
  return (
    <div className="rounded-card border-border bg-card overflow-x-auto border">
      <table className="w-full min-w-[48rem] text-sm">
        <thead>
          <tr className="border-border border-b text-left">
            {["course", "yearSemester", "state", "file", "actions"].map((c) => (
              <th key={c} scope="col" className="p-3 font-semibold">
                {t(`columns.${c}` as never)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.planCourseId} className="border-border border-b align-top last:border-0">
              <th scope="row" className="p-3 text-left font-semibold">
                <span className="font-tabular">{r.code}</span> — {r.name}
              </th>
              <td className="font-tabular p-3">
                {r.yearOfStudy} / {r.semester}
              </td>
              <td className="p-3">
                <StatusBadge tone={TONE[r.state]!} label={t(`state.${r.state}`)} />
                {r.state === "approved" && r.draft && (
                  <p className="text-muted-foreground mt-1 text-[13px]">
                    {t("draftWaiting", { version: r.draft.version })}
                  </p>
                )}
              </td>
              <td className="p-3">
                <div className="flex flex-col gap-1">
                  {r.approved && (
                    <a
                      href={`/api/files/${r.approved.fileId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {t("download", { version: r.approved.version })}
                    </a>
                  )}
                  {staff && r.draft && (
                    <a
                      href={`/api/files/${r.draft.fileId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {t("downloadDraft", { version: r.draft.version })}
                    </a>
                  )}
                  {!r.approved && !(staff && r.draft) && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-2">
                  {editable && <UploadDialog row={r} yearId={yearId} replace={r.versions > 0} />}
                  {editable && r.draft && (
                    <>
                      <ConfirmDialog
                        trigger={<Button variant="secondary">{t("approve")}</Button>}
                        title={t("approveTitle", { code: r.code })}
                        description={t("approveBody")}
                        confirmLabel={t("approve")}
                        onConfirm={() =>
                          step(
                            () => approveSyllabusAction({ syllabusId: r.draft!.id }),
                            t("approved"),
                          )
                        }
                      />
                      <ConfirmDialog
                        trigger={<Button variant="destructive">{t("deleteDraft")}</Button>}
                        title={t("deleteTitle", { code: r.code })}
                        description={t("deleteBody")}
                        confirmLabel={t("deleteDraft")}
                        destructive
                        onConfirm={() =>
                          step(
                            () => deleteSyllabusAction({ syllabusId: r.draft!.id }),
                            t("deleted"),
                          )
                        }
                      />
                    </>
                  )}
                  {staff && r.versions > 0 && (
                    <Link
                      href={`/cur/syllabi/${r.planCourseId}?year=${yearId}`}
                      className="inline-flex min-h-11 items-center underline"
                    >
                      {t("history")}
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** AC-7 */
export function CarryForwardButton({
  planId,
  yearId,
  yearLabel,
}: {
  planId: string;
  yearId: string;
  yearLabel: string;
}) {
  const t = useTranslations("cur.syllabi");
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="secondary">{t("carry")}</Button>}
      title={t("carryTitle", { year: yearLabel })}
      description={t("carryBody")}
      confirmLabel={t("carry")}
      onConfirm={async () => {
        const r = await carryForwardAction({ planId, academicYearId: yearId });
        if (r.ok) {
          toast.success(t("carried", r.data));
          router.refresh();
        } else toast.error(t("failed"));
      }}
    />
  );
}
