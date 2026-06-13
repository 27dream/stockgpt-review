'use client';

export interface HistoryItem {
  id: string;
  mode: 'review' | 'morning' | 'stock';
  title: string;
  date: string;
  ts: number;
  content: string;
}

const KEY = 'stockgpt-history';
const MAX = 10;

export function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(item: Omit<HistoryItem, 'id' | 'ts' | 'date'>): HistoryItem {
  const now = new Date();
  const full: HistoryItem = {
    ...item,
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: now.getTime(),
    date: now.toLocaleString('zh-CN', { hour12: false }),
  };
  const list = [full, ...loadHistory()].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  return full;
}

export function removeHistory(id: string): HistoryItem[] {
  const list = loadHistory().filter((x) => x.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  return list;
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
