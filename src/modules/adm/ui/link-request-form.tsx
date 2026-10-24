"use client";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestLinkAction } from "../server/application.actions";

/** AC-10: ask for a new private link with reference + e-mail; the answer never says if they matched. */
export function LinkRequestForm() {
  const t = useTranslations("adm.link");
  const uid = useId();
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "sent" | "limited" | "invalid">("idle");

  if (state === "sent")
    return (
      <p role="status" className="rounded-card border-success/40 bg-success-bg border p-4 text-sm">
        {t("sent")}
      </p>
    );
  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("pending");
        const r = await requestLinkAction({ reference, email });
        setState(r.ok ? "sent" : r.code === "RATE_LIMITED" ? "limited" : "invalid");
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-ref`}>{t("reference")}</Label>
        <Input
          id={`${uid}-ref`}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-email`}>{t("email")}</Label>
        <Input
          id={`${uid}-email`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {state === "limited" && (
        <p role="alert" className="text-danger text-sm">
          {t("rateLimited")}
        </p>
      )}
      {state === "invalid" && (
        <p role="alert" className="text-danger text-sm">
          {t("invalid")}
        </p>
      )}
      <Button type="submit" disabled={state === "pending"} className="self-start">
        {t("submit")}
      </Button>
    </form>
  );
}
