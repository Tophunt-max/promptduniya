import { AppError, created, handle } from '@/lib/api';
import { requireEditor } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { logAdminAction } from '@/services/admin';
import { MAX_UPLOAD_BYTES, storageMode, uploadImage } from '@/services/storage';

export const dynamic = 'force-dynamic';

/**
 * Image upload.
 *
 * Validation happens in `uploadImage`: a size cap, a MIME allow-list, and
 * magic-byte sniffing so a renamed file cannot be stored as an image. Binary
 * data goes to object storage (or local disk in development) — never the
 * database, which only holds the key, URL and dimensions.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireEditor();

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw AppError.badRequest('Upload must be sent as multipart/form-data');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_UPLOAD_BYTES * 1.1) {
    throw AppError.badRequest('That file is too large');
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const folder = formData.get('folder');

  if (!(file instanceof File)) throw AppError.badRequest('No file was provided');

  const stored = await uploadImage({
    file,
    folder: typeof folder === 'string' ? folder : 'prompts',
  });

  await logAdminAction({
    actorId: actor.id,
    action: 'media.upload',
    targetType: 'media',
    targetId: stored.objectKey,
    meta: { size: stored.fileSize, mime: stored.mimeType, driver: storageMode() },
    ipHash: context.ipHash,
  });

  return created({
    objectKey: stored.objectKey,
    url: stored.url,
    mimeType: stored.mimeType,
    fileSize: stored.fileSize,
    originalName: stored.originalName,
    driver: storageMode(),
  });
});
