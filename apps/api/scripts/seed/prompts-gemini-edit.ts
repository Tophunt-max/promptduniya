import type { SeedPrompt } from './prompt-types';

/**
 * Identity-preserving photo-editing prompts (original content written for
 * promptduniya).
 *
 * These differ from the text-to-image prompts in the other seed files in one
 * important way: the user uploads a photo of themselves and the model rebuilds
 * the scene around their real face. That makes them conversational-model
 * prompts — plain prose for Gemini and ChatGPT, with no weight syntax like
 * `(term:1.2)` and no CLI flags like `--ar`, because neither model honours them.
 *
 * Every prompt follows the same eight blocks, in this order:
 *   1. Identity lock      — preserve the uploaded face, forbid beautification
 *   2. Scene and pose     — where the subject is, how they are standing
 *   3. Wardrobe           — fabric-level description
 *   4. Environment        — surfaces, depth, clutter control
 *   5. Texture            — skin pores and fabric fibres, the anti-plastic pass
 *   6. Lighting           — key, fill, shadow direction, colour temperature
 *   7. Camera and grade   — lens, aperture, framing, colour treatment
 *   8. Constraints        — framing lock and what must not appear
 *
 * The order matters: both models weight earlier instructions more heavily, so
 * the identity lock goes first and the framing lock goes last where it acts as
 * a final correction.
 *
 * Deliberately excluded: named real people, celebrity likenesses and
 * trademarked logos. Every negative prompt rejects brand marks explicitly, both
 * to keep outputs publishable and to keep promptduniya clear of likeness and
 * trademark claims.
 */

/** Reused verbatim so every prompt in the set locks identity the same way. */
const IDENTITY_LOCK =
  'Use the uploaded photo as the single source of facial identity. Reproduce the face exactly as it appears: bone structure, eye shape and spacing, eyebrow shape, nose, lips, jawline, chin, hairline, facial hair, skin tone and the natural asymmetry between the two halves of the face. Do not slim, smooth, brighten, reshape or idealise any feature. Do not change apparent age. The person must remain immediately recognisable to someone who knows them.';

/** Shared tail — the two failure modes every one of these prompts must reject. */
const NEGATIVE_BASE =
  'changed face, different person, face swap, beautified face, slimmed jaw, enlarged eyes, lightened skin tone, plastic skin, waxy skin, over-smoothed skin, beauty filter, artificial symmetry, cartoon, anime, 3D render, CGI look, illustration, painting, distorted hands, extra fingers, missing fingers, malformed limbs, duplicate people, blown-out highlights, excessive HDR, oversaturated colour, brand logos, trademarked marks, readable signage, text overlay, watermark, low resolution, blurry';

