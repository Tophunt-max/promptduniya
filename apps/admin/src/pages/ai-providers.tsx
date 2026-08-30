import { useEffect, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  cn,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

/**
 * AI providers.
 *
 * The gap this fills: none of it was reachable. Provider choice lived in
 * `wrangler.jsonc` vars, API keys were Worker secrets set through the `wrangler`
 * CLI, and every model id was a string literal inside the engine that used it. So
 * switching from Workers AI to Gemini meant editing a config file and redeploying,
 * entering a key meant having the CLI and the account, and changing model meant a
 * code change.
 *
 * Three things this screen has to be careful about:
 *
 *   secrets   A key is write-only. The API returns whether one exists, where it
 *             came from, and its last four characters — never the value. So the
 *             input starts empty on every load and an empty input means "leave it
 *             alone", which has to be said out loud or it reads as "no key set".
 *   source    A key saved here overrides the deployed secret. The screen names
 *             which one is live, because the alternative is an operator pasting a
 *             key, seeing it accepted, and nothing changing.
 *   models    Free text with presets as buttons, not a dropdown. Providers retire
 *             models on their own schedule — this codebase already lost time to a
 *             pinned Workers AI model being deprecated — so being able to type
 *             today's id matters more than being protected from typos.
 */

interface ModelPreset {
  id: string;
  label: string;
  note?: string;
}

interface KeyState {
  configured: boolean;
  source: 'settings' | 'environment' | 'none';
  hint: string | null;
}

interface AiStatus {
  textProvider: string;
  imageProvider: string;
  generatorProvider: string;
  models: {
    geminiText: string;
    openaiText: string;
    workersText: string[];
    geminiImage: string;
    workersImage: string;
  };
  keys: { gemini: KeyState; openai: KeyState };
  readiness: { workersAi: boolean; gemini: boolean; openai: boolean };
  ready: boolean;
  supportsReferenceImages: boolean;
  presets: {
    text: Record<string, ModelPreset[]>;
    image: Record<string, ModelPreset[]>;
  };
}

interface TestResult {
  provider: string;
  ok: boolean;
  model: string;
  durationMs: number;
  reply?: string;
  error?: string;
}

const TEXT_PROVIDER_NOTES: Record<string, string> = {
  'workers-ai': 'No key needed. 10,000 free Neurons a day, resets at 00:00 UTC.',
  gemini: 'Best at holding to the JSON contract the pipeline parses. Free key at aistudio.google.com/apikey.',
  openai: 'Reliable and paid from the first request.',
};

const IMAGE_PROVIDER_NOTES: Record<string, string> = {
  'workers-ai': 'FLUX on Cloudflare. No key, but text-to-image only — it cannot preserve an uploaded face.',
  gemini: 'The only option that accepts a reference face, so photo-edit covers need this.',
  none: 'Covers are never generated. Prompts still save; they just have no example image.',
};

export function AiProvidersPage() {
  const status = useQuery<AiStatus>('/v1/admin/ai-config');
  const save = useMutation();
  const test = useMutation();

  const [form, setForm] = useState({
    textProvider: '',
    imageProvider: '',
    generatorProvider: '',
    geminiTextModel: '',
    openaiTextModel: '',
    workersTextModels: '',
    geminiImageModel: '',
    workersImageModel: '',
  });
  // Kept apart from the rest of the form: these are never populated from the
  // server, and an empty value means "unchanged" rather than "clear".
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const data = status.data;
    if (!data) return;
    setForm({
      textProvider: data.textProvider,
      imageProvider: data.imageProvider,
      generatorProvider: data.generatorProvider,
      geminiTextModel: data.models.geminiText,
      openaiTextModel: data.models.openaiText,
      workersTextModels: data.models.workersText.join(', '),
      geminiImageModel: data.models.geminiImage,
      workersImageModel: data.models.workersImage,
    });
  }, [status.data]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    const payload: Record<string, string> = { ...form };
    // Only send a key when one was typed. Sending '' would clear it.
    if (geminiKey.trim()) payload.geminiApiKey = geminiKey.trim();
    if (openaiKey.trim()) payload.openaiApiKey = openaiKey.trim();

    const result = await save.run(() => api.put<AiStatus>('/v1/admin/ai-config', payload));
    if (result) {
      setGeminiKey('');
      setOpenaiKey('');
      setSaved(true);
      setResults({});
      status.reload();
      setTimeout(() => setSaved(false), 4000);
    }
  }

  /** Explicitly drops a stored key so the deployed secret takes over again. */
  async function clearKey(which: 'gemini' | 'openai') {
    if (
      !window.confirm(
        `Remove the ${which} key stored here? The deployed environment secret will be used instead, if there is one.`,
      )
    ) {
      return;
    }
    const result = await save.run(() =>
      api.put<AiStatus>('/v1/admin/ai-config', {
        [which === 'gemini' ? 'geminiApiKey' : 'openaiApiKey']: '',
      }),
    );
    if (result) status.reload();
  }

  async function runTest(provider: string) {
    const result = await test.run(() =>
      api.post<TestResult>('/v1/admin/ai-config/test', { provider }),
    );
    if (result) setResults((prev) => ({ ...prev, [provider]: result }));
  }

  if (status.loading && !status.data) return <Spinner label="Loading provider settings" />;
  if (status.error) return <Alert>{status.error}</Alert>;
  if (!status.data) return <Alert>No provider configuration returned.</Alert>;

  const data = status.data;

  return (
    <>
      <PageHeader
        title="AI providers"
        description="Which service writes the prompts and draws the covers, which model each one uses, and the API keys they need."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={data.ready ? 'success' : 'danger'}>
              {data.ready ? 'Ready to generate' : 'Not ready'}
            </Badge>
            <Button loading={save.pending} onClick={() => void submit()}>
              Save changes
            </Button>
          </div>
        }
      />

      {save.error && <Alert>{save.error}</Alert>}
      {saved && <Alert tone="success">Saved. New settings apply to the next generation.</Alert>}

      {!data.ready && (
        <div className="mb-4">
          <Alert tone="warning">
            The selected providers cannot run yet. Add a key below, or switch the text provider to
            Workers AI, which needs none.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* -------------------------------- Keys -------------------------------- */}
          <Card
            title="API keys"
            description="Stored encrypted at rest and never sent back to this screen. Leave a field empty to keep the existing key."
          >
            <div className="space-y-5">
              <KeyRow
                label="Google Gemini"
                help="Free key from aistudio.google.com/apikey — no card required."
                state={data.keys.gemini}
                value={geminiKey}
                onChange={setGeminiKey}
                onClear={() => void clearKey('gemini')}
                pending={save.pending}
              />
              <div className="border-t border-[var(--border-line)]" />
              <KeyRow
                label="OpenAI"
                help="From platform.openai.com/api-keys. Billed per request."
                state={data.keys.openai}
                value={openaiKey}
                onChange={setOpenaiKey}
                onClear={() => void clearKey('openai')}
                pending={save.pending}
              />
            </div>
          </Card>

          {/* ------------------------------ Text model ---------------------------- */}
          <Card
            title="Prompt writing"
            description="Writes prompt bodies, trend ideas and SEO metadata. The other providers act as fallbacks when the chosen one hits a quota."
          >
            <div className="space-y-4">
              <Field label="Provider" hint={TEXT_PROVIDER_NOTES[form.textProvider]}>
                <Select
                  value={form.textProvider}
                  onChange={(event) => set('textProvider', event.target.value)}
                >
                  <option value="workers-ai">Workers AI — no key needed</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                </Select>
              </Field>

              {form.textProvider === 'gemini' && (
                <ModelField
                  label="Gemini model"
                  value={form.geminiTextModel}
                  onChange={(value) => set('geminiTextModel', value)}
                  presets={data.presets.text.gemini ?? []}
                />
              )}

              {form.textProvider === 'openai' && (
                <ModelField
                  label="OpenAI model"
                  value={form.openaiTextModel}
                  onChange={(value) => set('openaiTextModel', value)}
                  presets={data.presets.text.openai ?? []}
                />
              )}

              {form.textProvider === 'workers-ai' && (
                <ModelField
                  label="Workers AI models"
                  hint="Comma separated and tried in order. Cloudflare retires models without notice, so a chain survives a deprecation without a code change."
                  value={form.workersTextModels}
                  onChange={(value) => set('workersTextModels', value)}
                  presets={data.presets.text['workers-ai'] ?? []}
                  appendPresets
                />
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-line)] pt-4">
                <p className="mr-1 text-sm text-[var(--text-muted)]">Check it works:</p>
                {(['workers-ai', 'gemini', 'openai'] as const).map((provider) => (
                  <Button
                    key={provider}
                    variant="outline"
                    size="sm"
                    loading={test.pending}
                    onClick={() => void runTest(provider)}
                  >
                    Test {provider}
                  </Button>
                ))}
              </div>

              {Object.values(results).map((result) => (
                <div
                  key={result.provider}
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs',
                    result.ok
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
                  )}
                >
                  <p className="font-semibold">
                    {result.provider} · {result.model} · {result.durationMs}ms{' '}
                    {result.ok ? 'replied' : 'failed'}
                  </p>
                  {result.error && <p className="mt-0.5">{result.error}</p>}
                  {result.ok && result.reply && (
                    <p className="mt-0.5 font-mono opacity-80">{result.reply}</p>
                  )}
                </div>
              ))}

              {test.error && <Alert>{test.error}</Alert>}
            </div>
          </Card>

          {/* ----------------------------- Image model ---------------------------- */}
          <Card
            title="Cover images"
            description="Draws the example image on each prompt page."
          >
            <div className="space-y-4">
              <Field label="Provider" hint={IMAGE_PROVIDER_NOTES[form.imageProvider]}>
                <Select
                  value={form.imageProvider}
                  onChange={(event) => set('imageProvider', event.target.value)}
                >
                  <option value="workers-ai">Workers AI — no key needed</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="none">Off</option>
                </Select>
              </Field>

              {form.imageProvider === 'gemini' && (
                <ModelField
                  label="Gemini image model"
                  value={form.geminiImageModel}
                  onChange={(value) => set('geminiImageModel', value)}
                  presets={data.presets.image.gemini ?? []}
                />
              )}

              {form.imageProvider === 'workers-ai' && (
                <ModelField
                  label="Workers AI image model"
                  value={form.workersImageModel}
                  onChange={(value) => set('workersImageModel', value)}
                  presets={data.presets.image['workers-ai'] ?? []}
                />
              )}

              {form.imageProvider === 'workers-ai' && (
                <Alert tone="warning">
                  Workers AI cannot preserve an uploaded face, so photo-edit prompts will get a
                  generic cover. Choose Gemini if identity-preserving covers matter.
                </Alert>
              )}
            </div>
          </Card>

          {/* --------------------------- Public generator -------------------------- */}
          <Card
            title="Public prompt generator"
            description="The generator visitors use on the website. Separate from the studio, because this one runs on visitor traffic and the cost scales with it."
          >
            <Field
              label="Engine"
              hint={
                form.generatorProvider === 'template'
                  ? 'Built-in templates. Free, instant, no provider quota — and the safe default for public traffic.'
                  : 'Every visitor request spends a Gemini call. Watch the quota.'
              }
            >
              <Select
                value={form.generatorProvider}
                onChange={(event) => set('generatorProvider', event.target.value)}
              >
                <option value="template">Built-in templates — free</option>
                <option value="gemini">Google Gemini</option>
              </Select>
            </Field>
          </Card>

          <div className="flex justify-end">
            <Button loading={save.pending} onClick={() => void submit()}>
              Save changes
            </Button>
          </div>
        </div>

        {/* -------------------------------- Sidebar ------------------------------- */}
        <div className="space-y-4">
          <Card title="Availability">
            <ul className="space-y-2">
              <ReadyRow
                label="Workers AI"
                ready={data.readiness.workersAi}
                detail={data.readiness.workersAi ? 'Binding present' : 'Not bound to the Worker'}
              />
              <ReadyRow
                label="Gemini"
                ready={data.readiness.gemini}
                detail={
                  data.keys.gemini.configured
                    ? `Key ${data.keys.gemini.hint} (${data.keys.gemini.source})`
                    : 'No key'
                }
              />
              <ReadyRow
                label="OpenAI"
                ready={data.readiness.openai}
                detail={
                  data.keys.openai.configured
                    ? `Key ${data.keys.openai.hint} (${data.keys.openai.source})`
                    : 'No key'
                }
              />
            </ul>

            <div className="mt-3 border-t border-[var(--border-line)] pt-3 text-xs text-[var(--text-muted)]">
              <p>
                Reference faces:{' '}
                <span
                  className={
                    data.supportsReferenceImages
                      ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                      : 'font-semibold text-amber-600 dark:text-amber-400'
                  }
                >
                  {data.supportsReferenceImages ? 'supported' : 'unavailable'}
                </span>
              </p>
            </div>
          </Card>

          <Card title="In use right now">
            <dl className="space-y-1.5 text-sm">
              <InUse label="Prompt writing" value={data.textProvider} model={
                data.textProvider === 'gemini'
                  ? data.models.geminiText
                  : data.textProvider === 'openai'
                    ? data.models.openaiText
                    : (data.models.workersText[0] ?? '—')
              } />
              <InUse
                label="Cover images"
                value={data.imageProvider}
                model={
                  data.imageProvider === 'none'
                    ? '—'
                    : data.imageProvider === 'gemini'
                      ? data.models.geminiImage
                      : data.models.workersImage
                }
              />
              <InUse label="Public generator" value={data.generatorProvider} model="" />
            </dl>
          </Card>

          <Card title="Where keys come from">
            <p className="text-xs text-[var(--text-muted)]">
              A key saved on this screen takes priority over the one deployed as a Worker secret, so
              you can change providers without touching the CLI. Clearing it here falls back to the
              secret.
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Either way the value stays server-side. Nothing on this page, and no other endpoint,
              will read a key back out.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

