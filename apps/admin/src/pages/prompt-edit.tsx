import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  AI_MODELS,
  ASPECT_RATIOS,
  DIFFICULTIES,
  GENDERS,
  INPUT_MODES,
  STYLES,
} from '@pd/shared';
import { MediaIcon } from '@/components/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

interface CategoryRow {
  id: string;
  name: string;
}

interface AdminPromptDetail {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  promptText: string;
  negativePrompt: string | null;
  usageInstructions: string | null;
  aiModel: string;
  inputMode: string;
  categoryId: string;
  style: string | null;
  gender: string | null;
  ageGroup: string | null;
  location: string | null;
  aspectRatio: string | null;
  cameraStyle: string | null;
  lighting: string | null;
  mood: string | null;
  difficulty: string;
  isPremium: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  isEditorsPick: boolean;
  isPublished: boolean;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  tags: { id: string; name: string; slug: string }[];
}

interface FormState {
  title: string;
  slug: string;
  shortDescription: string;
  promptText: string;
  negativePrompt: string;
  usageInstructions: string;
  aiModel: string;
  inputMode: string;
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

const BLANK: FormState = {
  title: '',
  slug: '',
  shortDescription: '',
  promptText: '',
  negativePrompt: '',
  usageInstructions: '',
  aiModel: 'gemini',
  inputMode: 'text-to-image',
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

/** Strips empty strings so the API's optional-URL fields validate. */
function toPayload(form: FormState) {
  const tags = form.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    title: form.title,
    slug: form.slug || undefined,
    shortDescription: form.shortDescription,
    promptText: form.promptText,
    negativePrompt: form.negativePrompt || undefined,
    usageInstructions: form.usageInstructions || undefined,
    aiModel: form.aiModel,
    inputMode: form.inputMode,
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
    tags,
    coverImageUrl: form.coverImageUrl || undefined,
    coverImageAlt: form.coverImageAlt || undefined,
    seoTitle: form.seoTitle || undefined,
    seoDescription: form.seoDescription || undefined,
    isPremium: form.isPremium,
    isFeatured: form.isFeatured,
    isTrending: form.isTrending,
    isEditorsPick: form.isEditorsPick,
    isPublished: form.isPublished,
  };
}

export function PromptEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const categories = useQuery<{ items: CategoryRow[] }>('/v1/admin/categories');
  const existing = useQuery<AdminPromptDetail>(isNew ? null : `/v1/admin/prompts/${id}`);
  const { run, pending, error, fieldErrors } = useMutation();

  const [form, setForm] = useState<FormState>(BLANK);
  const [uploading, setUploading] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [coverNote, setCoverNote] = useState<string | null>(null);

  // Hydrate the form once the prompt arrives.
  useEffect(() => {
    const prompt = existing.data;
    if (!prompt) return;
    setForm({
      title: prompt.title,
      slug: prompt.slug,
      shortDescription: prompt.shortDescription,
      promptText: prompt.promptText,
      negativePrompt: prompt.negativePrompt ?? '',
      usageInstructions: prompt.usageInstructions ?? '',
      aiModel: prompt.aiModel,
      inputMode: prompt.inputMode ?? 'text-to-image',
      categoryId: prompt.categoryId,
      style: prompt.style ?? '',
      gender: prompt.gender ?? 'any',
      ageGroup: prompt.ageGroup ?? '',
      location: prompt.location ?? '',
      aspectRatio: prompt.aspectRatio ?? '4:5',
      cameraStyle: prompt.cameraStyle ?? '',
      lighting: prompt.lighting ?? '',
      mood: prompt.mood ?? '',
      difficulty: prompt.difficulty,
      tags: prompt.tags.map((tag) => tag.name).join(', '),
      coverImageUrl: prompt.coverImageUrl ?? '',
      coverImageAlt: prompt.coverImageAlt ?? '',
      seoTitle: prompt.seoTitle ?? '',
      seoDescription: prompt.seoDescription ?? '',
      isPremium: prompt.isPremium,
      isFeatured: prompt.isFeatured,
      isTrending: prompt.isTrending,
      isEditorsPick: prompt.isEditorsPick,
      isPublished: prompt.isPublished,
    });
  }, [existing.data]);

