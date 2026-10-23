"use client";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ROLES, type Role, type ScopeType } from "@/lib/authz/roles";
import type { RoleAssignmentInput } from "../domain/schemas";
import type { RoleEditorOptions } from "../server/user.queries";

export type RoleEditorProps = { options: RoleEditorOptions };

/** The first scope the role can use now; roles with none available cannot be picked. */
function defaultAssignment(role: Role, options: RoleEditorOptions): RoleAssignmentInput {
  const scopeType = options.allowedScopes[role][0] ?? "INSTITUTION";
  return { role, scopeType, scopeId: options.scopeChoices[scopeType]?.[0]?.id ?? null };
}

function idScope(type: ScopeType) {
  return type === "FACULTY" || type === "DEPARTMENT" || type === "PROGRAM";
}

/** One role + scope (+ target) row; used alone on the detail page and repeated in the create form. */
export function RoleAssignmentRow({
  value,
  onChange,
  options,
  idPrefix,
  invalid,
}: {
  value: RoleAssignmentInput;
  onChange: (next: RoleAssignmentInput) => void;
  options: RoleEditorOptions;
  idPrefix: string;
  invalid?: boolean;
}) {
  const t = useTranslations("iam");
  const tRoles = useTranslations("roles");
  const scopes = options.allowedScopes[value.role];
  const choices = options.scopeChoices[value.scopeType] ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-role`}>{t("form.role")}</Label>
        <Select
          id={`${idPrefix}-role`}
          value={value.role}
          aria-invalid={invalid}
          onChange={(e) => onChange(defaultAssignment(e.target.value as Role, options))}
        >
          {ROLES.filter((r) => options.allowedScopes[r].length > 0).map((r) => (
            <option key={r} value={r}>
              {tRoles(r)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-scope`}>{t("form.scope")}</Label>
        <Select
          id={`${idPrefix}-scope`}
          value={value.scopeType}
          onChange={(e) => {
            const scopeType = e.target.value as ScopeType;
            onChange({
              ...value,
              scopeType,
              scopeId: idScope(scopeType)
                ? (options.scopeChoices[scopeType]?.[0]?.id ?? null)
                : null,
            });
          }}
        >
          {scopes.map((s) => (
            <option key={s} value={s}>
              {t(`scope.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      {idScope(value.scopeType) && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-target`}>{t("form.scopeTarget")}</Label>
          <Select
            id={`${idPrefix}-target`}
            value={value.scopeId ?? ""}
            onChange={(e) => onChange({ ...value, scopeId: e.target.value })}
          >
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

/** AC-2/5: list of role rows with add/remove. */
export function RoleAssignmentsField({
  value,
  onChange,
  options,
  error,
}: RoleEditorProps & {
  value: RoleAssignmentInput[];
  onChange: (next: RoleAssignmentInput[]) => void;
  error?: string;
}) {
  const t = useTranslations("iam");
  const firstRole = ROLES.find((r) => options.allowedScopes[r].length > 0) ?? "secretary";
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">{t("form.roles")}</legend>
      {value.map((assignment, i) => (
        <div key={i} className="rounded-control border-border bg-card border p-3">
          <RoleAssignmentRow
            idPrefix={`role-${i}`}
            options={options}
            value={assignment}
            invalid={!!error}
            onChange={(next) => onChange(value.map((v, j) => (j === i ? next : v)))}
          />
          {value.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              className="mt-2"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden /> {t("form.remove")}
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-danger text-[13px] font-semibold">
          {error}
        </p>
      )}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, defaultAssignment(firstRole, options)])}
        >
          <Plus aria-hidden /> {t("form.addRole")}
        </Button>
      </div>
    </fieldset>
  );
}

export { defaultAssignment };
