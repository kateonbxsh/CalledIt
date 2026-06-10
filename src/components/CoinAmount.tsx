import { CircleDollarSign } from 'lucide-react';

export function CoinAmount({
  amount,
  className = '',
}: {
  amount: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex align-middle items-center gap-1 font-bold text-citrus ${className}`}>
      <CircleDollarSign size={16} className="shrink-0 fill-citrus/15" />
      {amount}
    </span>
  );
}
