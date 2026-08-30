import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, qs } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';
import { CheckIcon, ClockIcon, PlayIcon, RadarIcon, RefreshIcon } from '@/components/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Cell,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Row,
  Select,
  Spinner,
  Table,
  Textarea,
  cn,
  formatDateTime,
  formatNumber,
} from '@/components/ui';

/**
 * AI Content Automation.
 *
 * The console for the unattended pipeline. The AI Studio next door is the manual
 * tool — type a theme, watch one prompt get written. This screen is about the
 * machine running without anyone watching, which needs a different set of
 * answers: is it on, when does it next run, what is waiting, what did it produce
 * overnight, and what went wrong.
 *
 * Five tabs rather than one long page. These are genuinely different tasks
 * performed at different times — configuring the schedule is a once-a-month job,
 * clearing the review queue is a daily one — and stacking them vertically buries
 * whichever one is not at the top. Tab state is local rather than in the URL
 * because none of these views is worth linking to or bookmarking.
 *
 * Everything reads from a single `/overview` call. The screen cannot render
 * usefully without all of it, so several parallel requests would only mean
 * several chances to show half a page.
 */

/* --------------------------------- Types ---------------------------------- */

interface AutomationConfig {
  enabled: boolean;
  postsPerDay: number;
  publishHours: number[];
  timezoneOffsetMinutes: number;
  publishMode: 'draft' | 'publish' | 'schedule';
  autoPublish: boolean;
  minQualityScore: number;
  duplicateThreshold: number;
  autoImages: boolean;
  autoSeo: boolean;
  autoCategory: boolean;
  autoTags: boolean;
  duplicateDetection: boolean;
  trendDiscovery: boolean;
  maxPerRun: number;
  runBudgetSeconds: number;
  maxAttempts: number;
  premiumRatio: number;
  photoEditRatio: number;
  defaultAiModel: string;
  logRetentionDays: number;
}

interface RunRecord {
  id: string;
  trigger: string;
  status: string;
  requested: number;
  queued: number;
  succeeded: number;
  failed: number;
  skipped: number;
  stopReason: string | null;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
}

interface Overview {
  config: AutomationConfig;
  providers: {
    // `model` is the resolved id, so this card can say what will actually run
    // rather than only which provider was picked.
    text: {
      provider: string;
      workersAi: boolean;
      gemini: boolean;
      openai: boolean;
      model: string;
    };
    image: {
      provider: string;
      workersAi: boolean;
      gemini: boolean;
      supportsReference: boolean;
      model: string;
    };
    ready: boolean;
  };
  queue: Record<string, number>;
  trends: Record<string, number>;
  pending: number;
  recentRuns: RunRecord[];
  logSummary: { info: number; warn: number; error: number };
  schedule: { inSlotNow: boolean; nextSlotAt: number | null; serverTime: number };
}

interface QueueItem {
  id: string;
  theme: string;
  status: string;
  source: string;
  attempts: number;
  maxAttempts: number;
  inputMode: string;
  isPremium: boolean;
  publishMode: string;
  scheduledFor: number | null;
  qualityScore: number | null;
  qualityReport: { summary?: string; failed?: string[] } | null;
  duplicateScore: number | null;
  textEngine: string | null;
  imageEngine: string | null;
  coverError: string | null;
  lastError: string | null;
  promptId: string | null;
  promptSlug: string | null;
  promptTitle: string | null;
  coverImageUrl: string | null;
  categoryName: string | null;
  createdAt: number;
}

interface TrendSignal {
  id: string;
  label: string;
  source: string;
  score: number;
  rationale: string | null;
  status: string;
  categoryName: string | null;
  createdAt: number;
}

interface LogLine {
  id: string;
  level: string;
  scope: string;
  message: string;
  provider: string | null;
  durationMs: number | null;
  createdAt: number;
}

interface Category {
  id: string;
  name: string;
}

interface Idea {
  theme: string;
  categoryId: string;
  categoryName: string;
  inputMode: string;
  isPremium: boolean;
  aiModel: string;
  rationale: string;
}

