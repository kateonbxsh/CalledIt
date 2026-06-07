import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Avatar } from './Avatar';
import { findUsersByUsernamePrefix } from '../services/userService';
import type { UserProfile } from '../types';

export function UsernamePicker({
  value,
  onChange,
  exclude = [],
  placeholder = 'Search usernames',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  exclude?: string[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const normalizedValue = useMemo(() => value.map((item) => item.toLowerCase()), [value]);
  const excluded = useMemo(() => new Set(exclude.map((item) => item.toLowerCase())), [exclude]);

  useEffect(() => {
    let cancelled = false;
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      findUsersByUsernamePrefix(normalized)
        .then((users) => {
          if (cancelled) return;
          setResults(
            users.filter(
              (user) => !normalizedValue.includes(user.username) && !excluded.has(user.username),
            ),
          );
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [excluded, normalizedValue, query]);

  function add(username: string) {
    const normalized = username.trim().toLowerCase();
    if (!normalized || normalizedValue.includes(normalized) || excluded.has(normalized)) return;
    onChange([...normalizedValue, normalized]);
    setQuery('');
    setResults([]);
  }

  function remove(username: string) {
    onChange(normalizedValue.filter((item) => item !== username));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 rounded-md border border-line bg-field p-2">
        {normalizedValue.map((username) => (
          <span key={username} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-bold text-ink/70">
            @{username}
            <button type="button" onClick={() => remove(username)} className="text-ink/35 hover:text-coral" title={`Remove ${username}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (results[0]) add(results[0].username);
            }
          }}
          placeholder={normalizedValue.length ? 'Add another' : placeholder}
        />
      </div>
      {results.length > 0 ? (
        <div className="mt-1 overflow-hidden rounded-md border border-line bg-white shadow-soft">
          {results.map((user) => (
            <button
              key={user.uid}
              type="button"
              onClick={() => add(user.username)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-field"
            >
              <Avatar name={user.displayName || user.username} src={user.photoURL} />
              <span className="min-w-0">
                <span className="block truncate font-bold">{user.displayName || user.username}</span>
                <span className="block truncate text-xs text-ink/45">@{user.username}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
