import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { call, migrateTestDb, truncateAll, withBindings } from './helpers';

/**
 * Admin panel services.
 *
 * Concentrated on the operations where the database can be left in a wrong state
 * rather than simply erroring — those are the ones worth the cost of a test here:
 *
 *   tag merge      The join table's primary key is `(prompt_id, tag_id)`, so the
 *                  obvious implementation breaks on the most common input. It also
 *                  has to leave the denormalised `usageCount` correct.
 *   bulk ops       Six operations that all touch cached counts on `categories` and
 *                  `tags`. A miss there is invisible in the admin console and
 *                  visible on the public site.
 *   segments       Who receives a broadcast is resolved server-side and cannot be
 *                  recalled once sent.
 *
 * Anything requiring a language model (SEO rewriting) is covered only for its
 * refusal paths — a test that needs a provider quota fails for reasons unrelated
 * to the code.
 */

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await truncateAll();
  await env.DB.exec(
    "INSERT INTO categories (id, name, slug, is_active) VALUES ('cat_wed', 'Wedding', 'wedding', 1)",
  );
  await env.DB.exec(
    "INSERT INTO categories (id, name, slug, is_active) VALUES ('cat_cpl', 'Couple', 'couple', 1)",
  );
});

/* -------------------------------- Fixtures -------------------------------- */

async function insertPrompt(
  id: string,
  options: { published?: boolean; categoryId?: string; title?: string } = {},
) {
  const published = options.published ?? true;
  await env.DB.prepare(
    `INSERT INTO prompts (id, title, slug, short_description, prompt_text, ai_model, category_id,
       is_published, published_at, search_text)
     VALUES (?, ?, ?, 'A prompt.', 'A body long enough to be plausible.', 'gemini', ?, ?, ?, ?)`,
  )
    .bind(
      id,
      options.title ?? `Prompt ${id}`,
      id.replace(/_/g, '-'),
      options.categoryId ?? 'cat_wed',
      published ? 1 : 0,
      published ? 1000 : null,
      (options.title ?? id).toLowerCase(),
    )
    .run();
}

async function insertTag(id: string, name: string, slug: string, usageCount = 0) {
  await env.DB.prepare('INSERT INTO tags (id, name, slug, usage_count) VALUES (?, ?, ?, ?)')
    .bind(id, name, slug, usageCount)
    .run();
}

async function link(promptId: string, tagId: string) {
  await env.DB.prepare('INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)')
    .bind(promptId, tagId)
    .run();
}

async function tagIdsFor(promptId: string): Promise<string[]> {
  const rows = await env.DB.prepare('SELECT tag_id FROM prompt_tags WHERE prompt_id = ? ORDER BY tag_id')
    .bind(promptId)
    .all<{ tag_id: string }>();
  return rows.results.map((row) => row.tag_id);
}

async function scalar(sql: string, ...binds: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...binds)
    .first<{ value: number }>();
  return Number(row?.value ?? 0);
}

/**
 * Asserts that a service call rejects, and that the message is the intended one.
 *
 * Matching on the message rather than the class is deliberate: every one of these
 * is an `AppError`, so the class proves nothing, whereas the message is what an
 * operator actually reads.
 *
 * Note the `return await` in every caller's callback — it is load-bearing, not
 * style. Several of these services validate their arguments *before* their first
 * internal `await`, so they return a promise that is already rejected by the time
 * the callback receives it. A bare `return promise` then relies on promise
 * adoption to attach a handler, and under the Workers test pool that lost race
 * gets reported a second time as an unattributed "unhandled error" — failing the
 * run while every assertion passes. `return await` puts an awaiting frame in
 * place in the same turn, so the rejection is only ever observed once.
 */
async function rejects(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown;
  let threw = false;

  try {
    await withBindings(fn);
  } catch (error) {
    threw = true;
    caught = error;
  }

  expect(threw, `expected the call to reject with ${pattern}`).toBe(true);
  expect(caught instanceof Error ? caught.message : String(caught)).toMatch(pattern);
}

/* ================================== Tags ================================== */