type Tab = 'controls' | 'queue' | 'trends' | 'runs' | 'logs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'queue', label: 'Queue' },
  { id: 'trends', label: 'Trends' },
  { id: 'runs', label: 'History' },
  { id: 'logs', label: 'Logs' },
];

/** Queue statuses in lifecycle order, with the tone each should read as. */
const STATUS_TONES: Record<string, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  queued: 'neutral',
  generating: 'brand',
  generated: 'brand',
  quality_check: 'brand',
  needs_review: 'warning',
  approved: 'success',
  scheduled: 'brand',
  published: 'success',
  failed: 'danger',
  cancelled: 'neutral',
  duplicate: 'warning',
};

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

/* ================================== Page ================================== */

export function AutomationPage() {
  const [tab, setTab] = useState<Tab>('controls');

  const overview = useQuery<Overview>('/v1/admin/automation/overview');

  if (overview.loading && !overview.data) return <Spinner label="Loading automation" />;
  if (overview.error) return <Alert>{overview.error}</Alert>;
  if (!overview.data) return <EmptyState>No automation data.</EmptyState>;

  const data = overview.data;

  return (
    <>
      <PageHeader
        title="AI Content Automation"
        description="Discovers trends, writes prompts, illustrates them, scores them, and publishes what passes — on a schedule, without anyone watching."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={data.config.enabled ? 'success' : 'neutral'}>
              {data.config.enabled ? 'Automation on' : 'Automation off'}
            </Badge>
            <Button variant="outline" size="sm" onClick={overview.reload}>
              <RefreshIcon size={15} />
              Refresh
            </Button>
          </div>
        }
      />

      <StatusStrip data={data} />

      <nav className="mb-4 mt-6 flex gap-1 overflow-x-auto border-b border-[var(--border-line)]">
        {TABS.map((entry) => {
          const count =
            entry.id === 'queue'
              ? (data.queue.needs_review ?? 0) + (data.queue.failed ?? 0)
              : entry.id === 'trends'
                ? (data.trends.new ?? 0)
                : entry.id === 'logs'
                  ? data.logSummary.error
                  : 0;

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                tab === entry.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-strong)]',
              )}
            >
              {entry.label}
              {count > 0 && (
                <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[0.6875rem] font-bold text-[var(--text-body)]">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === 'controls' && <ControlsTab data={data} onSaved={overview.reload} />}
      {tab === 'queue' && <QueueTab onChanged={overview.reload} />}
      {tab === 'trends' && <TrendsTab onChanged={overview.reload} />}
      {tab === 'runs' && <RunsTab />}
      {tab === 'logs' && <LogsTab />}
    </>
  );
}

/* ============================== Status strip ============================== */

function StatusStrip({ data }: { data: Overview }) {
  const { schedule, config, queue, providers } = data;

  const nextRun = schedule.nextSlotAt
    ? formatDateTime(schedule.nextSlotAt)
    : 'No slots configured';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Next scheduled run"
        value={schedule.inSlotNow ? 'Now' : nextRun}
        note={
          config.enabled
            ? `${config.publishHours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ')} · UTC${
                config.timezoneOffsetMinutes >= 0 ? '+' : '-'
              }${Math.floor(Math.abs(config.timezoneOffsetMinutes) / 60)}`
            : 'Automation is switched off'
        }
        icon={<ClockIcon size={16} />}
      />
      <Stat
        label="Waiting in queue"
        value={formatNumber(data.pending)}
        note={`${formatNumber(queue.needs_review ?? 0)} held for review · ${formatNumber(queue.failed ?? 0)} failed`}
      />
      <Stat
        label="Published by automation"
        value={formatNumber(queue.published ?? 0)}
        note={`${config.postsPerDay}/day cap · min score ${config.minQualityScore}`}
      />
      <Stat
        label="Providers"
        value={providers.ready ? 'Ready' : 'Not ready'}
        note={`text: ${providers.text.provider} · image: ${providers.image.provider}`}
        tone={providers.ready ? 'success' : 'danger'}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: React.ReactNode;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 truncate text-lg font-bold',
          tone === 'success'
            ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'danger'
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-[var(--text-strong)]',
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}

