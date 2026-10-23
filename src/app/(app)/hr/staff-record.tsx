import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n/config";
import { formatPlainDate } from "@/lib/i18n/format";
import type { StaffView } from "@/modules/hr";

/** The read-only record; the fields the viewer may not see (AC-9) are simply absent. */
export async function StaffRecord({ staff }: { staff: StaffView }) {
  const [t, locale] = await Promise.all([getTranslations("hr"), getLocale()]);
  const day = (d: string) => formatPlainDate(d, locale as Locale);
  const rows: [string, string | null][] = [
    [t("form.fatherName"), staff.fatherName],
    [t("form.gender"), t(`gender.${staff.gender}`)],
    [t("form.birthDate"), staff.birthDate ? day(staff.birthDate) : null],
    [t("form.nationalId"), staff.nationalId],
    [t("form.phone"), staff.phone],
    [t("form.email"), staff.email],
    [t("form.address"), staff.address],
    [t("form.kind"), t(`kind.${staff.kind}`)],
    [t("form.category"), t(`category.${staff.category}`)],
    [t("form.degree"), staff.degree],
    [t("form.titleField"), staff.title],
    [t("form.department"), staff.departmentName],
    [t("form.primaryEmployer"), staff.primaryEmployer],
    [t("form.retired"), t(staff.retired ? "yes" : "no")],
    [t("form.contractStart"), day(staff.contractStart)],
    [t("form.contractEnd"), staff.contractEnd ? day(staff.contractEnd) : null],
  ];
  return (
    <dl className="mb-8 grid max-w-2xl gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
      {rows
        .filter(([, v]) => v)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-semibold">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}
