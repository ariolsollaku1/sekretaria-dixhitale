"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import type { Role, ScopeType } from "@/lib/authz/roles";
import type { RoleAssignmentInput } from "../domain/schemas";
import { addRoleAction, removeRoleAction } from "../server/user.actions";
import type { RoleEditorOptions } from "../server/user.queries";
import { errorMessage } from "./messages";
import { RoleAssignmentRow, defaultAssignment } from "./role-assignments-field";

export type AssignmentView = {
  id: string;
  role: Role;
  scopeType: ScopeType;
  scopeLabel: string | null;
};

/** AC-5: add or remove assignments one by one; each change is validated and audited server-side. */
export function UserRolesPanel({
  userId,
  assignments,
  options,
}: {
  userId: string;
  assignments: AssignmentView[];
  options: RoleEditorOptions;
}) {
  const t = useTranslations("iam");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const firstRole =
    (["secretary", "sysadmin"] as Role[]).find((r) => options.allowedScopes[r].length > 0) ??
    "secretary";
  const [draft, setDraft] = useState<RoleAssignmentInput>(defaultAssignment(firstRole, options));
  const [pending, setPending] = useState(false);

  async function add() {
    setPending(true);
    try {
      const result = await addRoleAction({ userId, assignment: draft });
      if (result.ok) {
        toast.success(t("actions.roleAdded"));
        router.refresh();
      } else {
        const key =
          result.error.fieldErrors?.roles?.[0] ??
          (result.error.code === "CONFLICT" ? result.error.message : result.error.code);
        toast.error(errorMessage(t, key));
      }
    } finally {
      setPending(false);
    }
  }

  async function remove(assignmentId: string) {
    const result = await removeRoleAction({ userId, assignmentId });
    if (result.ok) {
      toast.success(t("actions.roleRemoved"));
      router.refresh();
    } else {
      toast.error(
        errorMessage(
          t,
          result.error.code === "CONFLICT" ? result.error.message : result.error.code,
        ),
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {assignments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("detail.noRoles")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="rounded-control border-border bg-card flex items-center justify-between gap-3 border px-3 py-2"
            >
              <span>
                <span className="font-semibold">{tRoles(a.role)}</span>
                <span className="text-muted-foreground text-sm">
                  {" "}
                  · {t(`scope.${a.scopeType}`)}
                  {a.scopeLabel ? `: ${a.scopeLabel}` : ""}
                </span>
              </span>
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t("form.remove")}: ${tRoles(a.role)}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                }
                title={t("actions.removeRoleTitle")}
                description={t("actions.removeRoleBody")}
                confirmLabel={t("form.remove")}
                destructive
                onConfirm={() => remove(a.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-card border-border bg-card border p-4">
        <h3 className="mb-3 font-semibold">{t("detail.addRoleTitle")}</h3>
        <RoleAssignmentRow
          idPrefix="add-role"
          value={draft}
          onChange={setDraft}
          options={options}
        />
        <Button type="button" className="mt-3" disabled={pending} onClick={add}>
          {t("form.addRole")}
        </Button>
      </div>
    </div>
  );
}