/* -------------------------------- Fragments ------------------------------- */

function KeyRow({
  label,
  help,
  state,
  value,
  onChange,
  onClear,
  pending,
}: {
  label: string;
  help: string;
  state: KeyState;
  value: string;
  onChange(value: string): void;
  onClear(): void;
  pending: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[var(--text-strong)]">{label}</p>
        {state.configured ? (
          <>
            <Badge tone="success">Configured</Badge>
            <span className="font-mono text-xs text-[var(--text-muted)]">{state.hint}</span>
            <span className="text-xs text-[var(--text-muted)]">
              from {state.source === 'settings' ? 'this screen' : 'a deployed secret'}
            </span>
          </>
        ) : (
          <Badge tone="neutral">Not set</Badge>
        )}
      </div>

      <Input
        type="password"
        autoComplete="off"
        value={value}
        placeholder={state.configured ? 'Leave empty to keep the current key' : 'Paste the key'}
        onChange={(event) => onChange(event.target.value)}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <p className="text-xs text-[var(--text-muted)]">{help}</p>
        {state.source === 'settings' && (
          <button
            type="button"
            disabled={pending}
            onClick={onClear}
            className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-60"
          >
            Remove stored key
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A model id field.
 *
 * Free text with presets as fill buttons rather than a `<select>`, because model
 * catalogues change faster than this app ships and an operator must be able to
 * enter an id nobody here has heard of yet.
 */
function ModelField({
  label,
  hint,
  value,
  onChange,
  presets,
  appendPresets,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange(value: string): void;
  presets: ModelPreset[];
  /** Add to a comma-separated chain instead of replacing the value. */
  appendPresets?: boolean;
}) {
  return (
    <div>
      <Field
        label={label}
        hint={hint ?? 'Any id the provider accepts. The presets below are only shortcuts.'}
      >
        <Input value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
      </Field>

      {presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {presets.map((preset) => {
            const active = appendPresets
              ? value.split(',').some((entry) => entry.trim() === preset.id)
              : value.trim() === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.note ?? preset.id}
                onClick={() => {
                  if (!appendPresets) return onChange(preset.id);
                  const parts = value
                    .split(',')
                    .map((entry) => entry.trim())
                    .filter(Boolean);
                  if (parts.includes(preset.id)) {
                    onChange(parts.filter((entry) => entry !== preset.id).join(', '));
                  } else {
                    onChange([...parts, preset.id].join(', '));
                  }
                }}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                  active
                    ? 'bg-brand-600 text-white'
                    : 'bg-[var(--surface-sunken)] text-[var(--text-body)] hover:bg-[var(--surface-hover)]',
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReadyRow({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          ready ? 'bg-emerald-500' : 'bg-[var(--border-strong)]',
        )}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-strong)]">{label}</p>
        <p className="truncate text-xs text-[var(--text-muted)]">{detail}</p>
      </div>
    </li>
  );
}

function InUse({ label, value, model }: { label: string; value: string; model: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right">
        <span className="font-semibold text-[var(--text-strong)]">{value}</span>
        {model && (
          <span className="block font-mono text-[0.625rem] text-[var(--text-muted)]">{model}</span>
        )}
      </dd>
    </div>
  );
}