describe('tag administration', () => {
  it('reports the stored count alongside the real one so drift is visible', async () => {
    await insertPrompt('prm_001');
    // Deliberately wrong: 9 stored, 1 actual. This is what an interrupted write
    // or a cascade leaves behind, and the public tag cloud reads the stored value.
    await insertTag('tag_001', 'Saree', 'saree', 9);
    await link('prm_001', 'tag_001');

    const listed = await withBindings(async () => {
      const { adminListTags } = await import('../src/services/tags');
      return adminListTags({});
    });

    expect(listed.items[0]).toMatchObject({ usageCount: 9, actualCount: 1 });
  });

  it('repairs a drifted count on recount', async () => {
    await insertPrompt('prm_001');
    await insertTag('tag_001', 'Saree', 'saree', 9);
    await link('prm_001', 'tag_001');

    await withBindings(async () => {
      const { recountTags } = await import('../src/services/tags');
      return recountTags();
    });

    expect(await scalar('SELECT usage_count AS value FROM tags WHERE id = ?', 'tag_001')).toBe(1);
  });

  /**
   * The case a naive `UPDATE prompt_tags SET tag_id = target` fails on.
   *
   * p2 carries both spellings, so repointing its source link would collide with
   * the primary key it already occupies.
   */
  it('merges tags when a prompt already carries both spellings', async () => {
    await insertPrompt('prm_001');
    await insertPrompt('prm_002');
    await insertPrompt('prm_003');

    await insertTag('tag_src', 'pre wedding', 'pre-wedding-a');
    await insertTag('tag_dst', 'Pre Wedding', 'pre-wedding');

    await link('prm_001', 'tag_src'); // source only  → repointed
    await link('prm_002', 'tag_src'); // both         → duplicate dropped
    await link('prm_002', 'tag_dst');
    await link('prm_003', 'tag_dst'); // target only  → untouched

    const result = await withBindings(async () => {
      const { mergeTags } = await import('../src/services/tags');
      return mergeTags({ sourceIds: ['tag_src'], targetId: 'tag_dst' });
    });

    expect(result).toMatchObject({
      mergedTagCount: 1,
      repointed: 1,
      duplicatesDropped: 1,
    });

    // The source tag is gone and every prompt kept a tag.
    expect(await scalar('SELECT count(*) AS value FROM tags WHERE id = ?', 'tag_src')).toBe(0);
    expect(await tagIdsFor('prm_001')).toEqual(['tag_dst']);
    expect(await tagIdsFor('prm_002')).toEqual(['tag_dst']); // once, not twice
    expect(await tagIdsFor('prm_003')).toEqual(['tag_dst']);

    // And the denormalised count reflects the merged total.
    expect(await scalar('SELECT usage_count AS value FROM tags WHERE id = ?', 'tag_dst')).toBe(3);
  });

  it('merges several tags at once', async () => {
    await insertPrompt('prm_001');
    await insertPrompt('prm_002');
    await insertTag('tag_001', 'prewedding', 'prewedding');
    await insertTag('tag_002', 'pre_wedding', 'pre-wedding-2');
    await insertTag('tag_dst', 'Pre Wedding', 'pre-wedding');
    await link('prm_001', 'tag_001');
    await link('prm_002', 'tag_002');

    const result = await withBindings(async () => {
      const { mergeTags } = await import('../src/services/tags');
      return mergeTags({ sourceIds: ['tag_001', 'tag_002'], targetId: 'tag_dst' });
    });

    expect(result.mergedTagCount).toBe(2);
    expect(result.repointed).toBe(2);
    expect(await scalar('SELECT count(*) AS value FROM tags')).toBe(1);
  });

  it('refuses to merge a tag into itself alone', async () => {
    await insertTag('tag_001', 'Saree', 'saree');

    await rejects(async () => {
      const { mergeTags } = await import('../src/services/tags');
      return await mergeTags({ sourceIds: ['tag_001'], targetId: 'tag_001' });
    }, /at least one other tag/i);
  });

  it('re-slugs on rename, and says to merge when the slug is taken', async () => {
    await insertTag('tag_001', 'pre wedding', 'pre-wedding-a');
    await insertTag('tag_002', 'Pre Wedding', 'pre-wedding');

    const renamed = await withBindings(async () => {
      const { renameTag } = await import('../src/services/tags');
      return renameTag('tag_001', 'Engagement Shoot');
    });
    expect(renamed).toMatchObject({ name: 'Engagement Shoot', slug: 'engagement-shoot' });

    // Renaming onto an existing slug is really a merge, so it should say so rather
    // than failing on the unique index with a driver error.
    await rejects(async () => {
      const { renameTag } = await import('../src/services/tags');
      return await renameTag('tag_001', 'Pre Wedding');
    }, /merge/i);
  });

  it('refuses to delete an attached tag unless forced', async () => {
    await insertPrompt('prm_001');
    await insertTag('tag_001', 'Saree', 'saree');
    await link('prm_001', 'tag_001');

    await rejects(async () => {
      const { deleteTag } = await import('../src/services/tags');
      return await deleteTag('tag_001');
    }, /still on 1 prompt/i);

    await withBindings(async () => {
      const { deleteTag } = await import('../src/services/tags');
      return deleteTag('tag_001', { force: true });
    });

    expect(await scalar('SELECT count(*) AS value FROM tags')).toBe(0);
    // The link went with it, via ON DELETE CASCADE.
    expect(await scalar('SELECT count(*) AS value FROM prompt_tags')).toBe(0);
  });

  it('prunes only the orphans', async () => {
    await insertPrompt('prm_001');
    await insertTag('tag_used', 'Saree', 'saree');
    await insertTag('tag_orphan', 'Lehenga', 'lehenga');
    await link('prm_001', 'tag_used');

    const result = await withBindings(async () => {
      const { pruneUnusedTags } = await import('../src/services/tags');
      return pruneUnusedTags();
    });

    expect(result.removed).toBe(1);
    expect(result.names).toEqual(['Lehenga']);
    expect(await scalar('SELECT count(*) AS value FROM tags')).toBe(1);
  });
});

