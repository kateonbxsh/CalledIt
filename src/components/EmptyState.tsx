import { SearchX } from 'lucide-react';

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-md border border-dashed border-line bg-white p-8 text-center">
      <div>
        <SearchX className="mx-auto mb-3 text-ink/45" size={36} />
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 max-w-md text-sm text-ink/60">{body}</p>
      </div>
    </div>
  );
}
