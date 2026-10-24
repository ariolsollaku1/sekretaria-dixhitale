import {
  Briefcase,
  CalendarClock,
  Mail,
  MapPin,
  Phone,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { RecordHero } from "@/components/record/record-hero";
import type { Breadcrumb } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Locale } from "@/lib/i18n/config";
import { formatNumber, formatPlainDate } from "@/lib/i18n/format";
import { contractProgress, type StaffView } from "@/modules/hr";

/**
 * The record page: hero, then personal / employment cards and a side column (contract, contact,
 * `aside`). The fields the viewer may not see (AC-9) are simply absent.
 */
export async function StaffRecord({
  staff,
  breadcrumbs,
  actions,
  aside,
  children,
}: {
  staff: StaffView;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const [t, locale] = await Promise.all([getTranslations("hr"), getLocale()]);
  const l = locale as Locale;
  const day = (d: string) => formatPlainDate(d, l);
  const name = `${staff.firstName} ${staff.lastName}`;

  const { percent: progress, daysLeft } = contractProgress(staff.contractStart, staff.contractEnd);

  const contact: { label: string; value: string | null; icon: LucideIcon }[] = [
    { label: t("form.email"), value: staff.email, icon: Mail },
    { label: t("form.phone"), value: staff.phone, icon: Phone },
    { label: t("form.address"), value: staff.address, icon: MapPin },
  ];

  return (
    <>
      <RecordHero
        name={name}
        subtitle={
          [staff.title, staff.departmentName].filter(Boolean).join(" · ") || t(`kind.${staff.kind}`)
        }
        breadcrumbs={breadcrumbs}
        actions={actions}
        badges={
          <>
            <StatusBadge
              tone={staff.active ? "success" : "neutral"}
              label={t(staff.active ? "status.active" : "status.inactive")}
            />
            <StatusBadge tone="info" label={t(`kind.${staff.kind}`)} />
            <StatusBadge
              tone={staff.category === "VOLUNTEER" ? "warning" : "neutral"}
              label={t(`category.${staff.category}`).split(" (")[0]!}
            />
            {staff.retired && <StatusBadge tone="neutral" label={t("form.retired")} />}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="staff-person">
            <CardTitle id="staff-person" icon={UserRound}>
              {t("form.person")}
            </CardTitle>
            <InfoList
              items={[
                { label: t("form.fatherName"), value: staff.fatherName },
                { label: t("form.gender"), value: t(`gender.${staff.gender}`) },
                {
                  label: t("form.birthDate"),
                  value: staff.birthDate ? day(staff.birthDate) : null,
                },
                {
                  label: t("form.nationalId"),
                  value: staff.nationalId && (
                    <span className="font-tabular">{staff.nationalId}</span>
                  ),
                },
              ]}
            />
          </Card>

          <Card aria-labelledby="staff-employment">
            <CardTitle id="staff-employment" icon={Briefcase}>
              {t("form.employment")}
            </CardTitle>
            <InfoList
              items={[
                { label: t("form.kind"), value: t(`kind.${staff.kind}`) },
                { label: t("form.category"), value: t(`category.${staff.category}`) },
                { label: t("form.degree"), value: staff.degree },
                { label: t("form.titleField"), value: staff.title },
                { label: t("form.department"), value: staff.departmentName },
                { label: t("form.primaryEmployer"), value: staff.primaryEmployer },
                { label: t("form.retired"), value: t(staff.retired ? "yes" : "no") },
              ]}
            />
          </Card>
          {children}
        </div>

        <div className="flex flex-col gap-6">
          <Card aria-labelledby="staff-contract">
            <CardTitle id="staff-contract" icon={CalendarClock}>
              {t("profile.contract")}
            </CardTitle>
            {daysLeft === null ? (
              <p className="mb-4 font-semibold">{t("profile.openEnded")}</p>
            ) : (
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <p className="font-tabular text-3xl font-semibold">
                  {formatNumber(Math.max(daysLeft, 0), l)}
                </p>
                <p className="text-muted-foreground text-right text-sm">
                  {daysLeft < 0 ? t("profile.ended") : t("profile.daysLeft")}
                </p>
              </div>
            )}
            {progress !== null && (
              <div
                role="progressbar"
                aria-label={t("profile.contract")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
                className="bg-muted mb-4 h-2 rounded-full"
              >
                <div
                  className="bg-brand-gradient h-2 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            <InfoList
              className="sm:grid-cols-1 lg:grid-cols-2"
              items={[
                { label: t("form.contractStart"), value: day(staff.contractStart) },
                {
                  label: t("form.contractEnd"),
                  value: staff.contractEnd && day(staff.contractEnd),
                },
              ]}
            />
          </Card>

          <Card aria-labelledby="staff-contact">
            <CardTitle id="staff-contact" icon={Mail}>
              {t("profile.contact")}
            </CardTitle>
            <InfoList className="sm:grid-cols-1" items={contact} />
            {contact.every((c) => !c.value) && (
              <p className="text-muted-foreground text-sm">{t("profile.noContact")}</p>
            )}
          </Card>
          {aside}
        </div>
      </div>
    </>
  );
}
