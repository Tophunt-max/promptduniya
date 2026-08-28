import { AppError, handle, created, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { contactSchema } from '@/lib/validation';
import { saveContactMessage } from '@/services/admin';

export const dynamic = 'force-dynamic';

/**
 * Contact form.
 *
 * Anti-spam: a strict per-IP rate limit plus a honeypot field that real users
 * never fill in. Messages land in the admin inbox; no personal email address is
 * exposed publicly unless an administrator configures one.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('contact');

  const body = await parseBody(request, contactSchema);

  if (body.website && body.website.length > 0) {
    throw AppError.badRequest('Your message could not be sent');
  }

  await saveContactMessage({
    name: body.name,
    email: body.email,
    subject: body.subject,
    message: body.message,
    ipHash: context.ipHash,
  });

  return created({
    sent: true,
    message: 'Thanks for reaching out — we usually reply within two working days.',
  });
});