/* ================================ Controls ================================ */

function ControlsTab({ data, onSaved }: { data: Overview; onSaved(): void }) {
  const [form, setForm] = useState<AutomationConfig>(data.config);
  const [hoursText, setHoursText] = useState(data.config.publishHours.join(','));
  const save = useMutation();
  const process = useMutation();
  const [runResult, setRunResult] = useState<string | null>(null);

  const set = useCallback(
    <K extends keyof AutomationConfig>(key: K, value: AutomationConfig[K]) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const onSave = async () => {
    const saved = await save.run(() =>
      api.put<AutomationConfig>('/v1/admin/automation/config', {
        ...form,
        publishHours: hoursText,
      }),
    );
    if (saved) {
      setForm(saved);
      setHoursText(saved.publishHours.join(','));
      onSaved();
    }
  };

  const onProcessNow = async () => {
    setRunResult(null);
    const result = await process.run(() =>
      api.post<{ succeeded: number; failed: number; skipped: number; stopReason: string }>(
        '/v1/admin/automation/process',
        { topUp: true },
      ),
    );
    if (result) {
      setRunResult(
        `${result.succeeded} created, ${result.skipped} skipped as duplicates, ${result.failed} failed. ${result.stopReason}.`,
      );
      onSaved();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card
          title="Schedule"
          description="The worker wakes every hour. These hours decide which of those wake-ups generate, so the schedule changes here rather than in a deploy."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Checkbox
                label="Automation enabled"
                checked={form.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                When off, scheduled ticks do nothing. “Run now” below still works.
              </p>
            </div>

            <Field label="Posts per day" hint="A cap, not a target. Counted from local midnight.">
              <Input
                type="number"
                min={0}
                max={200}
                value={form.postsPerDay}
                onChange={(e) => set('postsPerDay', Number(e.target.value))}
              />
            </Field>

            <Field label="Generate at these hours" hint="Comma separated, 0-23. e.g. 9,13,18,21">
              <Input
                value={hoursText}
                onChange={(e) => setHoursText(e.target.value)}
                placeholder="9,13,18,21"
              />
            </Field>

            <Field label="Timezone offset (minutes)" hint="330 = IST. Sets the day boundary too.">
              <Input
                type="number"
                min={-840}
                max={840}
                value={form.timezoneOffsetMinutes}
                onChange={(e) => set('timezoneOffsetMinutes', Number(e.target.value))}
              />
            </Field>

            <Field label="Max items per run" hint="Ceiling for a single tick.">
              <Input
                type="number"
                min={1}
                max={50}
                value={form.maxPerRun}
                onChange={(e) => set('maxPerRun', Number(e.target.value))}
              />
            </Field>

            <Field
              label="Run time budget (seconds)"
              hint="A run stops here even if items remain, so a tick cannot overrun."
            >
              <Input
                type="number"
                min={10}
                max={600}
                value={form.runBudgetSeconds}
                onChange={(e) => set('runBudgetSeconds', Number(e.target.value))}
              />
            </Field>

            <Field label="Retries per item" hint="Then it lands in the queue as failed.">
              <Input
                type="number"
                min={1}
                max={10}
                value={form.maxAttempts}
                onChange={(e) => set('maxAttempts', Number(e.target.value))}
              />
            </Field>
          </div>
        </Card>

        <Card
          title="Quality gates"
          description="What has to be true before a generated post reaches the public site."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Minimum quality score"
              hint="Below this, the prompt is saved as a draft and held for review instead of publishing."
            >
              <Input
                type="number"
                min={0}
                max={100}
                value={form.minQualityScore}
                onChange={(e) => set('minQualityScore', Number(e.target.value))}
              />
            </Field>

            <Field
              label="Duplicate threshold (%)"
              hint="Similarity to an existing prompt at which a new one is rejected."
            >
              <Input
                type="number"
                min={50}
                max={100}
                value={form.duplicateThreshold}
                onChange={(e) => set('duplicateThreshold', Number(e.target.value))}
              />
            </Field>

            <div className="space-y-2.5 sm:col-span-2">
              <Checkbox
                label="Auto-publish posts that pass"
                checked={form.autoPublish}
                onChange={(e) => set('autoPublish', e.target.checked)}
              />
              <Checkbox
                label="Duplicate detection"
                checked={form.duplicateDetection}
                onChange={(e) => set('duplicateDetection', e.target.checked)}
              />
              <Checkbox
                label="Generate example images"
                checked={form.autoImages}
                onChange={(e) => set('autoImages', e.target.checked)}
              />
              <Checkbox
                label="Trend discovery"
                checked={form.trendDiscovery}
                onChange={(e) => set('trendDiscovery', e.target.checked)}
              />
              <Checkbox
                label="Route to categories automatically"
                checked={form.autoCategory}
                onChange={(e) => set('autoCategory', e.target.checked)}
              />
            </div>

            <Field label="When auto-publish is on, passing posts should">
              <Select
                value={form.publishMode}
                onChange={(e) =>
                  set('publishMode', e.target.value as AutomationConfig['publishMode'])
                }
              >
                <option value="draft">stay as drafts</option>
                <option value="publish">publish immediately</option>
                <option value="schedule">be scheduled for tomorrow</option>
              </Select>
            </Field>

            <Field label="Log retention (days)">
              <Input
                type="number"
                min={1}
                max={365}
                value={form.logRetentionDays}
                onChange={(e) => set('logRetentionDays', Number(e.target.value))}
              />
            </Field>
          </div>
        </Card>

        <Card title="Content mix" description="How generated posts are spread across the catalogue.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Premium share (%)" hint="Spread evenly through each batch, not at random.">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.premiumRatio}
                onChange={(e) => set('premiumRatio', Number(e.target.value))}
              />
            </Field>
            <Field label="Photo-edit share (%)" hint="The rest are text-to-image prompts.">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.photoEditRatio}
                onChange={(e) => set('photoEditRatio', Number(e.target.value))}
              />
            </Field>
          </div>
        </Card>

        {save.error && <Alert>{save.error}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSave} loading={save.pending}>
            <CheckIcon size={15} />
            Save configuration
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setForm(data.config);
              setHoursText(data.config.publishHours.join(','));
            }}
          >
            Discard changes
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card
          title="Run now"
          description="Ignores the enabled flag and the schedule, so you can test a change without waiting for the next hour."
        >
          <Button onClick={onProcessNow} loading={process.pending} className="w-full">
            <PlayIcon size={15} />
            Generate now
          </Button>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Tops the queue up from trends first, then works through it until the time budget runs
            out. Expect this to take a minute or two per post.
          </p>
          {process.error && (
            <div className="mt-3">
              <Alert>{process.error}</Alert>
            </div>
          )}
          {runResult && (
            <div className="mt-3">
              <Alert tone="success">{runResult}</Alert>
            </div>
          )}
        </Card>

        <EnqueueCard onQueued={onSaved} config={data.config} />

        <Card
          title="Providers"
          actions={
            <Link
              to="/ai-providers"
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              Keys and models
            </Link>
          }
        >
          <ProviderList
            label="Text"
            active={data.providers.text.provider}
            model={data.providers.text.model}
            options={[
              { id: 'workers-ai', ready: data.providers.text.workersAi },
              { id: 'gemini', ready: data.providers.text.gemini },
              { id: 'openai', ready: data.providers.text.openai },
            ]}
          />
          <div className="mt-3">
            <ProviderList
              label="Image"
              active={data.providers.image.provider}
              model={data.providers.image.model}
              options={[
                { id: 'workers-ai', ready: data.providers.image.workersAi },
                { id: 'gemini', ready: data.providers.image.gemini },
              ]}
            />
          </div>
          {!data.providers.ready && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
              No usable provider. Add a key on the AI providers screen.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function ProviderList({
  label,
  active,
  model,
  options,
}: {
  label: string;
  active: string;
  /** The resolved model id, so the card says what will actually run. */
  model?: string;
  options: { id: string; ready: boolean }[];
}) {
  return (
    <div>
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
        {model && (
          <span className="ml-1.5 font-mono text-[0.625rem] normal-case tracking-normal opacity-80">
            {model}
          </span>
        )}
      </p>
      <ul className="mt-1.5 space-y-1">
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
                option.id === active ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]',
              )}
            >
              {option.id}
            </span>
            {option.id === active && <Badge tone="brand">in use</Badge>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------ Manual enqueue ---------------------------- */

/**
 * Queue briefs by hand, or let the model propose them.
 *
 * The preview step is the point: rejecting a weak theme here costs nothing,
 * whereas discovering it after the pipeline has written a prompt and drawn an
 * image costs a model call and an image quota.
 */
function EnqueueCard({ onQueued, config }: { onQueued(): void; config: AutomationConfig }) {
  const categories = useQuery<{ items: Category[] } | Category[]>('/v1/admin/categories');
  const [themes, setThemes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [seed, setSeed] = useState('');
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const enqueue = useMutation();
  const suggest = useMutation();
  const [notice, setNotice] = useState<string | null>(null);

  const list = Array.isArray(categories.data)
    ? categories.data
    : (categories.data?.items ?? []);

  const onSuggest = async () => {
    setNotice(null);
    const result = await suggest.run(() =>
      api.post<{ ideas: Idea[] }>('/v1/admin/automation/ideas', {
        count: 10,
        seed: seed || undefined,
        useTrends: !seed,
      }),
    );
    if (result) setIdeas(result.ideas);
  };

  const onQueue = async (payloadThemes: string[], useCategory: string) => {
    setNotice(null);
    const result = await enqueue.run(() =>
      api.post<{ queued: number }>('/v1/admin/automation/queue', {
        themes: payloadThemes,
        categoryId: useCategory,
        aiModel: config.defaultAiModel,
        publishMode: 'draft',
      }),
    );
    if (result) {
      setNotice(`Queued ${result.queued} item(s).`);
      setThemes('');
      setIdeas(null);
      onQueued();
    }
  };

  const manualThemes = themes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <Card title="Queue work" description="Add briefs directly, or ask for suggestions first.">
      <div className="space-y-3">
        <Field label="Seed topic (optional)" hint="Leave empty to draw on discovered trends.">
          <Input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="monsoon fashion"
          />
        </Field>

        <Button variant="outline" onClick={onSuggest} loading={suggest.pending} className="w-full">
          <RadarIcon size={15} />
          Suggest 10 ideas
        </Button>

        {suggest.error && <Alert>{suggest.error}</Alert>}

        {ideas && ideas.length > 0 && (
          <div className="rounded-lg border border-[var(--border-line)] p-2.5">
            <ol className="space-y-1.5">
              {ideas.map((idea, index) => (
                <li key={`${idea.theme}-${index}`} className="text-sm">
                  <p className="font-medium text-[var(--text-strong)]">{idea.theme}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {idea.categoryName} · {idea.inputMode}
                    {idea.isPremium && ' · premium'}
                  </p>
                </li>
              ))}
            </ol>
            <Button
              size="sm"
              className="mt-2.5 w-full"
              loading={enqueue.pending}
              onClick={() =>
                onQueue(
                  ideas.map((idea) => idea.theme),
                  ideas[0]!.categoryId,
                )
              }
            >
              Queue all {ideas.length}
            </Button>
          </div>
        )}

        <Field label="Or type themes, one per line">
          <Textarea
            rows={4}
            value={themes}
            onChange={(e) => setThemes(e.target.value)}
            placeholder={'Diwali rooftop couple portraits\nBanarasi saree studio portrait'}
          />
        </Field>

        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose a category…</option>
            {list.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        {enqueue.error && <Alert>{enqueue.error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        <Button
          className="w-full"
          disabled={manualThemes.length === 0 || !categoryId}
          loading={enqueue.pending}
          onClick={() => onQueue(manualThemes, categoryId)}
        >
          Queue {manualThemes.length || ''} item{manualThemes.length === 1 ? '' : 's'}
        </Button>
      </div>
    </Card>
  );
}

/* ================================== Queue ================================= */

const QUEUE_FILTERS = [
  '',
  'queued',
  'needs_review',
  'published',
  'scheduled',
  'duplicate',
  'failed',
  'cancelled',
] as const;

function QueueTab({ onChanged }: { onChanged(): void }) {
  const [status, setStatus] = useState<string>('');
  const queue = useQuery<{ items: QueueItem[]; total: number }>(
    `/v1/admin/automation/queue${qs({ status: status || undefined, pageSize: 50 })}`,
    [status],
  );
  const action = useMutation();

  const act = async (id: string, verb: 'retry' | 'cancel' | 'approve', body?: unknown) => {
    const ok = await action.run(() =>
      api.post(`/v1/admin/automation/queue/${id}/${verb}`, body ?? {}),
    );
    if (ok) {
      queue.reload();
      onChanged();
    }
  };

  return (
    <Card
      title="Content queue"
      description="Every post the system intends to create. A row survives a closed tab, a failed provider and a redeploy — which is what makes a run resumable."
      actions={
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-auto min-w-40"
        >
          {QUEUE_FILTERS.map((value) => (
            <option key={value || 'all'} value={value}>
              {value ? statusLabel(value) : 'All statuses'}
            </option>
          ))}
        </Select>
      }
    >
      {action.error && (
        <div className="mb-3">
          <Alert>{action.error}</Alert>
        </div>
      )}

      {queue.loading && !queue.data ? (
        <Spinner label="Loading queue" />
      ) : queue.error ? (
        <Alert>{queue.error}</Alert>
      ) : !queue.data || queue.data.items.length === 0 ? (
        <EmptyState>Nothing in the queue. Add briefs from the Controls tab.</EmptyState>
      ) : (
        <Table head={['Item', 'Status', 'Score', 'Engines', 'Created', '']}>
          {queue.data.items.map((item) => (
            <Row key={item.id}>
              <Cell>
                <div className="flex items-start gap-2.5">
                  {item.coverImageUrl ? (
                    <img
                      src={item.coverImageUrl}
                      alt=""
                      className="size-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-sunken)] text-[0.5625rem] font-bold uppercase text-[var(--text-muted)]">
                      {item.status === 'generating' ? '···' : '—'}
                    </span>
                  )}
                  <div className="min-w-0">
                    {item.promptId ? (
                      <Link
                        to={`/prompts/${item.promptId}`}
                        className="text-sm font-semibold text-[var(--text-strong)] hover:text-brand-600"
                      >
                        {item.promptTitle ?? item.theme}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-[var(--text-strong)]">{item.theme}</p>
                    )}
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {item.categoryName ?? '—'} · {item.inputMode} · {item.source}
                      {item.isPremium && ' · premium'}
                    </p>
                    {item.lastError && (
                      <p className="mt-1 max-w-md text-xs text-amber-600 dark:text-amber-400">
                        {item.lastError}
                      </p>
                    )}
                    {item.coverError && (
                      <p className="mt-1 max-w-md text-xs text-amber-600 dark:text-amber-400">
                        No cover: {item.coverError}
                      </p>
                    )}
                  </div>
                </div>
              </Cell>
              <Cell>
                <Badge tone={STATUS_TONES[item.status] ?? 'neutral'}>
                  {statusLabel(item.status)}
                </Badge>
                {item.attempts > 1 && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    attempt {item.attempts}/{item.maxAttempts}
                  </p>
                )}
              </Cell>
              <Cell>
                {item.qualityScore === null ? (
                  <span className="text-[var(--text-muted)]">—</span>
                ) : (
                  <span
                    className={cn(
                      'font-bold',
                      item.qualityScore >= 80
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : item.qualityScore >= 60
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400',
                    )}
                    title={item.qualityReport?.failed?.join('; ')}
                  >
                    {item.qualityScore}
                  </span>
                )}
                {item.duplicateScore !== null && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {Math.round(item.duplicateScore)}% dup
                  </p>
                )}
              </Cell>
              <Cell className="text-xs">
                {item.textEngine ?? '—'}
                {item.imageEngine && (
                  <>
                    <br />
                    {item.imageEngine}
                  </>
                )}
              </Cell>
              <Cell className="text-xs whitespace-nowrap">{formatDateTime(item.createdAt)}</Cell>
              <Cell>
                <div className="flex justify-end gap-1.5">
                  {item.status === 'needs_review' && item.promptId && (
                    <Button
                      size="sm"
                      onClick={() => act(item.id, 'approve', { publishMode: 'publish' })}
                    >
                      Publish
                    </Button>
                  )}
                  {(item.status === 'failed' || item.status === 'cancelled') && (
                    <Button variant="outline" size="sm" onClick={() => act(item.id, 'retry')}>
                      Retry
                    </Button>
                  )}
                  {(item.status === 'queued' || item.status === 'needs_review') && (
                    <Button variant="ghost" size="sm" onClick={() => act(item.id, 'cancel')}>
                      Cancel
                    </Button>
                  )}
                </div>
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}

/* ================================== Trends ================================ */

function TrendsTab({ onChanged }: { onChanged(): void }) {
  const [status, setStatus] = useState('new');
  const trends = useQuery<{ items: TrendSignal[] }>(
    `/v1/admin/automation/trends${qs({ status: status || undefined, pageSize: 50 })}`,
    [status],
  );
  const discover = useMutation();
  const dismiss = useMutation();
  const [notice, setNotice] = useState<string | null>(null);

  const onDiscover = async () => {
    setNotice(null);
    const result = await discover.run(() =>
      api.post<{ discovered: number; stored: number; aiUsed: boolean }>(
        '/v1/admin/automation/trends/discover',
        {},
      ),
    );
    if (result) {
      setNotice(
        `Found ${result.discovered} signal(s), ${result.stored} new.${
          result.aiUsed ? '' : ' The language model was unavailable, so only internal signals were mined.'
        }`,
      );
      trends.reload();
      onChanged();
    }
  };

  return (
    <Card
      title="Trend signals"
      description="Topics worth writing about, mined from your own search log, engagement data and the festival calendar, then expanded by a language model."
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-auto min-w-32"
          >
            <option value="new">New</option>
            <option value="used">Used</option>
            <option value="dismissed">Dismissed</option>
            <option value="">All</option>
          </Select>
          <Button size="sm" onClick={onDiscover} loading={discover.pending}>
            <RadarIcon size={15} />
            Discover
          </Button>
        </div>
      }
    >
      {discover.error && (
        <div className="mb-3">
          <Alert>{discover.error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-3">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      {trends.loading && !trends.data ? (
        <Spinner label="Loading signals" />
      ) : trends.error ? (
        <Alert>{trends.error}</Alert>
      ) : !trends.data || trends.data.items.length === 0 ? (
        <EmptyState>No signals yet. Press Discover to scan.</EmptyState>
      ) : (
        <Table head={['Topic', 'Source', 'Score', 'Category', '']}>
          {trends.data.items.map((signal) => (
            <Row key={signal.id}>
              <Cell>
                <p className="text-sm font-medium text-[var(--text-strong)]">{signal.label}</p>
                {signal.rationale && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{signal.rationale}</p>
                )}
              </Cell>
              <Cell>
                <Badge tone={signal.source === 'search' ? 'brand' : 'neutral'}>
                  {signal.source}
                </Badge>
              </Cell>
              <Cell className="font-bold">{Math.round(signal.score)}</Cell>
              <Cell className="text-xs">{signal.categoryName ?? '—'}</Cell>
              <Cell>
                {signal.status === 'new' && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={dismiss.pending}
                      onClick={async () => {
                        const ok = await dismiss.run(() =>
                          api.post(`/v1/admin/automation/trends/${signal.id}/dismiss`, {}),
                        );
                        if (ok) {
                          trends.reload();
                          onChanged();
                        }
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}

/* =================================== Runs ================================= */

const RUN_TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'brand'> = {
  running: 'brand',
  completed: 'success',
  partial: 'warning',
  failed: 'danger',
  skipped: 'neutral',
};

function RunsTab() {
  const runs = useQuery<{ items: RunRecord[] }>('/v1/admin/automation/runs?pageSize=40');

  return (
    <Card
      title="Generation history"
      description="One row per cycle, so six posts appearing overnight can be told apart from four cycles that mostly failed."
    >
      {runs.loading && !runs.data ? (
        <Spinner label="Loading history" />
      ) : runs.error ? (
        <Alert>{runs.error}</Alert>
      ) : !runs.data || runs.data.items.length === 0 ? (
        <EmptyState>No runs yet.</EmptyState>
      ) : (
        <Table head={['Started', 'Trigger', 'Status', 'Created', 'Skipped', 'Failed', 'Outcome']}>
          {runs.data.items.map((run) => (
            <Row key={run.id}>
              <Cell className="whitespace-nowrap text-xs">{formatDateTime(run.startedAt)}</Cell>
              <Cell>
                <Badge tone={run.trigger === 'cron' ? 'neutral' : 'brand'}>{run.trigger}</Badge>
              </Cell>
              <Cell>
                <Badge tone={RUN_TONES[run.status] ?? 'neutral'}>{run.status}</Badge>
              </Cell>
              <Cell className="font-bold text-emerald-600 dark:text-emerald-400">
                {run.succeeded}
              </Cell>
              <Cell>{run.skipped}</Cell>
              <Cell className={run.failed > 0 ? 'font-bold text-rose-600 dark:text-rose-400' : ''}>
                {run.failed}
              </Cell>
              <Cell className="text-xs">
                {run.stopReason ?? '—'}
                {run.durationMs !== null && (
                  <span className="text-[var(--text-muted)]">
                    {' '}
                    ({Math.round(run.durationMs / 1000)}s)
                  </span>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}

/* =================================== Logs ================================= */

const LEVEL_TONES: Record<string, 'neutral' | 'warning' | 'danger'> = {
  info: 'neutral',
  warn: 'warning',
  error: 'danger',
};

function LogsTab() {
  const [level, setLevel] = useState('');
  const logs = useQuery<{ items: LogLine[] }>(
    `/v1/admin/automation/logs${qs({ level: level || undefined, pageSize: 80 })}`,
    [level],
  );

  return (
    <Card
      title="Automation log"
      description="What the machine did, including the parts that failed. Separate from the audit log, which records what people did."
      actions={
        <Select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="w-auto min-w-32"
        >
          <option value="">All levels</option>
          <option value="error">Errors</option>
          <option value="warn">Warnings</option>
          <option value="info">Info</option>
        </Select>
      }
    >
      {logs.loading && !logs.data ? (
        <Spinner label="Loading log" />
      ) : logs.error ? (
        <Alert>{logs.error}</Alert>
      ) : !logs.data || logs.data.items.length === 0 ? (
        <EmptyState>Nothing logged yet.</EmptyState>
      ) : (
        <Table head={['When', 'Level', 'Scope', 'Message', 'Provider']}>
          {logs.data.items.map((line) => (
            <Row key={line.id}>
              <Cell className="whitespace-nowrap text-xs">{formatDateTime(line.createdAt)}</Cell>
              <Cell>
                <Badge tone={LEVEL_TONES[line.level] ?? 'neutral'}>{line.level}</Badge>
              </Cell>
              <Cell className="text-xs">{line.scope}</Cell>
              <Cell className="text-xs">{line.message}</Cell>
              <Cell className="text-xs whitespace-nowrap">
                {line.provider ?? '—'}
                {line.durationMs !== null && (
                  <span className="text-[var(--text-muted)]">
                    {' '}
                    {Math.round(line.durationMs / 1000)}s
                  </span>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}
