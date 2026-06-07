import { SearchX } from 'lucide-react';

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center">
      <div>
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-field">
          <SearchX className="text-ink/35" size={28} />
        </div>
        <h2 className="font-black text-ink/70">{title}</h2>
        <p className="mt-1.5 max-w-sm text-sm text-ink/45">{body}</p>
      </div>
    </div>
  );
}
