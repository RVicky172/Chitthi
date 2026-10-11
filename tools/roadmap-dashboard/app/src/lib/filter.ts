// The roadmap's search and status filter.

export interface Filterable {
  id: string;
  title: string;
  workItem?: string | null;
  status: string;
  note?: string;
  phase?: string;
}

export function matchItem(item: Filterable, { q = '', status = '', phase = '' }: { q?: string; status?: string; phase?: string } = {}): boolean {
  if (status && item.status !== status) return false;
  if (phase && item.phase !== phase) return false;
  const query = q.trim().toLowerCase();
  if (!query) return true;
  return [item.id, item.title, item.workItem, item.note].some((v) => v && String(v).toLowerCase().includes(query));
}
