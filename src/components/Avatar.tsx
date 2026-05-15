import { initials } from '../utils/format';

export function Avatar({
  name,
  src,
  size = 'md',
}: {
  name: string;
  src?: string;
  size?: 'md' | 'lg';
}) {
  const classes = size === 'lg' ? 'h-20 w-20 text-xl' : 'h-10 w-10 text-sm';

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${classes} rounded-md object-cover`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className={`${classes} grid place-items-center rounded-md bg-mint font-bold text-white`}>
      {initials(name)}
    </div>
  );
}