  // Default the category once the list loads, so a new prompt is valid immediately.
  useEffect(() => {
    const first = categories.data?.items[0];
    if (isNew && first && !form.categoryId) {
      setForm((prev) => ({ ...prev, categoryId: first.id }));
    }
  }, [categories.data, isNew, form.categoryId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    const payload = toPayload(form);
    const saved = await run(() =>
      isNew
        ? api.post<{ id: string }>('/v1/admin/prompts', payload)
        : api.put<{ id: string }>(`/v1/admin/prompts/${id}`, payload),
    );
    if (saved !== null) navigate('/prompts');
  }

  /**
   * Asks the API to generate a cover for this prompt.
   *
   * `force=true` because the button is only ever pressed deliberately — refusing
   * because a cover already exists would just make the operator delete the URL
   * first to get the same result.
   */
  async function generateCover() {
    setGeneratingCover(true);
    setCoverNote(null);
    const result = await run(() =>
      api.post<{ url: string; engine: string; usedReference: boolean }>(
        `/v1/admin/prompts/${id}/cover?force=true`,
      ),
    );
    setGeneratingCover(false);
    if (!result) return;
    set('coverImageUrl', result.url);
    set('coverImageAlt', `AI generated example output for ${form.title}`);
    setCoverNote(
      `Generated by ${result.engine}${result.usedReference ? ' using the house model' : ''}. Save the prompt to keep it.`,
    );
  }

  async function uploadCover(file: File) {
    setUploading(true);
    const form = new FormData();
    form.set('file', file);
    form.set('folder', 'prompts');
    const stored = await run(() => api.upload<{ url: string }>('/v1/admin/upload', form));
    setUploading(false);
    if (stored) set('coverImageUrl', stored.url);
  }

  if (!isNew && existing.loading && !existing.data) return <Spinner label="Loading prompt" />;
  if (!isNew && existing.error) return <Alert>{existing.error}</Alert>;

  return (
    <>
      <PageHeader
        title={isNew ? 'New prompt' : 'Edit prompt'}
        description="Premium prompt bodies are only released by the API to entitled members."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/prompts')}>
              Cancel
            </Button>
            <Button loading={pending} onClick={() => void submit()}>
              {isNew ? 'Create prompt' : 'Save changes'}
            </Button>
          </div>
        }
      />

      {error && <Alert>{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Content">
            <div className="space-y-4">
              <Field label="Title" error={fieldErrors.title}>
                <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
              </Field>

              <Field
                label="Slug"
                hint="Leave blank to generate from the title."
                error={fieldErrors.slug}
              >
                <Input value={form.slug} onChange={(e) => set('slug', e.target.value)} />
              </Field>

              <Field label="Short description" error={fieldErrors.shortDescription}>
                <Textarea
                  rows={2}
                  value={form.shortDescription}
                  onChange={(e) => set('shortDescription', e.target.value)}
                />
              </Field>

              <Field label="Prompt text" error={fieldErrors.promptText}>
                <Textarea
                  rows={8}
                  value={form.promptText}
                  onChange={(e) => set('promptText', e.target.value)}
                />
              </Field>

              <Field label="Negative prompt" error={fieldErrors.negativePrompt}>
                <Textarea
                  rows={3}
                  value={form.negativePrompt}
                  onChange={(e) => set('negativePrompt', e.target.value)}
                />
              </Field>

              <Field label="Usage instructions" error={fieldErrors.usageInstructions}>
                <Textarea
                  rows={4}
                  value={form.usageInstructions}
                  onChange={(e) => set('usageInstructions', e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card title="Attributes">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="AI model" error={fieldErrors.aiModel}>
                <Select value={form.aiModel} onChange={(e) => set('aiModel', e.target.value)}>
                  {AI_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Input mode"
                hint="Photo edit means the reader uploads their own face."
                error={fieldErrors.inputMode}
              >
                <Select value={form.inputMode} onChange={(e) => set('inputMode', e.target.value)}>
                  {INPUT_MODES.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Category" error={fieldErrors.categoryId}>
                <Select
                  value={form.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                >
                  <option value="">Select a category…</option>
                  {(categories.data?.items ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Style">
                <Select value={form.style} onChange={(e) => set('style', e.target.value)}>
                  <option value="">None</option>
                  {STYLES.map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Aspect ratio">
                <Select
                  value={form.aspectRatio}
                  onChange={(e) => set('aspectRatio', e.target.value)}
                >
                  {ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio.id} value={ratio.id}>
                      {ratio.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Gender">
                <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  {GENDERS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Difficulty">
                <Select
                  value={form.difficulty}
                  onChange={(e) => set('difficulty', e.target.value)}
                >
                  {DIFFICULTIES.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Age group">
                <Input value={form.ageGroup} onChange={(e) => set('ageGroup', e.target.value)} />
              </Field>

              <Field label="Location">
                <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
              </Field>

              <Field label="Camera style">
                <Input
                  value={form.cameraStyle}
                  onChange={(e) => set('cameraStyle', e.target.value)}
                />
              </Field>

              <Field label="Lighting">
                <Input value={form.lighting} onChange={(e) => set('lighting', e.target.value)} />
              </Field>

              <Field label="Mood">
                <Input value={form.mood} onChange={(e) => set('mood', e.target.value)} />
              </Field>

              <Field label="Tags" hint="Comma separated." error={fieldErrors.tags}>
                <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="SEO">
            <div className="space-y-4">
              <Field label="SEO title" error={fieldErrors.seoTitle}>
                <Input value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} />
              </Field>
              <Field label="Meta description" error={fieldErrors.seoDescription}>
                <Textarea
                  rows={2}
                  value={form.seoDescription}
                  onChange={(e) => set('seoDescription', e.target.value)}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Ordered by what an operator actually reaches for.
              Generation was originally last, below the URL and file fields, which
              on a laptop put it under the fold — so the card read as "paste a URL
              or upload a file" and the AI option looked as though it did not
              exist. It is now the first thing in the card, and the manual routes
              are the fallback they have become. */}
          <Card title="Cover image">
            <div className="space-y-4">
              {form.coverImageUrl ? (
                <img
                  src={form.coverImageUrl}
                  alt=""
                  className="aspect-[4/5] w-full rounded-lg border border-[var(--border-line)] object-cover"
                />
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-sunken)] px-3 py-3">
                  <MediaIcon size={20} className="shrink-0 text-[var(--text-muted)]" />
                  <p className="text-xs text-[var(--text-muted)]">
                    No cover yet — generate one below.
                  </p>
                </div>
              )}

              {/* Generation reads the prompt's stored columns to build its
                  instruction, so it needs a saved row — there is nothing to
                  describe on an unsaved draft. */}
              {id ? (
                <div className="space-y-2">
                  <Button
                    type="button"
                    className="w-full"
                    loading={generatingCover}
                    onClick={() => void generateCover()}
                  >
                    {form.coverImageUrl ? 'Regenerate cover with AI' : 'Generate cover with AI'}
                  </Button>
                  <p className="text-xs text-[var(--text-muted)]">
                    Built from this prompt&rsquo;s own scene, lighting and camera settings. The
                    subject is always an adult Indian person. Takes a few seconds.
                  </p>
                  {coverNote && (
                    <p className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2 text-xs text-[var(--text-body)]">
                      {coverNote}
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2 text-xs text-[var(--text-muted)]">
                  Save the prompt first, then a cover can be generated from it.
                </p>
              )}

              <div className="border-t border-[var(--border-line)] pt-4">
                <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Or set it manually
                </p>

                <Field label="Upload a file" hint="JPEG, PNG, WebP, AVIF or GIF up to 8 MB.">
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadCover(file);
                    }}
                  />
                </Field>

                {uploading && (
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">Uploading…</p>
                )}

                <div className="mt-3">
                  <Field label="Image URL" error={fieldErrors.coverImageUrl}>
                    <Input
                      value={form.coverImageUrl}
                      placeholder="https://…"
                      onChange={(e) => set('coverImageUrl', e.target.value)}
                    />
                  </Field>
                </div>
              </div>

              <Field label="Alt text" error={fieldErrors.coverImageAlt}>
                <Input
                  value={form.coverImageAlt}
                  onChange={(e) => set('coverImageAlt', e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card title="Visibility">
            <div className="space-y-3">
              <Checkbox
                label="Published"
                checked={form.isPublished}
                onChange={(e) => set('isPublished', e.target.checked)}
              />
              <Checkbox
                label="Premium only"
                checked={form.isPremium}
                onChange={(e) => set('isPremium', e.target.checked)}
              />
              <Checkbox
                label="Featured"
                checked={form.isFeatured}
                onChange={(e) => set('isFeatured', e.target.checked)}
              />
              <Checkbox
                label="Trending"
                checked={form.isTrending}
                onChange={(e) => set('isTrending', e.target.checked)}
              />
              <Checkbox
                label="Editor's pick"
                checked={form.isEditorsPick}
                onChange={(e) => set('isEditorsPick', e.target.checked)}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
