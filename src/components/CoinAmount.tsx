const coinFormatter = new Intl.NumberFormat('en-US');

export function CoinAmount({
  amount,
  className = '',
  tone,
}: {
  amount: number;
  className?: string;
  tone?: 'green' | 'gold' | 'red';
}) {
  // Negative amounts read as red across the app unless a tone is forced.
  const effectiveTone = tone ?? (amount < 0 ? 'red' : 'gold');
  const color = effectiveTone === 'red'
    ? 'text-coral'
    : effectiveTone === 'green'
      ? 'text-[#3f9473]'
      : 'text-citrus';
  return (
    <span className={`inline-flex align-middle items-baseline gap-[0.18em] font-bold ${color} ${className}`}>
      <span>{coinFormatter.format(amount)}</span>
      <span>€</span>
    </span>
  );
}
