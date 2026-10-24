"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toaster";
import type { AccountState } from "../domain/account-rules";
import {
  provisionStaffAccountAction,
  provisionStudentAccountAction,
  resendStaffActivationAction,
  resendStudentActivationAction,
} from "../server/account.actions";

const TONE: Record<AccountState, StatusTone> = {
  none: "neutral",
  pending: "warning",
  active: "success",
  disabled: "neutral",
};

type Props = {
  state: AccountState;
  email: string | null;
  /** whether the viewer may create / re-send (the server checks again) */
  canManage: boolean;
} & (
  | { kind: "STUDENT"; studentId: string }
  | { kind: "STAFF"; staffId: string; roles: string[]; defaultRole: string | null }
);

/** AC-9, AC-1, AC-4: the account of a student or staff member and what can be done with it. */
export function AccountPanel(props: Props) {
  const t = useTranslations("iam.accounts");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const [role, setRole] = useState(
    props.kind === "STAFF" ? (props.defaultRole ?? props.roles[0] ?? "") : "",
  );
  const [pending, setPending] = useState(false);

  const fail = (error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  }) => {
    const code = error.fieldErrors ? Object.values(error.fieldErrors)[0]?.[0] : error.message;
    const key = code && t.has(`errors.${code}` as never) ? code : error.code;
    toast.error(
      t.has(`errors.${key}` as never) ? t(`errors.${key}` as never) : t("errors.generic"),
    );
  };

  async function run(
    call: () => Promise<{ ok: true } | { ok: false; error: Parameters<typeof fail>[0] }>,
    done: string,
  ) {
    setPending(true);
    try {
      const result = await call();
      if (result.ok) {
        toast.success(done);
        router.refresh();
      } else fail(result.error);
    } finally {
      setPending(false);
    }
  }

  const create = () =>
    run(
      () =>
        props.kind === "STUDENT"
          ? provisionStudentAccountAction({ studentId: props.studentId })
          : provisionStaffAccountAction({ staffId: props.staffId, role } as never),
      t("created"),
    );
  const resend = () =>
    run(
      () =>
        props.kind === "STUDENT"
          ? resendStudentActivationAction({ studentId: props.studentId })
          : resendStaffActivationAction({ staffId: props.staffId }),
      t("resent"),
    );

  return (
    <section aria-labelledby="account-panel-title" className="mb-8 max-w-2xl">
      <h2 id="account-panel-title" className="mb-3 text-2xl font-semibold">
        {t("title")}
      </h2>
      <p className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone={TONE[props.state]} label={t(`state.${props.state}`)} />
        {props.email && <span>{props.email}</span>}
      </p>
      {props.state === "none" && !props.email && (
        <p className="text-muted-foreground text-sm">{t("errors.noEmail")}</p>
      )}
      {props.canManage && props.state === "none" && props.email && (
        <div className="flex flex-wrap items-end gap-3">
          {props.kind === "STAFF" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-role">{t("role")}</Label>
              <Select id="account-role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">{t("selectRole")}</option>
                {props.roles.map((r) => (
                  <option key={r} value={r}>
                    {tRoles(r as never)}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button
            type="button"
            onClick={create}
            disabled={pending || (props.kind === "STAFF" && !role)}
          >
            {t("create")}
          </Button>
        </div>
      )}
      {props.canManage && props.state === "pending" && (
        <Button type="button" variant="secondary" onClick={resend} disabled={pending}>
          {t("resend")}
        </Button>
      )}
    </section>
  );
}
