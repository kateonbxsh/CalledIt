export function RewardChest({
  open = false,
  className = '',
  tone = 'classic',
}: {
  open?: boolean;
  className?: string;
  tone?: 'classic' | 'plane' | 'mines' | 'guessing' | 'plinko';
}) {
  const shell = {
    classic: 'bg-[radial-gradient(circle_at_45%_20%,#ffe48f,#d49a25_50%,#8a5b32)]',
    plane: 'bg-[radial-gradient(circle_at_45%_20%,#d8f2ff,#3b75af_52%,#244c78)]',
    mines: 'bg-[radial-gradient(circle_at_45%_20%,#ffd9d0,#d95f46_52%,#843529)]',
    guessing: 'bg-[radial-gradient(circle_at_45%_20%,#eadfff,#7b5aa6_52%,#493366)]',
    plinko: 'bg-[radial-gradient(circle_at_45%_20%,#d9f7e9,#2f7d63_52%,#1d5140)]',
  }[tone];
  return (
    <div
      className={`relative grid place-items-center overflow-visible rounded-2xl p-2 shadow-soft ${shell} ${open ? 'animate-chest-open' : ''} ${className}`}
      aria-hidden="true"
    >
      {open ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          <span className="absolute left-[20%] top-[8%] grid h-6 w-6 animate-reward-pop place-items-center rounded-full border-2 border-white bg-citrus text-xs font-black text-white shadow-soft">€</span>
          <span className="absolute right-[17%] top-[18%] grid h-5 w-5 animate-reward-pop place-items-center rounded-full border-2 border-white bg-citrus text-[10px] font-black text-white shadow-soft">€</span>
          <span className="absolute left-[48%] top-[-4%] grid h-5 w-5 animate-reward-pop place-items-center rounded-full border-2 border-white bg-citrus text-[10px] font-black text-white shadow-soft">€</span>
        </div>
      ) : null}
      <img
        src="./chest-locked-game-icons.svg"
        alt=""
        className="relative z-10 h-[88%] w-[88%] object-contain drop-shadow-[0_8px_12px_rgba(18,20,23,0.24)]"
      />
    </div>
  );
}
