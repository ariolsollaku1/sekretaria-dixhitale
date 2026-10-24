"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { PAYMENT_METHODS, type PaymentMethod } from "../domain/payment-rules";
import { recordPaymentAction, voidPaymentAction } from "../server/fin.actions";
import { useExplain } from "./explain";

const alertClass = "rounded-control border-danger text-danger w-full border p-3 text-sm";

/** AC-1: record a payment on a plan, optionally for one installment. */
export function RecordPayment({
  planId,
  today,
  installments,
}: {
  planId: string;
  today: string;
  installments: { id: string; label: string }[];
}) {
  const t = useTranslations("fin.payment");
  const router = useRouter();
  const explain = useExplain();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    amount: "",
    paidOn: today,
    reference: "",
    method: "BANK_TRANSFER" as PaymentMethod,
    installmentId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!open)
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        {t("record")}
      </Button>
    );
  return (
    <form
      className="rounded-card border-border bg-muted/40 mb-6 flex flex-wrap items-end gap-3 border p-4 print:hidden"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await recordPaymentAction({
            planId,
            ...v,
            installmentId: v.installmentId || null,
          });
          if (r.ok) {
            toast.success(t("saved"));
            setOpen(false);
            setV({ ...v, amount: "", reference: "", installmentId: "" });
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <h3 className="w-full text-lg font-semibold">{t("recordTitle")}</h3>
      <div className="flex w-36 flex-col gap-1">
        <Label htmlFor="pay-amount" className="text-[12px]">
          {t("amount")}
        </Label>
        <Input
          id="pay-amount"
          inputMode="decimal"
          value={v.amount}
          onChange={(e) => setV({ ...v, amount: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="pay-date" className="text-[12px]">
          {t("paidOn")}
        </Label>
        <Input
          id="pay-date"
          type="date"
          max={today}
          value={v.paidOn}
          onChange={(e) => setV({ ...v, paidOn: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="pay-method" className="text-[12px]">
          {t("method")}
        </Label>
        <Select
          id="pay-method"
          value={v.method}
          onChange={(e) => setV({ ...v, method: e.target.value as PaymentMethod })}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`methods.${m}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor="pay-ref" className="text-[12px]">
          {t("reference")}
        </Label>
        <Input
          id="pay-ref"
          value={v.reference}
          maxLength={120}
          onChange={(e) => setV({ ...v, reference: e.target.value })}
        />
      </div>
      <div className="flex min-w-48 flex-col gap-1">
        <Label htmlFor="pay-inst" className="text-[12px]">
          {t("installment")}
        </Label>
        <Select
          id="pay-inst"
          value={v.installmentId}
          onChange={(e) => setV({ ...v, installmentId: e.target.value })}
        >
          <option value="">{t("oldestFirst")}</option>
          {installments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        {t("close")}
      </Button>
      <p className="text-muted-foreground w-full text-[13px]">{t("hint")}</p>
      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}
    </form>
  );
}

/** AC-2: void a payment with a reason. */
export function VoidPayment({ paymentId }: { paymentId: string }) {
  const t = useTranslations("fin.payment");
  const router = useRouter();
  const explain = useExplain();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!open)
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        {t("void")}
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await voidPaymentAction({ paymentId, reason });
          if (r.ok) {
            toast.success(t("voided"));
            setOpen(false);
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor={`void-r-${paymentId}`} className="text-[12px]">
          {t("voidReason")}
        </Label>
        <Input
          id={`void-r-${paymentId}`}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <Button type="submit" variant="destructive" disabled={pending}>
        {t("confirmVoid")}
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
