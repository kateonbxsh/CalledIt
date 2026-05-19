import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-normal sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink/65">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
