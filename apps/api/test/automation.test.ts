import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { call, migrateTestDb, truncateAll, withBindings } from './helpers';

/**
 * Content automation.
 *
 * Three layers are worth testing here, and for different reasons:
 *
 *   quality      Pure functions over a draft. This is the gate that decides
 *                whether machine-written content reaches the public site, so its
 *                behaviour at the boundaries is the whole safety story.
 *   duplicates   Similarity scoring against real rows. Needs D1, because the
 *                candidate narrowing is SQL and a JS-only test would prove
 *                nothing about the part most likely to break.
 *   queue        The state machine. Claiming is compare-and-swap, retries are
 *                bounded, and cancellation is refused mid-flight — all of which
 *                are easy to regress and impossible to notice by hand.
 *
 * Deliberately not tested: anything that calls a language model. Those paths are
 * exercised through their fallbacks instead (see the config and route tests), on
 * the grounds that a test which needs a provider quota is a test that fails for
 * reasons unrelated to the code.
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
    "INSERT INTO categories (id, name, slug, is_active) VALUES ('cat_pre', 'Pre Wedding', 'pre-wedding', 1)",
  );
});

/* ============================== Quality gate ============================== */

/** A draft that should comfortably pass every check. */
function goodDraft() {
  return {
    title: 'Diwali Rooftop Couple Portrait',
    shortDescription:
      'A warm rooftop portrait of a couple lit by clay diyas during Diwali evening celebrations.',
    promptText: [
      'A 31-year-old Indian woman and a 34-year-old Indian man stand close together on a Jaipur',
      'rooftop terrace during Diwali evening. She wears a deep magenta Banarasi silk saree with a',
      'gold zari border, the pleats crisp and the pallu draped over one shoulder; he wears an ivory',
      'silk kurta with a fine chikankari collar. Rows of small clay diyas line the parapet behind',
      'them, their flames catching the metallic thread in the fabric. The terrace floor is old red',
      'sandstone, slightly uneven, still warm from the day. Behind them the city recedes into a haze',
      'of distant fairy lights and low rooftops. Lighting comes almost entirely from the diya flames',
      'at waist height, a warm 2200 kelvin glow that rises across their faces and leaves the upper',
      'background in soft shadow, with one cooler blue spill from a window to camera left separating',
      'their shoulders from the darkness. Shot on an 85mm portrait lens at f/2.0, framed as a',
      'three-quarter length portrait, the couple slightly off centre with the diya line leading the',
      'eye through the frame. Shallow depth of field renders the distant lights as soft round bokeh.',
      'The colour grade is warm and filmic, amber highlights with gently retained shadow detail,',
      'skin texture natural and unretouched, fabric weave clearly resolved.',
    ].join(' '),
    negativePrompt: 'blurry, distorted hands, extra fingers, harsh flash, plastic skin, watermark',
    usageInstructions:
      'Paste the prompt as written and let the model interpret it. If the flames look blown out, ask for a lower exposure on the highlights.',
    style: 'Cinematic',
    gender: 'any',
    ageGroup: 'Adult',
    location: 'Jaipur rooftop terrace',
    aspectRatio: '4:5',
    cameraStyle: '85mm portrait lens, f/2.0',
    lighting: 'Warm diya flame light',
    mood: 'Festive',
    difficulty: 'intermediate' as const,
    tags: ['diwali', 'couple', 'rooftop', 'saree'],
    seoTitle: 'Diwali Rooftop Couple Portrait Prompt',
    seoDescription:
      'A warm Diwali rooftop couple portrait prompt with diya lighting, Banarasi silk and an 85mm look.',
    engine: 'test',
  };
}

