/*
 * Days marked on calendar pages: national days, festivals, and the user's own dates.
 *
 * Festival dates follow the Indian lunar calendar, so they change every year. They are taken from the Government of
 * India's official lists (Department of Personnel & Training, holidays for Central Government offices in Delhi):
 *   2026: O.M. F.No.12/2/2023-JCA dated 03.07.2025 (Annexures I and II)
 *   2027: O.M. F.No.12/2/2023-JCA dated 16.07.2026 (Annexures I and II)
 * Islamic festivals depend on the moon sighting and can move by a day; states may observe some festivals on other
 * days. For any other year only the fixed-date days are marked; add a year here from the next DoPT list.
 */

/** A national day, a festival or one of the user's own dates. */
export type MarkKind = 'national' | 'festival' | 'own';

/** A day marked on a calendar page. */
export interface DayMark {
  /** Month 1–12 and day of month. */
  m: number;
  d: number;
  name: string;
  kind: MarkKind;
}

/** Same date every year. */
const FIXED: DayMark[] = [
  { m: 1, d: 26, name: 'Republic Day', kind: 'national' },
  { m: 8, d: 15, name: 'Independence Day', kind: 'national' },
  { m: 10, d: 2, name: 'Gandhi Jayanti', kind: 'national' },
  { m: 1, d: 13, name: 'Lohri', kind: 'festival' },
  { m: 12, d: 25, name: 'Christmas', kind: 'festival' },
];

/**
 * A festival on a date.
 * @param month month 1–12
 * @param day day of month
 * @param name the festival
 * @returns its mark
 */
const festival = (month: number, day: number, name: string): DayMark => ({ m: month, d: day, name, kind: 'festival' });

/** Festivals that move, per year (gazetted holidays plus the widely celebrated restricted ones). */
const BY_YEAR: Record<number, DayMark[]> = {
  2026: [
    festival(1, 14, 'Makar Sankranti'),
    festival(1, 14, 'Pongal'),
    festival(1, 23, 'Basant Panchami'),
    festival(2, 15, 'Maha Shivratri'),
    festival(3, 4, 'Holi'),
    festival(3, 19, 'Ugadi · Gudi Padwa'),
    festival(3, 21, 'Eid-ul-Fitr'),
    festival(3, 26, 'Ram Navami'),
    festival(3, 31, 'Mahavir Jayanti'),
    festival(4, 3, 'Good Friday'),
    festival(4, 5, 'Easter'),
    festival(4, 14, 'Vaisakhi'),
    festival(5, 1, 'Buddha Purnima'),
    festival(5, 27, 'Bakrid'),
    festival(6, 26, 'Muharram'),
    festival(7, 16, 'Rath Yatra'),
    festival(8, 26, 'Onam'),
    festival(8, 26, 'Milad-un-Nabi'),
    festival(8, 28, 'Raksha Bandhan'),
    festival(9, 4, 'Janmashtami'),
    festival(9, 14, 'Ganesh Chaturthi'),
    festival(10, 20, 'Dussehra'),
    festival(10, 29, 'Karwa Chauth'),
    festival(11, 8, 'Diwali'),
    festival(11, 9, 'Govardhan Puja'),
    festival(11, 11, 'Bhai Dooj'),
    festival(11, 15, 'Chhath Puja'),
    festival(11, 24, 'Guru Nanak Jayanti'),
  ],
  2027: [
    festival(1, 14, 'Makar Sankranti'),
    festival(1, 15, 'Pongal'),
    festival(2, 11, 'Basant Panchami'),
    festival(3, 6, 'Maha Shivratri'),
    festival(3, 10, 'Eid-ul-Fitr'),
    festival(3, 23, 'Holi'),
    festival(3, 26, 'Good Friday'),
    festival(3, 28, 'Easter'),
    festival(4, 7, 'Ugadi · Gudi Padwa'),
    festival(4, 14, 'Vaisakhi'),
    festival(4, 15, 'Ram Navami'),
    festival(4, 19, 'Mahavir Jayanti'),
    festival(5, 17, 'Bakrid'),
    festival(5, 20, 'Buddha Purnima'),
    festival(6, 16, 'Muharram'),
    festival(7, 5, 'Rath Yatra'),
    festival(8, 15, 'Milad-un-Nabi'),
    festival(8, 17, 'Raksha Bandhan'),
    festival(8, 25, 'Janmashtami'),
    festival(9, 4, 'Ganesh Chaturthi'),
    festival(9, 12, 'Onam'),
    festival(10, 9, 'Dussehra'),
    festival(10, 18, 'Karwa Chauth'),
    festival(10, 29, 'Diwali'),
    festival(10, 30, 'Govardhan Puja'),
    festival(10, 31, 'Bhai Dooj'),
    festival(11, 4, 'Chhath Puja'),
    festival(11, 14, 'Guru Nanak Jayanti'),
  ],
};

/** Years with festival dates built in. */
export const FESTIVAL_YEARS = Object.keys(BY_YEAR).map(Number);
/**
 * Whether a year's moving festivals are built in.
 * @param year the year
 * @returns true when its festivals can be marked
 */
export const hasFestivals = (year: number): boolean => year in BY_YEAR;

/** A date of the user's own (a birthday, an anniversary). */
export interface OwnDate {
  /** Month 1–12 and day of month; repeats every year. */
  m: number;
  d: number;
  label: string;
}

/** Which public days a calendar marks. */
export type MarkShow = 'off' | 'national' | 'all';

/**
 * The national days and festivals a calendar shows in a month.
 * @param year the year
 * @param month month 1–12
 * @param show which of them to mark
 * @returns the fixed days, then that year's moving festivals
 */
function publicMarks(year: number, month: number, show: MarkShow): DayMark[] {
  if (show === 'off') return [];
  const fixed = FIXED.filter((mark) => mark.m === month && (show === 'all' || mark.kind === 'national'));
  const moving = show === 'all' ? (BY_YEAR[year] ?? []).filter((mark) => mark.m === month) : [];
  return [...fixed, ...moving];
}

/**
 * Everything marked on one month: national days and festivals as chosen, then the user's own dates. A day lists each
 * name once.
 * @param year the year
 * @param month0 the month, 0–11
 * @param show which public days to mark
 * @param own the user's own dates (they repeat every year; blank labels are skipped)
 * @returns the marks by day of month
 */
export function marksFor(year: number, month0: number, show: MarkShow, own: OwnDate[] = []): Map<number, DayMark[]> {
  const month = month0 + 1;
  const marksByDay = new Map<number, DayMark[]>();
  const ownMarks = own
    .filter((date) => date.m === month && date.label.trim())
    .map((date): DayMark => ({ m: date.m, d: date.d, name: date.label.trim(), kind: 'own' }));
  for (const mark of [...publicMarks(year, month, show), ...ownMarks]) {
    const list = marksByDay.get(mark.d) ?? [];
    if (!list.some((listed) => listed.name === mark.name)) list.push(mark);
    marksByDay.set(mark.d, list);
  }
  return marksByDay;
}
