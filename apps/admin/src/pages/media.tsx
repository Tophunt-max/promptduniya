import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

interface UploadConfig {
  maxBytes: number;
  driver: string;
  allowed: string[];
}

interface StoredObject {
  objectKey: string;
  url: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Upload helper.
 *
 * There is deliberately no bucket browser: R2 listing is not exposed by the API,
 * and image URLs live on the records that use them. This screen exists to get a
 * public URL you can paste into a prompt or article.
 */
export function MediaPage() {
  const config = useQuery<UploadConfig>('/v1/admin/upload/config');
  const { run, pending, error } = useMutation();
  const [folder, setFolder] = useState('prompts');
  const [uploaded, setUploaded] = useState<StoredObject[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const maxMb = config.data ? Math.floor(config.data.maxBytes / (1024 * 1024)) : 8;

  async function upload(file: File) {
    const form = new FormData();
    form.set('file', file);
    if (folder) form.set('folder', folder);
    const stored = await run(() => api.upload<StoredObject>('/v1/admin/upload', form));
    if (stored) setUploaded((prev) => [stored, ...prev]);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard permission denied — the URL is selectable in the input anyway.
    }
  }

  return (
    <>
      <PageHeader
        title="Media"
        description="Upload images to R2 and copy their public URL."
        actions={
          config.data ? <Badge tone="neutral">Driver: {config.data.driver}</Badge> : undefined
        }
      />

      {error && <Alert>{error}</Alert>}

      <Card title="Upload an image">
        <div className="space-y-4">
          <Field label="Folder" hint="Grouping prefix inside the bucket, e.g. prompts or articles.">
            <Input value={folder} onChange={(event) => setFolder(event.target.value)} />
          </Field>

          <Field
            label="Image"
            hint={`${config.data?.allowed.join(', ') ?? 'JPEG, PNG, WebP, AVIF, GIF'} up to ${maxMb} MB. The API re-checks the file's magic bytes, so a renamed file is rejected.`}
          >
            <Input
              type="file"
              accept="image/*"
              disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
          </Field>

          {pending && <p className="text-sm text-muted">Uploading…</p>}
        </div>
      </Card>

      {uploaded.length > 0 && (
        <Card className="mt-4" title="Uploaded this session">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {uploaded.map((item) => (
              <li key={item.objectKey} className="rounded-lg border border-line p-3">
                <img
                  src={item.url}
                  alt=""
                  className="aspect-4/3 w-full rounded object-cover"
                  loading="lazy"
                />
                <p className="mt-2 truncate font-mono text-xs text-muted">{item.objectKey}</p>
                <p className="text-xs text-muted">
                  {item.mimeType} · {Math.round(item.fileSize / 1024)} KB
                </p>
                <div className="mt-2 flex gap-2">
                  <Input readOnly value={item.url} className="text-xs" />
                  <Button size="sm" variant="outline" onClick={() => void copy(item.url)}>
                    {copied === item.url ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
