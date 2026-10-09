// The roadmap's search and status filter.

export interface Filterable {
  id: string;
  title: string;
  workItem?: string | null;
  status: string;
  note?: string;
}

export function matchItem(item: Filterable, { q = '', status = '' }: { q?: string; status?: string } = {}): boolean {
  if (status && item.status !== status) return false;
  const query = q.trim().toLowerCase();
  if (!query) return true;
  return [item.id, item.title, item.workItem, item.note].some((v) => v && String(v).toLowerCase().includes(query));
}
