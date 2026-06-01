/** Locale-aware relative time (e.g. "52 minutes ago" / "52 分钟前"). */
export function formatRelativeTime(iso: string, locale: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;

  const diffSec = Math.round((parsed - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const absSec = Math.abs(diffSec);
  if (absSec < 60) return rtf.format(diffSec, 'second');

  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');

  const diffHour = Math.round(diffSec / 3600);
  if (Math.abs(diffHour) < 48) return rtf.format(diffHour, 'hour');

  const diffDay = Math.round(diffSec / 86400);
  return rtf.format(diffDay, 'day');
}
