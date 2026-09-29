export default function MetricCell({
  value,
  tone = 'muted',
}: {
  value: number;
  tone?: 'muted' | 'success' | 'warning' | 'brand' | 'strong';
}) {
  const cls =
    tone === 'success'
      ? 'text-success-600'
      : tone === 'warning'
        ? 'text-warning-600'
        : tone === 'brand'
          ? 'text-brand-700'
          : tone === 'strong'
            ? 'text-[var(--foreground)]'
            : 'text-[var(--muted)]';
  return (
    <span className={`font-mono text-sm font-semibold tabular-nums ${cls}`}>{value}</span>
  );
}