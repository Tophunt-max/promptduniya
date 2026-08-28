import { describe, expect, it } from 'vitest';

import { hmacSha256, hashIp, hashVisitor, safeEqual, sha256 } from '@/lib/crypto';
import { escapeHtml, slugify } from '@/lib/utils';
import { serializeJsonLd } from '@/lib/seo';
import {
  contactSchema,
  promptListQuerySchema,
  promptWriteSchema,
  registerSchema,
  reportSchema,
  settingsWriteSchema,
} from '@/lib/validation';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from '@/services/storage';

describe('cryptographic helpers', () => {
  it('produces stable SHA-256 digests', () => {
    expect(sha256('promptduniya')).toBe(sha256('promptduniya'));
    expect(sha256('a')).not.toBe(sha256('b'));
    expect(sha256('a')).toHaveLength(64);
  });

  it('compares strings without throwing on length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    // A naive timingSafeEqual would throw here.
    expect(safeEqual('short', 'much-longer-string')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });

  it('keys HMAC output to the secret', () => {
    const a = hmacSha256('secret-one', 'payload');
    const b = hmacSha256('secret-two', 'payload');
    expect(a).not.toBe(b);
  });

  it('pseudonymises visitors without retaining the IP', () => {
    const hash = hashVisitor('203.0.113.5', 'Mozilla/5.0');

    expect(hash).not.toContain('203.0.113.5');
    expect(hash).toHaveLength(32);
    // Stable for the same visitor, different for another.
    expect(hashVisitor('203.0.113.5', 'Mozilla/5.0')).toBe(hash);
    expect(hashVisitor('203.0.113.6', 'Mozilla/5.0')).not.toBe(hash);
  });

  it('hashes IPs for audit records', () => {
    const hash = hashIp('198.51.100.7');
    expect(hash).not.toContain('198.51.100.7');
    expect(hash).toHaveLength(32);
  });
});

describe('output escaping', () => {
  it('escapes HTML-significant characters', () => {
    const escaped = escapeHtml('<script>alert("xss")</script>');
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&quot;');
  });

  it('escapes < in JSON-LD so it cannot close the script tag', () => {
    const payload = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(payload).not.toContain('</script>');
    expect(payload).toContain('\\u003c');
  });

  it('strips unsafe characters when slugifying', () => {
    expect(slugify('<script>Bad</script>')).toBe('script-bad-script');
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('  spaced   out  ')).toBe('spaced-out');
    expect(slugify('Ünïcödé Ttitle')).toBe('unicode-ttitle');
  });
});

describe('input validation', () => {
  it('requires the terms checkbox on registration', () => {
    const result = registerSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'CorrectHorse7!',
      acceptTerms: false,
    });
    expect(result.success).toBe(false);
  });

  it('normalises email case on registration', () => {
    const result = registerSchema.safeParse({
      name: 'Test User',
      email: 'Test@Example.COM',
      password: 'CorrectHorse7!',
      acceptTerms: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('test@example.com');
  });

  it('rejects malformed emails', () => {
    for (const email of ['notanemail', 'missing@tld', '@example.com', 'a b@example.com']) {
      const result = registerSchema.safeParse({
        name: 'Test User',
        email,
        password: 'CorrectHorse7!',
        acceptTerms: true,
      });
      expect(result.success).toBe(false);
    }
  });

  it('strips control characters from free text', () => {
    const result = contactSchema.safeParse({
      name: 'Test\u0000User',
      email: 'test@example.com',
      subject: 'A subject line',
      message: 'A message long enough to pass validation checks.',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('TestUser');
  });

  it('enforces maximum lengths on prompt content', () => {
    const result = promptWriteSchema.safeParse({
      title: 'x'.repeat(500),
      shortDescription: 'A valid short description.',
      promptText: 'A valid prompt body that is long enough.',
      aiModel: 'gemini',
      categoryId: 'category-id-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown AI model', () => {
    const result = promptWriteSchema.safeParse({
      title: 'A valid title',
      shortDescription: 'A valid short description.',
      promptText: 'A valid prompt body that is long enough.',
      aiModel: 'not-a-real-model',
      categoryId: 'category-id-1',
    });
    expect(result.success).toBe(false);
  });

  it('clamps pagination to a sane range', () => {
    expect(promptListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(promptListQuerySchema.safeParse({ page: '99999' }).success).toBe(false);
    expect(promptListQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false);

    const valid = promptListQuerySchema.safeParse({ page: '2', pageSize: '24' });
    expect(valid.success).toBe(true);
  });

  it('applies safe defaults for listing queries', () => {
    const result = promptListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.access).toBe('all');
      expect(result.data.sort).toBe('trending');
    }
  });

  it('restricts report reasons to a known set', () => {
    expect(
      reportSchema.safeParse({
        targetType: 'prompt',
        targetId: 'prompt-id-1',
        reason: 'inappropriate',
      }).success,
    ).toBe(true);

    expect(
      reportSchema.safeParse({
        targetType: 'prompt',
        targetId: 'prompt-id-1',
        reason: 'arbitrary-reason',
      }).success,
    ).toBe(false);
  });

  it('rejects an oversized settings payload value', () => {
    const result = settingsWriteSchema.safeParse({
      values: { 'site.name': 'x'.repeat(5000) },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a well-formed settings payload', () => {
    const result = settingsWriteSchema.safeParse({
      values: { 'site.name': 'promptduniya', 'limits.free.copies_per_day': 10, 'ops.ads_enabled': false },
    });
    expect(result.success).toBe(true);
  });
});

describe('upload validation policy', () => {
  it('allows only image types', () => {
    expect(ALLOWED_MIME_TYPES.has('image/jpeg')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('image/png')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('image/webp')).toBe(true);

    expect(ALLOWED_MIME_TYPES.has('application/javascript')).toBe(false);
    expect(ALLOWED_MIME_TYPES.has('text/html')).toBe(false);
    expect(ALLOWED_MIME_TYPES.has('image/svg+xml')).toBe(false); // SVG can carry script
  });

  it('caps the upload size', () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(0);
  });
});

describe('honeypot handling', () => {
  it('accepts an empty honeypot field', () => {
    const result = contactSchema.safeParse({
      name: 'Real Person',
      email: 'real@example.com',
      subject: 'Question about premium',
      message: 'This is a genuine enquiry that is long enough.',
      website: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a filled honeypot field at the schema level', () => {
    const result = contactSchema.safeParse({
      name: 'Spam Bot',
      email: 'spam@example.com',
      subject: 'Buy cheap things',
      message: 'This is spam content that is long enough to pass length checks.',
      website: 'http://spam.example.com',
    });
    expect(result.success).toBe(false);
  });
});
