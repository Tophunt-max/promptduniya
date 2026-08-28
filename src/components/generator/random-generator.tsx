'use client';

import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { AI_MODELS } from '@/lib/constants';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Select } from '../ui/field';
import { DiceIcon } from '../ui/icon';
import { useToast } from '../ui/toast';
import { GeneratorPlaceholder, GeneratorResult, type GeneratorOutput } from './generator-result';

interface RandomBrief {
  imageType?: string;
  style?: string;
  location?: string;
  mood?: string;
  camera?: string;
  lighting?: string;
  outfit?: string;
  aspectRatio?: string;
}

interface RandomResult extends GeneratorOutput {
  brief: RandomBrief;
}

/**
 * Random prompt roller.
 *
 * The brief is generated server-side so every field is filled, then shown
 * alongside the result — the point is that you can see what was rolled and pull
 * any of it into the advanced generator afterwards.
 */
export function RandomGenerator() {
  const toast = useToast();
  const [model, setModel] = useState('');
  const [result, setResult] = useState<RandomResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function roll() {
    setLoading(true);
    try {
      const data = await api.post<RandomResult>('/api/generator/random', {
        aiModel: model || undefined,
      });
      setResult(data);
    } catch (error) {
      if (error instanceof ApiClientError) {
        toast.error(
          error.isLimit ? 'Daily limit reached' : 'Could not generate',
          error.message,
          error.upgradeHref ? { label: 'See plans', href: error.upgradeHref } : undefined,
        );
      } else {
        toast.error('Could not generate', 'Please try again in a moment.');
      }
    } finally {
      setLoading(false);
    }
  }

  const briefRows: [string, string | undefined][] = result
    ? [
        ['Category', result.brief.imageType],
        ['Style', result.brief.style],
        ['Location', result.brief.location],
        ['Mood', result.brief.mood],
        ['Camera', result.brief.camera],
        ['Lighting', result.brief.lighting],
        ['Outfit', result.brief.outfit],
        ['Aspect ratio', result.brief.aspectRatio],
      ]
    : [];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10">
      <div className="grid content-start gap-5">
        <div className="card p-5">
          <h2 className="text-sm font-bold">Roll a brief</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-body">
            Every field is randomised — category, style, subject, location, mood, camera and
            lighting — then written up as a complete prompt.
          </p>

          <div className="mt-4 grid gap-3">
            <Select
              label="AI model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              options={AI_MODELS.map((m) => ({ value: m.id, label: m.label }))}
              placeholder="Randomise the model too"
            />
            <Button
              onClick={roll}
              loading={loading}
              size="lg"
              fullWidth
              leadingIcon={<DiceIcon size={18} />}
            >
              {result ? 'Generate again' : 'Generate random prompt'}
            </Button>
          </div>
        </div>

        {result && (
          <div className="card p-5">
            <h2 className="text-sm font-bold">What we rolled</h2>
            <dl className="mt-3 grid gap-2.5">
              {briefRows
                .filter(([, value]) => Boolean(value))
                .map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4">
                    <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-faint">
                      {label}
                    </dt>
                    <dd className="text-right text-sm font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
            <p className="mt-4 text-xs text-faint">
              Like part of this? Take any value into the{' '}
              <a href="/generator" className="font-semibold text-brand-600 underline dark:text-brand-300">
                advanced generator
              </a>{' '}
              and control the rest yourself.
            </p>
          </div>
        )}
      </div>

      <div>
        {result ? (
          <>
            <div className="mb-3">
              <Badge tone="marigold" icon={<DiceIcon size={12} />}>
                Random roll
              </Badge>
            </div>
            <GeneratorResult
              result={result}
              regenerating={loading}
              onRegenerate={() => void roll()}
            />
          </>
        ) : (
          <GeneratorPlaceholder />
        )}
      </div>
    </div>
  );
}
