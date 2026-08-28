'use client';

import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import {
  AI_MODELS,
  ASPECT_RATIOS,
  BACKGROUNDS,
  CAMERA_STYLES,
  COLOR_TONES,
  EXPRESSIONS,
  GENDERS,
  IMAGE_TYPES,
  LIGHTING,
  LOCATIONS,
  MOODS,
  OUTFITS,
  POSES,
  QUALITY_LEVELS,
  STYLES,
} from '@/lib/constants';
import { Button } from '../ui/button';
import { Input, Select, Switch, Textarea } from '../ui/field';
import { CrownIcon, SparkleIcon } from '../ui/icon';
import { useToast } from '../ui/toast';
import { useViewer } from '../viewer-provider';
import { GeneratorPlaceholder, GeneratorResult, type GeneratorOutput } from './generator-result';
import Link from 'next/link';

/**
 * Advanced generator form.
 *
 * Every field is optional — the template engine fills gaps with sensible,
 * context-appropriate defaults, so a first-time visitor gets a complete prompt
 * from a single click.
 */

interface FormState {
  aiModel: string;
  imageType: string;
  subject: string;
  gender: string;
  style: string;
  location: string;
  outfit: string;
  pose: string;
  expression: string;
  lighting: string;
  camera: string;
  background: string;
  mood: string;
  colorTone: string;
  aspectRatio: string;
  quality: string;
  additionalInstructions: string;
  useAi: boolean;
}

const INITIAL: FormState = {
  aiModel: 'gemini',
  imageType: 'Portrait',
  subject: '',
  gender: 'any',
  style: '',
  location: '',
  outfit: '',
  pose: '',
  expression: '',
  lighting: '',
  camera: '',
  background: '',
  mood: '',
  colorTone: '',
  aspectRatio: '4:5',
  quality: 'high',
  additionalInstructions: '',
  useAi: false,
};

const toOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: value }));

