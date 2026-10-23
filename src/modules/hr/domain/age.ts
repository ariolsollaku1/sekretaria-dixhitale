// Pure age calculation (HR-05 AC-4). Days are `YYYY-MM-DD` strings.
/** Whole years between a birth day and `today`. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** The birth day range that gives an age in [from, to] on `today` (inclusive), for database filters. */
export function birthRangeForAges(
  from: number | null,
  to: number | null,
  today: string,
): { gte?: string; lte?: string } {
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const shift = (years: number, extra: number) => {
    const d = new Date(Date.UTC(ty - years, tm - 1, td + extra));
    return d.toISOString().slice(0, 10);
  };
  const range: { gte?: string; lte?: string } = {};
  // age >= from  <=>  born on or before today - from years
  if (from !== null) range.lte = shift(from, 0);
  // age <= to    <=>  born after today - (to + 1) years
  if (to !== null) range.gte = shift(to + 1, 1);
  return range;
}
