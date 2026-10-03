/** Line icons of the public area (24×24, stroke). Always decorative: the text beside them carries the meaning. */
const paths = {
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  bed: (
    <>
      <path d="M3 18V6M3 14h18v4M21 14v-1a3 3 0 0 0-3-3h-8v4" />
      <circle cx="6.5" cy="10.5" r="1.8" />
    </>
  ),
  bus: (
    <>
      <rect x="4" y="3" width="16" height="15" rx="3" />
      <path d="M4 11h16M8 18v2.5M16 18v2.5M7.5 14.5h.01M16.5 14.5h.01" />
    </>
  ),
  mountain: <path d="m3 20 6-10 4 6 2-3 6 7H3z" />,
  shield: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3z" />,
  star: <path d="m12 3 2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8L12 3z" />,
  utensils: <path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 21V3c-2 1-3 3-3 6v4h3" />,
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 13l2 2 4-4" />
    </>
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.2" />
    </>
  ),
  luggage: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M9 7V4h6v3M9 11v5M15 11v5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 7.4 5.3a2 2 0 0 0 2.2 0L20.5 7" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21.5s7-6.1 7-11.5a7 7 0 0 0-14 0c0 5.4 7 11.5 7 11.5z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  refresh: (
    <path d="M20 12a8 8 0 0 1-14 5.3L4 15.5M4 12a8 8 0 0 1 14-5.3l2 1.8M20 4v4.5h-4.5M4 20v-4.5h4.5" />
  ),
  school: <path d="M3 21h18M5 21V9.5L12 5l7 4.5V21M9.5 21v-5h5v5M12 5V2.5h3" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
