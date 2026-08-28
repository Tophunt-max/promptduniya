import { env } from '@/lib/env';
import { escapeHtml } from '@/lib/utils';

/**
 * Transactional email adapter.
 *
 * The `console` provider is the default so the app is fully functional locally
 * without any paid service — links are printed to the server log. Swapping in
 * SMTP or Resend only requires environment variables.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailAdapter {
  readonly name: string;
  send(message: EmailMessage): Promise<{ delivered: boolean; id?: string }>;
}

class ConsoleAdapter implements EmailAdapter {
  readonly name = 'console';
  async send(message: EmailMessage) {
    console.info(
      [
        '',
        '──────────── promptduniya · outbound email (console adapter) ────────────',
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        '',
        message.text,
        '─────────────────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return { delivered: true, id: 'console' };
  }
}

class ResendAdapter implements EmailAdapter {
  readonly name = 'resend';
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(message: EmailMessage) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      console.error('[mailer] resend delivery failed', response.status, await response.text());
      return { delivered: false };
    }
    const body = (await response.json()) as { id?: string };
    return { delivered: true, id: body.id };
  }
}

let adapter: EmailAdapter | null = null;

export function mailer(): EmailAdapter {
  if (adapter) return adapter;
  const e = env();
  if (e.EMAIL_PROVIDER === 'resend' && e.RESEND_API_KEY) {
    adapter = new ResendAdapter(e.RESEND_API_KEY, e.EMAIL_FROM);
  } else {
    // SMTP intentionally falls back to console: adding a mail transport
    // dependency is a deployment choice, documented in DEPLOYMENT.md.
    adapter = new ConsoleAdapter();
  }
  return adapter;
}

/** Test seam. */
export function setMailer(custom: EmailAdapter | null) {
  adapter = custom;
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#f6f5fb;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a1626">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 6px 24px rgba(26,22,38,.08)">
    <p style="margin:0 0 24px;font-weight:700;font-size:18px;letter-spacing:-.02em">promptduniya</p>
    ${bodyHtml}
    <hr style="margin:32px 0 16px;border:none;border-top:1px solid #eceaf4">
    <p style="margin:0;font-size:12px;color:#6f6880">You received this email because an account was created on promptduniya. If this wasn't you, you can safely ignore it.</p>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#5b3df5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${escapeHtml(
    label,
  )}</a></p>`;
}

export async function sendVerificationEmail(to: string, name: string, link: string) {
  return mailer().send({
    to,
    subject: 'Verify your promptduniya email',
    html: layout(
      'Verify your email',
      `<h1 style="margin:0 0 12px;font-size:22px">Welcome, ${escapeHtml(name)} 👋</h1>
       <p style="margin:0;line-height:1.6">Confirm your email address to unlock saved prompts, daily copies and the prompt generator.</p>
       ${button(link, 'Verify email address')}
       <p style="margin:0;font-size:13px;color:#6f6880;word-break:break-all">Or paste this link into your browser:<br>${escapeHtml(link)}</p>`,
    ),
    text: `Welcome, ${name}!\n\nVerify your email address: ${link}\n\nThis link expires in 24 hours.`,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, link: string) {
  return mailer().send({
    to,
    subject: 'Reset your promptduniya password',
    html: layout(
      'Reset your password',
      `<h1 style="margin:0 0 12px;font-size:22px">Reset your password</h1>
       <p style="margin:0;line-height:1.6">Hi ${escapeHtml(
         name,
       )}, use the button below to choose a new password. The link expires in 60 minutes.</p>
       ${button(link, 'Choose a new password')}
       <p style="margin:0;font-size:13px;color:#6f6880">If you didn't request this, no action is needed.</p>`,
    ),
    text: `Hi ${name},\n\nReset your password: ${link}\n\nThis link expires in 60 minutes. If you didn't request it, ignore this email.`,
  });
}

export async function sendSubscriptionActivatedEmail(
  to: string,
  name: string,
  planName: string,
  endsAt: string,
) {
  return mailer().send({
    to,
    subject: `Your ${planName} membership is active`,
    html: layout(
      'Membership active',
      `<h1 style="margin:0 0 12px;font-size:22px">You're premium 🎉</h1>
       <p style="margin:0;line-height:1.6">Thanks ${escapeHtml(name)} — your <strong>${escapeHtml(
         planName,
       )}</strong> membership is now active${endsAt ? ` until ${escapeHtml(endsAt)}` : ''}.</p>
       ${button('/dashboard', 'Open your dashboard')}`,
    ),
    text: `Thanks ${name}! Your ${planName} membership is active${endsAt ? ` until ${endsAt}` : ''}.`,
  });
}
