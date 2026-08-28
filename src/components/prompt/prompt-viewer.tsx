'use client';

import { useEffect } from 'react';

import { api } from '@/lib/client-api';
import { aiModel } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ButtonLink } from '../ui/button';
import { CrownIcon, LockIcon, SparkleIcon } from '../ui/icon';
import { CopyPromptButton, DownloadPromptButton } from './prompt-actions';

/**
 * The prompt body panel.
 *
 * For a locked premium prompt the server sends `promptText: null`, so this
 * component renders an upgrade panel instead — there is no hidden text in the
 * DOM to reveal with dev tools.
 */

export interface PromptViewerProps {
  promptId: string;
  slug: string;
  title: string;
  promptText: string | null;
  negativePrompt: string | null;
  usageInstructions: string | null;
  aiModel: string;
  locked: boolean;
  isAuthenticated: boolean;
}

export function PromptViewer({
  promptId,
  slug,
  title,
  promptText,
  negativePrompt,
  usageInstructions,
  aiModel: model,
  locked,
  isAuthenticated,
}: PromptViewerProps) {
  const modelMeta = aiModel(model);

  if (locked || promptText === null) {
    return (
      <div className="prompt-box relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 select-none p-6 opacity-25 blur-[7px]"
        >
          {/* Decorative filler only — the real prompt is never sent to a locked viewer. */}
          <p className="font-mono text-sm leading-relaxed">
            ████ ███████ ██ ████████ ██████, ███████ ██████ ████ ██████ ███ ██ ████████ █████ ████
            ███████████ ██████ ████ ██ ███████ ████ ████████ ███.
          </p>
        </div>

        <div className="relative text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-marigold-500 to-marigold-600 text-white">
            <LockIcon size={22} />
          </span>
          <h3 className="mt-4 text-lg font-bold text-white">This is a premium prompt</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/70">
            Premium prompts are longer and more specific, and ship with a matching negative prompt
            and setup notes. Upgrade to unlock the full collection.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <ButtonLink href="/premium" variant="premium" leadingIcon={<CrownIcon size={17} />}>
              Unlock with Premium
            </ButtonLink>
            {!isAuthenticated && (
              <ButtonLink
                href="/register"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:border-white hover:text-white"
              >
                Create a free account
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <PromptBlock label="Prompt" body={promptText} tone="primary" />

      {negativePrompt && (
        <PromptBlock label="Negative prompt" body={negativePrompt} tone="muted" />
      )}

      {usageInstructions && (
        <div className="card p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <SparkleIcon size={16} className="text-marigold-500" />
            How to use this prompt
          </h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-body">
            {usageInstructions}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        <CopyPromptButton
          promptId={promptId}
          title={title}
          size="lg"
          className="flex-1 sm:flex-none"
        />
        <CopyPromptButton
          promptId={promptId}
          title={title}
          variant="instructions"
          buttonVariant="outline"
          size="lg"
          label="Copy with instructions"
        />
        <DownloadPromptButton promptId={promptId} title={title} slug={slug} />
      </div>

      <p className="text-xs text-faint">
        Written and tested for <strong className="font-semibold">{modelMeta.label}</strong>.{' '}
        {modelMeta.note}
      </p>
    </div>
  );
}

function PromptBlock({
  label,
  body,
  tone,
}: {
  label: string;
  body: string;
  tone: 'primary' | 'muted';
}) {
  return (
    <figure className={cn('prompt-box overflow-hidden', tone === 'muted' && 'opacity-90')}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-white/55">
          {label}
        </span>
        <span className="text-[0.6875rem] text-white/40">{body.length} characters</span>
      </figcaption>
      <div className="max-h-[26rem] overflow-y-auto px-4 py-4">
        <p className="whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed selection:bg-brand-500/40">
          {body}
        </p>
      </div>
    </figure>
  );
}

/**
 * Records a view once the page has painted.
 *
 * Deliberately client-side and fire-and-forget so counting never delays the
 * server response or blocks rendering. De-duplication happens server-side.
 */
export function ViewTracker({ promptId, path }: { promptId: string; path: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      void api.post('/api/prompts/view', { promptId }).catch(() => {});
      void api
        .post('/api/analytics/event', { name: 'page.view', path })
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [promptId, path]);

  return null;
}
