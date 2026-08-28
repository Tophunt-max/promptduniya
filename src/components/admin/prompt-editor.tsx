'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import {
  AI_MODELS,
  ASPECT_RATIOS,
  CAMERA_STYLES,
  DIFFICULTIES,
  GENDERS,
  LIGHTING,
  MOODS,
  STYLES,
} from '@/lib/constants';
import { slugify } from '@/lib/utils';
import type { CategorySummary } from '@/services/categories';
import { Badge, ModelBadge, PremiumBadge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/field';
import { EyeIcon, SparkleIcon } from '../ui/icon';
import { Modal } from '../ui/modal';
import { useToast } from '../ui/toast';

/**
 * Prompt CMS editor.
 *
 * Handles both create and edit. Includes a preview dialog that renders the
 * prompt exactly as the public detail page will, so an editor can check their
 * work before publishing.
 */

export interface PromptFormValues {
  id?: string;
  title: string;
  slug: string;
  shortDescription: string;
  promptText: string;
  negativePrompt: string;
  usageInstructions: string;
  aiModel: string;
  categoryId: string;
  style: string;
  gender: string;
  ageGroup: string;
  location: string;
  aspectRatio: string;
  cameraStyle: string;
  lighting: string;
  mood: string;
  difficulty: string;
  tags: string;
  coverImageUrl: string;
  coverImageAlt: string;
  seoTitle: string;
  seoDescription: string;
  isPremium: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  isEditorsPick: boolean;
  isPublished: boolean;
}

export const EMPTY_PROMPT_FORM: PromptFormValues = {
  title: '',
  slug: '',
  shortDescription: '',
  promptText: '',
  negativePrompt: '',
  usageInstructions: '',
  aiModel: 'gemini',
  categoryId: '',
  style: '',
  gender: 'any',
  ageGroup: '',
  location: '',
  aspectRatio: '4:5',
  cameraStyle: '',
  lighting: '',
  mood: '',
  difficulty: 'beginner',
  tags: '',
  coverImageUrl: '',
  coverImageAlt: '',
  seoTitle: '',
  seoDescription: '',
  isPremium: false,
  isFeatured: false,
  isTrending: false,
  isEditorsPick: false,
  isPublished: false,
};

const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function PromptEditor({
  initial,
  categories,
}: {
  initial: PromptFormValues;
  categories: CategorySummary[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = Boolean(initial.id);

  function set<K extends keyof PromptFormValues>(key: K, value: PromptFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(publish?: boolean) {
    setSaving(true);
    setErrors({});

    const payload = {
      title: form.title,
      slug: form.slug || slugify(form.title),
      shortDescription: form.shortDescription,
      promptText: form.promptText,
      negativePrompt: form.negativePrompt || undefined,
      usageInstructions: form.usageInstructions || undefined,
      aiModel: form.aiModel,
      categoryId: form.categoryId,
      style: form.style || undefined,
      gender: form.gender || undefined,
      ageGroup: form.ageGroup || undefined,
      location: form.location || undefined,
      aspectRatio: form.aspectRatio || undefined,
      cameraStyle: form.cameraStyle || undefined,
      lighting: form.lighting || undefined,
      mood: form.mood || undefined,
      difficulty: form.difficulty,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      coverImageUrl: form.coverImageUrl || undefined,
      coverImageAlt: form.coverImageAlt || undefined,
      seoTitle: form.seoTitle || undefined,
      seoDescription: form.seoDescription || undefined,
      isPremium: form.isPremium,
      isFeatured: form.isFeatured,
      isTrending: form.isTrending,
      isEditorsPick: form.isEditorsPick,
      isPublished: publish ?? form.isPublished,
      exampleImages: [],
    };

    try {
      if (isEditing) {
        await api.patch(`/api/admin/prompts/${initial.id}`, payload);
        toast.success('Prompt saved');
      } else {
        const created = await api.post<{ id: string; slug: string }>('/api/admin/prompts', payload);
        toast.success('Prompt created');
        router.push(`/admin/prompts/${created.id}`);
      }
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const details = error.details as { issues?: { path: string; message: string }[] } | undefined;
        const mapped: Record<string, string> = {};
        for (const issue of details?.issues ?? []) if (issue.path) mapped[issue.path] = issue.message;
        setErrors(mapped);
        toast.error('Could not save', error.message);
      } else {
        toast.error('Could not save', 'Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start"
      >
        {/* Main column */}
        <div className="grid gap-5">
          <fieldset className="card grid gap-4 p-5">
            <legend className="px-1 text-sm font-bold">Content</legend>

            <Input
              label="Title"
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              onBlur={() => {
                if (!form.slug && form.title) set('slug', slugify(form.title));
              }}
              error={errors.title}
              required
              maxLength={160}
            />

            <Input
              label="URL slug"
              value={form.slug}
              onChange={(event) => set('slug', slugify(event.target.value))}
              error={errors.slug}
              hint={`Public URL: /prompt/${form.slug || 'your-slug'}`}
            />

            <Textarea
              label="Short description"
              value={form.shortDescription}
              onChange={(event) => set('shortDescription', event.target.value)}
              error={errors.shortDescription}
              required
              rows={2}
              maxLength={300}
              hint={`${form.shortDescription.length}/300 — shown on cards and in search results`}
            />

            <Textarea
              label="Prompt text"
              value={form.promptText}
              onChange={(event) => set('promptText', event.target.value)}
              error={errors.promptText}
              required
              rows={12}
              className="font-mono text-[0.8125rem]"
              hint={`${form.promptText.length} characters`}
            />

            <Textarea
              label="Negative prompt"
              value={form.negativePrompt}
              onChange={(event) => set('negativePrompt', event.target.value)}
              rows={3}
              className="font-mono text-[0.8125rem]"
              hint="Leave blank for models without a negative field."
            />

            <Textarea
              label="How to use this prompt"
              value={form.usageInstructions}
              onChange={(event) => set('usageInstructions', event.target.value)}
              rows={4}
              hint="Shown on the detail page and included in “Copy with instructions”."
            />
          </fieldset>

          <fieldset className="card grid gap-4 p-5">
            <legend className="px-1 text-sm font-bold">Attributes</legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="AI model"
                value={form.aiModel}
                onChange={(event) => set('aiModel', event.target.value)}
                options={AI_MODELS.map((m) => ({ value: m.id, label: m.label }))}
                required
              />
              <Select
                label="Category"
                value={form.categoryId}
                onChange={(event) => set('categoryId', event.target.value)}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Choose a category"
                error={errors.categoryId}
                required
              />
              <Select
                label="Style"
                value={form.style}
                onChange={(event) => set('style', event.target.value)}
                options={toOptions(STYLES)}
                placeholder="Not specified"
              />
              <Select
                label="Subject"
                value={form.gender}
                onChange={(event) => set('gender', event.target.value)}
                options={GENDERS.map((g) => ({ value: g.id, label: g.label }))}
              />
              <Select
                label="Aspect ratio"
                value={form.aspectRatio}
                onChange={(event) => set('aspectRatio', event.target.value)}
                options={ASPECT_RATIOS.map((a) => ({ value: a.id, label: a.label }))}
              />
              <Select
                label="Difficulty"
                value={form.difficulty}
                onChange={(event) => set('difficulty', event.target.value)}
                options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label }))}
              />
              <Select
                label="Lighting"
                value={form.lighting}
                onChange={(event) => set('lighting', event.target.value)}
                options={toOptions(LIGHTING)}
                placeholder="Not specified"
              />
              <Select
                label="Camera"
                value={form.cameraStyle}
                onChange={(event) => set('cameraStyle', event.target.value)}
                options={toOptions(CAMERA_STYLES)}
                placeholder="Not specified"
              />
              <Select
                label="Mood"
                value={form.mood}
                onChange={(event) => set('mood', event.target.value)}
                options={toOptions(MOODS)}
                placeholder="Not specified"
              />
              <Input
                label="Age group"
                value={form.ageGroup}
                onChange={(event) => set('ageGroup', event.target.value)}
                placeholder="Young adult"
              />
              <Input
                label="Location"
                value={form.location}
                onChange={(event) => set('location', event.target.value)}
                placeholder="Jaipur haveli courtyard"
                containerClassName="sm:col-span-2"
              />
            </div>

            <Input
              label="Tags"
              value={form.tags}
              onChange={(event) => set('tags', event.target.value)}
              placeholder="portrait, saree, golden hour"
              hint="Comma-separated. Used for filtering and internal links."
            />
          </fieldset>

          <fieldset className="card grid gap-4 p-5">
            <legend className="px-1 text-sm font-bold">Media and SEO</legend>

            <Input
              label="Cover image URL"
              value={form.coverImageUrl}
              onChange={(event) => set('coverImageUrl', event.target.value)}
              error={errors.coverImageUrl}
              placeholder="https://…"
              hint="Leave blank to use the generated gradient artwork."
            />
            <Input
              label="Cover image alt text"
              value={form.coverImageAlt}
              onChange={(event) => set('coverImageAlt', event.target.value)}
              hint="Describe the image for screen readers and search engines."
            />
            <Input
              label="SEO title"
              value={form.seoTitle}
              onChange={(event) => set('seoTitle', event.target.value)}
              maxLength={200}
              hint="Defaults to the prompt title plus the model name."
            />
            <Textarea
              label="Meta description"
              value={form.seoDescription}
              onChange={(event) => set('seoDescription', event.target.value)}
              rows={2}
              maxLength={320}
              hint={`${form.seoDescription.length}/320 — aim for 150 to 160 characters`}
            />
          </fieldset>
        </div>

        {/* Sidebar */}
        <div className="grid gap-5 lg:sticky lg:top-20">
          <div className="card grid gap-3 p-5">
            <p className="text-sm font-bold">Publishing</p>

            <div className="grid gap-2.5">
              <Checkbox
                label="Published"
                description="Visible on the public site and in sitemaps."
                checked={form.isPublished}
                onChange={(event) => set('isPublished', event.target.checked)}
              />
              <Checkbox
                label="Premium only"
                description="The prompt body is withheld from non-members."
                checked={form.isPremium}
                onChange={(event) => set('isPremium', event.target.checked)}
              />
              <Checkbox
                label="Featured"
                checked={form.isFeatured}
                onChange={(event) => set('isFeatured', event.target.checked)}
              />
              <Checkbox
                label="Trending"
                description="Also set automatically by engagement."
                checked={form.isTrending}
                onChange={(event) => set('isTrending', event.target.checked)}
              />
              <Checkbox
                label="Editor's pick"
                checked={form.isEditorsPick}
                onChange={(event) => set('isEditorsPick', event.target.checked)}
              />
            </div>

            <div className="mt-1 grid gap-2">
              <Button type="submit" loading={saving} fullWidth>
                {isEditing ? 'Save changes' : 'Save draft'}
              </Button>
              {!form.isPublished && (
                <Button
                  type="button"
                  variant="outline"
                  fullWidth
                  loading={saving}
                  onClick={() => void save(true)}
                >
                  Save and publish
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={() => setPreview(true)}
                leadingIcon={<EyeIcon size={16} />}
              >
                Preview
              </Button>
            </div>
          </div>

          <div className="card p-5">
            <p className="mb-3 text-sm font-bold">How it will appear</p>
            <div className="flex flex-wrap gap-1.5">
              <ModelBadge model={form.aiModel} />
              {form.isPremium ? <PremiumBadge /> : <Badge tone="success">Free</Badge>}
              {form.isTrending && <Badge tone="rose">Trending</Badge>}
              {form.isFeatured && <Badge tone="brand">Featured</Badge>}
            </div>
            <p className="mt-3 text-sm font-bold">{form.title || 'Untitled prompt'}</p>
            <p className="mt-1 text-xs leading-relaxed text-body">
              {form.shortDescription || 'Add a short description to see it here.'}
            </p>
          </div>
        </div>
      </form>

      <Modal
        open={preview}
        onClose={() => setPreview(false)}
        title="Preview"
        description="This is how the prompt will read on its public page."
        size="lg"
      >
        <article className="grid gap-4">
          <div className="flex flex-wrap gap-1.5">
            <ModelBadge model={form.aiModel} />
            {form.isPremium ? <PremiumBadge /> : <Badge tone="success">Free</Badge>}
            <Badge tone="neutral" className="capitalize">
              {form.difficulty}
            </Badge>
          </div>

          <h2 className="text-xl font-extrabold">{form.title || 'Untitled prompt'}</h2>
          <p className="text-sm leading-relaxed text-body">{form.shortDescription}</p>

          <figure className="prompt-box overflow-hidden">
            <figcaption className="border-b border-white/10 px-4 py-2.5 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-white/55">
              Prompt
            </figcaption>
            <div className="max-h-72 overflow-y-auto px-4 py-3.5">
              <p className="whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed">
                {form.promptText || 'No prompt text yet.'}
              </p>
            </div>
          </figure>

          {form.negativePrompt && (
            <figure className="prompt-box overflow-hidden opacity-90">
              <figcaption className="border-b border-white/10 px-4 py-2.5 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-white/55">
                Negative prompt
              </figcaption>
              <div className="px-4 py-3">
                <p className="whitespace-pre-wrap font-mono text-[0.8125rem] leading-relaxed">
                  {form.negativePrompt}
                </p>
              </div>
            </figure>
          )}

          {form.usageInstructions && (
            <div className="card p-4">
              <p className="flex items-center gap-2 text-sm font-bold">
                <SparkleIcon size={15} className="text-marigold-500" />
                How to use this prompt
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-body">
                {form.usageInstructions}
              </p>
            </div>
          )}
        </article>
      </Modal>
    </>
  );
}
