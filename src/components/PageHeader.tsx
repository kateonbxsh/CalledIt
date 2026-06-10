import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  back?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {back ? (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-white text-ink/70 shadow-soft transition active:scale-95 sm:h-10 sm:w-10"
              aria-label="Go back"
            >
              <ChevronLeft size={21} />
            </button>
          ) : null}
          <h1 className="min-w-0 break-words text-2xl font-black tracking-normal sm:text-3xl">{title}</h1>
        </div>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink/65">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
