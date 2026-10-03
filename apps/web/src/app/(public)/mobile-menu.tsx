'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons';

/** Phone-only menu with the secondary links; Escape or a click outside closes it. */
export function MobileMenu() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className="relative lg:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 place-items-center rounded-full"
      >
        <Icon name={open ? 'x' : 'menu'} className="size-7" />
        <span className="sr-only">Menú</span>
      </button>
      <ul
        id={id}
        hidden={!open}
        className="absolute top-12 right-0 w-48 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-200"
      >
        <li>
          <Link
            href="/ingresar"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center rounded-xl px-3 hover:bg-orange-50"
          >
            Ingresar
          </Link>
        </li>
        <li>
          <Link
            href="/privacidad"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center rounded-xl px-3 hover:bg-orange-50"
          >
            Privacidad
          </Link>
        </li>
      </ul>
    </div>
  );
}
