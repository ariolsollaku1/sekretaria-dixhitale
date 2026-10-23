import { registerYearChecklistItem } from "@/modules/org";

// AC-14: the "start a new year" checklist gets a calendar step.
registerYearChecklistItem({
  id: "cal.calendar",
  labelKey: "cal.rollover.label",
  descriptionKey: "cal.rollover.description",
  href: "/calendar/copy",
  permission: "cal.event.write",
  order: 30,
});
