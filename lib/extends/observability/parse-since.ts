/** Parses CLI/API `since` values like `1h`, `7d`, `30m`, or ISO timestamps. */
export function parseSinceToMs(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const trimmed = value.trim();
  const rel = /^(\d+)(m|h|d)$/i.exec(trimmed);
  if (rel) {
    const amount = Number.parseInt(rel[1]!, 10);
    const unit = rel[2]!.toLowerCase();
    const multipliers: Record<string, number> = {
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return Date.now() - amount * multipliers[unit]!;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
