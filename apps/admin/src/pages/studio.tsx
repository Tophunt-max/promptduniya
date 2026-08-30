import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  cn,
} from '@/components/ui';
import { AI_MODELS, INPUT_MODES } from '@pd/shared';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/use-api';

/**
 * AI Studio — the content pipeline's control surface.
 *
 * One run does four things server-side: a language model writes a complete
 * prompt record, it is saved as a draft, an image model illustrates it, and it
 * is published or scheduled.
 *
 * The batch loop lives here in the browser rather than in the API on purpose.
 * Each item takes ten to twenty seconds, so a request that generated ten would
 * sit open for minutes and lose everything if it timed out. Looping client-side
 * means each item commits independently, progress is visible as it happens, and
 * a failure on item eight costs one item instead of the whole run.
 */

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
}

interface StudioStatus {
  text: { provider: string; workersAi: boolean; gemini: boolean; openai: boolean };
  image: { provider: string; workersAi: boolean; gemini: boolean; supportsReference: boolean };
  ready: boolean;
}

interface RunResult {
  promptId: string;
  slug: string;
  title: string;
  published: boolean;
  scheduledFor: number | null;
  coverUrl: string | null;
  coverError: string | null;
  textEngine: string;
  imageEngine: string | null;
}

type ItemState =
  | { status: 'pending'; theme: string }
  | { status: 'running'; theme: string }
  | { status: 'done'; theme: string; result: RunResult }
  | { status: 'failed'; theme: string; error: string };

const PUBLISH_MODES = [
  { id: 'publish', label: 'Publish immediately' },
  { id: 'draft', label: 'Save as draft' },
  { id: 'schedule', label: 'Schedule for tomorrow' },
] as const;

/** Splits the textarea into one theme per line, so a batch is just a list. */
function parseThemes(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 3)
    .slice(0, 25);
}

