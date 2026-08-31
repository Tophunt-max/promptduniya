import { describe, expect, it } from 'vitest';

import { buildCoverInstruction } from '../src/services/images/covers';
import { clampPrompt } from '../src/services/images/workers-ai';

/**
 * What gets sent to the image model when a cover is generated.
 *
 * A cover's job is to show a reader what the prompt produces. It was instead
 * built from a summary of the row — title, one sentence, and five one-word
 * columns — which is a different photograph by construction, and is why covers
 * never resembled the prompt they illustrated.
 */

const BODY = [
  'Use the uploaded photo as the single source of facial identity. Reproduce the face exactly as it appears: bone structure, eye shape and spacing, nose, lips, jawline and the natural asymmetry between the two halves of the face. Do not slim, smooth or idealise any feature.',
  'Scene and pose: the person stands at the edge of a temple pond, body turned three quarters to camera, looking back over the left shoulder. The right hand lifts a fold of the saree, the left holds a brass basket of marigolds.',
  'Wardrobe: a sand beige Kerala kasavu saree with a woven gold border, pallu over the left shoulder, puff sleeve blouse in the same fabric, gold temple necklace and jhumka earrings.',
  'Lighting: soft natural daylight filtered through tree cover, gentle shadows across the steps, specular highlights on the gold and the wet stone.',
  'Camera and grade: 35mm equivalent at f/2.8, ISO 160, face and saree fabric sharp, water surface softly textured. Muted beige with marigold orange and dark pond green.',
].join('\n\n');

function row(overrides: Partial<Parameters<typeof buildCoverInstruction>[0]> = {}) {
  return {
    slug: 'kerala-onam-pond-portrait',
    title: 'Kerala Onam Pond Portrait',
    shortDescription: 'Upload your photo to get a festive Onam portrait beside a temple pond.',
    promptText: BODY,
    negativePrompt: 'changed face, plastic skin',
    inputMode: 'photo-edit',
    style: 'Editorial',
    gender: 'female',
    ageGroup: 'Young adult',
    location: 'Kerala temple pond',
    aspectRatio: '3:4',
    cameraStyle: '85mm portrait lens, f/2.0',
    lighting: 'Soft daylight',
    mood: 'Serene',
    ...overrides,
  };
}

describe('cover instruction', () => {
  it('sends the prompt body, not a summary of the row', () => {
    const instruction = buildCoverInstruction(row(), true);

    // The specifics that only exist in the body. Each is something the summary
    // route dropped, and each visibly changes the photograph.
    expect(instruction).toContain('turned three quarters to camera');
    expect(instruction).toContain('brass basket of marigolds');
    expect(instruction).toContain('woven gold border');
    expect(instruction).toContain('pallu over the left shoulder');
    expect(instruction).toContain('specular highlights');
    expect(instruction).toContain('marigold orange and dark pond green');
  });

  it('does not contradict the body own optics', () => {
    const instruction = buildCoverInstruction(row(), true);

    // The body asks for 35mm f/2.8. The old shared clause hardcoded an 85mm lens
    // and was appended regardless, leaving two focal lengths in one instruction
    // for the model to pick between.
    expect(instruction).toContain('35mm equivalent at f/2.8');
    expect(instruction).not.toContain('85mm');
  });

  it('keeps the identity block when a face is actually supplied', () => {
    const instruction = buildCoverInstruction(row(), true);
    expect(instruction).toContain('single source of facial identity');
  });

  it('drops the identity block when no face is supplied', () => {
    // Without an upload, "reproduce the face exactly as it appears" points at
    // nothing. Models answer by inventing a face and then holding it rigid.
    const instruction = buildCoverInstruction(row(), false);

    expect(instruction).not.toContain('uploaded photo');
    expect(instruction).not.toContain('Reproduce the face exactly');
    // ...while keeping the scene, which is the part that still applies.
    expect(instruction).toContain('temple pond');
    expect(instruction).toContain('kasavu saree');
    expect(instruction).toMatch(/Photograph of an? .*adult Indian woman/);
  });

  it('always states the frame shape last', () => {
    // The card is a fixed portrait, so a square render is cropped on arrival —
    // and the tail of a prompt is what these models weight most.
    for (const withReference of [true, false]) {
      const instruction = buildCoverInstruction(row(), withReference);
      expect(instruction.trimEnd().endsWith('vertical 3:4 composition.')).toBe(true);
    }
  });

  it('falls back to the column summary when there is no body yet', () => {
    // A half-finished draft should still be able to get a cover.
    const instruction = buildCoverInstruction(row({ promptText: null }), false);

    expect(instruction).toContain('Kerala Onam Pond Portrait');
    expect(instruction).toContain('Setting: Kerala temple pond.');
    // The reader-facing lead-in must not reach the model.
    expect(instruction).not.toContain('Upload your photo');
    // Here the shared clause is appropriate: there is no body to contradict.
    expect(instruction).toContain('85mm lens');
  });

  it('carries the realism floor without naming a lens', () => {
    const instruction = buildCoverInstruction(row(), true);
    expect(instruction).toContain('correct human anatomy and hand structure');
    expect(instruction).toContain('fabric that drapes under its own weight');
  });

  it('asks for no people on a product prompt', () => {
    const instruction = buildCoverInstruction(
      row({ gender: 'non-human', promptText: null }),
      false,
    );
    expect(instruction).toContain('Clean frame, no people.');
  });
});

describe('prompt length clamping', () => {
  it('leaves a prompt inside the limit untouched', () => {
    expect(clampPrompt('a short instruction', 2000)).toBe('a short instruction');
  });

  it('cuts at a boundary rather than mid-word', () => {
    const long = `${'First sentence here. '.repeat(40)}\n\nVertical 4:5 composition.`;
    const clamped = clampPrompt(long, 300);

    expect(clamped.length).toBeLessThanOrEqual(300);
    // A hard slice would end mid-word; this must end on a sentence.
    expect(clamped.endsWith('.')).toBe(true);
    expect(clamped).not.toMatch(/\s\S{1,3}$/);
  });

  it('still returns most of the budget when there is no boundary to find', () => {
    // One enormous unbroken token — falling back to a hard cut is correct here,
    // but it must not collapse to almost nothing.
    const clamped = clampPrompt('x'.repeat(5000), 300);
    expect(clamped.length).toBe(300);
  });
});
