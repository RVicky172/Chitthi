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

export type MarkKind = 'national' | 'festival' | 'own';

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

const f = (m: number, d: number, name: string): DayMark => ({ m, d, name, kind: 'festival' });

/** Festivals that move, per year (gazetted holidays plus the widely celebrated restricted ones). */
const BY_YEAR: Record<number, DayMark[]> = {
  2026: [
    f(1, 14, 'Makar Sankranti'),
    f(1, 14, 'Pongal'),
    f(1, 23, 'Basant Panchami'),
    f(2, 15, 'Maha Shivratri'),
    f(3, 4, 'Holi'),
    f(3, 19, 'Ugadi · Gudi Padwa'),
    f(3, 21, 'Eid-ul-Fitr'),
    f(3, 26, 'Ram Navami'),
    f(3, 31, 'Mahavir Jayanti'),
    f(4, 3, 'Good Friday'),
    f(4, 5, 'Easter'),
    f(4, 14, 'Vaisakhi'),
    f(5, 1, 'Buddha Purnima'),
    f(5, 27, 'Bakrid'),
    f(6, 26, 'Muharram'),
    f(7, 16, 'Rath Yatra'),
    f(8, 26, 'Onam'),
    f(8, 26, 'Milad-un-Nabi'),
    f(8, 28, 'Raksha Bandhan'),
    f(9, 4, 'Janmashtami'),
    f(9, 14, 'Ganesh Chaturthi'),
    f(10, 20, 'Dussehra'),
    f(10, 29, 'Karwa Chauth'),
    f(11, 8, 'Diwali'),
    f(11, 9, 'Govardhan Puja'),
    f(11, 11, 'Bhai Dooj'),
    f(11, 15, 'Chhath Puja'),
    f(11, 24, 'Guru Nanak Jayanti'),
  ],
  2027: [
    f(1, 14, 'Makar Sankranti'),
    f(1, 15, 'Pongal'),
    f(2, 11, 'Basant Panchami'),
    f(3, 6, 'Maha Shivratri'),
    f(3, 10, 'Eid-ul-Fitr'),
    f(3, 23, 'Holi'),
    f(3, 26, 'Good Friday'),
    f(3, 28, 'Easter'),
    f(4, 7, 'Ugadi · Gudi Padwa'),
    f(4, 14, 'Vaisakhi'),
    f(4, 15, 'Ram Navami'),
    f(4, 19, 'Mahavir Jayanti'),
    f(5, 17, 'Bakrid'),
    f(5, 20, 'Buddha Purnima'),
    f(6, 16, 'Muharram'),
    f(7, 5, 'Rath Yatra'),
    f(8, 15, 'Milad-un-Nabi'),
    f(8, 17, 'Raksha Bandhan'),
    f(8, 25, 'Janmashtami'),
    f(9, 4, 'Ganesh Chaturthi'),
    f(9, 12, 'Onam'),
    f(10, 9, 'Dussehra'),
    f(10, 18, 'Karwa Chauth'),
    f(10, 29, 'Diwali'),
    f(10, 30, 'Govardhan Puja'),
    f(10, 31, 'Bhai Dooj'),
    f(11, 4, 'Chhath Puja'),
    f(11, 14, 'Guru Nanak Jayanti'),
  ],
};

/** Years with festival dates built in. */
export const FESTIVAL_YEARS = Object.keys(BY_YEAR).map(Number);
export const hasFestivals = (year: number): boolean => year in BY_YEAR;

export interface OwnDate {
  /** Month 1–12 and day of month; repeats every year. */
  m: number;
  d: number;
  label: string;
}

/** Everything marked on one month: national days and festivals as chosen, then the user's own dates. */
export function marksFor(year: number, month0: number, show: 'off' | 'national' | 'all', own: OwnDate[] = []): Map<number, DayMark[]> {
  const m = month0 + 1,
    out = new Map<number, DayMark[]>();
  const add = (x: DayMark) => {
    const list = out.get(x.d) ?? [];
    if (!list.some((y) => y.name === x.name)) list.push(x);
    out.set(x.d, list);
  };
  if (show !== 'off') {
    for (const x of FIXED) if (x.m === m && (show === 'all' || x.kind === 'national')) add(x);
    if (show === 'all') for (const x of BY_YEAR[year] ?? []) if (x.m === m) add(x);
  }
  for (const o of own) if (o.m === m && o.label.trim()) add({ m: o.m, d: o.d, name: o.label.trim(), kind: 'own' });
  return out;
}
