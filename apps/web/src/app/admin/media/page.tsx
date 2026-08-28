import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { MediaUploader } from '@/components/admin/media-uploader';
import { Badge } from '@/components/ui/badge';
import { InfoIcon } from '@/components/ui/icon';
import { requireAdminPage } from '@/lib/auth/guards';
import { MAX_UPLOAD_BYTES, storageMode } from '@/services/storage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Media' };

export default async function AdminMediaPage() {
  await requireAdminPage();
  const mode = storageMode();
  const maxMb = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

  return (
    <AdminShell
      title="Media"
      description="Upload cover images and example outputs, then paste the returned URL into a prompt."
      actions={
        <Badge tone={mode === 'r2' ? 'success' : 'marigold'}>
          {mode === 'r2' ? 'Object storage (R2)' : 'Local disk (development)'}
        </Badge>
      }
    >
      <div className="card mb-5 flex items-start gap-3 p-4">
        <InfoIcon size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
        <div className="text-sm leading-relaxed text-body">
          <p>
            Images go to object storage; the database only records the object key, public URL and
            dimensions — never the binary data. Uploads are validated on the server by size, MIME
            allow-list and magic bytes, so a renamed file cannot be stored as an image.
          </p>
          <p className="mt-2">
            Accepted: JPEG, PNG, WebP, AVIF, GIF. Maximum {maxMb} MB per file.
            {mode === 'local' && (
              <>
                {' '}
                No object storage is configured, so files are written to{' '}
                <code className="rounded bg-[var(--surface-sunken)] px-1">public/uploads</code> —
                fine for development, but configure R2 before production.
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-faint">
            Only upload images you have the rights to use. Do not upload copyrighted material.
          </p>
        </div>
      </div>

      <MediaUploader />
    </AdminShell>
  );
}
