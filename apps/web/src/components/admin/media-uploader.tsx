'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

import { copyToClipboard } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { CheckIcon, CopyIcon, ImageIcon } from '../ui/icon';
import { useToast } from '../ui/toast';

interface Uploaded {
  objectKey: string;
  url: string;
  mimeType: string;
  fileSize: number;
  originalName: string;
}

/**
 * Drag-and-drop uploader.
 *
 * Uses a plain multipart POST rather than the JSON client, because the endpoint
 * needs the raw file. The CSRF token is attached manually for the same reason.
 */
export function MediaUploader() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function csrfToken(): string {
    const match = document.cookie.match(/(?:^|;\s*)pd_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]!) : '';
  }

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    setBusy(true);
    for (const file of list) {
      const body = new FormData();
      body.append('file', file);
      body.append('folder', 'prompts');

      try {
        const response = await fetch('/api/admin/upload', {
          method: 'POST',
          body,
          headers: { 'x-csrf-token': csrfToken() },
          credentials: 'same-origin',
        });

        const payload = (await response.json()) as
          | { ok: true; data: Uploaded }
          | { ok: false; error: { message: string } };

        if (!payload.ok) {
          toast.error(`Could not upload ${file.name}`, payload.error.message);
          continue;
        }

        setUploads((current) => [payload.data, ...current]);
        toast.success('Uploaded', file.name);
      } catch {
        toast.error(`Could not upload ${file.name}`, 'Check your connection and try again.');
      }
    }
    setBusy(false);
  }

  async function copyUrl(upload: Uploaded) {
    const absolute = upload.url.startsWith('http')
      ? upload.url
      : `${window.location.origin}${upload.url}`;
    const ok = await copyToClipboard(absolute);
    if (ok) {
      setCopiedKey(upload.objectKey);
      toast.success('URL copied');
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  return (
    <div className="grid gap-5">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-[var(--radius-card)] border-2 border-dashed p-10 text-center transition-colors',
          dragging
            ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30'
            : 'border-[var(--border-strong)]',
        )}
      >
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
          <ImageIcon size={24} />
        </span>
        <p className="mt-4 text-sm font-bold">Drop images here</p>
        <p className="mt-1 text-sm text-body">or choose files from your device</p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files);
            event.target.value = '';
          }}
        />

        <Button
          type="button"
          className="mt-4"
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose images
        </Button>
      </div>

      {uploads.length > 0 && (
        <section aria-labelledby="uploaded">
          <h2 id="uploaded" className="mb-3 text-sm font-bold">
            Uploaded this session
          </h2>
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {uploads.map((upload) => (
              <li key={upload.objectKey} className="card overflow-hidden">
                <div className="relative aspect-video bg-[var(--surface-sunken)]">
                  <Image
                    src={upload.url}
                    alt={upload.originalName}
                    fill
                    sizes="320px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="p-3">
                  <p className="truncate text-xs font-semibold">{upload.originalName}</p>
                  <p className="mt-0.5 text-[0.6875rem] text-faint">
                    {(upload.fileSize / 1024).toFixed(0)} KB · {upload.mimeType}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyUrl(upload)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {copiedKey === upload.objectKey ? (
                      <CheckIcon size={13} />
                    ) : (
                      <CopyIcon size={13} />
                    )}
                    {copiedKey === upload.objectKey ? 'Copied' : 'Copy URL'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
