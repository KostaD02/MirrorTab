export interface PendingParams {
  url: string;
  deadline: number;
}

const PENDING_PAGE = 'src/pending/index.html';

export function buildPendingUrl(targetUrl: string, deadline: number): string {
  const params = new URLSearchParams({
    url: targetUrl,
    deadline: String(deadline),
  });
  return `${chrome.runtime.getURL(PENDING_PAGE)}?${params.toString()}`;
}

export function parsePendingParams(search: string): PendingParams | null {
  const params = new URLSearchParams(search);
  const url = params.get('url');
  const rawDeadline = params.get('deadline');

  if (!url || rawDeadline === null) return null;

  const deadline = Number(rawDeadline);
  if (!Number.isFinite(deadline)) return null;

  return { url, deadline };
}

export function formatCountdown(msRemaining: number): string {
  const seconds = Math.max(0, Math.ceil(msRemaining / 1000));
  return String(seconds);
}
