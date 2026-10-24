"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { DISCOUNT_KINDS, FEE_KINDS, type DiscountKind, type FeeKind } from "../domain/fee-rules";
import { saveFeeItemAction, setItemActiveAction } from "../server/fin.actions";
import { useExplain } from "./explain";

export type FeeItemDraft = {
  id: string;
  kind: FeeKind;
  label: string;
  amount: string;
  installments: { dueDate: string; amount: string }[];
  discounts: {
    label: string;
    kind: DiscountKind;
    value: string;
    validFrom: string;
    validTo: string;
  }[];
};

const empty: Omit<FeeItemDraft, "id"> = {
  kind: "TUITION",
  label: "",
  amount: "",
  installments: [],
  discounts: [],
};

/** AC-1..AC-3: add a fee of a program for the year, or change one (all of it is saved together). */
export function FeeItemForm({
  programId,
  academicYearId,
  item,
}: {
  programId: string;
  academicYearId: string;
  item?: FeeItemDraft;
}) {
  const t = useTranslations("fin.form");
  const tk = useTranslations("fin.kind");
  const router = useRouter();
  const explain = useExplain();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Omit<FeeItemDraft, "id">>(item ?? empty);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const uid = `${programId}-${item?.id ?? "new"}`;

  if (!open)
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {item ? t("edit") : t("add")}
      </Button>
    );

  const setInst = (i: number, patch: Partial<FeeItemDraft["installments"][number]>) =>
    setV({
      ...v,
      installments: v.installments.map((r, n) => (n === i ? { ...r, ...patch } : r)),
    });
  const setDisc = (i: number, patch: Partial<FeeItemDraft["discounts"][number]>) =>
    setV({ ...v, discounts: v.discounts.map((r, n) => (n === i ? { ...r, ...patch } : r)) });

  return (
    <form
      className="rounded-card border-border bg-muted/40 flex flex-col gap-4 border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await saveFeeItemAction({
            itemId: item?.id ?? null,
            programId,
            academicYearId,
            ...v,
          });
          if (r.ok) {
            toast.success(t("saved"));
            if (!item) setV(empty);
            setOpen(false);
            router.refresh();
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-kind`} className="text-[12px]">
            {t("kind")}
          </Label>
          <Select
            id={`${uid}-kind`}
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
          <Label htmlFor={`${uid}-label`} className="text-[12px]">
            {t("label")}
          </Label>
          <Input
            id={`${uid}-label`}
            value={v.label}
            maxLength={60}
            onChange={(e) => setV({ ...v, label: e.target.value })}
          />
        </div>
        <div className="flex w-40 flex-col gap-1">
          <Label htmlFor={`${uid}-amount`} className="text-[12px]">
            {t("amount")}
          </Label>
          <Input
            id={`${uid}-amount`}
            inputMode="decimal"
            value={v.amount}
            onChange={(e) => setV({ ...v, amount: e.target.value })}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">{t("installments")}</legend>
        <p className="text-muted-foreground text-[13px]">{t("installmentsHint")}</p>
        {v.installments.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-id-${i}`} className="text-[12px]">
                {t("dueDate")}
              </Label>
              <Input
                id={`${uid}-id-${i}`}
                type="date"
                value={r.dueDate}
                onChange={(e) => setInst(i, { dueDate: e.target.value })}
              />
            </div>
            <div className="flex w-40 flex-col gap-1">
              <Label htmlFor={`${uid}-ia-${i}`} className="text-[12px]">
                {t("installmentAmount")}
              </Label>
              <Input
                id={`${uid}-ia-${i}`}
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => setInst(i, { amount: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setV({ ...v, installments: v.installments.filter((_, n) => n !== i) })}
            >
              {t("remove")}
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setV({ ...v, installments: [...v.installments, { dueDate: "", amount: "" }] })
            }
          >
            {t("addInstallment")}
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">{t("discounts")}</legend>
        <p className="text-muted-foreground text-[13px]">{t("discountsHint")}</p>
        {v.discounts.map((d, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-dl-${i}`} className="text-[12px]">
                {t("discountLabel")}
              </Label>
              <Input
                id={`${uid}-dl-${i}`}
                value={d.label}
                maxLength={60}
                onChange={(e) => setDisc(i, { label: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-dk-${i}`} className="text-[12px]">
                {t("discountKind")}
              </Label>
              <Select
                id={`${uid}-dk-${i}`}
                value={d.kind}
                onChange={(e) => setDisc(i, { kind: e.target.value as DiscountKind })}
              >
                {DISCOUNT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`discountKinds.${k}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex w-32 flex-col gap-1">
              <Label htmlFor={`${uid}-dv-${i}`} className="text-[12px]">
                {t("discountValue")}
              </Label>
              <Input
                id={`${uid}-dv-${i}`}
                inputMode="decimal"
                value={d.value}
                onChange={(e) => setDisc(i, { value: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-df-${i}`} className="text-[12px]">
                {t("validFrom")}
              </Label>
              <Input
                id={`${uid}-df-${i}`}
                type="date"
                value={d.validFrom}
                onChange={(e) => setDisc(i, { validFrom: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-dt-${i}`} className="text-[12px]">
                {t("validTo")}
              </Label>
              <Input
                id={`${uid}-dt-${i}`}
                type="date"
                value={d.validTo}
                onChange={(e) => setDisc(i, { validTo: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setV({ ...v, discounts: v.discounts.filter((_, n) => n !== i) })}
            >
              {t("remove")}
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setV({
                ...v,
                discounts: [
                  ...v.discounts,
                  { label: "", kind: "PERCENT", value: "", validFrom: "", validTo: "" },
                ],
              })
            }
          >
            {t("addDiscount")}
          </Button>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-control border-danger text-danger border p-3 text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/** AC-4: deactivate or reactivate a fee. */
export function ItemActiveButton({ itemId, active }: { itemId: string; active: boolean }) {
  const t = useTranslations("fin.form");
  const router = useRouter();
  const explain = useExplain();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const r = await setItemActiveAction({ itemId, active: !active });
          if (r.ok) router.refresh();
          else toast.error(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      {active ? t("deactivate") : t("activate")}
    </Button>
  );
}
