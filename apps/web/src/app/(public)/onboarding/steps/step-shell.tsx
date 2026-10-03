'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { Icon, type IconName } from '../../icons';

export interface StepProgress {
  /** 1-based; `total + 1` once every step is complete. */
  current: number;
  total: number;
  /** Short names shown in the stepper; without them only the screen-reader text remains. */
  labels?: readonly string[];
}

/** Mobile-first step frame. Focus moves to the title on every step for screen-reader users. */
export function StepShell({
  title,
  icon,
  progress,
  onBack,
  children,
}: {
  title: string;
  icon?: IconName | undefined;
  progress?: StepProgress | undefined;
  onBack?: (() => void) | undefined;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      {progress ? <Progress {...progress} /> : null}
      <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-4">
        {icon ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-600 lg:size-14 lg:rounded-2xl">
            <Icon name={icon} className="size-6 lg:size-7" />
          </span>
        ) : null}
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-[1.625rem] leading-tight font-extrabold tracking-tight text-slate-900 outline-none lg:text-[2.5rem]"
        >
          {title}
        </h1>
      </div>
      {children}
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center self-start text-sm text-slate-700 underline hover:text-orange-700"
        >
          ← Atrás
        </button>
      ) : null}
    </section>
  );
}

function Progress({ current, total, labels }: StepProgress) {
  const complete = current > total;
  return (
    <>
      <p className="sr-only">{complete ? 'Registro completo' : `Paso ${current} de ${total}`}</p>
      {labels ? (
        // The text above is the accessible version; the stepper is a visual duplicate.
        <ol aria-hidden="true" className="flex">
          {labels.map((label, index) => {
            const position = index + 1;
            const done = position < current;
            const active = position === current;
            return (
              <li
                key={label}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1.5 ${
                  index === 0
                    ? ''
                    : `before:absolute before:top-3.5 before:right-[calc(50%+1.125rem)] before:h-0.5 before:w-[calc(100%-2.25rem)] before:rounded-full ${
                        done || active ? 'before:bg-orange-500' : 'before:bg-slate-200'
                      }`
                }`}
              >
                <span
                  className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${
                    done || active
                      ? 'bg-orange-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-500'
                  } ${active ? 'ring-4 ring-orange-100' : ''}`}
                >
                  {done ? <Icon name="check" className="size-4" /> : position}
                </span>
                <span
                  className={`public-stepper-label text-[0.625rem] tracking-tight whitespace-nowrap min-[400px]:text-[0.6875rem] sm:text-xs sm:tracking-normal ${
                    active ? 'font-semibold text-slate-900' : 'text-slate-500'
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </>
  );
}

// 19px bold is "large text" for WCAG, so white on orange-600 (3.6:1) meets AA.
export const primaryButton =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-[1.1875rem] lg:py-3.5 font-bold text-white shadow-md shadow-orange-600/25 hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60';
