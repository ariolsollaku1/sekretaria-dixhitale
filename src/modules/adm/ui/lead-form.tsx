"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { LEAD_SOURCES, type LeadSource } from "../domain/lead-rules";
import { createLeadAction, updateLeadAction } from "../server/lead.actions";
import { useExplain } from "./explain";

export type LeadDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  programId: string;
  programNote: string;
  message: string;
  source: LeadSource;
  sourceNote: string;
};

const empty: LeadDraft = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  programId: "",
  programNote: "",
  message: "",
  source: "EVENT",
  sourceNote: "",
};

/** AC-3 / AC-7: add a lead by hand, or edit the contact data of one (`leadId`). */
export function LeadForm({
  leadId,
  initial,
  programs,
}: {
  leadId?: string;
  initial?: LeadDraft;
  programs: { id: string; label: string }[];
}) {
  const t = useTranslations("adm.leadForm");
  const tc = useTranslations("common");
  const ts = useTranslations("adm.source");
  const router = useRouter();
  const explain = useExplain();
  const [draft, setDraft] = useState<LeadDraft>(initial ?? empty);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const uid = leadId ?? "new";

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = leadId
            ? await updateLeadAction({ leadId, ...draft })
            : await createLeadAction({ ...draft, consent });
          if (r.ok) {
            toast.success(t("saved"));
            if (!leadId) {
              setDraft(empty);
              setConsent(false);
            }
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      {(
        [
          ["firstName", "text", true],
          ["lastName", "text", true],
          ["email", "email", false],
          ["phone", "tel", false],
        ] as const
      ).map(([key, type, required]) => (
        <div key={key} className="flex flex-col gap-1.5">
          <Label htmlFor={`lead-${uid}-${key}`}>{t(key)}</Label>
          <Input
            id={`lead-${uid}-${key}`}
            type={type}
            required={required}
            maxLength={key === "email" ? 254 : 100}
            value={draft[key]}
            onChange={(e) => set(key, e.target.value)}
          />
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`lead-${uid}-program`}>{t("program")}</Label>
        <Select
          id={`lead-${uid}-program`}
          value={draft.programId}
          onChange={(e) => set("programId", e.target.value)}
        >
          <option value="">{t("noProgram")}</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`lead-${uid}-programNote`}>{t("programNote")}</Label>
        <Input
          id={`lead-${uid}-programNote`}
          maxLength={200}
          value={draft.programNote}
          onChange={(e) => set("programNote", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`lead-${uid}-source`}>{t("source")}</Label>
        <Select
          id={`lead-${uid}-source`}
          value={draft.source}
          onChange={(e) => set("source", e.target.value as LeadSource)}
        >
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {ts(s)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`lead-${uid}-sourceNote`}>{t("sourceNote")}</Label>
        <Input
          id={`lead-${uid}-sourceNote`}
          maxLength={200}
          value={draft.sourceNote}
          onChange={(e) => set("sourceNote", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={`lead-${uid}-message`}>{t("message")}</Label>
        <Textarea
          id={`lead-${uid}-message`}
          maxLength={2000}
          value={draft.message}
          onChange={(e) => set("message", e.target.value)}
        />
      </div>
      {!leadId && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="size-4"
          />
          {t("consent")}
        </label>
      )}
      {error && (
        <p role="alert" className="text-danger text-[13px] font-semibold sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {leadId ? tc("save") : t("add")}
        </Button>
      </div>
    </form>
  );
}
