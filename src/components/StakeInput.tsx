import { useEffect, useState } from 'react';
import { CircleDollarSign } from 'lucide-react';

export function StakeInput({
  label = 'Stake',
  value,
  onChange,
  min = 10,
  step = 10,
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  const normalized = Number.isFinite(value) ? value : min;
  // Local text lets the user freely clear/retype (e.g. delete "10" to type "85")
  // without the field snapping back to the minimum on every keystroke. The value
  // is only clamped to the minimum when the field loses focus.
  const [text, setText] = useState(String(normalized));
  useEffect(() => {
    setText(String(Number.isFinite(value) ? value : min));
  }, [value, min]);

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-ink/50">{label}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, normalized - step))}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-lg font-black text-citrus transition hover:bg-citrus/10 active:scale-95"
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          -
        </button>
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-citrus/25 bg-citrus/10 px-3 text-citrus shadow-card focus-within:border-citrus">
          <CircleDollarSign size={18} className="shrink-0 fill-citrus/15" />
          <input
            className="min-w-0 flex-1 bg-transparent text-center font-black text-citrus outline-none"
            type="number"
            min={min}
            value={text}
            onChange={(event) => {
              const raw = event.target.value;
              setText(raw);
              const parsed = Number(raw);
              // Push live updates while typing without forcing the minimum yet.
              if (raw !== '' && Number.isFinite(parsed)) onChange(parsed);
            }}
            onBlur={() => {
              const parsed = Number(text);
              const clamped = Number.isFinite(parsed) && parsed >= min ? parsed : min;
              onChange(clamped);
              setText(String(clamped));
            }}
            aria-label={label}
          />
        </label>
        <button
          type="button"
          onClick={() => onChange(normalized + step)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-lg font-black text-citrus transition hover:bg-citrus/10 active:scale-95"
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
