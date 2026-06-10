import { initials } from '../utils/format';

export function Avatar({
  name,
  src,
  size = 'md',
  round = false,
}: {
  name: string;
  src?: string;
  size?: 'md' | 'lg';
  round?: boolean;
}) {
  const dim = size === 'lg' ? 'h-20 w-20 text-xl' : 'h-10 w-10 text-sm';
  const shape = round ? 'rounded-full' : 'rounded-xl';

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${dim} ${shape} object-cover shrink-0`}
        style={{ imageRendering: 'crisp-edges', WebkitFontSmoothing: 'antialiased' } as React.CSSProperties}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className={`${dim} ${shape} grid place-items-center bg-gradient-to-br from-mint to-mint/70 font-bold text-white`}>
      {initials(name)}
    </div>
  );
}
