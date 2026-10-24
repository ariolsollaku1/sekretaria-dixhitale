"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  assignEvaluatorAction,
  closeCampaignAction,
  openCampaignAction,
} from "../server/evaluation.actions";

type ActionError = { message: string; fieldErrors?: Record<string, string[]> };

function useExplain() {
  const t = useTranslations("hrEvaluation");
  return (error: ActionError) => {
    const code = error.fieldErrors ? Object.values(error.fieldErrors)[0]?.[0] : error.message;
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  };
}

const today = () => new Date().toISOString().slice(0, 10);

/** AC-2: open a campaign. */
export function OpenCampaignForm() {
  const t = useTranslations("hrEvaluation");
  const router = useRouter();
  const explain = useExplain();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"LECTURER" | "STAFF">("LECTURER");
  const [periodStart, setPeriodStart] = useState(today());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [resultsVisible, setResultsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await openCampaignAction({ name, kind, periodStart, periodEnd, resultsVisible });
      if (r.ok) {
        toast.success(t("opened"));
        setName("");
        router.push(`/hr/evaluations/${r.data.id}`);
        router.refresh();
      } else setError(explain(r.error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-3" aria-label={t("openTitle")}>
      <h2 className="text-lg font-semibold">{t("openTitle")}</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ev-name">{t("fields.name")}</Label>
        <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ev-kind">{t("fields.kind")}</Label>
        <Select
          id="ev-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "LECTURER" | "STAFF")}
        >
          <option value="LECTURER">{t("kinds.LECTURER")}</option>
          <option value="STAFF">{t("kinds.STAFF")}</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-start">{t("fields.periodStart")}</Label>
          <Input
            id="ev-start"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-end">{t("fields.periodEnd")}</Label>
          <Input
            id="ev-end"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={resultsVisible}
          onChange={(e) => setResultsVisible(e.target.checked)}
        />
        {t("fields.resultsVisible")}
      </label>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || !name.trim()}>
          {t("open")}
        </Button>
      </div>
    </form>
  );
}

/** AC-6: close a campaign (irreversible). */
export function CloseCampaignButton({ campaignId }: { campaignId: string }) {
  const t = useTranslations("hrEvaluation");
  const router = useRouter();
  const explain = useExplain();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function close() {
    setPending(true);
    setError(null);
    try {
      const r = await closeCampaignAction({ campaignId });
      if (r.ok) {
        toast.success(t("closed"));
        router.refresh();
      } else setError(explain(r.error));
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="secondary" disabled={pending}>
            {t("close")}
          </Button>
        }
        title={t("closeTitle")}
        description={t("closeConfirm")}
        confirmLabel={t("close")}
        onConfirm={close}
      />
      {error && (
        <p role="alert" className="text-destructive mt-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/** AC-3: change the evaluator of one evaluation. */
export function AssignEvaluator({
  evaluationId,
  current,
  options,
  person,
}: {
  evaluationId: string;
  current: string | null;
  options: { id: string; name: string }[];
  person: string;
}) {
  const t = useTranslations("hrEvaluation");
  const router = useRouter();
  const explain = useExplain();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function change(next: string) {
    setValue(next);
    if (!next) return;
    setPending(true);
    setError(null);
    try {
      const r = await assignEvaluatorAction({ evaluationId, evaluatorId: next });
      if (r.ok) {
        toast.success(t("assigned"));
        router.refresh();
      } else {
        setValue(current ?? "");
        setError(explain(r.error));
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Select
        value={value}
        disabled={pending}
        aria-label={t("assignFor", { person })}
        onChange={(e) => void change(e.target.value)}
      >
        <option value="">{t("unassigned")}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