describe('quality scoring', () => {
  it('passes a well-formed draft with a cover', async () => {
    const { scorePrompt } = await import('../src/services/studio/quality');
    const report = scorePrompt({
      draft: goodDraft(),
      inputMode: 'text-to-image',
      hasCover: true,
    });

    expect(report.blocked).toBe(false);
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.failed).toHaveLength(0);
  });

  it('blocks a draft that mentions a minor, whatever else it gets right', async () => {
    const { scorePrompt } = await import('../src/services/studio/quality');
    const draft = goodDraft();
    draft.promptText = draft.promptText.replace('31-year-old Indian woman', 'teenage girl');

    const report = scorePrompt({ draft, inputMode: 'text-to-image', hasCover: true });

    // Blocking checks must zero the score outright — a high weighted score
    // elsewhere cannot buy its way past a safety failure.
    expect(report.blocked).toBe(true);
    expect(report.score).toBe(0);
    expect(report.summary).toContain('Blocked');
  });

  it('blocks a photo-edit prompt that never anchors the uploaded face', async () => {
    const { scorePrompt } = await import('../src/services/studio/quality');

    // The same body is fine as text-to-image and wrong as photo-edit: the reader
    // would get a stranger's face back.
    const asTextToImage = scorePrompt({
      draft: goodDraft(),
      inputMode: 'text-to-image',
      hasCover: true,
    });
    const asPhotoEdit = scorePrompt({
      draft: goodDraft(),
      inputMode: 'photo-edit',
      hasCover: true,
    });

    expect(asTextToImage.blocked).toBe(false);
    expect(asPhotoEdit.blocked).toBe(true);
  });

  it('rejects a body that is too short to be a prompt', async () => {
    const { scorePrompt } = await import('../src/services/studio/quality');
    const draft = goodDraft();
    draft.promptText = 'A nice portrait.';

    const report = scorePrompt({ draft, inputMode: 'text-to-image', hasCover: true });
    expect(report.blocked).toBe(true);
  });

  it('penalises weight syntax and stock filler', async () => {
    const { scorePrompt } = await import('../src/services/studio/quality');
    const draft = goodDraft();
    draft.promptText =
      '(beautiful:1.4) Indian woman, masterpiece, best quality, ultra realistic, 8k, hdr, stunning, amazing, award winning, highly detailed portrait --ar 4:5';

    const report = scorePrompt({ draft, inputMode: 'text-to-image', hasCover: true });

    expect(report.score).toBeLessThan(60);
    expect(report.failed).toContain('Written as prose, not parameter syntax');
    expect(report.failed).toContain('Low filler density');
  });

  it('does not penalise a missing cover when no cover was attempted', async () => {
    const { scorePrompt } = await import('../src/services/studio/quality');

    const skipped = scorePrompt({
      draft: goodDraft(),
      inputMode: 'text-to-image',
      hasCover: false,
      coverRequired: false,
    });
    const expected = scorePrompt({
      draft: goodDraft(),
      inputMode: 'text-to-image',
      hasCover: false,
      coverRequired: true,
    });

    // Skipping images is a legitimate operator choice when a quota is spent;
    // scoring it as a failure would push a whole run below the threshold.
    expect(skipped.score).toBeGreaterThan(expected.score);
    expect(skipped.failed).not.toContain('Example image generated');
    expect(expected.failed).toContain('Example image generated');
  });
});

/* =========================== Duplicate detection ========================== */

async function insertPrompt(id: string, title: string, body: string) {
  await env.DB.prepare(
    `INSERT INTO prompts (id, title, slug, short_description, prompt_text, ai_model, category_id,
       is_published, published_at, search_text)
     VALUES (?, ?, ?, ?, ?, 'gemini', 'cat_wed', 1, 1, ?)`,
  )
    .bind(
      id,
      title,
      id.replace(/_/g, '-'),
      'An existing prompt.',
      body,
      `${title} ${body}`.toLowerCase(),
    )
    .run();
}

