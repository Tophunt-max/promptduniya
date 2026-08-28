import type { SeedPrompt } from './prompt-types';

/** Free-tier sample prompts (original content written for promptduniya). */
export const FREE_PROMPTS: SeedPrompt[] = [
  {
    title: 'Golden Hour Rooftop Portrait',
    slug: 'gemini-golden-hour-rooftop-portrait',
    shortDescription:
      'A warm rooftop portrait at sunset with soft rim light and a city skyline falling away behind the subject.',
    aiModel: 'gemini',
    categorySlug: 'portrait',
    style: 'Cinematic',
    gender: 'any',
    ageGroup: 'Young adult',
    location: 'Delhi rooftop with string lights',
    aspectRatio: '4:5',
    cameraStyle: '85mm portrait lens, f/1.8',
    lighting: 'Golden hour sunlight',
    mood: 'Serene',
    difficulty: 'beginner',
    isFeatured: true,
    isTrending: true,
    tags: ['portrait', 'golden hour', 'cinematic', 'bokeh'],
    promptText: `Create a cinematic golden-hour portrait of a young adult standing on an open urban rooftop in Delhi, turned three-quarters towards the camera with a soft, natural smile.

Wardrobe: a plain sand-coloured linen shirt with the sleeves rolled once, no visible logos.

Setting: a low parapet wall in the foreground, a hazy city skyline compressed in the background, and warm string lights strung overhead just out of focus.

Lighting: low sun behind and slightly to the left of the subject, creating a warm rim light along the jaw and hair, with a soft bounce filling the face so the shadow side keeps detail.

Camera: 85mm lens at f/1.8, framed from mid-chest up, eye level, focus locked on the near eye.

Colour: warm amber highlights with cool blue shadows in the skyline, gentle film-like roll-off in the brightest areas.

Technical: 4:5 aspect ratio, high detail, true-to-life skin texture with visible pores, natural flyaway hair strands, hands not in frame.`,
    negativePrompt:
      'plastic skin, over-smoothed face, blown-out highlights, harsh direct flash, extra fingers, deformed ears, watermark, text overlay, oversaturated orange skin, duplicate faces',
    usageInstructions:
      'Change only the wardrobe colour on your second run — keeping the lighting description identical is what makes a series look consistent. If the rim light disappears, move the phrase "low sun behind the subject" to the start of the prompt.',
  },
  {
    title: 'Handloom Saree Courtyard Portrait',
    slug: 'gemini-handloom-saree-courtyard-portrait',
    shortDescription:
      'A soft daylight portrait in a heritage courtyard that keeps the weave and border of a handloom saree sharp.',
    aiModel: 'gemini',
    categorySlug: 'saree',
    style: 'Editorial Fashion',
    gender: 'female',
    ageGroup: 'Adult',
    location: 'Jaipur haveli courtyard',
    aspectRatio: '4:5',
    cameraStyle: '85mm portrait lens, f/1.8',
    lighting: 'Soft diffused daylight',
    mood: 'Regal',
    difficulty: 'beginner',
    isFeatured: true,
    isTrending: true,
    tags: ['saree', 'handloom', 'traditional', 'jaipur', 'editorial'],
    promptText: `Create an editorial portrait of an adult Indian woman standing in the open courtyard of a Jaipur haveli, one hand lightly adjusting the pleats of her saree, chin level, gaze direct and composed.

Wardrobe: a deep indigo handloom cotton saree with a contrasting mustard temple border and a simple blouse; small gold jhumkas; no other jewellery.

Setting: lime-washed pink-ochre walls with visible texture, a carved sandstone arch to camera right, a shallow strip of sunlit floor at her feet.

Lighting: soft overhead daylight diffused by the open courtyard, bright but shadowless on the face, with a subtle warm bounce from the walls.

Camera: 85mm lens at f/1.8, full-length framing with headroom above the arch, camera at chest height, focus on the eyes.

Colour: rich indigo and mustard against warm neutral stone, restrained saturation.

Technical: 4:5 aspect ratio, high detail, the saree weave and border embroidery clearly resolved, fabric drape falling naturally with real weight, hands anatomically correct with five visible fingers.`,
    negativePrompt:
      'melted fabric patterns, blurred border embroidery, extra fingers, deformed hands, floating jewellery, distorted face, plastic skin, watermark, text, oversaturated colours',
    usageInstructions:
      'Fabric detail is the hard part. If the weave looks smeared, add "macro-level fabric texture, individual threads visible" near the end of the prompt and re-run.',
  },
  {
    title: 'Marine Drive Couple at Blue Hour',
    slug: 'gemini-marine-drive-couple-blue-hour',
    shortDescription:
      'A candid couple portrait at dusk with matched lighting on both faces and Mumbai city lights behind them.',
    aiModel: 'gemini',
    categorySlug: 'couples',
    style: 'Cinematic',
    gender: 'couple',
    ageGroup: 'Young adult',
    location: 'Mumbai Marine Drive at dusk',
    aspectRatio: '3:2',
    cameraStyle: '50mm prime, f/1.4',
    lighting: 'Moonlit blue hour',
    mood: 'Romantic',
    difficulty: 'intermediate',
    isTrending: true,
    tags: ['couple', 'mumbai', 'cinematic', 'candid'],
    promptText: `Create a candid cinematic photograph of an Indian couple in their late twenties sitting on the sea-facing promenade wall at Marine Drive, Mumbai, at blue hour. She is mid-laugh, head tilted slightly back; he is looking at her rather than the camera.

Wardrobe: she wears a rust cotton kurta with the sleeves pushed up; he wears a faded denim jacket over a plain white tee.

Setting: the curved sweep of promenade lights receding into the background, dark sea to the left, a damp stone wall catching reflections.

Lighting: deep blue ambient sky light as the base, warm sodium street lamps as a practical key from camera right, both faces lit by the same source so the colour temperature matches exactly.

Camera: 50mm lens at f/1.4, waist-up two-shot, camera at their seated eye level, focus on her near eye with his face slightly softer.

Colour: teal shadows against warm amber practicals, deep but detailed blacks.

Technical: 3:2 aspect ratio, high detail, natural skin tone on both subjects, four hands total and all correctly formed, no merging of bodies or clothing.`,
    negativePrompt:
      'merged bodies, three arms, mismatched lighting between faces, inconsistent skin tones, extra fingers, distorted features, blurry, watermark, text overlay, cartoonish look',
    usageInstructions:
      'Two-subject prompts fail most often on hands and face consistency. Generate at least four frames and discard any where the couple\u2019s lighting direction disagrees.',
  },
  {
    title: 'Diwali Diya Glow Portrait',
    slug: 'gemini-diwali-diya-glow-portrait',
    shortDescription:
      'A warm festival portrait lit almost entirely by oil lamps, with believable falloff and catchlights.',
    aiModel: 'gemini',
    categorySlug: 'festival',
    style: 'Festive Glow',
    gender: 'any',
    ageGroup: 'Any',
    location: 'Home doorway decorated for Diwali',
    aspectRatio: '4:5',
    cameraStyle: '50mm prime, f/1.4',
    lighting: 'Candle and diya glow',
    mood: 'Joyful',
    difficulty: 'intermediate',
    isFeatured: true,
    tags: ['festival', 'diwali', 'portrait', 'natural light'],
    promptText: `Create a warm festive portrait of a person crouching to place a clay diya in a row of lit lamps at a home doorway during Diwali, face lit from below by the flames, expression quietly delighted.

Wardrobe: a marigold-yellow kurta with fine chikankari embroidery at the collar.

Setting: a rangoli of marigold petals and white chalk on the floor, a wooden doorframe behind, four or five diyas already burning in a receding line.

Lighting: the diyas are the only meaningful light source — warm 1800K, very close to the subject, so falloff is rapid and the background sinks into soft darkness. Small twin catchlights in the eyes from the two nearest flames.

Camera: 50mm lens at f/1.4, framed from the knees up looking slightly down, focus on the eyes.

Colour: deep amber and ochre highlights, near-black shadows with retained detail, no cool tones anywhere in frame.

Technical: 4:5 aspect ratio, high detail, correct flame shapes and scale, hands holding the diya anatomically correct, no floating objects.`,
    negativePrompt:
      'giant unrealistic flames, blue light spill, flat evenly-lit scene, extra fingers, deformed hands, floating diyas, watermark, text, HDR halos',
    usageInstructions:
      'The phrase "the diyas are the only meaningful light source" is what stops the model flattening this into ordinary room light. Keep it.',
  },
  {
    title: 'Streetwear Portrait in Monsoon Rain',
    slug: 'flux-streetwear-monsoon-rain-portrait',
    shortDescription:
      'A high-contrast streetwear portrait with wet neon reflections and visible rain in the light.',
    aiModel: 'flux',
    categorySlug: 'boys',
    style: 'Street Photography',
    gender: 'male',
    ageGroup: 'Young adult',
    location: 'Rain-soaked city street with neon reflections',
    aspectRatio: '4:5',
    cameraStyle: '35mm documentary, f/2.0',
    lighting: 'Neon city glow',
    mood: 'Confident',
    difficulty: 'intermediate',
    isTrending: true,
    tags: ['streetwear', 'portrait', 'monsoon', 'mumbai'],
    promptText: `(street photography:1.2), young Indian man standing still in a narrow rain-soaked city lane at night, oversized black tee and loose cargo trousers, hood down, hair wet and pushed back, arms relaxed at his sides, confident neutral gaze straight into the lens, (neon shop signage reflecting in wet asphalt:1.15), visible rain streaks catching the light, shallow puddles with sharp specular reflections, 35mm documentary lens f/2.0, waist-up framing, eye level, (magenta and cyan neon key light:1.1), teal shadows, deep contrast, film grain, ultra-detailed, 8K resolution, true-to-life skin texture with rain droplets on the face, razor-sharp focus on the eyes, aspect ratio 4:5`,
    negativePrompt:
      'dry clothing, missing reflections, extra fingers, deformed hands, distorted face, asymmetric eyes, plastic skin, blurry, low resolution, jpeg artifacts, watermark, text overlay, logo, cartoon',
    usageInstructions:
      'Flux responds well to weighted terms. If the rain is not visible, raise the weight on "visible rain streaks" to 1.3 and keep everything else unchanged.',
  },
  {
    title: 'Minimal Product Shot on Seamless Backdrop',
    slug: 'flux-minimal-product-seamless-backdrop',
    shortDescription:
      'A clean e-commerce product shot with controlled reflections and a soft contact shadow.',
    aiModel: 'flux',
    categorySlug: 'product-photography',
    style: 'Minimal',
    gender: 'non-human',
    location: 'Modern minimal photo studio',
    aspectRatio: '1:1',
    cameraStyle: 'Macro detail shot',
    lighting: 'Studio three-point lighting',
    mood: 'Contemplative',
    difficulty: 'beginner',
    isFeatured: true,
    tags: ['product', 'ecommerce', 'studio', 'minimal'],
    promptText: `(commercial product photography:1.25), a handcrafted brass water bottle standing upright and perfectly centred on a seamless warm-grey backdrop, hammered surface texture clearly visible, (controlled soft reflections along the body:1.15), a single crisp engraved detail near the base, studio three-point lighting with a large softbox front-left, a subtle rim light from behind-right separating the bottle from the background, soft contact shadow directly beneath, macro-capable lens, straight-on eye-level framing with the product occupying 70 percent of the frame height, neutral colour with warm brass highlights, ultra-detailed, 8K resolution, razor-sharp focus across the full product, aspect ratio 1:1`,
    negativePrompt:
      'fingerprints, dust, scratches, warped shape, floating object, missing contact shadow, harsh specular blowout, distorted reflections, busy background, watermark, text overlay, logo, blurry, low resolution',
    usageInstructions:
      'Swap the object description and keep every lighting phrase identical — that is how you get a whole catalogue that looks like one shoot.',
  },
  {
    title: 'Kerala Backwater Travel Frame',
    slug: 'midjourney-kerala-backwater-travel-frame',
    shortDescription:
      'A wide travel frame with layered depth across a Kerala backwater at first light.',
    aiModel: 'midjourney',
    categorySlug: 'travel',
    style: 'Documentary',
    gender: 'any',
    location: 'Kerala backwater houseboat',
    aspectRatio: '16:9',
    cameraStyle: '24mm wide environmental',
    lighting: 'Soft diffused daylight',
    mood: 'Serene',
    difficulty: 'beginner',
    tags: ['travel', 'kerala', 'landscape', 'natural light'],
    promptText: `Documentary travel photograph of a traditional Kerala houseboat moving slowly through a narrow backwater channel at first light, a lone figure seated at the bow facing away from camera, coconut palms leaning over both banks, mist sitting low on the water, mirror-still reflections broken only by the boat's wake, layered depth from foreground reeds through the boat to distant treeline, 24mm wide environmental lens, low camera height close to the water, soft diffused dawn light, muted green and pale gold tones, gentle atmospheric haze, high detail, natural finish --ar 16:9 --style raw`,
    negativePrompt:
      '--no harsh midday sun, oversaturated greens, cartoon look, distorted boat shape, floating objects, watermark, text overlay, tourists crowding the frame',
    usageInstructions:
      'Midjourney puts the parameter flags at the end. Add `--seed` once you find a frame you like, then vary only the time of day.',
  },
  {
    title: 'Corporate Headshot on Neutral Grey',
    slug: 'chatgpt-corporate-headshot-neutral-grey',
    shortDescription:
      'A professional headshot with flattering three-point lighting and an approachable expression.',
    aiModel: 'chatgpt',
    categorySlug: 'business',
    style: 'Studio Portrait',
    gender: 'any',
    ageGroup: 'Adult',
    location: 'Modern minimal photo studio',
    aspectRatio: '4:5',
    cameraStyle: '85mm portrait lens, f/1.8',
    lighting: 'Studio three-point lighting',
    mood: 'Confident',
    difficulty: 'beginner',
    tags: ['corporate', 'portrait', 'studio'],
    promptText: `Create a professional corporate headshot of an adult in business attire, squared to camera with shoulders angled very slightly away, chin level, wearing a warm and approachable closed-mouth smile.

Wardrobe: a well-fitted charcoal blazer over a crisp white shirt, no tie, no visible branding.

Setting: a seamless mid-grey studio backdrop with a subtle vertical gradient, slightly darker at the edges.

Lighting: a large softbox key at 45 degrees camera-left and slightly above eye level, a fill panel camera-right at roughly half the key's intensity, and a hair light behind to separate the head from the background. Soft, even, no harsh shadow under the nose.

Camera: 85mm lens at f/1.8, framed from mid-chest up with a little headroom, camera at eye level, focus on the near eye.

Colour: neutral and accurate, no colour cast on the skin or the shirt.

Technical: 4:5 aspect ratio, high detail, natural skin texture retained, eyes sharp with visible catchlights, collar and lapel edges clean.`,
    negativePrompt:
      'heavy retouching, plastic skin, harsh shadow under nose, colour cast on white shirt, crooked collar, distorted glasses, extra fingers, watermark, text',
    usageInstructions:
      'For a matched team set, keep every lighting and camera sentence byte-for-byte identical and change only the wardrobe and subject line.',
  },
  {
    title: 'Cafe Racer on a Coastal Road',
    slug: 'sd-cafe-racer-coastal-road',
    shortDescription:
      'A motorcycle hero shot with a low angle, hard afternoon light and honest metal reflections.',
    aiModel: 'stable-diffusion',
    categorySlug: 'bikes',
    style: 'Hyper Realistic',
    gender: 'non-human',
    location: 'Old Goa colonial street',
    aspectRatio: '3:2',
    cameraStyle: 'Low-angle hero shot',
    lighting: 'Dramatic split lighting',
    mood: 'Energetic',
    difficulty: 'intermediate',
    tags: ['automotive', 'bikes', 'goa'],
    promptText: `(hyper realistic automotive photography:1.25), a matte-black cafe racer motorcycle parked at a slight angle on an empty coastal road in old Goa, brushed aluminium tank strip, spoked wheels, worn leather seat, (accurate chrome and metal reflections:1.2), whitewashed colonial wall behind with peeling paint, palm shadows falling across the tarmac, low-angle hero shot from just above ground level, 35mm lens f/2.8, hard mid-afternoon side light creating a strong split between lit and shadow sides, warm earthy tones with deep shadows, ultra-detailed, 8K resolution, razor-sharp focus on the engine and tank, aspect ratio 3:2`,
    negativePrompt:
      'warped frame geometry, melted exhaust, wrong number of spokes, floating motorcycle, missing shadow, distorted reflections, blurry, low resolution, jpeg artifacts, watermark, text overlay, logo, cartoon',
    usageInstructions:
      'Paste the negative prompt into the dedicated negative field, not the main box. Bike geometry is where this fails — check the wheel spokes before you commit to a frame.',
  },
  {
    title: 'Studio Portrait in High-Contrast Monochrome',
    slug: 'ideogram-studio-monochrome-portrait',
    shortDescription:
      'A black-and-white studio portrait with sculpted light and deep, controlled shadow.',
    aiModel: 'ideogram',
    categorySlug: 'portrait',
    style: 'High Contrast Monochrome',
    gender: 'any',
    ageGroup: 'Adult',
    location: 'Modern minimal photo studio',
    aspectRatio: '4:5',
    cameraStyle: '135mm compressed telephoto',
    lighting: 'Dramatic split lighting',
    mood: 'Contemplative',
    difficulty: 'advanced',
    tags: ['portrait', 'monochrome', 'studio', 'editorial'],
    promptText: `High-contrast black-and-white studio portrait of an adult, head turned slightly away from the light with eyes coming back towards the lens, lips closed, expression thoughtful and still.

Wardrobe: a plain black high-neck top so the clothing disappears into the background.

Setting: a black studio backdrop with no visible seams or texture.

Lighting: a single hard source at 90 degrees camera-left creating a clean split down the centre of the face, no fill on the shadow side, a narrow strip of light catching the cheekbone and jaw. The shadow side falls to near-black but keeps a trace of detail in the eye socket.

Camera: 135mm lens at f/4 for compressed features, tight head-and-shoulders crop, camera at eye level, focus on the lit eye.

Tone: true monochrome with a full range from clean white highlight on the cheekbone to dense black shadow, fine film grain, no colour tinting.

Technical: 4:5 aspect ratio, ultra detail, skin texture and individual pores retained, eyelashes separated, no crushed blacks in the eye.`,
    negativePrompt:
      'flat even lighting, grey muddy tones, colour tint, over-smoothed skin, crushed shadow with no detail, asymmetric eyes, watermark, text overlay',
    usageInstructions:
      'This is an advanced setup because the shadow side must stay dark but not empty. If the face goes fully black on one side, add "trace of detail retained in the shadow-side eye".',
  },
];
