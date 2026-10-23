"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  changeCohortPlanAction,
  deactivateCohortAction,
  reactivateCohortAction,
  renameCohortAction,
} from "../server/cohort.actions";
import { ReasonDialog } from "./reason-dialog";

/** AC-3/AC-5: rename, change plan (reason) and deactivate / reactivate (reason). */
export function CohortActions({
  cohortId,
  name,
  active,
  planId,
  plans,
}: {
  cohortId: string;
  name: string;
  active: boolean;
  planId: string;
  plans: { id: string; label: string }[];
}) {
  const t = useTranslations("org.cohort");
  const root = useTranslations();
  const router = useRouter();
  const [newName, setNewName] = useState(name);
  const [newPlan, setNewPlan] = useState(planId);

  function explain(result: { error: { message: string; fieldErrors?: Record<string, string[]> } }) {
    if (result.error.fieldErrors?.reason) return t("errors.reasonRequired");
    const code = result.error.fieldErrors
      ? Object.values(result.error.fieldErrors)[0]?.[0]
      : result.error.message.split(":")[0];
    if (code === "HAS_DEPENDENTS") {
      const names = (result.error.message.split(":")[1] ?? "")
        .split(",")
        .map((p) => p.split("="))
        .map(([k, n]) => `${root.has(k as never) ? root(k as never) : k} (${n})`);
      return t("errors.HAS_DEPENDENTS", { names: names.join(", ") });
    }
    return code && t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : t("errors.generic");
  }

  async function rename() {
    const r = await renameCohortAction({ cohortId, name: newName });
    if (r.ok) {
      toast.success(t("actions.saved"));
      router.refresh();
    } else toast.error(explain(r));
  }

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rename-cohort">{t("form.name")}</Label>
        <div className="flex gap-2">
          <Input id="rename-cohort" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button
            type="button"
            variant="secondary"
            disabled={!newName.trim() || newName === name}
            onClick={rename}
          >
            {t("actions.rename")}
          </Button>
        </div>
      </div>
      {active && plans.length > 1 && (
        <ReasonDialog
          triggerLabel={t("actions.changePlan")}
          title={t("actions.changePlanTitle")}
          description={t("actions.changePlanBody")}
          confirmLabel={t("actions.changePlan")}
          onSubmit={async (reason) => {
            const r = await changeCohortPlanAction({
              cohortId,
              curriculumPlanId: newPlan,
              reason,
            } as never);
            if (r.ok) {
              toast.success(t("actions.saved"));
              router.refresh();
              return null;
            }
            return explain(r);
          }}
        >
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="change-plan">{t("form.plan")}</Label>
            <Select id="change-plan" value={newPlan} onChange={(e) => setNewPlan(e.target.value)}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        </ReasonDialog>
      )}
      <ReasonDialog
        triggerLabel={t(active ? "actions.deactivate" : "actions.reactivate")}
        title={t(active ? "actions.deactivateTitle" : "actions.reactivateTitle")}
        description={t(active ? "actions.deactivateBody" : "actions.reactivateBody")}
        confirmLabel={t(active ? "actions.deactivate" : "actions.reactivate")}
        destructive={active}
        onSubmit={async (reason) => {
          const r = await (active ? deactivateCohortAction : reactivateCohortAction)({
            cohortId,
            reason,
          } as never);
          if (r.ok) {
            toast.success(t("actions.statusChanged"));
            router.refresh();
            return null;
          }
          return explain(r);
        }}
      />
    </div>
  );
}
