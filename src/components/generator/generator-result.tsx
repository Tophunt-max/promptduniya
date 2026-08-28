'use client';

import { useState } from 'react';

import { ApiClientError, api, copyToClipboard, downloadTextFile } from '@/lib/client-api';
import { aiModel } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ShareButton } from '../prompt/share-button';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  BookmarkIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  RefreshIcon,
  SparkleIcon,
} from '../ui/icon';
import { useToast } from '../ui/toast';
import { useViewer } from '../viewer-provider';

export interface GeneratorOutput {
  id: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  tips: string[];
  engine: string;
  aiModel: string;
  usage: { used: number; limit: number; remaining: number; unlimited: boolean };
}

/**
 * Result panel for both generators.
 *
 * The engine name is surfaced honestly: when no AI provider is configured the
 * badge says "template engine", and a fallback after an upstream failure is
 * labelled as such rather than being passed off as an AI result.
 */
export function GeneratorResult({
  result,
  onRegenerate,
  onUseAgain,
  regenerating,
}: {
  result: GeneratorOutput;
  onRegenerate?: () => void;
  onUseAgain?: () => void;
  regenerating?: boolean;
}) {
  const viewer = useViewer();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const model = aiModel(result.aiModel);
  const isTemplate = result.engine === 'template' || result.engine.endsWith(':template');
  const wasFallback = result.engine.includes('fallback');

  const fullText = result.negativePrompt
    ? `${result.prompt}\n\nNegative prompt:\n${result.negativePrompt}`
    : result.prompt;

  async function onCopy() {
    const ok = await copyToClipboard(fullText);
    if (ok) {
      setCopied(true);
      toast.success('Prompt copied successfully');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.info('Copy manually', 'Your browser blocked clipboard access — select the text instead.');
    }
  }

  async function onSave() {
    if (!viewer.isAuthenticated) {
      toast.error('Sign in to save prompts', 'Create a free account to keep your generated prompts.', {
        label: 'Sign up free',
        href: '/register',
      });
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/generator/save', { generatedId: result.id, title: result.title });
      setSaved(true);
      toast.success('Saved to your prompts', 'Find it under Dashboard → My prompts.');
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Could not save that prompt.';
      toast.error('Save failed', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 animate-[fade-up_0.35s_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="brand" icon={<SparkleIcon size={12} />}>
            Generated
          </Badge>
          <Badge tone="neutral">{model.label}</Badge>
          <Badge tone={isTemplate ? 'neutral' : 'peacock'}>
            {wasFallback
              ? 'AI unavailable · template engine'
              : isTemplate
                ? 'Template engine'
                : `${result.engine} engine`}
          </Badge>
        </div>
        {!result.usage.unlimited && (
          <span className="text-xs font-semibold text-faint">
            {result.usage.remaining} of {result.usage.limit} runs left today
          </span>
        )}
      </div>

      <h2 className="text-lg font-extrabold">{result.title}</h2>

      <figure className="prompt-box overflow-hidden">
        <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-white/55">
            Prompt
          </span>
          <span className="text-[0.6875rem] text-white/40">{result.prompt.length} characters</span>
        </figcaption>
        <div className="max-h-80 overflow-y-auto px-4 py-4">
          <p className="whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed">
            {result.prompt}
          </p>
        </div>
      </figure>

      {result.negativePrompt && (
        <figure className="prompt-box overflow-hidden opacity-90">
          <figcaption className="border-b border-white/10 px-4 py-2.5">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-white/55">
              Negative prompt
            </span>
          </figcaption>
          <div className="px-4 py-3.5">
            <p className="whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed">
              {result.negativePrompt}
            </p>
          </div>
        </figure>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={onCopy}
          leadingIcon={copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          className="flex-1 sm:flex-none"
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>

        {onRegenerate && (
          <Button
            onClick={onRegenerate}
            variant="outline"
            loading={regenerating}
            leadingIcon={<RefreshIcon size={16} />}
          >
            Regenerate
          </Button>
        )}

        <Button
          onClick={onSave}
          variant="outline"
          loading={saving}
          leadingIcon={saved ? <CheckIcon size={16} /> : <BookmarkIcon size={16} filled={saved} />}
        >
          {saved ? 'Saved' : 'Save'}
        </Button>

        <ShareButton
          title={result.title}
          path="/generator"
          description="I generated this prompt on promptduniya"
        />

        <Button
          variant="ghost"
          onClick={() => downloadTextFile(`${result.title.toLowerCase().replace(/\s+/g, '-')}.txt`, fullText)}
          leadingIcon={<DownloadIcon size={16} />}
        >
          Download
        </Button>

        {onUseAgain && (
          <Button variant="ghost" onClick={onUseAgain}>
            Use again
          </Button>
        )}
      </div>

      {result.tips.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold">Getting the most from this prompt</h3>
          <ul className="mt-2 grid gap-1.5">
            {result.tips.map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-sm leading-relaxed text-body">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Placeholder shown before the first generation. */
export function GeneratorPlaceholder({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] px-6 text-center',
        compact ? 'py-10' : 'py-16',
      )}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
        <SparkleIcon size={24} />
      </span>
      <h3 className="mt-4 text-base font-bold">Your prompt will appear here</h3>
      <p className="mt-1.5 max-w-sm text-sm text-body">
        Fill in as much or as little as you like — anything you leave blank gets a sensible default
        chosen for you.
      </p>
    </div>
  );
}