/* ============================ Bulk prompt ops ============================= */

describe('bulk prompt operations', () => {
  it('publishes a batch and refreshes the category count', async () => {
    await insertPrompt('prm_001', { published: false });
    await insertPrompt('prm_002', { published: false });

    const result = await withBindings(async () => {
      const { bulkSetPublished } = await import('../src/services/prompts-bulk');
      return bulkSetPublished(['prm_001', 'prm_002'], true);
    });

    expect(result.affected).toBe(2);
    expect(await scalar('SELECT count(*) AS value FROM prompts WHERE is_published = 1')).toBe(2);
    // The public category grid reads this cached number.
    expect(await scalar('SELECT prompt_count AS value FROM categories WHERE id = ?', 'cat_wed')).toBe(2);
  });

  it('does not overwrite an existing published_at on re-publish', async () => {
    await insertPrompt('prm_001'); // published_at = 1000
    await withBindings(async () => {
      const { bulkSetPublished } = await import('../src/services/prompts-bulk');
      await bulkSetPublished(['prm_001'], false);
      await bulkSetPublished(['prm_001'], true);
    });

    // Stamping a fresh date would jump an old prompt to the top of "latest" just
    // because someone briefly unpublished it to fix a typo.
    expect(await scalar('SELECT published_at AS value FROM prompts WHERE id = ?', 'prm_001')).toBe(1000);
  });

  it('reports ids that no longer exist instead of failing the batch', async () => {
    await insertPrompt('prm_001', { published: false });

    const result = await withBindings(async () => {
      const { bulkSetPublished } = await import('../src/services/prompts-bulk');
      return bulkSetPublished(['prm_001', 'prm_gone'], true);
    });

    expect(result.affected).toBe(1);
    expect(result.missing).toEqual(['prm_gone']);
  });

  it('forces a scheduled prompt to be unpublished', async () => {
    await insertPrompt('prm_001'); // currently published

    await withBindings(async () => {
      const { bulkSchedule } = await import('../src/services/prompts-bulk');
      return bulkSchedule(['prm_001'], 9_999_999);
    });

    // `publishScheduled()` only scans unpublished rows, so leaving this published
    // would set a date that never fires and read as a pending change.
    expect(await scalar('SELECT is_published AS value FROM prompts WHERE id = ?', 'prm_001')).toBe(0);
    expect(await scalar('SELECT scheduled_for AS value FROM prompts WHERE id = ?', 'prm_001')).toBe(9_999_999);
  });

  it('clears a schedule without republishing', async () => {
    await insertPrompt('prm_001', { published: false });

    await withBindings(async () => {
      const { bulkClearSchedule, bulkSchedule } = await import('../src/services/prompts-bulk');
      await bulkSchedule(['prm_001'], 9_999_999);
      await bulkClearSchedule(['prm_001']);
    });

    const row = await env.DB.prepare(
      'SELECT scheduled_for, is_published FROM prompts WHERE id = ?',
    )
      .bind('prm_001')
      .first<{ scheduled_for: number | null; is_published: number }>();

    expect(row?.scheduled_for).toBeNull();
    expect(row?.is_published).toBe(0);
  });

  it('moves a batch between categories and fixes both counts', async () => {
    await insertPrompt('prm_001', { categoryId: 'cat_wed' });
    await insertPrompt('prm_002', { categoryId: 'cat_wed' });
    await withBindings(async () => {
      const { bulkSetPublished } = await import('../src/services/prompts-bulk');
      return bulkSetPublished(['prm_001', 'prm_002'], true);
    });

    await withBindings(async () => {
      const { bulkSetCategory } = await import('../src/services/prompts-bulk');
      return bulkSetCategory(['prm_001'], 'cat_cpl');
    });

    expect(await scalar('SELECT prompt_count AS value FROM categories WHERE id = ?', 'cat_wed')).toBe(1);
    expect(await scalar('SELECT prompt_count AS value FROM categories WHERE id = ?', 'cat_cpl')).toBe(1);
  });

  it('rejects an unknown category rather than orphaning rows', async () => {
    await insertPrompt('prm_001');

    await rejects(async () => {
      const { bulkSetCategory } = await import('../src/services/prompts-bulk');
      return await bulkSetCategory(['prm_001'], 'cat_none1');
    }, /unknown category/i);
  });

  it('adds tags idempotently, creating any that are new', async () => {
    await insertPrompt('prm_001');
    await insertPrompt('prm_002');

    await withBindings(async () => {
      const { bulkAddTags } = await import('../src/services/prompts-bulk');
      await bulkAddTags(['prm_001', 'prm_002'], ['Diwali', 'rooftop']);
      // Re-running over an overlapping selection must not violate the primary key.
      await bulkAddTags(['prm_001'], ['Diwali']);
    });

    expect(await scalar('SELECT count(*) AS value FROM tags')).toBe(2);
    expect(await scalar('SELECT count(*) AS value FROM prompt_tags')).toBe(4);
    expect(
      await scalar('SELECT usage_count AS value FROM tags WHERE slug = ?', 'diwali'),
    ).toBe(2);
  });

  it('removes tag links but keeps the tag rows', async () => {
    await insertPrompt('prm_001');
    await withBindings(async () => {
      const { bulkAddTags, bulkRemoveTags } = await import('../src/services/prompts-bulk');
      await bulkAddTags(['prm_001'], ['Diwali']);
      await bulkRemoveTags(['prm_001'], ['Diwali']);
    });

    expect(await scalar('SELECT count(*) AS value FROM prompt_tags')).toBe(0);
    // The tag survives so it can be reused; the count drops to zero.
    expect(await scalar('SELECT usage_count AS value FROM tags WHERE slug = ?', 'diwali')).toBe(0);
  });

  it('sets flags and refuses an empty flag payload', async () => {
    await insertPrompt('prm_001');

    await withBindings(async () => {
      const { bulkSetFlags } = await import('../src/services/prompts-bulk');
      return bulkSetFlags(['prm_001'], { isFeatured: true, isPremium: true });
    });

    expect(await scalar('SELECT is_featured AS value FROM prompts WHERE id = ?', 'prm_001')).toBe(1);
    expect(await scalar('SELECT is_premium AS value FROM prompts WHERE id = ?', 'prm_001')).toBe(1);

    // Would only bump updatedAt — refuse rather than pretend something happened.
    await rejects(async () => {
      const { bulkSetFlags } = await import('../src/services/prompts-bulk');
      return await bulkSetFlags(['prm_001'], {});
    }, /no flags/i);
  });

  it('deletes a batch and repairs the counts it invalidates', async () => {
    await insertPrompt('prm_001');
    await insertPrompt('prm_002');
    await withBindings(async () => {
      const { bulkAddTags, bulkSetPublished } = await import('../src/services/prompts-bulk');
      await bulkSetPublished(['prm_001', 'prm_002'], true);
      await bulkAddTags(['prm_001', 'prm_002'], ['Diwali']);
    });

    const result = await withBindings(async () => {
      const { bulkDelete } = await import('../src/services/prompts-bulk');
      return bulkDelete(['prm_001']);
    });

    expect(result.affected).toBe(1);
    expect(await scalar('SELECT prompt_count AS value FROM categories WHERE id = ?', 'cat_wed')).toBe(1);
    // The tag count had to be read before the delete, because prompt_tags cascades.
    expect(await scalar('SELECT usage_count AS value FROM tags WHERE slug = ?', 'diwali')).toBe(1);
  });

  it('requires a selection and caps the batch size', async () => {
    await rejects(async () => {
      const { bulkSetPublished } = await import('../src/services/prompts-bulk');
      return await bulkSetPublished([], true);
    }, /select at least one/i);

    await rejects(async () => {
      const { bulkSetPublished } = await import('../src/services/prompts-bulk');
      return await bulkSetPublished(
        Array.from({ length: 76 }, (_, index) => `p_${index}`),
        true,
      );
    }, /at most 75/i);

    // A batch at exactly the cap has to reach D1 and come back. This is the
    // assertion the cap exists for: it was 200, which put the `inArray` over
    // D1's 100-bound-parameter ceiling, so the real failure was a driver error
    // and a 500 rather than the clean 400 above. Ids that match nothing are
    // fine — the statement is still built and bound at full width.
    const atCap = await withBindings(async () => {
      const { bulkSetPublished } = await import('../src/services/prompts-bulk');
      return bulkSetPublished(
        Array.from({ length: 75 }, (_, index) => `p_absent_${index}`),
        true,
      );
    });
    expect(atCap.affected).toBe(0);
    expect(atCap.missing).toHaveLength(75);

    // Deletion is capped harder — it is the one action here that cannot be undone.
    await rejects(async () => {
      const { bulkDelete } = await import('../src/services/prompts-bulk');
      return await bulkDelete(Array.from({ length: 51 }, (_, index) => `p_${index}`));
    }, /at most 50/i);
  });
});

