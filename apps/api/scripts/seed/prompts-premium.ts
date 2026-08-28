import type { SeedPrompt } from './prompt-types';

/** Premium-tier sample prompts — longer, with negative prompts and setup notes. */
export const PREMIUM_PROMPTS: SeedPrompt[] = [
  {
    title: 'Mandap Bridal Portrait with Practical Light',
    slug: 'gemini-mandap-bridal-portrait-practical-light',
    shortDescription:
      'A full bridal portrait under a marigold mandap, lit by warm practicals with jewellery detail preserved.',
    aiModel: 'gemini',
    categorySlug: 'wedding',
    style: 'Cinematic',
    gender: 'female',
    ageGroup: 'Adult',
    location: 'Marigold-decorated wedding mandap',
    aspectRatio: '4:5',
    cameraStyle: '85mm portrait lens, f/1.8',
    lighting: 'Practical fairy lights',
    mood: 'Regal',
    difficulty: 'advanced',
    isPremium: true,
    isFeatured: true,
    isEditorsPick: true,
    tags: ['wedding', 'portrait', 'jewellery', 'traditional', 'cinematic'],
    promptText: `Create a cinematic full-length bridal portrait of an adult Indian bride standing beneath a marigold-draped mandap in the hour after sunset, body angled three-quarters to camera, head turned back over her shoulder towards the lens, expression calm and self-possessed rather than smiling.

Wardrobe and jewellery: a deep crimson silk lehenga with gold zari work along the hem and border; a lightweight dupatta drawn over the crown of the head and falling behind the left shoulder; a maang tikka, layered temple-style gold necklace, and matching jhumkas. Mehndi on both hands, visible on the palm-side of the near hand.

Setting: dense marigold and tuberose garlands hanging in vertical strands framing both sides of the frame; a raised stone platform underfoot; warm out-of-focus fairy lights receding into the darkness behind.

Lighting: motivated entirely by the practical lights on set — a warm 2200K string of bulbs above and camera-right acting as the key, wrapping down the near side of the face; a second dimmer string behind creating a rim along the dupatta edge and the gold work; no cool fill anywhere. Falloff is quick, so the background reads as warm points of light in near-darkness.

Camera: 85mm lens at f/1.8 shot from slightly below chest height to give her presence, full-length with the garland strands cropping the frame edges, focus locked on the near eye with the jewellery just within the depth of field.

Colour: crimson and gold against deep brown-black shadow, warm throughout, restrained saturation so the red does not clip.

Technical: 4:5 aspect ratio, ultra-detailed, 8K resolution. Silk must read as silk with directional sheen along the folds; zari embroidery resolved thread by thread; individual marigold petals separated; skin texture true to life with visible pores; both hands anatomically correct with five fingers each and mehndi patterns continuous rather than smeared.`,
    negativePrompt:
      'extra fingers, six fingers, deformed hands, merged fingers, smeared mehndi patterns, melted zari embroidery, plastic silk, flat evenly-lit scene, cool blue fill light, blown-out red channel, floating jewellery, duplicate earrings, asymmetric eyes, distorted face, watermark, text overlay, logo, low resolution, jpeg artifacts',
    usageInstructions: `Three things make or break this prompt:

1. Keep the phrase "motivated entirely by the practical lights on set" — without it the model reverts to generic even lighting and the whole mood collapses.
2. Hands and mehndi fail most often. Generate at least six frames and reject any where the mehndi pattern breaks across the knuckles.
3. If the crimson clips to a flat red block, append "red channel held below clipping, silk sheen retained in the highlights" and re-run.

For a matched series, change only the pose sentence and leave the lighting and colour paragraphs untouched.`,
  },
  {
    title: 'Editorial Fashion Set in the White Desert',
    slug: 'midjourney-editorial-fashion-white-desert',
    shortDescription:
      'A high-fashion editorial in the Rann of Kutch with hard sun, flowing fabric and negative space.',
    aiModel: 'midjourney',
    categorySlug: 'fashion',
    style: 'Editorial Fashion',
    gender: 'female',
    ageGroup: 'Young adult',
    location: 'Rann of Kutch white desert',
    aspectRatio: '2:3',
    cameraStyle: '135mm compressed telephoto',
    lighting: 'Backlit silhouette',
    mood: 'Dramatic',
    difficulty: 'advanced',
    isPremium: true,
    isTrending: true,
    isEditorsPick: true,
    tags: ['editorial', 'fashion', 'cinematic'],
    promptText: `Editorial fashion photograph of a young woman standing alone on the cracked white salt flats of the Rann of Kutch under a hard low sun, mid-turn with a long pleated fabric panel caught in the wind and lifting across the frame, chin raised, eyes closed, expression composed and remote, full-length figure placed in the lower third with deliberate empty white space above, wardrobe: a structured ivory co-ord with sharp shoulders and a separate sheer flowing overlay in pale saffron, minimal gold cuff on one wrist, hair pulled back tight, backlit by the sun so the sheer overlay glows translucent and the figure edges into partial silhouette, a low reflector bounce off the salt returning just enough light to hold detail in the face, 135mm compressed telephoto, camera at ground level looking slightly up, horizon line kept perfectly level, colour: near-white ground and sky separated only by a faint warm band, pale saffron as the single accent, ultra-detailed, fabric weave and pleat structure resolved, individual salt crystals visible in the foreground, true-to-life skin texture, hands fully visible and correctly formed --ar 2:3 --style raw --q 2`,
    negativePrompt:
      '--no extra limbs, deformed hands, merged fabric and skin, muddy grey ground, busy background, tourists, vehicles, oversaturated colour, watermark, text, logo, cartoon, plastic skin',
    usageInstructions: `Midjourney handles the negative via --no rather than a separate field, which is why the flags sit at the end here.

The hard part is fabric behaviour. Wind-caught sheer fabric often fuses into the skin — if that happens, add "clear separation between fabric and body, visible gap" and increase stylize with --s 250.

Lock a seed once the silhouette works, then vary the accent colour to build a full lookbook.`,
  },
  {
    title: 'Cinematic Rain Frame with Anamorphic Feel',
    slug: 'flux-cinematic-rain-anamorphic-frame',
    shortDescription:
      'A wide anamorphic-style frame with practical street light, heavy rain and true cinema colour.',
    aiModel: 'flux',
    categorySlug: 'cinematic',
    style: 'Cinematic',
    gender: 'any',
    ageGroup: 'Adult',
    location: 'Rain-soaked city street with neon reflections',
    aspectRatio: '21:9',
    cameraStyle: 'Anamorphic cinema lens',
    lighting: 'Rim light with haze',
    mood: 'Mysterious',
    difficulty: 'advanced',
    isPremium: true,
    isFeatured: true,
    tags: ['cinematic', 'monsoon', 'mumbai', 'natural light'],
    promptText: `(anamorphic cinema still:1.3), (photorealistic:1.2), a solitary adult figure in a dark overcoat walking away from camera down the centre of a narrow rain-soaked street at night, seen from behind at mid-distance, umbrella held low and to one side, (heavy rain falling through the light beams:1.25), steam rising from a grate in the mid-ground, shuttered shopfronts on both sides compressing the frame, (wet asphalt with long specular reflections of overhead sodium lamps:1.2), a single distant headlight flaring at the end of the street, anamorphic cinema lens with subtle horizontal flare and oval bokeh, wide 21:9 framing, camera at chest height dead centre for symmetry, (atmospheric haze catching every light source:1.15), colour: deep teal shadows against warm sodium amber, filmic highlight roll-off, fine 35mm grain, deep but detailed blacks, ultra-detailed, 8K resolution, aspect ratio 21:9`,
    negativePrompt:
      'dry pavement, missing reflections, flat lighting, daylight, HDR halos, oversaturated neon, extra limbs, deformed silhouette, duplicate figures, blurry, low resolution, jpeg artifacts, watermark, text overlay, logo, cartoon, illustration',
    usageInstructions: `Flux rewards weighted terms, and this prompt leans on them heavily. The weights are doing real work — dropping them flattens the whole image.

Two adjustments worth knowing:
- If the rain vanishes, push "heavy rain falling through the light beams" to 1.4.
- If it renders as daytime, the haze term is competing with the night description; move "at night" to the very front of the prompt.

Because the subject faces away, this is a forgiving prompt for faces and hands — useful when you need a hero frame without fighting anatomy.`,
  },
  {
    title: 'Luxury Jewellery Macro on Dark Velvet',
    slug: 'sd-luxury-jewellery-macro-velvet',
    shortDescription:
      'A macro jewellery shot with controlled specular highlights, real gemstone dispersion and velvet texture.',
    aiModel: 'stable-diffusion',
    categorySlug: 'luxury',
    style: 'Hyper Realistic',
    gender: 'non-human',
    location: 'Modern minimal photo studio',
    aspectRatio: '1:1',
    cameraStyle: 'Macro detail shot',
    lighting: 'Studio three-point lighting',
    mood: 'Regal',
    difficulty: 'advanced',
    isPremium: true,
    isEditorsPick: true,
    tags: ['product', 'jewellery', 'studio', 'luxury'],
    promptText: `(hyper realistic macro product photography:1.3), (commercial jewellery advertisement:1.2), an ornate gold temple-style necklace arranged in a loose curve on deep burgundy velvet, central pendant with a faceted red gemstone, granulated gold beadwork along the chain, (accurate gemstone light dispersion and internal reflection:1.25), (crisp controlled specular highlights along every gold surface:1.2), individual velvet fibres catching light at the edge of the pool of illumination, studio three-point setup — a narrow strip softbox raking from camera-left to sculpt the gold relief, a small fill card camera-right lifting the shadow side, a focused snoot from behind picking out the gemstone, macro lens at f/8 with focus stacking so the full necklace is sharp front to back, top-down flat lay framing with the necklace filling 80 percent of the frame, colour: warm gold and deep burgundy, rich jewel tones, no colour cast on the metal, ultra-detailed, 8K resolution, texture-accurate, aspect ratio 1:1`,
    negativePrompt:
      'flat lifeless metal, blown-out specular highlights, plastic-looking gold, incorrect gemstone facets, floating jewellery, missing contact shadow, dust, fingerprints, warped chain links, duplicated pendants, blurry, shallow depth of field, low resolution, jpeg artifacts, watermark, text overlay, logo',
    usageInstructions: `Paste the negative prompt into the dedicated negative field — do not append it to the main prompt.

The two terms that matter most are "focus stacking" (without it half the necklace goes soft) and "controlled specular highlights" (without it the gold either goes dull or blows out completely).

Recommended settings as a starting point: CFG around 6, 40 sampling steps, and a hi-res fix pass at 1.5x. Run a batch of eight and pick the frame where the chain links stay consistent all the way round the curve.`,
  },
  {
    title: 'Heritage Architecture at First Light',
    slug: 'ideogram-heritage-architecture-first-light',
    shortDescription:
      'An architectural frame with corrected verticals, raking dawn light and full shadow detail.',
    aiModel: 'ideogram',
    categorySlug: 'architecture',
    style: 'Fine Art',
    gender: 'non-human',
    location: 'Hampi boulder landscape',
    aspectRatio: '16:9',
    cameraStyle: '24mm wide environmental',
    lighting: 'Golden hour sunlight',
    mood: 'Contemplative',
    difficulty: 'advanced',
    isPremium: true,
    tags: ['architecture', 'landscape', 'golden hour'],
    promptText: `Fine-art architectural photograph of a carved stone temple mandapa among the granite boulders of Hampi, captured in the first fifteen minutes after sunrise.

Composition: a colonnade of carved pillars running diagonally from the lower-left foreground into the mid-ground, a weathered stepped plinth in front, massive rounded boulders stacked behind and above, a sliver of pale sky along the top edge. No people in frame.

Perspective: shot on a 24mm wide lens with vertical lines fully corrected so every pillar stands perfectly plumb, camera on a tripod at waist height, one-point perspective with the vanishing point placed slightly right of centre.

Lighting: hard low sun raking in from camera-right almost parallel to the colonnade, so each pillar throws a long shadow across the floor and the carved relief catches the light edge-on. Warm bounce from the granite fills the shadows enough to keep carving detail readable throughout.

Colour: warm ochre and honey on the lit stone, cool violet-grey in the shadows, a restrained fine-art palette with no oversaturation.

Technical: 16:9 aspect ratio, ultra detail, individual chisel marks and lichen visible on the stone, full tonal range from bright lit stone to open shadow with no crushed blacks and no clipped highlights, sharp corner to corner.`,
    negativePrompt:
      'converging vertical lines, keystoning, tilted horizon, midday flat light, crushed black shadows, clipped highlights, HDR halos, tourists, modern signage, power lines, watermark, text overlay, oversaturated orange',
    usageInstructions: `"Vertical lines fully corrected" is the single most important phrase here — architectural renders almost always keystone without it.

If the shadows go solid black, add "open shadows with visible carving detail" rather than raising overall brightness, which would wash out the lit stone.

Works well at 16:9 for hero banners; switch to 4:5 and move the colonnade to the centre for a portrait crop.`,
  },
];
