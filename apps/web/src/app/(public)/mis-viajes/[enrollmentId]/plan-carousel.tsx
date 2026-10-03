'use client';

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../icons';

export interface PlanSlide {
  key: string;
  label: string;
  node: ReactNode;
}

/** Scroll position that centers a slide (slides are positioned relative to the track). */
const centeredLeft = (container: HTMLElement, element: HTMLElement) =>
  Math.max(element.offsetLeft - (container.clientWidth - element.offsetWidth) / 2, 0);

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Swipeable pricing cards (native scroll-snap, no library). On phones each card takes most of the
 * width and the next one peeks in; the card in view is sharp, the other dimmed. When every card fits
 * (desktop) the controls hide themselves. Keyboard: arrows on the carousel; screen readers get
 * "Opción 1 de 2: …" per slide.
 */
export function PlanCarousel({
  slides,
  label,
  initial = 0,
  focusIndex,
}: {
  slides: PlanSlide[];
  label: string;
  initial?: number;
  /** Brings this slide into view when it changes (e.g. the option the user just chose). */
  focusIndex?: number;
}) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(initial);
  const activeRef = useRef(initial);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const [scrollable, setScrollable] = useState(false);

  // Start on the recommended card without animating. Widths settle after the first frame and
  // once web fonts load, so it is re-applied then, unless the user has already moved it.
  const touched = useRef(false);
  const placeInitial = useRef<() => void>(() => {});
  useEffect(() => {
    const container = track.current;
    if (!container) return;
    const place = () => {
      const element = items.current[initial];
      if (!element || touched.current) return;
      container.scrollTo({ left: centeredLeft(container, element), behavior: 'instant' });
    };
    placeInitial.current = place;
    // Layout changes (fonts, the controls appearing) re-place it while the user has not moved it.
    const resize = new ResizeObserver(place);
    resize.observe(container);
    const markTouched = () => {
      touched.current = true;
    };
    place();
    const frame = requestAnimationFrame(place);
    void document.fonts?.ready.then(place);
    // Later font weights reflow the cards and Chrome moves the scroll without a scroll event:
    // keep the initial card, or once the user moved it, the card they were looking at.
    const restore = () => {
      if (!touched.current) return place();
      const element = items.current[activeRef.current];
      if (element)
        container.scrollTo({ left: centeredLeft(container, element), behavior: 'instant' });
    };
    document.fonts?.addEventListener('loadingdone', restore);
    const events = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const;
    for (const name of events) container.addEventListener(name, markTouched, { passive: true });
    // Until the user moves it, any scroll is the browser adjusting the layout: put it back.
    const keep = () => {
      const element = items.current[initial];
      if (!element || touched.current) return;
      const left = centeredLeft(container, element);
      if (
        Math.abs(
          container.scrollLeft - Math.min(left, container.scrollWidth - container.clientWidth),
        ) > 2
      )
        place();
    };
    container.addEventListener('scroll', keep, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      container.removeEventListener('scroll', keep);
      document.fonts?.removeEventListener('loadingdone', restore);
      for (const name of events) container.removeEventListener(name, markTouched);
    };
  }, [initial]);

  // When the carousel becomes scrollable the cards change size and Chrome re-snaps to the first
  // one: place the initial card again after that render.
  useEffect(() => {
    if (!scrollable) return;
    const frame = requestAnimationFrame(() => placeInitial.current());
    return () => cancelAnimationFrame(frame);
  }, [scrollable]);

  // The slide that is (mostly) in view is the active one; controls only when something is hidden.
  useEffect(() => {
    const container = track.current;
    if (!container) return;
    const visible = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(
            Number((entry.target as HTMLElement).dataset['index']),
            entry.intersectionRatio,
          );
        }
        let best = 0;
        let ratio = -1;
        for (const [index, value] of visible) {
          if (value > ratio + 0.05) {
            best = index;
            ratio = value;
          }
        }
        setActive(best);
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const item of items.current) if (item) observer.observe(item);
    const measure = () => setScrollable(container.scrollWidth > container.clientWidth + 4);
    const resize = new ResizeObserver(measure);
    resize.observe(container);
    measure();
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, [slides.length]);

  const go = (index: number) => {
    touched.current = true;
    const target = Math.min(Math.max(index, 0), slides.length - 1);
    const element = items.current[target];
    const container = track.current;
    if (!element || !container) return;
    container.scrollTo({
      left: centeredLeft(container, element),
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  };

  const firstFocus = useRef(true);
  useEffect(() => {
    if (focusIndex === undefined) return;
    // The initial position is set without animation above.
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    go(focusIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the requested slide changes
  }, [focusIndex]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(active + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(active - 1);
    }
  };

  return (
    <div
      role="region"
      aria-roledescription="carrusel"
      aria-label={label}
      className="flex flex-col gap-4"
    >
      <div
        // The ::before/::after spacers let the first and last cards be centered (and snapped).
        ref={track}
        id={id}
        tabIndex={scrollable ? 0 : -1}
        onKeyDown={onKey}
        className={`relative -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 [overflow-anchor:none] before:block before:w-[max(0px,calc(7%-1rem))] before:shrink-0 before:content-[''] after:block after:w-[max(0px,calc(7%-1rem))] after:shrink-0 after:content-[''] sm:before:w-[calc(18%-1rem)] sm:after:w-[calc(18%-1rem)] pt-4 pb-3 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-orange-500 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden`}
      >
        {slides.map((slide, index) => {
          const current = !scrollable || index === active;
          return (
            <div
              key={slide.key}
              ref={(element) => {
                items.current[index] = element;
              }}
              data-index={index}
              role="group"
              aria-roledescription="opción"
              aria-label={`${index + 1} de ${slides.length}: ${slide.label}`}
              className={`w-[86%] shrink-0 snap-center transition-[opacity,transform] duration-300 motion-reduce:transition-none sm:w-[64%] ${
                current ? 'opacity-100' : 'scale-[0.96] opacity-60'
              }`}
            >
              {slide.node}
            </div>
          );
        })}
      </div>

      {scrollable ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go(active - 1)}
            disabled={active === 0}
            aria-controls={id}
            className="grid size-11 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 disabled:opacity-40"
          >
            <Icon name="arrowRight" className="size-5 rotate-180" />
            <span className="sr-only">Opción anterior</span>
          </button>
          <div className="flex items-center gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => go(index)}
                aria-controls={id}
                aria-current={index === active ? 'true' : undefined}
                className="grid size-6 place-items-center"
              >
                <span
                  aria-hidden="true"
                  className={`block h-2 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                    index === active ? 'w-6 bg-orange-600' : 'w-2 bg-slate-300'
                  }`}
                />
                <span className="sr-only">Ver {slide.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(active + 1)}
            disabled={active === slides.length - 1}
            aria-controls={id}
            className="grid size-11 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 disabled:opacity-40"
          >
            <Icon name="arrowRight" className="size-5" />
            <span className="sr-only">Opción siguiente</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
