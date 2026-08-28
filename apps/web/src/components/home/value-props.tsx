import Link from 'next/link';

import { ButtonLink } from '../ui/button';
import {
  CameraIcon,
  CrownIcon,
  DiceIcon,
  PaletteIcon,
  SparkleIcon,
  ArrowRightIcon,
} from '../ui/icon';

/** Explains what the platform actually does, in three concrete steps. */
export function HowItWorks() {
  const steps = [
    {
      icon: <PaletteIcon size={20} />,
      title: 'Pick a look',
      body: 'Browse by category, style or the exact AI model you use. Every prompt lists the model it was written and tested for.',
    },
    {
      icon: <CameraIcon size={20} />,
      title: 'Copy and generate',
      body: 'One tap copies the full prompt, plus the negative prompt and setup notes where they matter.',
    },
    {
      icon: <SparkleIcon size={20} />,
      title: 'Make it yours',
      body: 'Feed your own subject, outfit and location into the generator to get a fresh prompt written around your idea.',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {steps.map((step, index) => (
        <div key={step.title} className="card p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
              {step.icon}
            </span>
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-faint">
              Step {index + 1}
            </span>
          </div>
          <h3 className="text-base font-bold">{step.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-body">{step.body}</p>
        </div>
      ))}
    </div>
  );
}

/** Side-by-side calls to action for the two creation tools. */
export function CreateCallouts() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="card relative overflow-hidden p-6 sm:p-7">
        <span
          aria-hidden="true"
          className="absolute -right-12 -top-12 size-40 rounded-full bg-gradient-to-br from-brand-600 to-brand-400 opacity-15"
        />
        <span className="relative grid size-11 place-items-center rounded-xl gradient-brand text-white">
          <SparkleIcon size={21} />
        </span>
        <h3 className="relative mt-4 text-lg font-extrabold">Advanced prompt generator</h3>
        <p className="relative mt-2 text-sm leading-relaxed text-body">
          Choose your model, subject, outfit, lighting, camera and mood. We assemble a prompt in the
          grammar that model expects — comma clauses and flags for Midjourney, weighted keywords for
          Flux and Stable Diffusion, natural language for Gemini.
        </p>
        <ButtonLink href="/generator" className="relative mt-5">
          Open the generator
        </ButtonLink>
      </div>

      <div className="card relative overflow-hidden p-6 sm:p-7">
        <span
          aria-hidden="true"
          className="absolute -right-12 -top-12 size-40 rounded-full bg-gradient-to-br from-marigold-500 to-marigold-300 opacity-20"
        />
        <span className="relative grid size-11 place-items-center rounded-xl bg-gradient-to-br from-marigold-500 to-marigold-600 text-white">
          <DiceIcon size={21} />
        </span>
        <h3 className="relative mt-4 text-lg font-extrabold">Stuck for ideas?</h3>
        <p className="relative mt-2 text-sm leading-relaxed text-body">
          The random generator rolls a complete brief for you — category, style, subject, location,
          mood, camera and lighting — then writes the prompt. Roll again until something clicks.
        </p>
        <ButtonLink href="/random-prompt" variant="outline" className="relative mt-5">
          Generate a random prompt
        </ButtonLink>
      </div>
    </div>
  );
}

/** Upgrade banner, hidden for members who already have premium. */
export function PremiumBanner({ isPremium }: { isPremium: boolean }) {
  if (isPremium) return null;

  return (
    <div className="card gradient-brand relative overflow-hidden border-0 p-6 text-white sm:p-9">
      <span
        aria-hidden="true"
        className="absolute -right-16 -bottom-20 size-64 rounded-full bg-white/10"
      />
      <div className="relative max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[0.6875rem] font-bold backdrop-blur">
          <CrownIcon size={13} />
          Premium membership
        </span>
        <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">
          Unlimited copies. Premium-only prompts. No ads.
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-white/85 sm:text-base">
          Go premium for unlimited prompt copies and favourites, the full premium collection, and
          more generator runs each day. Pay with UPI, cards, net banking or wallets.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ButtonLink
            href="/premium"
            variant="secondary"
            className="bg-white text-brand-700 hover:bg-white/90 dark:bg-white dark:text-brand-700"
          >
            See plans and pricing
          </ButtonLink>
          <Link
            href="/premium#faq"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/85 underline underline-offset-4 hover:text-white"
          >
            Common questions
            <ArrowRightIcon size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}
