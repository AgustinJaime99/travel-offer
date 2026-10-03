import type { ReactNode } from 'react';

export type BadgeTone = 'green' | 'amber' | 'blue' | 'slate' | 'red';

const tones: Record<BadgeTone, { badge: string; dot: string }> = {
  green: { badge: 'bg-green-50 text-green-800 ring-green-600/20', dot: 'bg-green-600' },
  amber: { badge: 'bg-amber-50 text-amber-900 ring-amber-600/25', dot: 'bg-amber-500' },
  blue: { badge: 'bg-sky-50 text-sky-900 ring-sky-600/20', dot: 'bg-sky-600' },
  red: { badge: 'bg-red-50 text-red-800 ring-red-600/20', dot: 'bg-red-600' },
  slate: { badge: 'bg-slate-100 text-slate-700 ring-slate-500/20', dot: 'bg-slate-400' },
};

/**
 * Status pill: the text carries the meaning, the color only reinforces it. The dot has no text, so
 * the element's text (and accessible name) is exactly the label.
 */
export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const { badge, dot } = tones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${badge}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

export const activeTone = (active: boolean): BadgeTone => (active ? 'green' : 'slate');

export const proposalTone = {
  DRAFT: 'slate',
  PUBLISHED: 'green',
  ARCHIVED: 'amber',
} as const satisfies Record<string, BadgeTone>;

export const requestTone = {
  PENDING: 'amber',
  REVIEWING: 'blue',
  RESOLVED: 'green',
  DISMISSED: 'slate',
} as const satisfies Record<string, BadgeTone>;
