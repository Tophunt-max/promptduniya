import { describe, expect, it } from 'vitest';

import {
  SUPPORTED_WORKERS_IMAGE_MODELS,
  buildFormFields,
  buildJsonInput,
  dimensionsFor,
  profileFor,
  toBytes,
} from '../src/services/images/workers-ai';

/**
 * Request shapes for the Workers AI image catalogue.
 *
 * These models cannot be exercised on demand: the daily Neuron allocation and
 * the Gemini free tier both run out, and when they do every model fails with the
 * same quota error regardless of whether the request was well formed. So the
 * payload is asserted directly. Each expectation below corresponds to a
 * documented constraint that, if broken, produces a cover that never renders and
 * an error message pointing at the wrong cause.
 */

const PROMPT = 'A portrait of an adult Indian woman at golden hour';
const NEGATIVE = 'plastic skin, extra fingers';

describe('Workers AI image model profiles', () => {
  it('drives every listed model through a transport the engine implements', () => {
    expect(SUPPORTED_WORKERS_IMAGE_MODELS.length).toBeGreaterThan(0);

    for (const model of SUPPORTED_WORKERS_IMAGE_MODELS) {
      const profile = profileFor(model);
      expect(['json', 'multipart'], model).toContain(profile.transport);
      expect(['base64', 'binary'], model).toContain(profile.output);
      expect(['steps', 'num_steps'], model).toContain(profile.stepsKey);
    }
  });

  it('never sends a step count to a model that fixes its own', () => {
    // klein 4B is distilled to exactly four steps and rejects the parameter.
    const fields = buildFormFields('@cf/black-forest-labs/flux-2-klein-4b', PROMPT, {
      aspectRatio: '4:5',
    });
    expect(fields.steps).toBeUndefined();
    expect(fields.num_steps).toBeUndefined();
    expect(fields.prompt).toBe(PROMPT);
  });

  it('uses each model own name for the step count', () => {
    // Sending `steps` to a model that reads `num_steps` is silently ignored, so
    // the request succeeds at the default and the setting appears to do nothing.
    expect(buildJsonInput('@cf/leonardo/lucid-origin', PROMPT, {}).steps).toBe(26);
    expect(buildJsonInput('@cf/leonardo/lucid-origin', PROMPT, {}).num_steps).toBeUndefined();

    expect(buildJsonInput('@cf/lykon/dreamshaper-8-lcm', PROMPT, {}).num_steps).toBe(20);
    expect(buildJsonInput('@cf/lykon/dreamshaper-8-lcm', PROMPT, {}).steps).toBeUndefined();
  });

  it('sends a negative prompt only where the model has that field', () => {
    // Where there is no field, the list must not leak into the positive prompt:
    // it reads as a request for the very things it lists, and trips the safety
    // classifier on words like "skin".
    const sdxl = buildJsonInput('@cf/stabilityai/stable-diffusion-xl-base-1.0', PROMPT, {
      negative: NEGATIVE,
    });
    expect(sdxl.negative_prompt).toBe(NEGATIVE);

    const lucid = buildJsonInput('@cf/leonardo/lucid-origin', PROMPT, { negative: NEGATIVE });
    expect(lucid.negative_prompt).toBeUndefined();
    expect(lucid.prompt).toBe(PROMPT);
  });

  it('omits dimensions for the one model that has no such parameter', () => {
    // flux-1-schnell takes prompt and steps only. Passing width/height is what
    // made the requested 4:5 frame silently become a square.
    const schnell = buildJsonInput('@cf/black-forest-labs/flux-1-schnell', PROMPT, {
      aspectRatio: '4:5',
    });
    expect(schnell.width).toBeUndefined();
    expect(schnell.height).toBeUndefined();
    expect(schnell.steps).toBe(8);
  });

  it('keeps dimensions inside each model own ceiling', () => {
    // FLUX.2 caps at 1920 where Lucid Origin allows 2500. A value over the cap is
    // rejected outright rather than clamped.
    for (const model of SUPPORTED_WORKERS_IMAGE_MODELS) {
      const profile = profileFor(model);
      if (!profile.dimensions) continue;

      for (const ratio of ['4:5', '1:1', '16:9', '9:16']) {
        const { width, height } = dimensionsFor(ratio, profile.dimensions.max);
        expect(width, `${model} ${ratio}`).toBeLessThanOrEqual(profile.dimensions.max);
        expect(height, `${model} ${ratio}`).toBeLessThanOrEqual(profile.dimensions.max);
        expect(width % 32, `${model} ${ratio}`).toBe(0);
        expect(height % 32, `${model} ${ratio}`).toBe(0);
      }
    }
  });

  it('reproduces the requested aspect ratio rather than approximating it', () => {
    expect(dimensionsFor('4:5')).toEqual({ width: 1024, height: 1280 });

    const wide = dimensionsFor('16:9');
    expect(wide.width).toBeGreaterThan(wide.height);

    const square = dimensionsFor('1:1');
    expect(square.width).toBe(square.height);
  });

  it('defaults to a portrait frame when the ratio is missing or unparseable', () => {
    // Covers are displayed in a portrait card. Falling back to a square would be
    // a silent crop in the one place a reader judges the prompt.
    for (const input of [undefined, '', 'portrait', '4x5', '0:0']) {
      const { width, height } = dimensionsFor(input);
      expect(height, String(input)).toBeGreaterThan(width);
    }
  });

  it('treats an unknown model id as prompt-and-steps only', () => {
    // A model released after this file was written should still be selectable:
    // the conservative profile is the common ground between both transports.
    const input = buildJsonInput('@cf/some-vendor/unreleased-model', PROMPT, {
      aspectRatio: '4:5',
      negative: NEGATIVE,
    });
    expect(Object.keys(input).sort()).toEqual(['prompt', 'steps']);
  });

  it('marks reference support on exactly the models that accept an input image', () => {
    // This drives whether a photo-edit cover bothers loading a house model, so a
    // wrong answer here means the face is never preserved.
    expect(profileFor('@cf/black-forest-labs/flux-2-dev').reference).toBe(true);
    expect(profileFor('@cf/black-forest-labs/flux-2-klein-9b').reference).toBe(true);
    expect(profileFor('@cf/leonardo/lucid-origin').reference).toBe(false);
    expect(profileFor('@cf/black-forest-labs/flux-1-schnell').reference).toBe(false);
  });
});


