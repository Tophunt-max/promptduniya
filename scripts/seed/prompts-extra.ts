import type { SeedPrompt } from './prompt-types';

/** Additional free prompts, spread across the remaining categories and models. */
export const EXTRA_PROMPTS: SeedPrompt[] = [
  {
    title: 'Navratri Garba Motion Frame',
    slug: 'gemini-navratri-garba-motion-frame',
    shortDescription:
      'A festival frame that keeps the dancer sharp while the skirt and background carry motion blur.',
    aiModel: 'gemini',
    categorySlug: 'festival',
    style: 'Documentary',
    gender: 'female',
    ageGroup: 'Young adult',
    location: 'Open-air Navratri ground at night',
    aspectRatio: '4:5',
    cameraStyle: 'Handheld gimbal tracking',
    lighting: 'Practical fairy lights',
    mood: 'Energetic',
    difficulty: 'intermediate',
    isTrending: true,
    tags: ['festival', 'candid', 'natural light'],
    promptText: `Create a documentary-style photograph of a young woman mid-spin during garba at an open-air Navratri ground at night, arms raised in the clap position, chaniya choli skirt flared wide by the rotation, genuine laugh, eyes bright.

Wardrobe: a mirror-work chaniya choli in teal and fuchsia with a light dupatta tied at the waist, oxidised silver jewellery.

Setting: strings of warm bulbs criss-crossing overhead, other dancers reduced to soft colourful shapes behind her, dusty ground catching light.

Lighting: warm overhead practicals as the key, hitting the top of the shoulders and the mirror work so it sparkles; the background falls away into warm darkness.

Camera: 35mm lens at f/2.8, shutter slow enough that the skirt hem and the background dancers streak while her face and torso stay sharp, framed from the knees up, camera at chest height.

Colour: saturated teal and fuchsia against warm amber light, high energy but not clipping.

Technical: 4:5 aspect ratio, high detail on the face and mirror work, motion blur confined to the skirt hem and background, hands correctly formed with five fingers each.`,
    negativePrompt:
      'blurry face, frozen static skirt, extra arms, deformed hands, duplicate faces in background, harsh flash, watermark, text overlay',
    usageInstructions:
      'The trick is asking for selective blur. If the whole frame goes soft, say "face and torso tack sharp, blur only in the skirt hem" explicitly.',
  },
  {
    title: 'Tea Estate Morning Portrait',
    slug: 'chatgpt-tea-estate-morning-portrait',
    shortDescription:
      'An environmental portrait in Munnar with layered hills and cool, soft morning light.',
    aiModel: 'chatgpt',
    categorySlug: 'travel',
    style: 'Documentary',
    gender: 'any',
    ageGroup: 'Adult',
    location: 'Munnar tea estate slopes',
    aspectRatio: '3:2',
    cameraStyle: '35mm documentary, f/2.0',
    lighting: 'Overcast soft light',
    mood: 'Serene',
    difficulty: 'beginner',
    tags: ['travel', 'kerala', 'portrait', 'natural light'],
    promptText: `Create an environmental portrait of an adult standing on a narrow path between tea bushes on a Munnar hillside early in the morning, body turned to look out across the slope with the face three-quarters to camera, calm and unhurried expression.

Wardrobe: a charcoal windbreaker over a plain shirt, sleeves down against the morning cool.

Setting: tightly clipped tea bushes filling the foreground and mid-ground in receding rows, mist sitting in the valley behind, silver oak trees breaking the skyline.

Lighting: flat overcast light, soft and directionless, with a faint brightening from camera-left where the sun is behind the cloud. No hard shadows anywhere.

Camera: 35mm lens at f/2.0, subject placed on the left third with the valley opening to the right, camera at eye level, focus on the near eye and the tea rows falling gently out of focus.

Colour: cool desaturated greens with a hint of blue in the mist, muted overall.

Technical: 3:2 aspect ratio, high detail, individual tea leaves resolved in the foreground, natural skin tone under cool light, hands in pockets and not visible.`,
    negativePrompt:
      'harsh sunlight, hard shadows, oversaturated green, plastic skin, distorted face, floating subject, watermark, text',
    usageInstructions:
      'Overcast light is the easiest lighting to get right, which makes this a good prompt for testing a new model.',
  },
  {
    title: 'Sherwani Groom Portrait in Warm Light',
    slug: 'gemini-sherwani-groom-portrait-warm-light',
    shortDescription:
      'A groom portrait with embroidery detail held sharp under warm indoor practicals.',
    aiModel: 'gemini',
    categorySlug: 'wedding',
    style: 'Studio Portrait',
    gender: 'male',
    ageGroup: 'Adult',
    location: 'Jaipur haveli courtyard',
    aspectRatio: '4:5',
    cameraStyle: '85mm portrait lens, f/1.8',
    lighting: 'Warm tungsten indoor light',
    mood: 'Confident',
    difficulty: 'intermediate',
    isFeatured: true,
    tags: ['wedding', 'traditional', 'portrait'],
    promptText: `Create a portrait of an adult Indian groom standing in a heritage doorway, one hand adjusting his cuff, shoulders squared, expression confident and still with a hint of a smile.

Wardrobe: an ivory raw-silk sherwani with fine tone-on-tone thread embroidery down the placket, a deep maroon stole over the left shoulder, a simple kalgi on the safa.

Setting: a carved wooden doorframe with brass detail, warm plastered wall, shallow depth so the interior behind falls into soft darkness.

Lighting: warm tungsten practicals from camera-left just out of frame, giving a soft directional key across the embroidery so the thread work catches light in relief; a weak warm bounce on the shadow side.

Camera: 85mm lens at f/1.8, framed from the knees up, camera at chest height, focus on the near eye with the embroidery still within the depth of field.

Colour: ivory, maroon and warm brass, restrained and rich.

Technical: 4:5 aspect ratio, high detail, thread embroidery resolved individually, raw-silk texture visible with its characteristic slubs, both hands anatomically correct.`,
    negativePrompt:
      'melted embroidery, flat lifeless fabric, extra fingers, deformed hands, floating turban, cool blue light, plastic skin, watermark, text',
    usageInstructions:
      'Ask for "relief" on the embroidery — that word does more work than "detailed" for getting thread texture to show.',
  },
  {
    title: 'Instagram Carousel Portrait Set',
    slug: 'flux-instagram-carousel-portrait-set',
    shortDescription:
      'A 4:5 portrait built for a consistent Instagram grid, with room for text overlay.',
    aiModel: 'flux',
    categorySlug: 'instagram',
    style: 'Minimal',
    gender: 'any',
    ageGroup: 'Young adult',
    location: 'Modern minimal photo studio',
    aspectRatio: '4:5',
    cameraStyle: '50mm prime, f/1.4',
    lighting: 'Soft diffused daylight',
    mood: 'Playful',
    difficulty: 'beginner',
    isTrending: true,
    tags: ['instagram', 'social media', 'portrait', 'studio'],
    promptText: `(clean minimal portrait:1.2), young adult seated on a simple wooden stool against a flat pastel-lilac backdrop, leaning slightly forward with elbows on knees, playful smirk, looking directly into the lens, wardrobe: an oversized cream knit and relaxed trousers, no logos, (large soft window light from camera-left:1.15), gentle shadow falling to the right keeping the lower-right area clean for text overlay, 50mm prime f/1.4, three-quarter body framing with generous headroom, camera at seated eye level, muted pastel palette, soft even contrast, high detail, natural skin texture, sharp focus on the eyes, aspect ratio 4:5`,
    negativePrompt:
      'busy background, harsh shadows, clutter in the corners, visible logos, extra fingers, deformed hands, plastic skin, blurry, low resolution, watermark, text overlay',
    usageInstructions:
      'The "keeping the lower-right area clean for text overlay" instruction is what makes this usable as a template. Change the backdrop colour per slide and keep everything else fixed.',
  },
  {
    title: 'YouTube Thumbnail Reaction Frame',
    slug: 'flux-youtube-thumbnail-reaction-frame',
    shortDescription:
      'A high-contrast 16:9 thumbnail frame with an exaggerated expression and clear space for titles.',
    aiModel: 'flux',
    categorySlug: 'youtube',
    style: 'High Contrast Monochrome',
    gender: 'any',
    ageGroup: 'Young adult',
    location: 'Modern minimal photo studio',
    aspectRatio: '16:9',
    cameraStyle: '35mm documentary, f/2.0',
    lighting: 'Studio three-point lighting',
    mood: 'Energetic',
    difficulty: 'beginner',
    tags: ['thumbnail', 'social media'],
    promptText: `(high-contrast thumbnail portrait:1.25), young adult positioned on the right third of the frame with an exaggerated look of surprised delight, eyebrows raised, mouth open, one hand gesturing near the face, wardrobe: a bright solid-colour tee against a deep contrasting background, (punchy saturated colour separation between subject and background:1.2), (large empty area on the left two-thirds for title text:1.15), studio three-point lighting with a hard key from camera-right and a strong rim light separating hair from background, 35mm lens f/2.0, chest-up framing, slight low angle, vivid saturated colour, crisp high micro-contrast, ultra-detailed, sharp focus on the eyes, aspect ratio 16:9`,
    negativePrompt:
      'subject centred, cluttered background, muddy low contrast, dull colours, extra fingers, deformed hand near face, distorted features, blurry, low resolution, watermark, existing text overlay',
    usageInstructions:
      'Thumbnails need composition control more than realism. The two weighted phrases about empty space and colour separation are the whole point — keep them and change everything else freely.',
  },
  {
    title: 'Anime-Style Festival Illustration',
    slug: 'sd-anime-festival-illustration',
    shortDescription:
      'A cel-shaded illustration of a festival evening with clean linework and warm lantern light.',
    aiModel: 'stable-diffusion',
    categorySlug: 'anime',
    style: 'Anime',
    gender: 'any',
    ageGroup: 'Teen',
    location: 'Bustling festival street at night',
    aspectRatio: '16:9',
    cameraStyle: '35mm documentary, f/2.0',
    lighting: 'Practical fairy lights',
    mood: 'Nostalgic',
    difficulty: 'beginner',
    tags: ['anime', 'festival', 'illustration'],
    promptText: `(anime illustration:1.3), (cel shaded:1.2), two teenagers walking side by side down a crowded festival street at night, seen from behind at three-quarter angle, one holding a paper lantern, the other carrying a paper cone of snacks, warm strings of bulbs overhead, stalls with hand-painted signage receding into the distance, soft crowd silhouettes, clean confident linework with varied line weight, flat colour fills with two-tone shading, (warm lantern glow as the dominant light source:1.15), nostalgic muted palette with warm highlights and cool blue-violet shadows, gentle bloom around the light sources, 16:9 composition with the pair on the lower-left third, detailed background, aspect ratio 16:9`,
    negativePrompt:
      'photorealistic, 3d render, muddy colours, sketchy inconsistent linework, extra limbs, deformed hands, distorted faces, blurry, low resolution, watermark, signature, text overlay',
    usageInstructions:
      'Keeping "photorealistic" and "3d render" in the negative prompt is what holds the style. Characters seen from behind avoid most face-consistency problems.',
  },
  {
    title: 'Fantasy Guardian in Mountain Mist',
    slug: 'midjourney-fantasy-guardian-mountain-mist',
    shortDescription:
      'A mythic wide frame with atmospheric scale, drawn from Indian folklore rather than western fantasy.',
    aiModel: 'midjourney',
    categorySlug: 'fantasy',
    style: 'Fine Art',
    gender: 'any',
    location: 'Ladakh mountain pass',
    aspectRatio: '21:9',
    cameraStyle: 'Low-angle hero shot',
    lighting: 'Rim light with haze',
    mood: 'Mysterious',
    difficulty: 'intermediate',
    tags: ['fantasy', 'landscape', 'cinematic'],
    promptText: `Fine-art fantasy illustration of a towering stone guardian figure carved in the style of Himalayan temple sculpture, standing sentinel at a high mountain pass, half-shrouded in drifting mist, weathered surface with lichen and centuries of erosion, a narrow prayer-flag line strung across the foreground for scale, a tiny lone traveller silhouetted at the base of the statue showing its immense height, low-angle hero framing from the traveller's position looking up, hard cold sun breaking through cloud behind the statue creating a rim of light along its shoulder and the mist glowing where it catches the beam, deep violet-grey shadows against pale gold highlights, restrained fine-art palette, atmospheric depth with four distinct layers of mist, ultra detailed stone carving, epic sense of scale --ar 21:9 --style raw`,
    negativePrompt:
      '--no western medieval armour, generic dragon, oversaturated colour, flat lighting, modern buildings, watermark, text, signature',
    usageInstructions:
      'The tiny traveller is doing the important work — without a human reference the model has no way to communicate scale. Keep that clause.',
  },
  {
    title: 'Birthday Candle Moment',
    slug: 'gemini-birthday-candle-moment',
    shortDescription:
      'A warm candlelit celebration frame with believable light falloff and genuine expressions.',
    aiModel: 'gemini',
    categorySlug: 'birthday',
    style: 'Documentary',
    gender: 'group',
    ageGroup: 'Any',
    location: 'Home dining room at night',
    aspectRatio: '3:2',
    cameraStyle: '35mm documentary, f/2.0',
    lighting: 'Candle and diya glow',
    mood: 'Joyful',
    difficulty: 'intermediate',
    tags: ['candid', 'natural light', 'portrait'],
    promptText: `Create a candid documentary photograph of a small family gathered around a birthday cake in a home dining room at night, the moment just before the candles are blown out. The person in the middle is leaning in with cheeks drawn; two others lean in from either side, one mid-laugh.

Setting: a simple round cake with lit candles, a cluttered-but-warm table with plates and glasses, a softly out-of-focus room behind.

Lighting: the candles are the primary source, lighting all three faces from below with rapid falloff; a very dim warm room light behind provides just enough separation so the group does not merge into the darkness. Twin catchlights from the candles in each pair of eyes.

Camera: 35mm lens at f/2.0, framed from across the table at cake height so the candle flames sit in the lower third, focus on the central face.

Colour: warm amber throughout with deep brown shadows, no cool tones.

Technical: 3:2 aspect ratio, high detail, correct flame scale and count, three distinct faces with consistent lighting direction, six hands total all anatomically correct.`,
    negativePrompt:
      'overhead flash, flat bright room light, giant flames, duplicate faces, merged bodies, extra fingers, deformed hands, watermark, text overlay',
    usageInstructions:
      'Group scenes with a single low light source are hard. State the exact number of people and hands — models are much more reliable when given a count.',
  },
  {
    title: 'Luxury Sedan Rolling Shot',
    slug: 'flux-luxury-sedan-rolling-shot',
    shortDescription:
      'An automotive rolling shot with accurate panel reflections and motion in the wheels and road.',
    aiModel: 'flux',
    categorySlug: 'cars',
    style: 'Hyper Realistic',
    gender: 'non-human',
    location: 'Coastal highway at dusk',
    aspectRatio: '16:9',
    cameraStyle: 'Handheld gimbal tracking',
    lighting: 'Golden hour sunlight',
    mood: 'Confident',
    difficulty: 'advanced',
    tags: ['automotive', 'golden hour', 'cinematic'],
    promptText: `(hyper realistic automotive photography:1.3), (rolling shot:1.25), a dark metallic-grey luxury sedan travelling at speed along a coastal highway at dusk, shot from a tracking vehicle alongside at the same speed, three-quarter front angle, (accurate environment reflections across the bonnet and door panels:1.25), (wheels showing rotational motion blur while the body stays tack sharp:1.3), road surface and guardrail streaking past, sea and sky visible beyond the barrier, low sun from camera-rear-left putting a long specular highlight along the shoulder line, headlights and daytime running lamps lit, gimbal-stabilised tracking shot at wheel height, 35mm lens f/4, warm gold highlights against cool blue dusk sky, teal and orange grade, ultra-detailed, 8K resolution, paint flake visible in the highlight, aspect ratio 16:9`,
    negativePrompt:
      'static frozen wheels, blurry car body, warped panel geometry, wrong badge shapes, floating car, missing ground shadow, distorted reflections, duplicate wheels, blurry, low resolution, jpeg artifacts, watermark, text overlay, cartoon',
    usageInstructions:
      'Rolling shots need contradictory instructions — sharp body, blurred wheels. Both weighted phrases are essential; drop either one and you get an ordinary parked car.',
  },
  {
    title: 'Modern Interior Architecture Frame',
    slug: 'ideogram-modern-interior-architecture-frame',
    shortDescription:
      'An interior frame with plumb verticals, layered natural light and honest material texture.',
    aiModel: 'ideogram',
    categorySlug: 'architecture',
    style: 'Minimal',
    gender: 'non-human',
    location: 'Contemporary Indian home interior',
    aspectRatio: '3:2',
    cameraStyle: '24mm wide environmental',
    lighting: 'Soft diffused daylight',
    mood: 'Serene',
    difficulty: 'intermediate',
    tags: ['architecture', 'minimal', 'natural light'],
    promptText: `Architectural interior photograph of a contemporary Indian living room in the late morning, unoccupied.

Composition: a low linen sofa along the left wall, a jaali screen filtering light on the right, a polished oxide floor reflecting softly, a single large potted plant in the far corner, one framed artwork on the rear wall. Frame arranged so the jaali screen and the sofa edge create strong parallel lines.

Perspective: 24mm wide lens with all vertical lines fully corrected and plumb, tripod at 1.2 metres, one-point perspective with the vanishing point on the rear wall slightly left of centre.

Lighting: soft daylight entering through the jaali, throwing a patterned grid of light across the floor and up the side of the sofa; a second softer source from a window behind camera lifting the shadows. No artificial lights on.

Materials: visible linen weave on the upholstery, honest oxide-floor sheen with subtle imperfections, matte lime plaster on the walls, warm teak in the jaali.

Colour: warm neutrals — cream, teak, terracotta — with a single green accent from the plant.

Technical: 3:2 aspect ratio, ultra detail, sharp corner to corner, full tonal range with no clipped window highlights and no crushed shadow, the jaali light pattern crisp on the floor.`,
    negativePrompt:
      'converging verticals, keystoning, fisheye distortion, blown-out windows, crushed shadows, HDR halos, cluttered styling, people, oversaturated colour, watermark, text overlay',
    usageInstructions:
      'Interiors live or die on the window highlights. "No clipped window highlights" is more effective than asking for HDR, which tends to produce halos.',
  },
  {
    title: 'Nature Macro in Morning Dew',
    slug: 'sd-nature-macro-morning-dew',
    shortDescription:
      'A macro nature frame with real water-droplet refraction and a clean bokeh background.',
    aiModel: 'stable-diffusion',
    categorySlug: 'nature',
    style: 'Hyper Realistic',
    gender: 'non-human',
    location: 'Garden at sunrise',
    aspectRatio: '1:1',
    cameraStyle: 'Macro detail shot',
    lighting: 'Golden hour sunlight',
    mood: 'Serene',
    difficulty: 'beginner',
    tags: ['nature', 'golden hour', 'bokeh'],
    promptText: `(hyper realistic macro photography:1.3), a single marigold petal edge covered in morning dew droplets, extreme close-up, (accurate water droplet refraction showing the petal texture magnified inside each drop:1.25), fine hairs along the petal edge catching light, warm low sunrise sun raking from camera-left creating tiny specular highlights on every droplet, creamy out-of-focus green and gold background, macro lens at f/4 with a razor-thin plane of focus across the droplet line, framed square with the petal running diagonally corner to corner, warm gold and deep orange against soft green bokeh, ultra-detailed, 8K resolution, texture-accurate, aspect ratio 1:1`,
    negativePrompt:
      'plastic-looking droplets, uniform fake spheres, missing refraction, flat lighting, busy background, oversaturated, blurry subject, low resolution, jpeg artifacts, watermark, text overlay',
    usageInstructions:
      'The refraction clause is what separates real-looking dew from plastic beads. Keep it verbatim and run at 40+ steps.',
  },
  {
    title: 'Family Portrait in Soft Window Light',
    slug: 'chatgpt-family-portrait-window-light',
    shortDescription:
      'A four-person family portrait with even light across every face and natural spacing.',
    aiModel: 'chatgpt',
    categorySlug: 'family',
    style: 'Studio Portrait',
    gender: 'group',
    ageGroup: 'Any',
    location: 'Home living room by a large window',
    aspectRatio: '3:2',
    cameraStyle: '50mm prime, f/1.4',
    lighting: 'Soft diffused daylight',
    mood: 'Joyful',
    difficulty: 'intermediate',
    tags: ['portrait', 'candid', 'natural light'],
    promptText: `Create a warm family portrait of four people — two adults and two children — seated together on a low sofa beside a large window in the late afternoon, arranged in a loose triangle with the children in front, everyone relaxed and looking at the camera with easy natural smiles.

Wardrobe: coordinated but not matching — soft neutrals in cream, oatmeal and pale blue, no logos or busy patterns.

Setting: a simple living room with a plain wall behind, one plant just inside the frame edge, soft-focus interior beyond.

Lighting: a large window camera-left acting as a broad soft source, positioned so all four faces receive the same light with no one falling into shadow; a white wall camera-right returning gentle fill. No artificial light.

Camera: 50mm lens at f/2.8 — deep enough that all four faces sit within the plane of focus — framed from the knees up, camera at the children's eye level, focus on the front row.

Colour: warm neutral tones, gentle contrast, accurate skin tones across all four subjects.

Technical: 3:2 aspect ratio, high detail, four distinct faces all sharp, eight hands total and all anatomically correct, no merging between bodies, natural spacing with slight overlap.`,
    negativePrompt:
      'one face in shadow, merged bodies, duplicate faces, extra limbs, deformed hands, inconsistent skin tones, shallow focus with soft faces, harsh flash, watermark, text',
    usageInstructions:
      'Note the aperture: f/2.8 rather than f/1.4. Group portraits need depth of field, and stating the reason ("deep enough that all four faces sit within the plane of focus") makes models comply.',
  },
  {
    title: 'Holi Colour Burst Portrait',
    slug: 'flux-holi-colour-burst-portrait',
    shortDescription:
      'A high-energy Holi portrait with suspended colour powder and a protected, sharp face.',
    aiModel: 'flux',
    categorySlug: 'festival',
    style: 'Documentary',
    gender: 'any',
    ageGroup: 'Young adult',
    location: 'Open terrace during Holi',
    aspectRatio: '4:5',
    cameraStyle: '50mm prime, f/1.4',
    lighting: 'Soft diffused daylight',
    mood: 'Playful',
    difficulty: 'intermediate',
    isTrending: true,
    tags: ['festival', 'candid', 'portrait'],
    promptText: `(documentary festival photography:1.2), young adult on an open terrace during Holi, mid-laugh with eyes squeezed shut, head tilted back, wearing a soaked white kurta stained with pink, yellow and green, (clouds of dry colour powder suspended in the air around the head and shoulders:1.3), individual powder particles catching the light, colour smeared across cheeks and forehead, (face sharp and clearly readable through the powder:1.2), bright overcast midday light for even soft illumination, 50mm prime f/1.4, chest-up framing, camera at eye level, saturated pink magenta and yellow against the white kurta, high energy, ultra-detailed, natural wet skin texture, sharp focus on the face, aspect ratio 4:5`,
    negativePrompt:
      'face fully obscured by powder, muddy brown colour mixing, flat pasted-on colour, extra fingers, deformed hands, distorted features, blurry face, low resolution, watermark, text overlay',
    usageInstructions:
      'Two weighted phrases fight each other here on purpose — lots of powder, but a readable face. If the face disappears, raise the "face sharp" weight to 1.35.',
  },
  {
    title: 'Vintage Film Street Frame',
    slug: 'midjourney-vintage-film-street-frame',
    shortDescription:
      'A grainy vintage-film street frame with halation, muted colour and honest imperfection.',
    aiModel: 'midjourney',
    categorySlug: 'photography',
    style: 'Vintage Film',
    gender: 'any',
    location: 'Bustling spice market lane',
    aspectRatio: '3:2',
    cameraStyle: '35mm documentary, f/2.0',
    lighting: 'Warm tungsten indoor light',
    mood: 'Nostalgic',
    difficulty: 'beginner',
    isFeatured: true,
    tags: ['vintage film', 'candid', 'travel'],
    promptText: `Vintage 35mm film street photograph of a narrow spice market lane in the late afternoon, a vendor mid-gesture behind sacks of turmeric and chilli, a passer-by blurred in the foreground from movement, hand-painted signage above, dust and light shafts cutting between the awnings, shot on expired colour negative film with visible grain, gentle halation around the brightest highlights, slightly shifted colour with warm greens and faded reds, soft corner falloff and mild vignetting, imperfect focus with the vendor sharp and everything else falling away, 35mm lens f/2.0, eye-level candid framing from the hip, nostalgic muted palette, natural finish --ar 3:2 --style raw`,
    negativePrompt:
      '--no clinical digital sharpness, oversaturated colour, HDR look, modern signage, watermark, text overlay, plastic skin',
    usageInstructions:
      'Film looks are about controlled imperfection. Asking for "expired colour negative" and "halation" gets you further than the word "vintage" alone.',
  },
  {
    title: 'Bandhani Co-ord Street Style',
    slug: 'gemini-bandhani-coord-street-style',
    shortDescription:
      'A contemporary street-style frame that keeps tie-dye pattern detail crisp in hard light.',
    aiModel: 'gemini',
    categorySlug: 'girls',
    style: 'Editorial Fashion',
    gender: 'female',
    ageGroup: 'Young adult',
    location: 'Old Goa colonial street',
    aspectRatio: '4:5',
    cameraStyle: '50mm prime, f/1.4',
    lighting: 'Dramatic split lighting',
    mood: 'Confident',
    difficulty: 'intermediate',
    tags: ['editorial', 'streetwear', 'goa', 'handloom'],
    promptText: `Create a contemporary street-style portrait of a young woman walking towards the camera mid-stride along a colonial street in old Goa, one hand adjusting her sunglasses, chin slightly raised, confident and unbothered expression.

Wardrobe: a red-and-white bandhani print co-ord set with a relaxed fit, white canvas sneakers, small hoop earrings.

Setting: a mustard-yellow colonial wall with peeling paint on one side, a hard-edged shadow line from the roofline cutting diagonally across the wall and the street.

Lighting: hard early-afternoon sun from camera-right creating a defined split between the lit and shadow sides of her face and outfit; the shadow side retains detail thanks to bounce off the pale street.

Camera: 50mm lens at f/2.8, three-quarter body framing, camera slightly below chest height, focus on the eyes with the bandhani pattern within the depth of field.

Colour: red and white against mustard walls, saturated but not clipping, strong contrast between light and shade.

Technical: 4:5 aspect ratio, high detail, individual bandhani dots resolved rather than smeared, natural walking posture with correct leg positioning, both hands anatomically correct.`,
    negativePrompt:
      'smeared tie-dye pattern, blurred print detail, unnatural walking pose, floating feet, extra fingers, deformed hands, flat overcast lighting, watermark, text',
    usageInstructions:
      'Bandhani dots smear easily. "Individual dots resolved rather than smeared" is the phrase that fixes it — generic "detailed fabric" does not.',
  },
];