export function GeneratorForm({ aiAvailable }: { aiAvailable: boolean }) {
  const viewer = useViewer();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(INITIAL);
  const [result, setResult] = useState<GeneratorOutput | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function generate() {
    setLoading(true);
    try {
      const payload = {
        ...form,
        subject: form.subject || undefined,
        style: form.style || undefined,
        location: form.location || undefined,
        outfit: form.outfit || undefined,
        pose: form.pose || undefined,
        expression: form.expression || undefined,
        lighting: form.lighting || undefined,
        camera: form.camera || undefined,
        background: form.background || undefined,
        mood: form.mood || undefined,
        colorTone: form.colorTone || undefined,
        additionalInstructions: form.additionalInstructions || undefined,
        useAi: form.useAi && viewer.isPremium,
      };

      const data = await api.post<GeneratorOutput>('/api/generator', payload);
      setResult(data);

      // Bring the result into view on mobile, where the panel sits below the form.
      if (window.innerWidth < 1024) {
        setTimeout(
          () => document.getElementById('generator-result')?.scrollIntoView({ behavior: 'smooth' }),
          80,
        );
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        toast.error(
          error.isLimit ? 'Daily limit reached' : 'Generation failed',
          error.message,
          error.upgradeHref ? { label: 'See plans', href: error.upgradeHref } : undefined,
        );
      } else {
        toast.error('Generation failed', 'Please try again in a moment.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <fieldset className="card grid gap-4 p-5">
          <legend className="px-1 text-sm font-bold">The essentials</legend>

          <Select
            label="AI model"
            value={form.aiModel}
            onChange={(event) => set('aiModel', event.target.value)}
            options={AI_MODELS.map((model) => ({ value: model.id, label: model.label }))}
            hint={AI_MODELS.find((m) => m.id === form.aiModel)?.note}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Image type"
              value={form.imageType}
              onChange={(event) => set('imageType', event.target.value)}
              options={toOptions(IMAGE_TYPES)}
            />
            <Select
              label="Subject"
              value={form.gender}
              onChange={(event) => set('gender', event.target.value)}
              options={GENDERS.map((g) => ({ value: g.id, label: g.label }))}
            />
          </div>

          <Input
            label="What are you picturing?"
            placeholder="e.g. a potter at her wheel, hands covered in clay"
            value={form.subject}
            onChange={(event) => set('subject', event.target.value)}
            hint="Leave blank and we'll pick something that suits the image type."
          />
        </fieldset>

        <fieldset className="card grid gap-4 p-5">
          <legend className="px-1 text-sm font-bold">Look and styling</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Style"
              value={form.style}
              onChange={(event) => set('style', event.target.value)}
              options={toOptions(STYLES)}
              placeholder="Surprise me"
            />
            <Select
              label="Location"
              value={form.location}
              onChange={(event) => set('location', event.target.value)}
              options={toOptions(LOCATIONS)}
              placeholder="Surprise me"
            />
            <Select
              label="Outfit"
              value={form.outfit}
              onChange={(event) => set('outfit', event.target.value)}
              options={toOptions(OUTFITS)}
              placeholder="Surprise me"
            />
            <Select
              label="Pose"
              value={form.pose}
              onChange={(event) => set('pose', event.target.value)}
              options={toOptions(POSES)}
              placeholder="Surprise me"
            />
            <Select
              label="Expression"
              value={form.expression}
              onChange={(event) => set('expression', event.target.value)}
              options={toOptions(EXPRESSIONS)}
              placeholder="Surprise me"
            />
            <Select
              label="Background"
              value={form.background}
              onChange={(event) => set('background', event.target.value)}
              options={toOptions(BACKGROUNDS)}
              placeholder="Surprise me"
            />
          </div>
        </fieldset>

        <fieldset className="card grid gap-4 p-5">
          <legend className="px-1 text-sm font-bold">Light, camera, colour</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Lighting"
              value={form.lighting}
              onChange={(event) => set('lighting', event.target.value)}
              options={toOptions(LIGHTING)}
              placeholder="Surprise me"
            />
            <Select
              label="Camera"
              value={form.camera}
              onChange={(event) => set('camera', event.target.value)}
              options={toOptions(CAMERA_STYLES)}
              placeholder="Surprise me"
            />
            <Select
              label="Mood"
              value={form.mood}
              onChange={(event) => set('mood', event.target.value)}
              options={toOptions(MOODS)}
              placeholder="Surprise me"
            />
            <Select
              label="Colour tone"
              value={form.colorTone}
              onChange={(event) => set('colorTone', event.target.value)}
              options={toOptions(COLOR_TONES)}
              placeholder="Surprise me"
            />
            <Select
              label="Aspect ratio"
              value={form.aspectRatio}
              onChange={(event) => set('aspectRatio', event.target.value)}
              options={ASPECT_RATIOS.map((ratio) => ({
                value: ratio.id,
                label: `${ratio.label} — ${ratio.hint}`,
              }))}
            />
            <Select
              label="Quality"
              value={form.quality}
              onChange={(event) => set('quality', event.target.value)}
              options={QUALITY_LEVELS.map((q) => ({ value: q.id, label: q.label }))}
            />
          </div>

          <Textarea
            label="Additional instructions"
            placeholder="Anything else — props, weather, a detail that must be present…"
            value={form.additionalInstructions}
            onChange={(event) => set('additionalInstructions', event.target.value)}
            rows={3}
            maxLength={600}
          />
        </fieldset>

        {aiAvailable && (
          <div className="grid gap-2">
            <Switch
              label="Use the AI engine"
              description={
                viewer.isPremium
                  ? 'Sends your brief to the configured AI provider for a more bespoke result.'
                  : 'Available on premium plans. The template engine is used otherwise.'
              }
              checked={form.useAi && viewer.isPremium}
              onChange={(next) => set('useAi', next)}
              disabled={!viewer.isPremium}
            />
            {!viewer.isPremium && (
              <Link
                href="/premium"
                className="inline-flex items-center gap-1.5 px-1 text-xs font-semibold text-marigold-700 hover:underline dark:text-marigold-300"
              >
                <CrownIcon size={13} />
                Upgrade to unlock the AI engine
              </Link>
            )}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          loading={loading}
          fullWidth
          leadingIcon={<SparkleIcon size={18} />}
        >
          Generate prompt
        </Button>

        {!viewer.isPremium && (
          <p className="text-center text-xs text-faint">
            {viewer.limits.generatorPerDay < 0
              ? 'Unlimited generator runs'
              : `${viewer.limits.generatorPerDay} generator runs per day on your current plan`}
          </p>
        )}
      </form>

      <div id="generator-result" className="lg:sticky lg:top-20 lg:self-start">
        {result ? (
          <GeneratorResult
            result={result}
            regenerating={loading}
            onRegenerate={() => void generate()}
            onUseAgain={() => {
              setResult(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : (
          <GeneratorPlaceholder />
        )}
      </div>
    </div>
  );
}
