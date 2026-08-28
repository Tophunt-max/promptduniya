/**
 * Seed articles — original long-form content written for this project.
 * The renderer treats `content` as light markdown (see `renderArticle`).
 */

export interface SeedArticle {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  categorySlug?: string;
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string;
}

export const SEED_ARTICLES: SeedArticle[] = [
  {
    title: 'How to write AI photo prompts that actually look Indian',
    slug: 'how-to-write-ai-photo-prompts-that-look-indian',
    categorySlug: 'traditional',
    excerpt:
      'Most prompts produce a generic "South Asian" look because they describe a person instead of a place, a fabric and a light source. Here is what to change.',
    seoTitle: 'How to write AI photo prompts that actually look Indian',
    seoDescription:
      'A practical guide to writing AI image prompts with genuine Indian specificity — fabric, light, location and jewellery detail that models can actually render.',
    keywords: 'indian ai prompts, ai photo prompts india, gemini indian prompts',
    content: `Most prompts that aim for an Indian look fail in the same way: they name an ethnicity and stop there. The model has nothing concrete to hold on to, so it falls back on an averaged, slightly plastic result that could be from anywhere.

The fix is to stop describing identity and start describing **material, light and place**.

## Name the fabric, not the outfit

"Traditional Indian clothing" gives the model almost nothing. "A deep indigo handloom cotton saree with a mustard temple border" gives it four usable facts: colour, weave, garment and border style.

Fabric is also where most renders visibly break. Silk, cotton and georgette catch light in completely different ways, and if you do not say which one you want, you tend to get a waxy hybrid that reads as costume rather than clothing.

- **Handloom cotton** — matte, slightly irregular weave, holds crisp folds
- **Kanjeevaram silk** — directional sheen, heavy drape, stiff pleats
- **Georgette** — soft fall, no sheen, moves with the body
- **Raw silk** — visible slubs, matte with occasional highlights

Add one texture instruction as well. Something like *"the weave clearly resolved, individual threads visible"* does more for realism than any number of quality adjectives.

## Be specific about the light source

This is the single biggest lever you have. "Beautiful lighting" means nothing. Name the source, its direction, and its colour temperature:

- *"Warm 2200K string bulbs above and camera-right, wrapping down the near side of the face"*
- *"Diyas as the only meaningful light source, lighting from below with rapid falloff"*
- *"Soft overhead daylight diffused by an open courtyard, bright but shadowless on the face"*

Notice that each of these implies a mood without ever naming one. Light does the emotional work.

If a model keeps flattening your scene into even, ambient light, add the phrase *"motivated entirely by the practical lights on set"*. It is oddly effective, because it tells the model that the visible light sources in the frame are the only ones.

## Choose a real place

"In India" is not a location. A courtyard in Jaipur, the promenade at Marine Drive, a tea slope in Munnar and a Ladakh pass all look nothing like each other — different architecture, different light quality, different colour palette.

Pick one and describe two or three physical details of it. Lime-washed walls. A carved sandstone arch. Damp stone catching reflections. Those details anchor the whole frame.

## Keep jewellery minimal and named

Models will happily invent floating, duplicated, physically impossible jewellery if you let them. The defence is to name each piece and stop:

> *"A maang tikka, a layered temple-style gold necklace, and matching jhumkas. No other jewellery."*

That final sentence matters more than the list. Without it you often get extra earrings appearing mid-cheek.

## Write a negative prompt for the failure modes you actually see

Generic negative prompts are close to useless. Watch what your specific prompt gets wrong, then name exactly that:

- Mehndi smearing across knuckles
- Zari embroidery melting into a gold smear
- Red channel clipping into a flat block
- A cool blue fill light appearing in a warm scene

## Then change one thing at a time

Once a frame works, resist the urge to rewrite. Change only the wardrobe, or only the location, and leave the lighting and camera paragraphs byte-for-byte identical. That discipline is what turns one good image into a consistent set.`,
  },
  {
    title: 'Negative prompts: what to include, and what to leave out',
    slug: 'negative-prompts-what-to-include',
    categorySlug: 'photography',
    excerpt:
      'Long copy-pasted negative prompts do less than you think. A short list aimed at your actual failure modes does far more.',
    seoTitle: 'Negative prompts explained: what to include and what to skip',
    seoDescription:
      'How negative prompts really work across Stable Diffusion, Flux and Midjourney, and how to write a short one that fixes your specific problems.',
    keywords: 'negative prompt guide, stable diffusion negative prompt, flux negative prompt',
    content: `There is a widely shared habit of pasting a two-hundred-word negative prompt into every generation. It rarely helps, and it sometimes actively hurts by pulling the image away from things you wanted.

## Not every model has a negative prompt

Worth getting straight first:

- **Stable Diffusion and Flux** have a genuine, separate negative conditioning field. Text there is processed as something to steer away from.
- **Midjourney** has no separate field. It uses a \`--no\` parameter, which is weaker and best kept to a handful of terms.
- **Gemini and ChatGPT** have no negative field at all. Phrase your exclusions as positive instructions instead — *"hands fully visible and correctly formed"* rather than *"no deformed hands"*.

Putting a Stable Diffusion-style negative block into a Gemini prompt does nothing useful. In the worst case the model reads the words as things to include.

## The short list that earns its place

For photoreal work with people, this covers the overwhelming majority of real failures:

\`\`\`
extra fingers, deformed hands, distorted face, asymmetric eyes,
plastic skin, blurry, low resolution, watermark, text overlay
\`\`\`

That is nine terms. Almost everything commonly added beyond this is either redundant or already implied.

## Then add your own failure modes

This is the part people skip. Generate four or five images, look at what specifically went wrong, and name it:

- Product shots picking up fingerprints and dust → add those
- Couples ending up with mismatched lighting → *"mismatched lighting between subjects"*
- Interiors blowing out the windows → *"blown-out windows, HDR halos"*
- Automotive renders warping panels → *"warped panel geometry, wrong badge shapes"*

A negative prompt tuned to one prompt family beats a giant generic one every time.

## Things that do not belong in a negative prompt

- **Quality words you already asked for positively.** "Low quality" in the negative while "high quality" sits in the positive is just noise.
- **Style terms, unless you mean them.** Putting "illustration" in the negative on an anime prompt will fight your own intent.
- **Anatomy terms on non-human subjects.** A product shot does not need "extra fingers".

## A note on weights

In Stable Diffusion and Flux you can weight negative terms the same way as positive ones — \`(extra fingers:1.4)\`. Use it sparingly, on the one or two things that keep breaking. Weighting everything up is the same as weighting nothing.

## The honest summary

A negative prompt is a corrective tool, not a quality setting. Write your positive prompt properly first — specific light, specific materials, specific camera — and you will find you need far less in the negative field than you expected.`,
  },
  {
    title: 'One brief, five models: how prompt grammar differs',
    slug: 'one-brief-five-models-prompt-grammar',
    categorySlug: 'photography',
    excerpt:
      'The same creative brief needs genuinely different wording for Midjourney, Flux, Gemini, Stable Diffusion and Ideogram. Here it is written five ways.',
    seoTitle: 'How prompt grammar differs across Midjourney, Flux, Gemini and more',
    seoDescription:
      'The same image brief rewritten for five AI models, showing how comma clauses, weighted keywords and natural language each suit different tools.',
    keywords: 'midjourney vs flux prompts, gemini image prompt format, prompt grammar',
    content: `A prompt that performs beautifully in Midjourney often lands flat in Gemini, and vice versa. It is not that one model is better — they parse text differently.

Here is one brief written five ways. The creative intent is identical each time: a golden-hour rooftop portrait, 85mm, warm rim light, 4:5.

## Midjourney — comma clauses plus trailing flags

Midjourney responds to a stack of short descriptive clauses, with parameters at the end:

> cinematic photograph of a young adult on an urban rooftop, sand-coloured linen shirt, three-quarter turn to camera, soft natural smile, hazy city skyline compressed behind, warm string lights out of focus, low sun behind subject creating rim light along the jaw, 85mm f/1.8, warm amber highlights with cool blue shadows, serene mood, high detail --ar 4:5 --style raw

Keep clauses short. Put what matters most first — Midjourney weights early terms more heavily. Use \`--no\` for exclusions and \`--seed\` to lock a look.

## Flux and Stable Diffusion — weighted keyword stacks

These models accept explicit numeric weights, which is a real advantage when one element keeps getting ignored:

> (cinematic portrait:1.2), young adult on an urban rooftop, sand-coloured linen shirt, three-quarter turn, soft natural smile, hazy compressed skyline, (warm rim light along the jaw:1.15), 85mm f/1.8, warm amber highlights, cool blue shadows, serene, ultra-detailed, 8K, aspect ratio 4:5

Both also have a separate negative field — use it rather than cramming exclusions into the main box.

## Gemini and ChatGPT — structured natural language

These are conversational models, and they follow prose instructions better than keyword soup:

> Create a cinematic golden-hour portrait of a young adult standing on an open urban rooftop, turned three-quarters towards the camera with a soft natural smile.
>
> Wardrobe: a plain sand-coloured linen shirt.
>
> Lighting: low sun behind and slightly left of the subject, creating a warm rim light along the jaw, with soft bounce filling the face.
>
> Camera: 85mm at f/1.8, framed mid-chest up, focus on the near eye.
>
> Technical: 4:5 aspect ratio, high detail, natural skin texture.

The labelled sections genuinely help. And because it is a conversation, you can follow up: *"keep the same face, change the shirt to charcoal"*.

## Ideogram — prose with an eye on typography

Ideogram handles in-image text more reliably than most, so if your brief involves a poster or signage, say so explicitly and put the exact text in quotes. For plain photography, treat it much like Gemini — structured prose works well.

## What carries across all five

Regardless of grammar, the same four things determine whether a prompt works:

1. **A named light source with a direction**
2. **A real focal length and aperture**
3. **A material, not just a garment**
4. **One explicit technical constraint** — aspect ratio, and what must stay sharp

Get those right and the model-specific formatting is a translation exercise. Get them wrong and no amount of syntax tuning will save the image.`,
  },
];
