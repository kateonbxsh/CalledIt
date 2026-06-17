import { CircleDollarSign } from 'lucide-react';

const coinFormatter = new Intl.NumberFormat('en-US');

export function CoinAmount({
  amount,
  className = '',
  tone,
}: {
  amount: number;
  className?: string;
  tone?: 'gold' | 'red';
}) {
  // Negative amounts read as red across the app unless a tone is forced.
  const effectiveTone = tone ?? (amount < 0 ? 'red' : 'gold');
  const color = effectiveTone === 'red' ? 'text-coral' : 'text-citrus';
  const fill = effectiveTone === 'red' ? 'fill-coral/15' : 'fill-citrus/15';
  return (
    <span className={`inline-flex align-middle items-center gap-1 font-bold ${color} ${className}`}>
      <CircleDollarSign size={16} className={`shrink-0 ${fill}`} />
      {coinFormatter.format(amount)}
    </span>
  );
}