describe('duplicate detection', () => {
  it('flags a reworded title as a duplicate', async () => {
    await insertPrompt(
      'p_one',
      'Diwali Couple Rooftop Portrait',
      'A couple on a rooftop lit by diyas, warm amber light, 85mm lens, silk saree.',
    );

    const result = await withBindings(async () => {
      const { findDuplicate } = await import('../src/services/studio/duplicates');
      return findDuplicate({
        // Same words, different order — a different slug, but the same post to a
        // reader and to a search engine.
        title: 'Rooftop Diwali Portrait Couple',
        promptText: 'A couple on a rooftop lit by diyas, warm amber light, 85mm lens, silk saree.',
      });
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.match?.promptId).toBe('p_one');
    expect(result.match?.reason).toBe('exact-title');
  });

  it('lets a genuinely different prompt through', async () => {
    await insertPrompt(
      'p_one',
      'Diwali Couple Rooftop Portrait',
      'A couple on a rooftop lit by diyas, warm amber light, 85mm lens, silk saree.',
    );

    const result = await withBindings(async () => {
      const { findDuplicate } = await import('../src/services/studio/duplicates');
      return findDuplicate({
        title: 'Monsoon Bike Ride Editorial',
        promptText:
          'A rider on a motorcycle in heavy monsoon rain on a Mumbai flyover, cold blue light, 35mm lens, wet asphalt reflections.',
      });
    });

    expect(result.isDuplicate).toBe(false);
  });

  it('ignores catalogue-wide vocabulary when judging similarity', async () => {
    await insertPrompt(
      'p_one',
      'Indian AI Portrait Prompt Trending',
      'A portrait of an Indian person, viral aesthetic, beautiful.',
    );

    const result = await withBindings(async () => {
      const { findDuplicate } = await import('../src/services/studio/duplicates');
      // Every distinctive word here is a stop word, so there is nothing to match
      // on and the two must not be judged similar.
      return findDuplicate({
        title: 'Trending Indian AI Prompt Portrait',
        promptText:
          'A completely different scene: a bride adjusting her lehenga in a Udaipur courtyard at noon, hard sunlight, 50mm.',
      });
    });

    expect(result.match?.reason).not.toBe('exact-title');
    expect(result.isDuplicate).toBe(false);
  });

  it('respects the configured threshold', async () => {
    await insertPrompt(
      'p_one',
      'Sangeet Night Lehenga Portrait',
      'A woman dancing at a sangeet under fairy lights, warm tungsten glow, 50mm lens, mirror work lehenga.',
    );

    const run = (threshold: number) =>
      withBindings(async () => {
        const { findDuplicate } = await import('../src/services/studio/duplicates');
        return findDuplicate({
          title: 'Sangeet Lehenga Dance Portrait',
          promptText:
            'A woman dancing at a sangeet under fairy lights, warm tungsten glow, 50mm lens, mirror work lehenga.',
          threshold,
        });
      });

    // Same content judged either way purely by where the operator set the bar.
    expect((await run(50)).isDuplicate).toBe(true);
    expect((await run(100)).isDuplicate).toBe(false);
  });

  it('spots a theme the catalogue already covers before spending a model call', async () => {
    await insertPrompt(
      'p_one',
      'Chhath Puja Ghat Sunrise',
      'A woman at a Ganges ghat at sunrise during Chhath Puja, soft gold light, 85mm.',
    );

    const [known, novel] = await withBindings(async () => {
      const { themeAlreadyUsed } = await import('../src/services/studio/duplicates');
      return Promise.all([
        themeAlreadyUsed('Ghat Sunrise Chhath Puja'),
        themeAlreadyUsed('Winter reception sherwani portraits'),
      ]);
    });

    expect(known).toBe(true);
    expect(novel).toBe(false);
  });
});

/* ============================ Queue state machine ========================= */

const BRIEF = {
  categoryId: 'cat_wed',
  aiModel: 'gemini',
  inputMode: 'text-to-image',
  isPremium: false,
  publishMode: 'draft' as const,
  source: 'manual' as const,
};

describe('content queue', () => {
  it('enqueues themes and de-duplicates within the batch', async () => {
    const items = await withBindings(async () => {
      const { enqueue } = await import('../src/services/automation/queue');
      return enqueue({
        ...BRIEF,
        themes: ['Sangeet night portraits', 'sangeet NIGHT portraits', 'Haldi morning portraits'],
      });
    });

    // Enqueueing the same theme twice guarantees one gets rejected by the
    // duplicate gate *after* paying for a full generation.
    expect(items).toHaveLength(2);
  });

  it('claims each item exactly once even when called concurrently', async () => {
    await withBindings(async () => {
      const { enqueue } = await import('../src/services/automation/queue');
      return enqueue({ ...BRIEF, themes: ['Only one theme'] });
    });

    const claims = await withBindings(async () => {
      const { claimNext, startRun } = await import('../src/services/automation/queue');

      // Real run ids: `content_queue.run_id` is a foreign key, so a made-up value
      // fails the constraint rather than the assertion.
      const runs = await Promise.all([
        startRun({ trigger: 'manual', requested: 1 }),
        startRun({ trigger: 'cron', requested: 1 }),
        startRun({ trigger: 'api', requested: 1 }),
      ]);

      // The contention this guards against is an operator pressing "process now"
      // while a cron tick is already draining the queue.
      return Promise.all(runs.map((runId) => claimNext(runId)));
    });

    const winners = claims.filter((claim) => claim !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.attempts).toBe(1);
  });

  it('returns nothing when the queue is empty', async () => {
    const claim = await withBindings(async () => {
      const { claimNext } = await import('../src/services/automation/queue');
      return claimNext(null);
    });

    expect(claim).toBeNull();
  });

  it('claims by priority, then oldest first', async () => {
    await withBindings(async () => {
      const { enqueue } = await import('../src/services/automation/queue');
      await enqueue({ ...BRIEF, themes: ['Low priority theme'], priority: 0 });
      await enqueue({ ...BRIEF, themes: ['Urgent theme'], priority: 10 });
    });

    const first = await withBindings(async () => {
      const { claimNext } = await import('../src/services/automation/queue');
      return claimNext(null);
    });

    expect(first?.theme).toBe('Urgent theme');
  });

  it('retries a failure until the attempt budget runs out', async () => {
    await withBindings(async () => {
      const { enqueue } = await import('../src/services/automation/queue');
      return enqueue({ ...BRIEF, themes: ['Flaky theme'], maxAttempts: 2 });
    });

    const outcomes = await withBindings(async () => {
      const { claimNext, fail } = await import('../src/services/automation/queue');
      const results = [];

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const item = await claimNext(null);
        if (!item) break;
        results.push(await fail(item.id, new Error('provider exploded')));
      }
      return results;
    });

    expect(outcomes[0]).toMatchObject({ willRetry: true, attempts: 1 });
    expect(outcomes[1]).toMatchObject({ willRetry: false, attempts: 2 });

    const counts = await withBindings(async () => {
      const { queueCounts } = await import('../src/services/automation/queue');
      return queueCounts();
    });

    expect(counts.failed).toBe(1);
    expect(counts.queued).toBe(0);
  });

  it('requeues a failed item on request and records the error until then', async () => {
    await withBindings(async () => {
      const { enqueue } = await import('../src/services/automation/queue');
      return enqueue({ ...BRIEF, themes: ['Retry me'], maxAttempts: 1 });
    });

    const afterFailure = await withBindings(async () => {
      const { claimNext, fail, listQueue } = await import('../src/services/automation/queue');
      const item = await claimNext(null);
      await fail(item!.id, new Error('quota exhausted'));
      return listQueue({});
    });

    expect(afterFailure.items[0]?.status).toBe('failed');
    expect(afterFailure.items[0]?.lastError).toContain('quota exhausted');

    const afterRetry = await withBindings(async () => {
      const { listQueue, retry } = await import('../src/services/automation/queue');
      await retry(afterFailure.items[0]!.id);
      return listQueue({});
    });

    expect(afterRetry.items[0]?.status).toBe('queued');
    expect(afterRetry.items[0]?.lastError).toBeNull();
  });

  it('refuses to cancel an item that is generating right now', async () => {
    await withBindings(async () => {
      const { enqueue } = await import('../src/services/automation/queue');
      return enqueue({ ...BRIEF, themes: ['In flight'] });
    });

    await expect(
      withBindings(async () => {
        const { cancel, claimNext } = await import('../src/services/automation/queue');
        const item = await claimNext(null);
        // The runner holds this row and will write to it when it finishes, so a
        // cancellation now would be silently overwritten seconds later.
        return cancel(item!.id);
      }),
    ).rejects.toThrow(/generating right now/i);
  });

  it('releases items abandoned by a killed worker', async () => {
    await withBindings(async () => {
      const { enqueue } = await import('../src/services/automation/queue');
      return enqueue({ ...BRIEF, themes: ['Abandoned theme'], maxAttempts: 3 });
    });

    const claimed = await withBindings(async () => {
      const { claimNext } = await import('../src/services/automation/queue');
      return claimNext(null);
    });

    // Backdate the claim to look like an invocation that never came back.
    await env.DB.prepare('UPDATE content_queue SET started_at = ? WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000) - 7200, claimed!.id)
      .run();

    const result = await withBindings(async () => {
      const { queueCounts, releaseStalled } = await import('../src/services/automation/queue');
      const released = await releaseStalled(1800);
      return { released, counts: await queueCounts() };
    });

    expect(result.released).toBe(1);
    expect(result.counts.queued).toBe(1);
    expect(result.counts.generating).toBe(0);
  });

  it('counts only generated work against the daily cap', async () => {
    await withBindings(async () => {
      const { enqueue, settle } = await import('../src/services/automation/queue');

      const automated = await enqueue({
        ...BRIEF,
        themes: ['Haldi courtyard portraits', 'Mehendi hands close up', 'Baraat street portraits'],
        source: 'automation',
      });
      // One published, one held for review, one still waiting.
      await settle(automated[0]!.id, 'published');
      await settle(automated[1]!.id, 'needs_review');

      // Manual work must not consume the automation budget.
      const manual = await enqueue({
        ...BRIEF,
        themes: ['Reception stage portraits'],
        source: 'manual',
      });
      await settle(manual[0]!.id, 'published');
    });

    const produced = await withBindings(async () => {
      const { producedSince } = await import('../src/services/automation/queue');
      return producedSince(0);
    });

    // A held item consumed a model call, so it counts; a queued one has not.
    expect(produced).toBe(2);
  });

  it('records a run and grades it by outcome', async () => {
    const runs = await withBindings(async () => {
      const { finishRun, listRuns, startRun } = await import('../src/services/automation/queue');

      const clean = await startRun({ trigger: 'cron', requested: 2 });
      await finishRun(clean, { succeeded: 2, failed: 0, skipped: 0 });

      const limping = await startRun({ trigger: 'manual', requested: 2 });
      await finishRun(limping, { succeeded: 1, failed: 1, skipped: 0 });

      const broken = await startRun({ trigger: 'cron', requested: 2 });
      await finishRun(broken, { succeeded: 0, failed: 2, skipped: 0 });

      return listRuns({});
    });

    const byTrigger = Object.fromEntries(runs.items.map((run) => [run.id, run.status]));
    const statuses = Object.values(byTrigger);

    // The distinction that matters in the history list: a clean run, one that
    // limped, and one that achieved nothing.
    expect(statuses).toContain('completed');
    expect(statuses).toContain('partial');
    expect(statuses).toContain('failed');
  });
});

/* ============================ Automation config =========================== */

describe('automation config', () => {
  it('is off and drafting by default, so installing it publishes nothing', async () => {
    const config = await withBindings(async () => {
      const { getAutomationConfig } = await import('../src/services/automation/config');
      return getAutomationConfig();
    });

    expect(config.enabled).toBe(false);
    expect(config.autoPublish).toBe(false);
    expect(config.publishMode).toBe('draft');
  });

  it('persists a partial write without resetting the rest', async () => {
    const config = await withBindings(async () => {
      const { getAutomationConfig, setAutomationConfig } = await import(
        '../src/services/automation/config'
      );
      await setAutomationConfig({ minQualityScore: 90 });
      await setAutomationConfig({ enabled: true });
      return getAutomationConfig();
    });

    // The console has twenty-odd controls across several cards; a toggle must not
    // clobber a threshold set moments earlier in another card.
    expect(config.minQualityScore).toBe(90);
    expect(config.enabled).toBe(true);
    expect(config.postsPerDay).toBe(8);
  });

  it('normalises and sorts the publish hours an operator types', async () => {
    const config = await withBindings(async () => {
      const { getAutomationConfig, setAutomationConfig } = await import(
        '../src/services/automation/config'
      );
      await setAutomationConfig({ publishHours: '21, 9,9, 13 ,99' as never });
      return getAutomationConfig();
    });

    expect(config.publishHours).toEqual([9, 13, 21]);
  });

  it('falls back to the default rather than disabling itself on a bad value', async () => {
    const { parsePublishHours, AUTOMATION_DEFAULTS } = await import(
      '../src/services/automation/config'
    );

    // An empty list would silently stop generation while the console still reads
    // "enabled", which is a miserable thing to debug.
    expect(parsePublishHours('', [9])).toEqual([9]);
    expect(parsePublishHours('nonsense', AUTOMATION_DEFAULTS.publishHours)).toEqual(
      AUTOMATION_DEFAULTS.publishHours,
    );
  });

  it('decides slots against the configured timezone, not UTC', async () => {
    const { isScheduledSlot, nextSlotAt } = await import('../src/services/automation/runner');
    const { AUTOMATION_DEFAULTS } = await import('../src/services/automation/config');

    // 03:30 UTC is 09:00 IST — a configured slot only if the offset is honoured.
    const at = Math.floor(Date.UTC(2026, 0, 15, 3, 30) / 1000);
    const ist = { ...AUTOMATION_DEFAULTS, publishHours: [9], timezoneOffsetMinutes: 330 };
    const utc = { ...AUTOMATION_DEFAULTS, publishHours: [9], timezoneOffsetMinutes: 0 };

    expect(isScheduledSlot(ist, at)).toBe(true);
    expect(isScheduledSlot(utc, at)).toBe(false);
    expect(nextSlotAt(ist, at)).toBeGreaterThan(at);
  });

  it('spreads the daily quota across slots instead of firing it all at once', async () => {
    const { slotAllowance, AUTOMATION_DEFAULTS } = await import(
      '../src/services/automation/config'
    );

    expect(slotAllowance({ ...AUTOMATION_DEFAULTS, postsPerDay: 8, publishHours: [9, 13, 18, 21] })).toBe(2);
    expect(slotAllowance({ ...AUTOMATION_DEFAULTS, postsPerDay: 1, publishHours: [9, 13] })).toBe(1);
  });
});

/* ============================== Log hygiene ============================== */

describe('automation log', () => {
  it('redacts anything credential-shaped before storing it', async () => {
    const logs = await withBindings(async () => {
      const { listAutomationLogs, logAutomation } = await import(
        '../src/services/automation/logs'
      );

      await logAutomation({
        scope: 'text',
        level: 'error',
        message: 'Provider rejected the call with key AIzaSyD-1234567890abcdefghijklmnop',
        meta: {
          apiKey: 'AIzaSyD-1234567890abcdefghijklmnop',
          authorization: 'Bearer abcdef1234567890',
          model: 'gemini-2.0-flash',
          nested: { openaiSecret: 'sk-abcdefghijklmnopqrstuvwx' },
        },
      });

      return listAutomationLogs({});
    });

    const line = logs.items[0]!;
    const serialised = JSON.stringify(line);

    // Provider error bodies do sometimes echo request headers back, so this has
    // to hold for the message as well as the metadata.
    expect(serialised).not.toContain('AIzaSyD-1234567890abcdefghijklmnop');
    expect(serialised).not.toContain('abcdef1234567890');
    expect(serialised).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(line.message).toContain('[redacted]');
  });

  it('never throws, so a logging fault cannot lose the work being logged', async () => {
    await expect(
      withBindings(async () => {
        const { logAutomation } = await import('../src/services/automation/logs');
        // Deliberately invalid: a scope the column accepts but a job id that
        // violates the foreign key.
        return logAutomation({
          scope: 'queue',
          message: 'orphaned',
          jobId: 'does-not-exist',
        });
      }),
    ).resolves.toBeUndefined();
  });

  it('purges lines past the retention window', async () => {
    const remaining = await withBindings(async () => {
      const { listAutomationLogs, logAutomation, purgeAutomationLogs } = await import(
        '../src/services/automation/logs'
      );

      await logAutomation({ scope: 'cron', message: 'recent' });
      await logAutomation({ scope: 'cron', message: 'ancient' });

      return { purge: purgeAutomationLogs, list: listAutomationLogs };
    });

    await env.DB.prepare("UPDATE automation_logs SET created_at = ? WHERE message = 'ancient'")
      .bind(Math.floor(Date.now() / 1000) - 60 * 86_400)
      .run();

    const after = await withBindings(async () => {
      const purged = await remaining.purge(30);
      return { purged, logs: await remaining.list({}) };
    });

    expect(after.purged).toBe(1);
    expect(after.logs.items.map((line) => line.message)).toEqual(['recent']);
  });
});

/* ============================ Route protection ============================ */

describe('automation endpoints', () => {
  it('refuses an anonymous caller', async () => {
    const res = await call('/v1/admin/automation/overview');
    expect(res.status).toBe(401);
  });

  it('refuses a signed-in user without an editor role', async () => {
    const register = await call('/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Plain User',
        email: 'plain@example.com',
        password: 'CorrectHorse7!',
        acceptTerms: true,
      },
    });
    expect(register.status).toBe(201);
    const token = (register.json.data as { accessToken: string }).accessToken;

    const res = await call('/v1/admin/automation/overview', { token });
    expect(res.status).toBe(403);
  });

  it('serves the overview to an editor', async () => {
    const token = await editorToken('editor@example.com');

    const res = await call('/v1/admin/automation/overview', { token });

    expect(res.status).toBe(200);
    const data = res.json.data as {
      config: { enabled: boolean };
      queue: Record<string, number>;
      schedule: { nextSlotAt: number | null };
    };
    expect(data.config.enabled).toBe(false);
    expect(data.queue.queued).toBe(0);
    expect(data.schedule.nextSlotAt).toBeGreaterThan(0);
  });

  it('lets an editor queue work but not rewrite the configuration', async () => {
    const token = await editorToken('editor2@example.com');

    const queued = await call('/v1/admin/automation/queue', {
      method: 'POST',
      token,
      body: {
        themes: ['Winter sangeet lehenga portraits'],
        categoryId: 'cat_wed',
        aiModel: 'gemini',
      },
    });
    expect(queued.status).toBe(201);
    expect((queued.json.data as { queued: number }).queued).toBe(1);

    // Config decides how much of the AI budget gets spent and whether machine
    // output reaches the public site, so it is administrator-only.
    const config = await call('/v1/admin/automation/config', {
      method: 'PUT',
      token,
      body: { enabled: true },
    });
    expect(config.status).toBe(403);
  });

  it('rejects a malformed publish-hours value', async () => {
    const token = await adminToken('boss@example.com');

    const res = await call('/v1/admin/automation/config', {
      method: 'PUT',
      token,
      body: { publishHours: 'nine oclock' },
    });

    expect(res.status).toBe(422);
  });

  it('round-trips a configuration change for an administrator', async () => {
    const token = await adminToken('boss2@example.com');

    const res = await call('/v1/admin/automation/config', {
      method: 'PUT',
      token,
      body: { enabled: true, postsPerDay: 12, publishHours: '8,20', minQualityScore: 85 },
    });

    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({
      enabled: true,
      postsPerDay: 12,
      publishHours: [8, 20],
      minQualityScore: 85,
    });
  });
});

/* -------------------------------- Fixtures -------------------------------- */

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

  // Re-login so the new role lands in the access token's claims.
  const login = await call('/v1/auth/login', {
    method: 'POST',
    body: { email, password: 'CorrectHorse7!' },
  });
  expect(login.status).toBe(200);
  return (login.json.data as { accessToken: string }).accessToken;
}

const editorToken = (email: string) => tokenWithRole(email, 'editor');
const adminToken = (email: string) => tokenWithRole(email, 'admin');