/**
 * Output shapes.
 *
 * The catalogue is split down the middle: FLUX and Lucid Origin resolve to
 * `{ image: <base64> }`, while Stable Diffusion, DreamShaper and Phoenix resolve
 * to a `ReadableStream` of raw bytes. Reading `.image` off a stream gives
 * `undefined`, so selecting any of the latter used to fail with "returned no
 * image data" from a model that had just produced a perfectly good image.
 */
describe('Workers AI image response handling', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

  function base64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  it('decodes a base64 image field', async () => {
    expect(await toBytes({ image: base64(png) })).toEqual(png);
  });

  it('drains a ReadableStream, including one split across chunks', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(png.slice(0, 4));
        controller.enqueue(png.slice(4));
        controller.close();
      },
    });

    // Order and length both matter: a naive implementation that keeps only the
    // last chunk still produces bytes, and those bytes are a corrupt image.
    expect(await toBytes(stream)).toEqual(png);
  });

  it('accepts buffers and blobs', async () => {
    expect(await toBytes(png)).toEqual(png);
    expect(await toBytes(png.buffer)).toEqual(png);
    expect(await toBytes(new Blob([png]))).toEqual(png);
  });

  it('reports nothing rather than empty bytes when there is no image', async () => {
    // Distinguishing "no image" from "zero-length image" is what lets the caller
    // fall back instead of storing an empty file as a cover.
    expect(await toBytes(null)).toBeNull();
    expect(await toBytes({})).toBeNull();
    expect(await toBytes({ image: '' })).toBeNull();

    const empty = new ReadableStream<Uint8Array>({
      start: (controller) => controller.close(),
    });
    expect(await toBytes(empty)).toBeNull();
  });
});


describe('admin image model presets', () => {
  it('offers only models the engine has a profile for', async () => {
    // A preset without a profile still works, but silently on the conservative
    // fallback: no dimensions, so the 4:5 frame is lost, and no negative prompt.
    // Offering it as a one-click choice implies the engine knows how to drive it.
    const { IMAGE_MODEL_PRESETS } = await import('../src/services/ai-providers');

    for (const preset of IMAGE_MODEL_PRESETS['workers-ai']) {
      expect(SUPPORTED_WORKERS_IMAGE_MODELS, preset.id).toContain(
        preset.id.split('/').pop() ?? preset.id,
      );
    }
  });

  it('defaults to a model that is offered as a preset', async () => {
    const { AI_DEFAULTS, IMAGE_MODEL_PRESETS } = await import('../src/services/ai-providers');
    const ids = IMAGE_MODEL_PRESETS['workers-ai'].map((preset) => preset.id);
    expect(ids).toContain(AI_DEFAULTS.workersImageModel);
  });
});
