import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { TimetableGrid, roomEntries } from "@/modules/cal";

export default async function RoomTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const user = await requireUser("/cal/timetable/room");
  if (!(await can(user, "cal.timetable.read"))) return <ForbiddenView />;
  const [t, params] = await Promise.all([getTranslations("cal.timetable"), searchParams]);
  const room = params.room?.trim() ?? "";
  const entries = room ? await roomEntries(room) : [];
  return (
    <>
      <PageHeader
        title={t("roomView")}
        breadcrumbs={[{ label: t("title"), href: "/cal/timetable" }, { label: t("roomView") }]}
      />
      <form method="get" className="mb-6 flex items-end gap-3 print:hidden">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="room">{t("form.room")}</Label>
          <Input id="room" name="room" defaultValue={room} />
        </div>
        <Button type="submit" variant="secondary">
          {t("show")}
        </Button>
      </form>
      {room ? (
        <TimetableGrid entries={entries} showGroup />
      ) : (
        <p className="text-muted-foreground text-sm">{t("chooseRoom")}</p>
      )}
    </>
  );
}