export const GEMINI_EDIT_PROMPTS: SeedPrompt[] = [
  /* ----------------------------- Festival ------------------------------- */
  {
    title: 'Diwali Diya Doorway Portrait',
    slug: 'edit-diwali-diya-doorway-portrait',
    shortDescription:
      'Upload your photo and get a warm Diwali portrait lit almost entirely by clay diyas in a home doorway.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'festival',
    style: 'Cinematic',
    gender: 'any',
    ageGroup: 'Young adult',
    location: 'Home doorway with rangoli',
    aspectRatio: '4:5',
    cameraStyle: '85mm portrait lens, f/2.2',
    lighting: 'Warm diya flame light',
    mood: 'Festive',
    difficulty: 'beginner',
    isFeatured: true,
    isTrending: true,
    tags: ['diwali', 'festival', 'photo editing', 'diya', 'warm light', 'identity lock'],
    seoTitle: 'Diwali AI Photo Editing Prompt for Gemini — Diya Doorway Portrait',
    seoDescription:
      'Copy-paste Diwali photo editing prompt for Gemini and ChatGPT. Upload your photo, keep your face, get a diya-lit doorway portrait in 4:5.',
    promptText: `${IDENTITY_LOCK}

Scene and pose: place the person standing in the open doorway of an Indian home on Diwali night, body angled about twenty degrees away from the camera with the face turned fully back to the lens. One hand holds a small clay diya at roughly chest height, close enough that the flame lights the underside of the jaw. The other hand rests relaxed at the side. Shoulders down and loose, chin level, a calm closed-mouth smile, eyes directly on the camera.

Wardrobe: a deep maroon silk kurta with a visible slub in the weave and a narrow tone-on-tone placket, worn over straight cream cotton trousers. A thin gold-toned chain sits at the neckline, half hidden. No wristwatch, no rings, no printed motifs.

Environment: a wooden door frame with worn paint immediately behind the shoulder, a chalk-and-colour rangoli on the polished floor at the feet, and a row of lit diyas along the threshold receding out of focus to one side. Marigold strings hang across the top of the frame. Every surface is clean and swept — no wax spills, no litter, no stacked objects.

Texture: keep skin pores, fine facial hair, natural lip texture and the small tonal variations across the forehead and cheeks clearly visible. Preserve silk fibre sheen, the matte grain of the clay diya, chalk dust in the rangoli and the flaking paint on the door frame.

Lighting: the diya flame is the key light, warm and low, striking the face from below and slightly to one side, so shadows fall upward across the cheekbones. A dim warm interior lamp deep inside the house provides a weak fill so the shadow side keeps detail. Everything beyond two metres falls into near darkness. No overhead room light, no camera flash.

Camera and grade: 85mm equivalent at f/2.2, ISO 1250, framed from the waist up with the top of the door frame just inside the crop, camera at eye level. Deep warm grade — amber highlights, dense brown-black shadows, restrained saturation so the maroon reads rich rather than orange. Visible fine grain from the high ISO.

Constraints: vertical 4:5 framing. Face fully turned to camera. Exactly one flame in the held diya. Nothing else in the set below.`,
    negativePrompt: `${NEGATIVE_BASE}, fireworks in frame, sparklers, electric fairy lights as key light, daylight, harsh flash, floating diyas, duplicate flames, melted wax puddles`,
    usageInstructions:
      'Upload a front-facing photo taken in soft indoor light — a hard-flash selfie fights the diya lighting and usually loses. If the flame stops lighting the face, move the whole Lighting paragraph directly under the identity lock; both Gemini and ChatGPT weight the first two blocks most heavily. Run it two or three times before judging it.',
  },
  {
    title: 'Navratri Garba Spin Portrait',
    slug: 'edit-navratri-garba-spin-portrait',
    shortDescription:
      'Turn your photo into a mid-spin Navratri garba portrait with a flaring lehenga and warm festival lights behind.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'festival',
    style: 'Cinematic',
    gender: 'female',
    ageGroup: 'Young adult',
    location: 'Outdoor garba ground at night',
    aspectRatio: '4:5',
    cameraStyle: '50mm lens, f/2.5',
    lighting: 'Warm string lights overhead',
    mood: 'Joyful',
    difficulty: 'intermediate',
    isTrending: true,
    tags: ['navratri', 'garba', 'lehenga', 'festival', 'photo editing', 'identity lock'],
    seoTitle: 'Navratri Garba AI Photo Prompt for Gemini — Mid-Spin Lehenga Portrait',
    seoDescription:
      'Navratri photo editing prompt for Gemini and ChatGPT. Upload your photo and get a mid-spin garba portrait with a flaring lehenga.',
    promptText: `${IDENTITY_LOCK}

Scene and pose: place the person on an open garba ground at night, caught mid-turn. The hips and skirt are rotated away from the camera while the torso twists back and the face comes fully round to the lens. Both arms are raised in a garba position, elbows soft, wrists turned outward, fingers relaxed rather than splayed. Weight is on the ball of one foot. Expression is a genuine open smile with the eyes crinkling, looking straight at the camera.

Wardrobe: a chaniya choli in deep teal with dense mirror-work along the hem and a contrasting rust-orange dupatta pinned at one shoulder and lifting with the movement. The skirt is heavy cotton with visible gathers, flaring outward in a wide circle from the spin. Oxidised silver jhumkas, stacked bangles on both wrists, no nose ring.

Environment: a packed festival ground with rows of warm bulb strings crossing overhead. Other dancers appear only as soft out-of-focus shapes well behind the subject, never overlapping her outline. A decorated garba mandap glows faintly at the far edge of the frame. The ground is swept earth with no rubbish, no plastic cups, no loose cables.

Texture: preserve skin pores, fine hairs along the temple, real sweat sheen on the forehead and the natural flush of movement. Keep individual mirror discs, embroidery thread, cotton weave in the flaring skirt and the metal grain of the oxidised jewellery sharply resolved.

Lighting: warm tungsten bulb strings above are the key, dropping light onto the crown, shoulders and the upper planes of the face, with soft shadows beneath the brow and chin. A weak cool ambient fill from the open night sky lifts the shadow side just enough. The background lights render as soft round highlights, not star shapes.

Camera and grade: 50mm equivalent at f/2.5, ISO 1600, shutter fast enough to hold the face sharp while the skirt hem carries a trace of motion blur. Full-length framing with clearance above the raised hands and below the skirt hem, camera at chest height. Warm festival grade with amber highlights, deep but open shadows and true teal in the fabric. Natural high-ISO grain.

Constraints: vertical 4:5 framing. Face fully turned to camera and completely sharp. Both hands visible with five fingers each. Skirt flare must read as fabric, not as a smooth cone.`,
    negativePrompt: `${NEGATIVE_BASE}, motion blur on the face, frozen static pose, dandiya sticks crossing the face, crowd overlapping the subject, plastic-looking mirror work, star-shaped light flares, daylight sky`,
    usageInstructions:
      'The spin is the hard part — the model tends to either freeze the pose or blur the face. Keep the phrase about the face staying sharp while only the hem blurs, and run it three to five times. A photo of you looking straight into the camera works better here than a side profile, because the twist already turns the head.',
  },

  /* ------------------------------- Saree -------------------------------- */
  {
    title: 'Silk Saree Temple Corridor Portrait',
    slug: 'edit-silk-saree-temple-corridor-portrait',
    shortDescription:
      'Upload your photo for a still, editorial saree portrait in a stone temple corridor with long receding pillars.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'saree',
    style: 'Editorial Fashion',
    gender: 'female',
    ageGroup: 'Adult',
    location: 'South Indian temple corridor',
    aspectRatio: '4:5',
    cameraStyle: '85mm portrait lens, f/2.8',
    lighting: 'Side daylight between pillars',
    mood: 'Regal',
    difficulty: 'beginner',
    isFeatured: true,
    tags: ['saree', 'temple', 'silk', 'editorial', 'photo editing', 'identity lock'],
    seoTitle: 'Silk Saree AI Photo Editing Prompt for Gemini — Temple Corridor Portrait',
    seoDescription:
      'Saree photo editing prompt for Gemini and ChatGPT. Upload your photo and get an editorial temple corridor portrait in 4:5.',
    promptText: `${IDENTITY_LOCK}

Scene and pose: place the person standing in a long stone temple corridor, body squared to the camera with one shoulder dropped very slightly. One hand holds the fall of the saree at hip height, thumb tucked into a pleat; the other arm hangs straight with the palm turned inward. Feet together, spine tall, chin level. The expression is composed and still — lips closed, no smile, eyes level and directly on the lens.

Wardrobe: a Kanjeevaram silk saree in deep bottle green with a wide gold zari border and a contrasting maroon pallu carrying woven temple motifs. The blouse matches the border. A single thick gold bangle on each wrist, small stud earrings, hair pulled back into a low bun with fresh jasmine wound through it.

Environment: a colonnade of weathered granite pillars running away from the subject on both sides, floor of worn polished stone slabs, and carved brackets visible where the pillars meet the ceiling. The far end of the corridor opens to bright daylight, giving the frame a deep bright vanishing point. Corridor swept clean — no offerings on the floor, no shoes, no crowd.

Texture: keep skin pores, fine facial hair, real texture around the eyes and lips, and the natural sheen of skin in humid air. Preserve the crisp zari thread, silk fibre catching the light along the pleats, granite grain, lichen in the pillar joints and individual jasmine buds.

Lighting: hard daylight enters from the open side of the corridor and rakes across the subject from ninety degrees, lighting one side of the face and body cleanly while the other falls into deep shadow. Reflected bounce from the pale stone floor lifts the shadow side just enough to keep detail in the eye socket. No fill flash, no artificial glow on the skin.

Camera and grade: 85mm equivalent at f/2.8, ISO 200, three-quarter length framing from mid-calf up, camera at chest height, pillars compressing behind her. Restrained editorial grade — accurate greens, warm gold in the zari, neutral skin, moderate contrast with the highlight on the lit cheek held just below clipping. Fine grain only.

Constraints: vertical 4:5 framing. Face fully to camera. Saree pleats must fall vertically and read as separate folds. Shadow side must retain visible detail, never pure black.`,
    negativePrompt: `${NEGATIVE_BASE}, flat frontal lighting, pure black shadow side, crowd in corridor, shoes on temple floor, deity idol face visible, plastic-looking silk, printed polyester sheen, floating jasmine`,
    usageInstructions:
      'The ninety-degree side light is what makes this look expensive — if the result comes back evenly lit and flat, put the Lighting block second, right after the identity lock. For a different colour story change only the saree and border in the Wardrobe block and leave every other word alone; that is how you get a matching set.',
  },

  /* ------------------------------ Couples ------------------------------- */
  {
    title: 'Mehendi Night Couple Portrait',
    slug: 'edit-mehendi-night-couple-portrait',
    shortDescription:
      'A warm two-person mehendi portrait built from two uploaded photos, with both faces held sharp and recognisable.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'couples',
    style: 'Cinematic',
    gender: 'couple',
    ageGroup: 'Young adult',
    location: 'Home terrace mehendi setup',
    aspectRatio: '4:5',
    cameraStyle: '50mm lens, f/2.0',
    lighting: 'Warm bulb strings and candle fill',
    mood: 'Romantic',
    difficulty: 'advanced',
    isPremium: true,
    isEditorsPick: true,
    tags: ['couple', 'mehendi', 'wedding', 'photo editing', 'two faces', 'identity lock'],
    seoTitle: 'Mehendi Couple AI Photo Prompt for Gemini — Two-Face Identity Lock',
    seoDescription:
      'Couple photo editing prompt for Gemini. Upload two photos and get a warm mehendi night portrait with both faces preserved.',
    promptText: `Use the two uploaded photos as the sources of facial identity — the first for the person on the left of the frame, the second for the person on the right. Reproduce both faces exactly: bone structure, eye shape, eyebrows, nose, lips, jawline, hairline, facial hair, skin tone and natural asymmetry. Do not blend, average or swap features between the two faces. Do not slim, smooth or brighten either one. Both people must remain independently recognisable.

Scene and pose: seat the pair close together on a low cushioned bench on a home terrace during a mehendi evening. They are angled inward towards each other at about thirty degrees, shoulders almost touching, but both faces turn out to the camera. The person on the left rests a hand palm-up on their knee showing fresh mehendi across the palm. The person on the right leans in very slightly, one hand behind on the bench. Both are mid-laugh but with mouths only just open, eyes on the lens.

Wardrobe: the person on the left wears a mustard-yellow cotton kurta set with fine chikankari at the yoke and a light dupatta over one shoulder. The person on the right wears an off-white linen kurta with a rolled collar and a moss-green Nehru jacket. Fabrics are matte and lived-in, not glossy. Minimal jewellery, no printed logos.

Environment: a terrace strung with warm bulbs at two heights, low brass candle holders on the floor around the bench, marigold garlands looped along a parapet wall, and a soft dark night sky above with the city glow low on the horizon. Floor swept, cushions neat, no scattered plates, no cables, no chairs stacked in the background.

Texture: preserve pores, fine facial hair and real skin variation on both faces independently. Keep chikankari thread, linen slub, the drying crackle of mehendi paste on the palm, brass patina and marigold petal texture resolved.

Lighting: warm bulb strings above are the key, falling on the tops of both heads and the near cheek of each. Candles on the floor add a weak warm uplight that catches the underside of the jaw and the mehendi palm. A dim cool ambient from the open sky separates both figures from the dark background. No flash, no coloured stage light.

Camera and grade: 50mm equivalent at f/2.0, ISO 1600, waist-up framing with both faces on the same focal plane and both fully sharp, camera at their seated eye level. Warm amber grade, deep open shadows, natural skin, restrained saturation. Visible high-ISO grain.

Constraints: vertical 4:5 framing. Exactly two people. Both faces fully to camera, both sharp, neither cropped. No third figure in the background. Four hands total, five fingers each.`,
    negativePrompt: `${NEGATIVE_BASE}, blended faces, identical twins, one face sharp one soft, three people, third arm, merged shoulders, mehendi on both palms, wet dripping mehendi, coloured disco lighting, daylight`,
    usageInstructions:
      'Two-face prompts are the hardest thing these models do. Upload both photos in the order named — left person first — and say it again in your message if the model swaps them. If one face drifts, regenerate rather than asking for a fix; a correction pass almost always degrades the other face. Budget five or six attempts.',
  },

  /* ------------------------------- Luxury ------------------------------- */
  {
    title: 'Midnight Showroom Overcoat Portrait',
    slug: 'edit-midnight-showroom-overcoat-portrait',
    shortDescription:
      'A cold, expensive-looking night portrait in a glass-walled car showroom, built around your uploaded photo.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'luxury',
    style: 'Editorial Fashion',
    gender: 'male',
    ageGroup: 'Young adult',
    location: 'Car showroom at night',
    aspectRatio: '3:4',
    cameraStyle: '85mm lens, f/2.0',
    lighting: 'Cool ambient with warm spot key',
    mood: 'Confident',
    difficulty: 'intermediate',
    isPremium: true,
    isFeatured: true,
    tags: ['luxury', 'night', 'overcoat', 'editorial', 'photo editing', 'identity lock'],
    seoTitle: 'Midnight Luxury AI Photo Prompt for Gemini — Showroom Overcoat Portrait',
    seoDescription:
      'Luxury night photo editing prompt for Gemini and ChatGPT. Upload your photo for a cinematic glass-walled showroom portrait.',
    promptText: `${IDENTITY_LOCK}

Scene and pose: place the person standing on the floor of a glass-walled automobile showroom late at night, empty of staff and customers. The body faces the camera nearly square with the weight shifted onto one leg and the opposite shoulder rolled back a few degrees. One hand is pushed into a coat pocket; the other hangs open at the side, fingers loosely curled. Chin level, jaw relaxed, lips together, a still and unsmiling expression with the eyes directly on the lens.

Wardrobe: a full-length charcoal wool overcoat worn open, wide notch lapels, structured shoulders, falling below the knee. Underneath, a fine-gauge black merino roll-neck and straight-cut black wool trousers with a clean break. Black leather derby shoes, polished but not mirror-bright. A slim steel watch just visible at one cuff. No other jewellery, no visible labels.

Environment: polished concrete floor throwing long soft reflections of the ceiling lights. Two unbadged dark saloon cars sit well back on either side, cropped and clearly secondary. A floor-to-ceiling glass wall on the far side shows a black city night with distant window lights thrown out of focus. Chrome-edged display plinths, no signage, no price boards, no people.

Texture: keep skin pores, stubble if present in the uploaded photo, fine hair at the temples and natural under-eye texture visible. Preserve wool fibre in the coat with a visible lapel roll, the flat matte of merino, leather grain on the shoes and the fine brushed finish on the watch case.

Lighting: recessed warm-white ceiling spots are the key, falling steeply from above and slightly in front, catching the tops of the shoulders, the brow, the cheekbones and the watch. Cool blue ambient spilling in from the glass wall fills the shadows and separates the coat from the dark background. Deep shadow sits under the chin and down the sides of the coat. No flash, no neon, no coloured gels.

Camera and grade: 85mm equivalent at f/2.0, ISO 800, framed from mid-thigh up with the subject centred and the showroom receding behind, camera at chest height and slightly below the eye line. Near-black grade — crushed but not clipped blacks in the wool, cool blue in the shadows, warm white on the skin, neutral and accurate skin tone, moderate contrast with a slight filmic desaturation through the midtones. Fine grain present.

Constraints: vertical 3:4 framing. Face fully to camera. Coat must read as wool with visible weight and drape, never as a flat black shape. Cars unbadged and out of focus. No people in the background.`,
    negativePrompt: `${NEGATIVE_BASE}, car badges, visible car brand marks, showroom signage, neon signs, rain on glass, wet floor reflections of neon, people in background, flat black coat with no texture, orange skin, daylight`,
    usageInstructions:
      'Black-on-black is where these prompts usually fail — the coat comes back as a flat silhouette. The Texture block is doing the real work, so keep it. If the coat still goes flat, add "subtle specular highlight along the lapel edge" to that block. Swap the showroom for a hotel lobby or a lift lobby and the rest of the prompt carries over unchanged.',
  },

  /* ----------------------------- Traditional ---------------------------- */
  {
    title: 'Heritage Courtyard Kurta Portrait',
    slug: 'edit-heritage-courtyard-kurta-portrait',
    shortDescription:
      'A clean overcast-light portrait against carved sandstone that keeps kurta fabric and stone texture honest.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'traditional',
    style: 'Editorial Fashion',
    gender: 'male',
    ageGroup: 'Young adult',
    location: 'Rajasthani haveli courtyard',
    aspectRatio: '4:5',
    cameraStyle: '35mm lens, f/2.8',
    lighting: 'Soft overcast daylight',
    mood: 'Composed',
    difficulty: 'beginner',
    tags: ['traditional', 'kurta', 'haveli', 'sandstone', 'photo editing', 'identity lock'],
    seoTitle: 'Traditional Kurta AI Photo Prompt for Gemini — Heritage Courtyard Portrait',
    seoDescription:
      'Traditional photo editing prompt for Gemini and ChatGPT. Upload your photo for a sandstone courtyard kurta portrait in 4:5.',
    promptText: `${IDENTITY_LOCK}

Scene and pose: place the person in the open courtyard of a Rajasthani haveli, leaning one shoulder lightly against a carved sandstone pillar. The body angles about forty degrees away from the camera while the face turns fully back to the lens. The near elbow is bent with the forearm resting against the pillar; the far hand rests at the waist. Weight on the back foot, front knee softly bent. Expression composed and quietly confident with a very slight smile, eyes on the lens.

Wardrobe: a matte black cotton kurta with a fine grid weave and a short mandarin collar, worn over straight bone-white trousers. A muted saffron sleeveless jacket with restrained hand embroidery along the placket. Tan leather juttis. One thin silver kada on the wrist, nothing else.

Environment: pale sandstone walls with visible pitting, a carved jaali screen throwing a soft geometric pattern across the wall behind, terracotta tile underfoot, and a large weathered wooden doorway framing the background. The courtyard is bare and swept — no potted plants crowding the frame, no furniture, no hanging wires.

Texture: keep skin pores, fine facial hair, natural texture across the forehead and around the eyes clearly visible. Preserve the flat matte of the cotton kurta, individual embroidery threads on the jacket, leather grain on the juttis, sandstone pores and the split grain of the old timber door.

Lighting: soft overcast daylight from the open sky above is the key — broad, directionless and gentle, giving a soft shadow under the chin and inside the clothing folds without any hard edge. Warm bounce off the sandstone walls lifts the shadow side and adds a faint warmth to the skin. No direct sun, no hard midday shadow across the face, no artificial fill.

Camera and grade: 35mm equivalent at f/2.8, ISO 320, three-quarter length framing with the jaali pattern readable behind, camera at chest height, natural perspective with the architecture kept legible rather than blurred away. Restrained grade — accurate stone neutrals, true black in the kurta, warm saffron, natural skin tone, gentle contrast and clean highlights. Subtle grain.

Constraints: vertical 4:5 framing. Face fully to camera. Jaali shadow pattern must stay geometric and sharp-edged. Architecture recognisable, not reduced to a blur.`,
    negativePrompt: `${NEGATIVE_BASE}, harsh midday sun, hard shadow across the face, heavy background blur, potted plants crowding frame, hanging wires, tourists in background, glossy synthetic kurta, gold jacket`,
    usageInstructions:
      'Overcast light is the most forgiving setup in this whole set, which makes it the one to start with if you are new to identity-lock prompts. Because f/2.8 and a 35mm keep the background sharp, the architecture has to hold up — if it comes back mushy, add "architectural detail in focus" to the Camera block.',
  },

  /* ------------------------------ Business ------------------------------ */
  {
    title: 'Corporate Headshot On Grey',
    slug: 'edit-corporate-headshot-on-grey',
    shortDescription:
      'A neutral studio headshot from a phone selfie — clean grey backdrop, soft key light, nothing stylised.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'business',
    style: 'Studio Portrait',
    gender: 'any',
    ageGroup: 'Adult',
    location: 'Photography studio',
    aspectRatio: '4:5',
    cameraStyle: '105mm lens, f/4',
    lighting: 'Large softbox key with reflector fill',
    mood: 'Professional',
    difficulty: 'beginner',
    isFeatured: true,
    tags: ['business', 'headshot', 'linkedin', 'studio', 'photo editing', 'identity lock'],
    seoTitle: 'Corporate Headshot AI Prompt for Gemini — Studio Portrait From A Selfie',
    seoDescription:
      'Turn a phone selfie into a professional headshot with this Gemini and ChatGPT prompt. Grey backdrop, soft light, identity preserved.',
    promptText: `${IDENTITY_LOCK} This is a professional headshot, so identity accuracy matters more here than in any stylised prompt — the result has to be usable as a real photograph of this person.

Scene and pose: place the person in a photography studio against a seamless mid-grey backdrop. Shoulders squared to the camera then rotated about fifteen degrees, head turned back to face the lens straight on. Spine tall, shoulders down and back, chin level and very slightly forward to keep the jawline clean. A warm, closed-mouth smile that reaches the eyes. Hands out of frame.

Wardrobe: a well-fitted navy single-breasted blazer with a natural shoulder, worn over a plain white cotton shirt with a soft point collar, top button open, no tie. No pocket square, no lapel pin, no visible labels. Fabric is matte worsted wool with a fine visible weave.

Environment: a plain mid-grey paper backdrop, evenly lit with a gentle vertical falloff so it reads slightly darker at the edges of the frame. Nothing else in shot — no furniture, no plants, no props, no visible studio equipment.

Texture: keep skin exactly as it is — pores, fine lines, stubble or its absence, natural under-eye texture, real skin tone variation across the face. Retouching is limited to what a professional would do: nothing. Preserve the wool weave in the blazer and the crisp cotton of the shirt collar.

Lighting: a large softbox slightly above eye level and about thirty degrees to one side is the key, producing a soft shadow under the nose that falls just short of the upper lip and a gentle triangle of light on the far cheek. A white reflector low on the opposite side opens the shadow side to roughly a two-stop difference. A separate light lifts the backdrop. A subtle hair light separates the head from the grey. Catchlights in both eyes.

Camera and grade: 105mm equivalent at f/4, ISO 200, framed from mid-chest to just above the head with even space on both sides, camera exactly at eye level, no perspective distortion. Neutral grade — accurate skin tone with no colour cast, neutral grey backdrop, moderate contrast, clean whites in the shirt with detail held in the collar, no vignette, no stylised colour. Sharp through the eyes, lashes resolved.

Constraints: vertical 4:5 framing. Face fully to camera at eye level. Both eyes sharp with visible catchlights. Skin texture preserved, not smoothed. Backdrop plain and unbroken.`,
    negativePrompt: `${NEGATIVE_BASE}, retouched skin, airbrushed complexion, removed wrinkles, whitened teeth, coloured gel lighting, dramatic shadow, outdoor background, office background, bokeh background, tie, glossy suit, wide-angle face distortion, low camera angle`,
    usageInstructions:
      'The most useful prompt in this set and the least glamorous. Upload a selfie shot at eye level in daylight near a window; a low-angle photo teaches the model the wrong facial geometry and no prompt fixes that. Note the deliberate instruction not to retouch — if the result looks airbrushed, say "keep visible skin texture and fine lines" again in your follow-up message.',
  },

  /* ------------------------------- Travel ------------------------------- */
  {
    title: 'Kashmir Snowfall Layered Portrait',
    slug: 'edit-kashmir-snowfall-layered-portrait',
    shortDescription:
      'A cold-weather travel portrait in falling snow, with breath visible and deodar trees fading into white behind.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'travel',
    style: 'Cinematic',
    gender: 'any',
    ageGroup: 'Young adult',
    location: 'Deodar forest road in Kashmir',
    aspectRatio: '3:4',
    cameraStyle: '50mm lens, f/2.2',
    lighting: 'Flat overcast snow light',
    mood: 'Contemplative',
    difficulty: 'intermediate',
    isPremium: true,
    isTrending: true,
    tags: ['travel', 'kashmir', 'snow', 'winter', 'photo editing', 'identity lock'],
    seoTitle: 'Kashmir Snow AI Photo Prompt for Gemini — Winter Travel Portrait',
    seoDescription:
      'Travel photo editing prompt for Gemini and ChatGPT. Upload your photo for a falling-snow Kashmir portrait with visible breath.',
    promptText: `${IDENTITY_LOCK} Cold changes a face — allow a natural flush across the nose, cheeks and ear tips, but do not alter the underlying features.

Scene and pose: place the person standing on a narrow snow-covered forest road, body turned about thirty degrees from the camera with the face brought fully round to the lens. Both hands are pushed into coat pockets, shoulders lifted very slightly against the cold. Chin tucked a fraction. The mouth is just open with a visible breath cloud drifting away to one side. Eyes on the lens, expression quiet rather than smiling.

Wardrobe: a heavy oatmeal wool overcoat with a wide collar turned up, worn over a charcoal cable-knit sweater with a visible chunky stitch. Dark indigo denim, and brown leather boots with a lugged sole set into soft snow. A rust-coloured wool scarf wound twice and tucked in. No gloves so the flush on the hands can read if they come into frame.

Environment: tall deodar trees crowding both sides of the road, their branches loaded with fresh snow. The road recedes and dissolves into flat white haze about thirty metres back. Snow is actively falling — flakes near the camera slightly out of focus, flakes further back reading as fine texture. Undisturbed snow on the verges, a single set of footprints behind the subject, nothing else.

Texture: keep skin pores, fine facial hair, chapped lip texture, and the natural cold flush visible. Preserve coarse wool fibre in the coat, individual cable stitches in the sweater, denim weave, leather grain on the boots and the crystalline surface of settled snow.

Lighting: flat overcast light from a heavy white sky, arriving from everywhere at once with no direction and no hard shadow anywhere. Snow on the ground acts as a huge reflector, bouncing light back up under the chin and into the eye sockets so nothing goes dark. Very low contrast overall. No sun, no warm light, no artificial fill.

Camera and grade: 50mm equivalent at f/2.2, ISO 640, three-quarter length framing with the road and trees receding behind, camera at chest height. Cool desaturated grade — blue-grey shadows, white balance held cold so the snow reads white rather than blue, skin kept naturally warm against the cold surroundings so the face stays the focal point. Low contrast, lifted blacks, soft highlights, fine grain.

Constraints: vertical 3:4 framing. Face fully to camera and sharp. Visible breath cloud. Snow must read as individual falling flakes, not as noise or streaks. No sunlight, no shadows on the ground.`,
    negativePrompt: `${NEGATIVE_BASE}, sunny sky, blue sky, hard shadows on snow, warm golden light, streaked snow, snow as digital noise, dirty grey snow, footprints everywhere, tourists, vehicles, blue skin, gloves`,
    usageInstructions:
      'Two things break this one: the model wants to add sunshine, and it renders falling snow as noise. Both are handled in the Constraints block, so do not trim it. The instruction to keep skin warm against cool surroundings is what stops your face going blue — that single line matters more than anything else in the grade.',
  },

  /* ------------------------------ Instagram ----------------------------- */
  {
    title: 'Aesthetic Mirror Selfie Upgrade',
    slug: 'edit-aesthetic-mirror-selfie-upgrade',
    shortDescription:
      'Rebuild a plain mirror selfie as a considered full-length one, keeping the phone in frame and your face intact.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'instagram',
    style: 'Minimal',
    gender: 'female',
    ageGroup: 'Young adult',
    location: 'Minimal bedroom with full-length mirror',
    aspectRatio: '4:5',
    cameraStyle: 'Phone rear camera, f/1.8',
    lighting: 'Large window daylight',
    mood: 'Effortless',
    difficulty: 'beginner',
    isTrending: true,
    tags: ['instagram', 'mirror selfie', 'aesthetic', 'ootd', 'photo editing', 'identity lock'],
    seoTitle: 'Mirror Selfie AI Photo Prompt for Gemini — Aesthetic OOTD Upgrade',
    seoDescription:
      'Mirror selfie photo editing prompt for Gemini and ChatGPT. Upload your photo for a clean full-length OOTD mirror shot.',
    promptText: `${IDENTITY_LOCK} The phone partially covers the face in a mirror selfie — whatever remains visible must match the uploaded photo exactly.

Scene and pose: recreate the shot as a full-length mirror selfie in a bright, sparse bedroom. The person stands facing a large mirror, hips angled slightly so the body reads three-quarter rather than flat. One hand holds a phone at roughly chest height, screen towards the mirror, the forearm relaxed and not blocking the torso. The other hand is loose at the side or hooked lightly in a pocket. Weight on one leg with the other knee soft and turned inward. Head tilted a few degrees, eyes looking at the mirror rather than at the phone.

Wardrobe: an oversized ecru linen shirt worn open over a fitted white ribbed tank, straight-leg mid-blue denim sitting at the natural waist with a plain leather belt, and white leather sneakers. A small gold chain, a slim watch. Fabric is relaxed and softly creased — real clothes, not showroom-pressed. No printed graphics, no visible labels.

Environment: a full-length mirror with a thin black metal frame. Behind the reflection, a pale plaster wall, a corner of an unmade bed with rumpled white cotton, a single trailing plant on a stool, and warm wooden flooring. The room is tidy but lived-in. No clutter on the floor, no laundry, no cables, no posters.

Texture: keep skin pores, fine facial hair, natural under-eye texture and real skin tone variation on whatever part of the face is visible around the phone. Preserve linen slub with genuine creases, ribbed knit texture in the tank, denim weave and fade, leather grain on the belt and the smudge pattern on the mirror glass.

Lighting: a large window off to one side, out of frame, is the key — soft directional daylight raking across the body, brighter on the near side, gently falling off across the room. The pale wall bounces a weak fill back into the shadow side. A soft natural gradient across the mirror surface. No flash, no ring light, no ceiling light.

Camera and grade: phone rear camera look, roughly 26mm equivalent at f/1.8, full-length framing with a little headroom and the sneakers included, camera held at chest height so the perspective stays natural and the legs are not stretched. Bright airy grade — warm neutral whites, soft contrast, gently lifted blacks, accurate skin, restrained saturation. Slight softness at the frame edges as a phone lens would give, sharp through the body.

Constraints: vertical 4:5 framing. Phone visible in hand and reflected. Whatever face is visible must be sharp and unchanged. Full length including feet. No wide-angle leg stretching.`,
    negativePrompt: `${NEGATIVE_BASE}, ring light reflection, flash blowout in mirror, stretched legs, cropped feet, cluttered room, laundry pile, posters on wall, glossy plastic mirror frame, phone missing from hand, second phone`,
    usageInstructions:
      'The instruction about camera height is doing quiet work here — mirror selfies shot low give absurdly long legs, and naming chest height prevents it. If the phone vanishes from the hand, say "the phone stays visible in the reflection" in a follow-up rather than regenerating; that one is usually fixable in place.',
  },

  /* -------------------------------- Bikes ------------------------------- */
  {
    title: 'Highway Shoulder Motorcycle Portrait',
    slug: 'edit-highway-shoulder-motorcycle-portrait',
    shortDescription:
      'A dusk portrait beside a parked classic motorcycle on an empty highway shoulder, with the tank left unbadged.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'bikes',
    style: 'Cinematic',
    gender: 'male',
    ageGroup: 'Young adult',
    location: 'Empty highway shoulder at dusk',
    aspectRatio: '3:4',
    cameraStyle: '35mm lens, f/2.8',
    lighting: 'Last daylight with warm sky glow',
    mood: 'Restless',
    difficulty: 'intermediate',
    isPremium: true,
    tags: ['bikes', 'motorcycle', 'highway', 'dusk', 'photo editing', 'identity lock'],
    seoTitle: 'Motorcycle AI Photo Prompt for Gemini — Highway Dusk Portrait',
    seoDescription:
      'Bike photo editing prompt for Gemini and ChatGPT. Upload your photo for a dusk highway portrait beside a classic motorcycle.',
    promptText: `${IDENTITY_LOCK}

Scene and pose: place the person on the gravel shoulder of an empty highway at dusk, beside a parked classic single-cylinder motorcycle on its side stand. They sit sideways on the seat with both feet on the ground, forearms resting on the thighs, hands loosely clasped. The torso leans forward a little and twists so the face comes fully round to the camera. A helmet rests on the tank under one hand. Chin level, no smile, eyes steady on the lens.

Wardrobe: a worn brown leather jacket with a broken-in collar and visible creasing at the elbows, over a plain grey cotton tee. Dark indigo jeans with genuine fade at the knees, and tan lace-up boots dusted with road grit. A leather strap on one wrist. No printed graphics, no visible labels.

Environment: a two-lane highway curving away and out of frame, its white edge line catching the last light. Flat scrub land on both sides with a low ridge on the horizon. The motorcycle is a matte black classic roadster with spoked wheels, a round headlamp, chrome exhaust and a completely unbadged fuel tank — no maker's mark anywhere on the machine. Road empty in both directions, no other vehicles, no hoardings, no signage.

Texture: keep skin pores, stubble if present in the uploaded photo, fine hair at the temples and a natural sheen from the day's heat visible. Preserve leather grain with real creases, cotton weave, denim fade, boot scuffing, road dust on the tank, chrome reflections and gravel detail underfoot.

Lighting: the last direct daylight comes low and warm from behind the subject at about forty-five degrees, putting a warm rim along the shoulder, jaw and hair, and a long soft highlight down the chrome exhaust. A broad cool fill from the open dusk sky opens the face so the shadow side keeps full detail. No headlights, no flash, no artificial warmth added to the front of the face.

Camera and grade: 35mm equivalent at f/2.8, ISO 500, full framing including the whole motorcycle and the road surface, camera low at about tank height looking very slightly up. Warm-cool split grade — amber rim and sky, cool blue-grey in the shadows and the road, neutral skin, moderate contrast with the warm highlights held short of clipping. Visible grain.

Constraints: vertical 3:4 framing. Face fully to camera and sharp. Fuel tank and engine casing completely unbadged. Both feet flat on the ground. Motorcycle upright on its stand, wheels straight, no distortion in the frame geometry.`,
    negativePrompt: `${NEGATIVE_BASE}, motorcycle brand badges, maker's mark on tank, visible number plate, other vehicles, roadside hoardings, headlight glare, wheelie, motion blur, bent frame geometry, floating motorcycle, sunset sun in frame`,
    usageInstructions:
      'Models love to stamp a logo on a fuel tank, so the unbadged instruction appears twice on purpose — in the Environment block and again in Constraints. Keep both. If a badge still appears, regenerate; asking for its removal tends to warp the tank shape.',
  },

  /* -------------------------------- Family ------------------------------ */
  {
    title: 'Parents Anniversary Sofa Portrait',
    slug: 'edit-parents-anniversary-sofa-portrait',
    shortDescription:
      'A warm, honest anniversary portrait of two parents at home — built to respect real age rather than erase it.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'family',
    style: 'Documentary',
    gender: 'couple',
    ageGroup: 'Middle aged',
    location: 'Family living room',
    aspectRatio: '4:5',
    cameraStyle: '50mm lens, f/2.5',
    lighting: 'Soft window daylight',
    mood: 'Tender',
    difficulty: 'advanced',
    isEditorsPick: true,
    tags: ['family', 'parents', 'anniversary', 'documentary', 'photo editing', 'identity lock'],
    seoTitle: 'Parents Anniversary AI Photo Prompt for Gemini — Honest Family Portrait',
    seoDescription:
      'Family photo editing prompt for Gemini. Upload two photos for a warm anniversary portrait that keeps real age and expression.',
    promptText: `Use the two uploaded photos as the sources of facial identity — the first for the person seated on the left, the second for the person on the right. Reproduce both faces exactly, including lines, folds, grey hair, spectacles if worn, skin texture and natural asymmetry. Do not blend features between them. Critically: do not make either person look younger, do not remove wrinkles or grey hair, and do not smooth skin. The dignity of this portrait depends on both faces being truthful.

Scene and pose: seat the pair together on a family living-room sofa, turned slightly towards each other with knees angled inward and shoulders touching. The person on the left has one hand resting over the other person's hand on the middle cushion. Both sit comfortably upright, not stiff. Both faces turn out to the camera with easy closed-mouth smiles that reach the eyes. Feet flat on the floor.

Wardrobe: the person on the left wears a soft cream cotton kurta with a fine woven texture and a thin gold chain. The person on the right wears a pale blue cotton shirt, sleeves buttoned, over dark trousers. Both garments are well-kept and clearly worn before — natural creasing at the elbows, no showroom stiffness, no printed logos.

Environment: a lived-in living room. A plain fabric sofa with slightly compressed cushions, a low wooden table holding a stainless steel tumbler and a folded newspaper, framed family photographs on the wall behind with faces turned away from legibility, and a cotton curtain drawn back at one side. Tidy, warm and real — not styled, not empty.

Texture: preserve every line, fold, pore, age spot and grey hair on both faces independently. Keep the soft cotton weave of both garments, the nap of the sofa fabric, wood grain on the table and the slight sheen on the steel tumbler.

Lighting: soft daylight through a window out of frame to one side is the key — broad and gentle, lighting both faces evenly with a shadow soft enough to have no visible edge. A pale wall opposite bounces a weak fill. Warm interior tone overall, no lamp switched on, no flash, no dramatic contrast anywhere.

Camera and grade: 50mm equivalent at f/2.5, ISO 400, waist-up framing with both faces on the same focal plane and both fully sharp, camera at their seated eye level. Warm gentle grade — natural skin tones with no smoothing, soft contrast, lifted blacks, accurate whites in the cream kurta, restrained saturation. Fine grain.

Constraints: vertical 4:5 framing. Exactly two people. Both faces fully to camera, both sharp, both showing real age. Four hands total, five fingers each. No third figure. Photographs on the wall must stay unreadable.`,
    negativePrompt: `${NEGATIVE_BASE}, younger faces, removed wrinkles, smoothed skin, dyed hair, blended faces, three people, glamour lighting, studio backdrop, empty styled room, readable photographs on wall, stiff posing, dramatic shadow`,
    usageInstructions:
      'Every model is biased towards making faces younger and smoother, and that bias is strongest on older faces. This prompt pushes back three separate times — in the identity lock, in Texture and in Constraints — and you still may need two or three runs. Upload well-lit photos of each parent taken straight on. Worth the effort; this is the one people actually print.',
  },

  /* ------------------------------- Fashion ------------------------------ */
  {
    title: 'Monsoon Street Fashion Portrait',
    slug: 'edit-monsoon-street-fashion-portrait',
    shortDescription:
      'An editorial streetwear portrait on a wet city street, using reflected neon as fill without going full cyberpunk.',
    aiModel: 'gemini',
    inputMode: 'photo-edit',
    categorySlug: 'fashion',
    style: 'Street Photography',
    gender: 'female',
    ageGroup: 'Young adult',
    location: 'Wet Mumbai street at night',
    aspectRatio: '3:4',
    cameraStyle: '50mm lens, f/1.8',
    lighting: 'Shopfront spill with wet-ground bounce',
    mood: 'Bold',
    difficulty: 'advanced',
    isPremium: true,
    isTrending: true,
    tags: ['fashion', 'streetwear', 'monsoon', 'night', 'photo editing', 'identity lock'],
    seoTitle: 'Monsoon Street Fashion AI Prompt for Gemini — Wet Night Editorial',
    seoDescription:
      'Streetwear photo editing prompt for Gemini and ChatGPT. Upload your photo for a wet-street monsoon night editorial portrait.',
    promptText: `${IDENTITY_LOCK} Rain-damp skin has its own look — allow a natural sheen on the forehead and cheekbones and a few wet strands of hair at the temple, but keep every feature exactly as uploaded.

Scene and pose: place the person mid-stride on a wet city pavement at night, caught between steps. The rear foot is still pushing off, the front foot is landing, the torso is upright and rotated a few degrees, and the face turns fully to the camera. One hand holds the strap of a shoulder bag; the other swings naturally with the walk, fingers loose. Chin level, lips closed, direct and unbothered eye contact.

Wardrobe: an oversized black technical shell jacket with a matte finish and taped seams, worn open over a cropped grey ribbed knit. Wide-leg black cargo trousers pooling slightly over chunky black leather boots. A small structured black shoulder bag. Small silver hoops, two thin rings. No printed graphics, no visible labels anywhere.

Environment: a narrow city street after heavy rain. The pavement is fully wet and throwing long soft vertical reflections of shopfront light. Shuttered shops line one side, an awning drips at the frame edge, and a strip of road with standing water runs along the other. Background compressed into soft out-of-focus light shapes. No pedestrians, no vehicles, no readable shop names, no rubbish.

Texture: keep skin pores, fine facial hair, natural rain sheen and real skin tone variation visible. Preserve the matte technical weave of the shell jacket with visible seam tape, ribbed knit definition, heavy cotton drape in the cargos, wet leather highlights on the boots and individual droplets on the jacket shoulders.

Lighting: warm shopfront light spilling from one side is the key, wrapping the near cheek, shoulder and jacket edge. The wet pavement acts as a second source, bouncing a soft warm light upward under the chin and along the trousers. A weak cool ambient from the open night sky separates the figure from the dark background. Deep shadow on the far side of the face, retaining detail. No neon colour wash across the skin, no flash, no coloured gels.

Camera and grade: 50mm equivalent at f/1.8, ISO 2000, full-length framing with a little headroom and the wet pavement included, camera at chest height. Restrained night grade — warm highlights, cool blue-grey shadows, neutral and accurate skin, crushed but unclipped blacks, moderate saturation so the reflections read warm rather than lurid. Visible high-ISO grain.

Constraints: vertical 3:4 framing. Face fully to camera and completely sharp. Mid-stride pose with both feet clearly placed. Pavement visibly wet with real reflections. No coloured light cast on the face. No readable text anywhere.`,
    negativePrompt: `${NEGATIVE_BASE}, cyberpunk neon wash, pink and blue colour cast on skin, heavy rain streaks, umbrella, readable shop signs, pedestrians, vehicles, motion blur on the face, dry pavement, glossy plastic jacket, feet cropped`,
    usageInstructions:
      'The trap here is cyberpunk. Ask for neon and you get a purple-and-teal face; this prompt instead asks for warm shopfront spill with the wet ground as bounce, and forbids colour cast on the skin. Keep that distinction. Mid-stride also needs several attempts before you get a sharp face and a believable step in the same frame.',
  },
];