/* ================================ Broadcast =============================== */

async function insertUser(
  id: string,
  options: { status?: string; premiumUntil?: number | null; lastLogin?: number | null } = {},
) {
  // `username` is NOT NULL and uniquely indexed, so it has to be supplied even
  // though nothing in these tests reads it.
  await env.DB.prepare(
    `INSERT INTO users (id, email, email_normalized, name, username, status,
       premium_cached_until, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      `${id}@example.com`,
      `${id}@example.com`,
      id,
      id,
      options.status ?? 'active',
      options.premiumUntil ?? null,
      options.lastLogin ?? null,
    )
    .run();
}

describe('broadcast segments', () => {
  it('splits premium from free and excludes suspended accounts everywhere', async () => {
    const now = Math.floor(Date.now() / 1000);
    await insertUser('usr_premium', { premiumUntil: now + 86_400 });
    await insertUser('usr_lapsed', { premiumUntil: now - 86_400 });
    await insertUser('usr_free');
    await insertUser('usr_susp', { status: 'suspended', premiumUntil: now + 86_400 });

    const sizes = await withBindings(async () => {
      const { segmentSizes } = await import('../src/services/broadcast');
      return segmentSizes();
    });

    expect(sizes.premium).toBe(1);
    // A lapsed member is free, not premium — the same rule the entitlement layer
    // applies, since both read `premium_cached_until`.
    expect(sizes.free).toBe(2);
    // Three active accounts; the suspended one is in no segment at all.
    expect(sizes.all).toBe(3);
  });

  it('resolves the recently-active segment by last sign-in', async () => {
    const now = Math.floor(Date.now() / 1000);
    await insertUser('usr_recent', { lastLogin: now - 86_400 });
    await insertUser('usr_stale', { lastLogin: now - 60 * 86_400 });
    await insertUser('usr_never');

    const sizes = await withBindings(async () => {
      const { segmentSizes } = await import('../src/services/broadcast');
      return segmentSizes();
    });

    expect(sizes.active30d).toBe(1);
  });

  it('reports suppressed recipients rather than overstating delivery', async () => {
    await insertUser('usr_001');
    await insertUser('usr_002');

    const result = await withBindings(async () => {
      const { sendBroadcast } = await import('../src/services/broadcast');
      return sendBroadcast({ segment: 'all', title: 'Two hundred new prompts are live' });
    });

    // `productUpdates` defaults to false, so an un-forced broadcast legitimately
    // reaches nobody. Reporting it is the difference between a confusing feature
    // and an understandable one.
    expect(result.recipients).toBe(2);
    expect(result.delivered).toBe(0);
    expect(result.suppressed).toBe(2);
  });

  it('reaches everyone when preferences are overridden', async () => {
    await insertUser('usr_001');
    await insertUser('usr_002');

    const result = await withBindings(async () => {
      const { sendBroadcast } = await import('../src/services/broadcast');
      return sendBroadcast({ segment: 'all', title: 'Pricing is changing', force: true });
    });

    expect(result.delivered).toBe(2);
    expect(result.suppressed).toBe(0);
    expect(await scalar('SELECT count(*) AS value FROM notifications')).toBe(2);
  });

  it('requires a usable title', async () => {
    await insertUser('usr_001');

    await rejects(async () => {
      const { sendBroadcast } = await import('../src/services/broadcast');
      return await sendBroadcast({ segment: 'all', title: 'hi' });
    }, /title is required/i);
  });
});

/* ================================== SEO =================================== */

describe('SEO attention list', () => {
  it('flags prompts whose SEO title merely repeats the heading', async () => {
    await insertPrompt('prm_empty', { title: 'No SEO At All' });
    await insertPrompt('prm_copy', { title: 'Copied Heading' });
    await insertPrompt('prm_good', { title: 'Properly Written' });

    await env.DB.prepare('UPDATE prompts SET seo_title = ?, seo_description = ? WHERE id = ?')
      .bind('Copied Heading', 'A description long enough to pass the sixty character floor here.', 'prm_copy')
      .run();
    await env.DB.prepare('UPDATE prompts SET seo_title = ?, seo_description = ? WHERE id = ?')
      .bind(
        'Properly Written Diwali Portrait Prompt',
        'A description long enough to pass the sixty character floor here.',
        'prm_good',
      )
      .run();

    const flagged = await withBindings(async () => {
      const { promptsNeedingSeo } = await import('../src/services/studio/reseo');
      return promptsNeedingSeo();
    });

    const ids = flagged.map((row) => row.id).sort();
    // `draftPrompt` falls back to the title when a model returns nothing usable, so
    // a title-copy looks populated to any NULL check while being just as weak.
    expect(ids).toEqual(['prm_copy', 'prm_empty']);
  });

  it('refuses to rewrite a prompt that does not exist', async () => {
    await rejects(async () => {
      const { regeneratePromptSeo } = await import('../src/services/studio/reseo');
      return await regeneratePromptSeo('prm_missing');
    }, /not found/i);
  });
});

/* ============================ Route protection ============================ */

async function tokenWithRole(email: string, role: 'editor' | 'admin'): Promise<string> {
  const register = await call('/v1/auth/register', {
    method: 'POST',
    body: { name: 'Staff', email, password: 'CorrectHorse7!', acceptTerms: true },
  });
  expect(register.status).toBe(201);
  const userId = (register.json.data as { user: { id: string } }).user.id;

  await env.DB.prepare('INSERT OR IGNORE INTO roles (id, name) VALUES (?, ?)')
    .bind(`role_${role}`, role)
    .run();
  await env.DB.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)')
    .bind(userId, `role_${role}`)
    .run();

  const login = await call('/v1/auth/login', {
    method: 'POST',
    body: { email, password: 'CorrectHorse7!' },
  });
  expect(login.status).toBe(200);
  return (login.json.data as { accessToken: string }).accessToken;
}

describe('admin panel endpoints', () => {
  it('refuses anonymous callers on every new surface', async () => {
    for (const path of [
      '/v1/admin/tags',
      '/v1/admin/analytics',
      '/v1/admin/media',
      '/v1/admin/logs',
      '/v1/admin/broadcasts',
    ]) {
      const res = await call(path);
      expect(res.status, `${path} should require auth`).toBe(401);
    }
  });

  it('lets an editor read tags and the analytics payload', async () => {
    const token = await tokenWithRole('editor@example.com', 'editor');
    await insertPrompt('prm_001');
    await insertTag('tag_001', 'Saree', 'saree', 1);
    await link('prm_001', 'tag_001');

    const tags = await call('/v1/admin/tags', { token });
    expect(tags.status).toBe(200);
    expect((tags.json.data as { items: unknown[] }).items).toHaveLength(1);

    const analytics = await call('/v1/admin/analytics?days=7', { token });
    expect(analytics.status).toBe(200);
    const payload = analytics.json.data as {
      days: number;
      series: Record<string, { labels: string[] }>;
      leaderboards: Record<string, unknown[]>;
    };
    expect(payload.days).toBe(7);
    // The four fields the dashboard used to fetch and discard, plus the new ones.
    expect(Object.keys(payload.series).sort()).toEqual(
      [
        'conversions',
        'favorites',
        'generatorUsage',
        'likes',
        'pageViews',
        'promptCopies',
        'promptViews',
        'revenue',
        'signups',
        'visitors',
      ].sort(),
    );
    expect(payload.series.visitors!.labels).toHaveLength(7);
    expect(Object.keys(payload.leaderboards)).toContain('topTags');
  });

  it('keeps destructive tag operations to administrators', async () => {
    const editor = await tokenWithRole('editor2@example.com', 'editor');
    await insertTag('tag_001', 'a', 'a');
    await insertTag('tag_002', 'b', 'b');

    // An editor may create and rename.
    const renamed = await call('/v1/admin/tags/tag_001', {
      method: 'PATCH',
      token: editor,
      body: { name: 'Renamed' },
    });
    expect(renamed.status).toBe(200);

    // Merging and deleting destroy rows, so they are administrator-only.
    const merge = await call('/v1/admin/tags/merge', {
      method: 'POST',
      token: editor,
      body: { targetId: 'tag_002', sourceIds: ['tag_001'] },
    });
    expect(merge.status).toBe(403);

    const admin = await tokenWithRole('boss@example.com', 'admin');
    const merged = await call('/v1/admin/tags/merge', {
      method: 'POST',
      token: admin,
      body: { targetId: 'tag_002', sourceIds: ['tag_001'] },
    });
    expect(merged.status).toBe(200);
  });

  it('keeps bulk delete and broadcasts to administrators', async () => {
    const editor = await tokenWithRole('editor3@example.com', 'editor');
    await insertPrompt('prm_001');

    const bulkPublish = await call('/v1/admin/prompts/bulk/publish', {
      method: 'POST',
      token: editor,
      body: { ids: ['prm_001'], isPublished: true },
    });
    expect(bulkPublish.status).toBe(200);

    const bulkDelete = await call('/v1/admin/prompts/bulk/delete', {
      method: 'POST',
      token: editor,
      body: { ids: ['prm_001'] },
    });
    expect(bulkDelete.status).toBe(403);

    const broadcast = await call('/v1/admin/broadcasts', {
      method: 'POST',
      token: editor,
      body: { segment: 'all', title: 'Should not be allowed' },
    });
    expect(broadcast.status).toBe(403);
  });

  it('surfaces the audit trail it has been recording all along', async () => {
    const admin = await tokenWithRole('boss2@example.com', 'admin');
    await insertTag('tag_001', 'Saree', 'saree');

    await call('/v1/admin/tags/tag_001', {
      method: 'PATCH',
      token: admin,
      body: { name: 'Silk Saree' },
    });

    const logs = await call('/v1/admin/logs', { token: admin });
    expect(logs.status).toBe(200);

    const items = logs.json.data as { items: { action: string; actorEmail: string | null }[] };
    const rename = items.items.find((row) => row.action === 'tag.rename');
    expect(rename).toBeDefined();
    // The email is what actually identifies an actor; two accounts can share a name.
    expect(rename?.actorEmail).toBe('boss2@example.com');
  });

  it('validates a bulk payload before touching anything', async () => {
    const token = await tokenWithRole('editor4@example.com', 'editor');

    const empty = await call('/v1/admin/prompts/bulk/publish', {
      method: 'POST',
      token,
      body: { ids: [], isPublished: true },
    });
    expect(empty.status).toBe(422);

    const badMode = await call('/v1/admin/prompts/bulk/tags', {
      method: 'POST',
      token,
      body: { ids: ['prm_001'], tags: ['x'], mode: 'sideways' },
    });
    expect(badMode.status).toBe(422);
  });
});
