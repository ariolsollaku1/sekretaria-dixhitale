"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { createCampaignAction } from "../server/qa.actions";
import { useExplain } from "./explain";

/** AC-1: a draft campaign for an academic year, optionally with the questions of an earlier one. */
export function CampaignForm({
  years,
  campaigns,
  defaultYearId,
}: {
  years: { id: string; label: string }[];
  campaigns: { id: string; label: string }[];
  defaultYearId: string;
}) {
  const t = useTranslations("qa");
  const router = useRouter();
  const explain = useExplain();
  const [yearId, setYearId] = useState(defaultYearId);
  const [name, setName] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="rounded-card border-border bg-muted/40 flex flex-wrap items-end gap-3 border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const r = await createCampaignAction({
            academicYearId: yearId,
            name,
            copyFromId: copyFromId || null,
          });
          if (r.ok) {
            toast.success(t("created"));
            router.push(`/qa/campaigns/${r.data.campaignId}`);
          } else setError(explain(r));
        } finally {
          setPending(false);
        }
      }}
    >
      <h2 className="w-full text-lg font-semibold">{t("campaign.new")}</h2>
      <div className="flex min-w-40 flex-col gap-1">
        <Label htmlFor="cmp-year" className="text-[12px]">
          {t("campaign.year")}
        </Label>
        <Select id="cmp-year" value={yearId} onChange={(e) => setYearId(e.target.value)}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex min-w-60 flex-1 flex-col gap-1">
        <Label htmlFor="cmp-name" className="text-[12px]">
          {t("campaign.name")}
        </Label>
        <Input
          id="cmp-name"
          value={name}
          maxLength={120}
          required
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex min-w-60 flex-col gap-1">
        <Label htmlFor="cmp-copy" className="text-[12px]">
          {t("campaign.copyFrom")}
        </Label>
        <Select id="cmp-copy" value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}>
          <option value="">{t("campaign.noCopy")}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending || name.trim() === ""}>
        {t("campaign.create")}
      </Button>
      {error && (
        <p role="alert" className="text-danger w-full text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
