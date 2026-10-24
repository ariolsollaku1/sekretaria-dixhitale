"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { FEE_KINDS, type FeeKind } from "../domain/fee-rules";
import {
  addInstallmentAction,
  adjustInstallmentAction,
  cancelInstallmentAction,
} from "../server/fin.actions";
import { useExplain } from "./explain";

const alertClass = "rounded-control border-danger text-danger w-full border p-3 text-sm";

/** AC-8: change the amount and due date of an installment, or cancel it, always with a reason. */
export function InstallmentActions({
  installmentId,
  amount,
  dueDate,
}: {
  installmentId: string;
  amount: string;
  dueDate: string;
}) {
  const t = useTranslations("fin.adjust");
  const router = useRouter();
  const explain = useExplain();
  const [mode, setMode] = useState<"adjust" | "cancel" | null>(null);
  const [v, setV] = useState({ amount, dueDate, reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const r =
        mode === "cancel"
          ? await cancelInstallmentAction({ installmentId, reason: v.reason })
          : await adjustInstallmentAction({
              installmentId,
              amount: v.amount,
              dueDate: v.dueDate,
              reason: v.reason,
            });
      if (r.ok) {
        toast.success(t("saved"));
        setMode(null);
        router.refresh();
      } else setError(explain(r));
    } finally {
      setPending(false);
    }
  }

  if (!mode)
    return (
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setMode("adjust")}>
          {t("adjust")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode("cancel")}>
          {t("cancelInstallment")}
        </Button>
      </div>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {mode === "adjust" && (
        <>
          <div className="flex w-36 flex-col gap-1">
            <Label htmlFor={`adj-a-${installmentId}`} className="text-[12px]">
              {t("amount")}
            </Label>
            <Input
              id={`adj-a-${installmentId}`}
              inputMode="decimal"
              value={v.amount}
              onChange={(e) => setV({ ...v, amount: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`adj-d-${installmentId}`} className="text-[12px]">
              {t("dueDate")}
            </Label>
            <Input
              id={`adj-d-${installmentId}`}
              type="date"
              value={v.dueDate}
              onChange={(e) => setV({ ...v, dueDate: e.target.value })}
            />
          </div>
        </>
      )}
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor={`adj-r-${installmentId}`} className="text-[12px]">
          {t("reason")}
        </Label>
        <Input
          id={`adj-r-${installmentId}`}
          value={v.reason}
          maxLength={500}
          onChange={(e) => setV({ ...v, reason: e.target.value })}
        />
      </div>
      <Button
        type="submit"
        disabled={pending}
        variant={mode === "cancel" ? "destructive" : "primary"}
      >
        {mode === "cancel" ? t("confirmCancel") : t("save")}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setMode(null)}>
        {t("close")}
      </Button>
      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}
    </form>
  );
}

/** AC-8: an extra installment on the plan. */
export function AddInstallment({ planId }: { planId: string }) {
  const t = useTranslations("fin.adjust");
  const tk = useTranslations("fin.kind");
  const router = useRouter();
  const explain = useExplain();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    kind: "OTHER" as FeeKind,
    label: "",
    amount: "",
    dueDate: "",
    reason: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!open)
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("add")}
      </Button>
    );
  return (
    <form
      className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await addInstallmentAction({ planId, ...v });
          if (r.ok) {
            toast.success(t("saved"));
            setOpen(false);
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <h3 className="w-full text-lg font-semibold">{t("addTitle")}</h3>
      <div className="flex flex-col gap-1">
        <Label htmlFor="add-kind" className="text-[12px]">
          {t("kind")}
        </Label>
        <Select
          id="add-kind"
          value={v.kind}
          onChange={(e) => setV({ ...v, kind: e.target.value as FeeKind })}
        >
          {FEE_KINDS.map((k) => (
            <option key={k} value={k}>
              {tk(k)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="add-label" className="text-[12px]">
          {t("label")}
        </Label>
        <Input
          id="add-label"
          value={v.label}
          maxLength={60}
          onChange={(e) => setV({ ...v, label: e.target.value })}
        />
      </div>
      <div className="flex w-36 flex-col gap-1">
        <Label htmlFor="add-amount" className="text-[12px]">
          {t("amount")}
        </Label>
        <Input
          id="add-amount"
          inputMode="decimal"
          value={v.amount}
          onChange={(e) => setV({ ...v, amount: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="add-due" className="text-[12px]">
          {t("dueDate")}
        </Label>
        <Input
          id="add-due"
          type="date"
          value={v.dueDate}
          onChange={(e) => setV({ ...v, dueDate: e.target.value })}
        />
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor="add-reason" className="text-[12px]">
          {t("reason")}
        </Label>
        <Input
          id="add-reason"
          value={v.reason}
          maxLength={500}
          onChange={(e) => setV({ ...v, reason: e.target.value })}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        {t("close")}
      </Button>
      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}
    </form>
  );
}