export function StudioPage() {
  const status = useQuery<StudioStatus>('/v1/admin/studio/status');
  const categories = useQuery<{ items: CategoryRow[] }>('/v1/admin/categories');

  const [themes, setThemes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [aiModel, setAiModel] = useState('gemini');
  const [inputMode, setInputMode] = useState('photo-edit');
  const [isPremium, setIsPremium] = useState(false);
  const [publishMode, setPublishMode] = useState<string>('publish');
  const [skipCover, setSkipCover] = useState(false);

  const [items, setItems] = useState<ItemState[]>([]);
  const [running, setRunning] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const categoryOptions = categories.data?.items ?? [];
  const parsed = parseThemes(themes);

  async function startRun() {
    const list = parseThemes(themes);
    if (list.length === 0 || !categoryId) return;

    setFatal(null);
    setRunning(true);
    setItems(list.map((theme) => ({ status: 'pending', theme })));

    for (let index = 0; index < list.length; index++) {
      const theme = list[index]!;
      setItems((current) =>
        current.map((item, i) => (i === index ? { status: 'running', theme } : item)),
      );

      try {
        const result = await api.post<RunResult>('/v1/admin/studio/run', {
          theme,
          categoryId,
          aiModel,
          inputMode,
          isPremium,
          publishMode,
          skipCover,
        });
        setItems((current) =>
          current.map((item, i) => (i === index ? { status: 'done', theme, result } : item)),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setItems((current) =>
          current.map((item, i) => (i === index ? { status: 'failed', theme, error: message } : item)),
        );
      }
    }

    setRunning(false);
  }

  const done = items.filter((item) => item.status === 'done').length;
  const failed = items.filter((item) => item.status === 'failed').length;

  return (
    <>
      <PageHeader
        title="AI Studio"
        description="Write a prompt, illustrate it, and publish it — one line of brief per prompt."
      />

      {status.loading && !status.data && <Spinner label="Checking providers" />}
      {status.error && <Alert>{status.error}</Alert>}
      {fatal && <Alert>{fatal}</Alert>}

      {status.data && !status.data.ready && (
        <Alert tone="warning">
          No provider is available. Bind Workers AI, or set AI_API_KEY / OPENAI_API_KEY.
        </Alert>
      )}

      {status.data && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <ProviderCard
            label="Prompt writer"
            active={status.data.text.provider}
            options={[
              { id: 'workers-ai', ready: status.data.text.workersAi, note: 'free, no key' },
              { id: 'gemini', ready: status.data.text.gemini, note: 'needs AI_API_KEY' },
              { id: 'openai', ready: status.data.text.openai, note: 'needs OPENAI_API_KEY' },
            ]}
          />
          <ProviderCard
            label="Image generator"
            active={status.data.image.provider}
            options={[
              { id: 'workers-ai', ready: status.data.image.workersAi, note: 'free, no key' },
              { id: 'gemini', ready: status.data.image.gemini, note: 'needs AI_API_KEY' },
            ]}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Briefs" description="One per line. Each line becomes one published prompt.">
            <Textarea
              rows={8}
              value={themes}
              disabled={running}
              placeholder={
                'Diwali rooftop portrait with diyas\nNavratri garba mid-spin in a teal chaniya choli\nMonsoon Mumbai street style at night'
              }
              onChange={(event) => setThemes(event.target.value)}
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {parsed.length} brief{parsed.length === 1 ? '' : 's'} · roughly{' '}
              {Math.max(1, Math.round((parsed.length * 15) / 60))} min to run
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void startRun()}
                loading={running}
                disabled={running || parsed.length === 0 || !categoryId || !status.data?.ready}
              >
                {running
                  ? `Generating ${done + failed + 1} of ${items.length}…`
                  : `Generate ${parsed.length || ''} prompt${parsed.length === 1 ? '' : 's'}`}
              </Button>
              {!categoryId && (
                <span className="text-xs text-[var(--text-muted)]">Pick a category first.</span>
              )}
            </div>
          </Card>

          {items.length > 0 && (
            <Card
              className="mt-4"
              title="Run"
              description={`${done} done · ${failed} failed · ${items.length} total`}
            >
              <ol className="space-y-2">
                {items.map((item, index) => (
                  <RunRow key={`${item.theme}-${index}`} item={item} />
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Settings">
            <div className="space-y-4">
              <Field label="Category">
                <Select
                  value={categoryId}
                  disabled={running}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Choose a category…</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Target AI model">
                <Select
                  value={aiModel}
                  disabled={running}
                  onChange={(event) => setAiModel(event.target.value)}
                >
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
              >
                <Select
                  value={inputMode}
                  disabled={running}
                  onChange={(event) => setInputMode(event.target.value)}
                >
                  {INPUT_MODES.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="When it is written">
                <Select
                  value={publishMode}
                  disabled={running}
                  onChange={(event) => setPublishMode(event.target.value)}
                >
                  {PUBLISH_MODES.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="space-y-2 border-t border-[var(--border-line)] pt-4">
                <Checkbox
                  label="Premium tier"
                  checked={isPremium}
                  disabled={running}
                  onChange={(event) => setIsPremium(event.target.checked)}
                />
                <Checkbox
                  label="Skip cover images"
                  checked={skipCover}
                  disabled={running}
                  onChange={(event) => setSkipCover(event.target.checked)}
                />
              </div>
            </div>
          </Card>

          <Card title="What a run does">
            <ol className="space-y-2.5 text-sm text-[var(--text-body)]">
              {[
                'A language model writes the full prompt — body, negatives, style, lighting, camera, tags.',
                'It is saved as a draft, so nothing is lost if the image step fails.',
                'An image model illustrates it. Every subject is an adult Indian person.',
                'It is published, scheduled, or left as a draft.',
              ].map((step, index) => (
                <li key={step} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-[0.625rem] font-bold">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

/* -------------------------------- Fragments ------------------------------- */

function ProviderCard({
  label,
  active,
  options,
}: {
  label: string;
  active: string;
  options: { id: string; ready: boolean; note: string }[];
}) {
  return (
    <div className="card p-4">
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {options.map((option) => (
          <li key={option.id} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={cn(
                'size-2 shrink-0 rounded-full',
                option.ready ? 'bg-emerald-500' : 'bg-[var(--border-strong)]',
              )}
            />
            <span
              className={cn(
                'font-medium',
                option.id === active
                  ? 'text-[var(--text-strong)]'
                  : 'text-[var(--text-muted)]',
              )}
            >
              {option.id}
            </span>
            {option.id === active && <Badge tone="brand">in use</Badge>}
            <span className="ml-auto text-xs text-[var(--text-muted)]">{option.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunRow({ item }: { item: ItemState }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-[var(--border-line)] p-2.5">
      {item.status === 'done' && item.result.coverUrl ? (
        <img
          src={item.result.coverUrl}
          alt=""
          className="size-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          className={cn(
            'grid size-14 shrink-0 place-items-center rounded-lg text-[0.625rem] font-bold uppercase',
            item.status === 'failed'
              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300'
              : 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
          )}
        >
          {item.status === 'running' ? '···' : item.status === 'failed' ? 'fail' : 'wait'}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {item.status === 'done' ? (
          <>
            <Link
              to={`/prompts/${item.result.promptId}`}
              className="text-sm font-semibold text-[var(--text-strong)] hover:text-brand-600"
            >
              {item.result.title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={item.result.published ? 'success' : 'neutral'}>
                {item.result.published
                  ? 'Published'
                  : item.result.scheduledFor
                    ? 'Scheduled'
                    : 'Draft'}
              </Badge>
              <span className="text-xs text-[var(--text-muted)]">{item.result.textEngine}</span>
              {item.result.imageEngine && (
                <span className="text-xs text-[var(--text-muted)]">
                  · {item.result.imageEngine}
                </span>
              )}
            </div>
            {item.result.coverError && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Saved without a cover: {item.result.coverError}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="truncate text-sm font-medium text-[var(--text-strong)]">{item.theme}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {item.status === 'running'
                ? 'Writing and illustrating…'
                : item.status === 'failed'
                  ? item.error
                  : 'Queued'}
            </p>
          </>
        )}
      </div>
    </li>
  );
}
