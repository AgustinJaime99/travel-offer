import { Anton, Caveat, Inter } from 'next/font/google';
import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';
import { HeroScene } from './hero-scene';
import { MobileMenu } from './mobile-menu';

const display = Anton({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const hand = Caveat({ subsets: ['latin'], weight: '600', variable: '--font-hand' });
const sans = Inter({ subsets: ['latin'] });

/**
 * Public, mobile-first area for families. Entirely separate from the staff panel. The trip photo
 * (`public/onboarding/hero-mobile.jpg`, `hero-desktop.jpg`) fills whatever height the card leaves on
 * phones (the card sits at the bottom, never leaving empty space) and the whole background on
 * desktop.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${display.variable} ${hand.variable} ${sans.className} public-theme relative flex min-h-dvh flex-col bg-[#fbf8f5] lg:block lg:bg-slate-900`}
    >
      {/* Phones: the header grows into the height the card leaves free, and the photo fills it. */}
      <header className="public-hero-slot relative flex-1 lg:flex-none">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -bottom-6 overflow-hidden lg:fixed lg:inset-0"
        >
          <div className="public-hero-photo absolute inset-0" />
          <Suspense fallback={null}>
            <HeroScene />
          </Suspense>
          <div className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-white/75 via-white/35 to-transparent lg:h-32 lg:from-white/50 lg:via-transparent" />
        </div>
        <div className="relative z-20 flex h-16 items-center justify-between px-5 lg:h-20 lg:px-12 xl:px-20">
          <Link
            href="/"
            className="-skew-x-6 font-(family-name:--font-display) text-2xl leading-[0.85] tracking-tight text-orange-600 uppercase drop-shadow-sm lg:text-[2.25rem]"
          >
            Travel
            <br />
            Rock
          </Link>
          <nav aria-label="Familias" className="flex items-center gap-6 font-medium text-slate-900">
            <Link href="/mis-viajes" className="inline-flex min-h-11 items-center underline">
              Mis viajes
            </Link>
            <Link
              href="/privacidad"
              className="hidden min-h-11 items-center underline lg:inline-flex"
            >
              Privacidad
            </Link>
            <MobileMenu />
          </nav>
        </div>
      </header>

      <div className="relative z-10 lg:grid lg:grid-cols-[1fr_minmax(0,42rem)] lg:gap-8 lg:px-12 lg:pt-2 lg:pb-12 xl:px-20">
        <Tagline />
        <main className="relative -mt-6 rounded-t-3xl bg-[#fbf8f5] px-5 pt-5 pb-6 shadow-[0_-8px_24px_rgb(0_0_0/0.08)] lg:col-start-2 lg:mt-0 lg:rounded-[1.75rem] lg:bg-[#fbf8f5]/95 lg:p-10 lg:shadow-2xl lg:backdrop-blur-sm">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Desktop only, over the photo: brand line and a hand-written nudge. Decorative. */
function Tagline() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-12 left-12 hidden flex-col gap-10 xl:left-20 xl:flex"
    >
      <p className="-rotate-6 font-(family-name:--font-display) text-6xl leading-[0.95] text-white uppercase drop-shadow-[0_2px_8px_rgb(0_0_0/0.45)]">
        Viajes
        <br />
        que dejan
        <br />
        <span className="relative text-orange-500">
          huella
          <svg viewBox="0 0 200 20" className="absolute -bottom-4 left-0 w-full" fill="none">
            <path
              d="M4 14C60 4 130 2 196 8"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </p>
      <p className="ml-[22rem] hidden w-64 -rotate-6 items-center gap-3 font-(family-name:--font-hand) text-3xl leading-tight text-white drop-shadow-[0_2px_6px_rgb(0_0_0/0.5)] 2xl:flex">
        <svg viewBox="0 0 24 24" className="size-10 shrink-0 text-orange-500" fill="currentColor">
          <path d="M22 2 2 10.5l7 2.5 2.5 7L22 2zM9 13l9-8-6.5 10.5" />
        </svg>
        Faltan pocos pasos para tu próxima aventura
      </p>
    </div>
  );
}
