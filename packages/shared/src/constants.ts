/**
 * Shared, non-secret domain constants. Anything an administrator should be able
 * to change at runtime lives in `site_settings` instead (see services/settings).
 */

export const AI_MODELS = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    short: 'Gemini',
    accent: 'sky',
    note: 'Conversational image generation with strong prompt adherence.',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    short: 'ChatGPT',
    accent: 'emerald',
    note: 'Great for iterating on descriptive, narrative prompts.',
  },
  {
    id: 'midjourney',
    label: 'Midjourney',
    short: 'Midjourney',
    accent: 'violet',
    note: 'Supports parameter flags such as aspect ratio and stylize.',
  },
  {
    id: 'flux',
    label: 'Flux',
    short: 'Flux',
    accent: 'amber',
    note: 'Photoreal outputs from dense, detail-rich prompts.',
  },
  {
    id: 'stable-diffusion',
    label: 'Stable Diffusion',
    short: 'SD',
    accent: 'rose',
    note: 'Works best with weighted keywords and a negative prompt.',
  },
  {
    id: 'leonardo',
    label: 'Leonardo AI',
    short: 'Leonardo',
    accent: 'cyan',
    note: 'Preset-driven pipeline with fine-grained style control.',
  },
  {
    id: 'ideogram',
    label: 'Ideogram',
    short: 'Ideogram',
    accent: 'indigo',
    note: 'Reliable in-image typography and poster layouts.',
  },
  { id: 'other', label: 'Other', short: 'Other', accent: 'slate', note: 'Model-agnostic wording.' },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]['id'];

export const AI_MODEL_IDS = AI_MODELS.map((m) => m.id) as AiModelId[];

export function aiModel(id: string) {
  return AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[AI_MODELS.length - 1];
}

export const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 Square', hint: 'Instagram feed' },
  { id: '4:5', label: '4:5 Portrait', hint: 'Instagram portrait' },
  { id: '9:16', label: '9:16 Vertical', hint: 'Reels / Stories' },
  { id: '3:4', label: '3:4 Portrait', hint: 'Classic portrait' },
  { id: '16:9', label: '16:9 Wide', hint: 'YouTube thumbnail' },
  { id: '3:2', label: '3:2 Photo', hint: 'DSLR frame' },
  { id: '2:3', label: '2:3 Tall', hint: 'Poster' },
  { id: '21:9', label: '21:9 Cinematic', hint: 'Anamorphic' },
] as const;

export const STYLES = [
  'Cinematic',
  'Hyper Realistic',
  'Editorial Fashion',
  'Documentary',
  'Vintage Film',
  'Bollywood Poster',
  'Studio Portrait',
  'Street Photography',
  'Fine Art',
  'Anime',
  'Illustration',
  '3D Render',
  'Minimal',
  'Dreamy Pastel',
  'High Contrast Monochrome',
  'Festive Glow',
] as const;

export const LIGHTING = [
  'Golden hour sunlight',
  'Soft diffused daylight',
  'Warm tungsten indoor light',
  'Dramatic split lighting',
  'Rim light with haze',
  'Neon city glow',
  'Candle and diya glow',
  'Overcast soft light',
  'Studio three-point lighting',
  'Moonlit blue hour',
  'Backlit silhouette',
  'Practical fairy lights',
] as const;

export const CAMERA_STYLES = [
  '85mm portrait lens, f/1.8',
  '50mm prime, f/1.4',
  '35mm documentary, f/2.0',
  '24mm wide environmental',
  '135mm compressed telephoto',
  'Macro detail shot',
  'Low-angle hero shot',
  'Top-down flat lay',
  'Handheld gimbal tracking',
  'Anamorphic cinema lens',
] as const;

export const MOODS = [
  'Joyful',
  'Serene',
  'Romantic',
  'Confident',
  'Nostalgic',
  'Dramatic',
  'Playful',
  'Regal',
  'Festive',
  'Contemplative',
  'Energetic',
  'Mysterious',
] as const;

export const COLOR_TONES = [
  'Warm earthy tones',
  'Teal and orange',
  'Muted pastels',
  'Rich jewel tones',
  'Monochrome with a single accent',
  'Sun-bleached film tones',
  'Deep cinematic shadows',
  'Vibrant saturated colour',
] as const;

export const GENDERS = [
  { id: 'any', label: 'Any / Not specified' },
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'couple', label: 'Couple' },
  { id: 'group', label: 'Group' },
  { id: 'non-human', label: 'Product / Object / Place' },
] as const;

export const AGE_GROUPS = [
  'Child',
  'Teen',
  'Young adult',
  'Adult',
  'Middle aged',
  'Senior',
  'Any',
] as const;

export const DIFFICULTIES = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
] as const;

/**
 * How the reader supplies the subject of the image.
 *
 * This is the single most useful thing to tell someone before they read a
 * prompt, because it decides whether they need to do anything first. A
 * photo-edit prompt without an uploaded face produces a stranger; a
 * text-to-image prompt ignores an upload entirely.
 */
export const INPUT_MODES = [
  {
    id: 'text-to-image',
    label: 'Text to image',
    short: 'Text to image',
    /** Shown on the prompt page as the one-line explanation. */
    note: 'The model builds the whole picture from the prompt. Nothing to upload.',
    /** Ordered steps rendered in the "how to use" block. */
    steps: [
      'Open your AI image tool.',
      'Paste the prompt exactly as written.',
      'Generate, then adjust the wardrobe or location line to taste.',
    ],
  },
  {
    id: 'photo-edit',
    label: 'Upload your photo',
    short: 'Photo edit',
    note: 'Upload a photo of yourself. The prompt keeps your face and rebuilds everything around it.',
    steps: [
      'Upload a clear, front-facing photo of yourself.',
      'Paste the prompt in the same message as the photo.',
      'Generate two or three times — the face locks in more cleanly on later runs.',
    ],
  },
] as const;

export type InputModeId = (typeof INPUT_MODES)[number]['id'];

export const INPUT_MODE_IDS = INPUT_MODES.map((m) => m.id) as InputModeId[];

export function inputMode(id: string | null | undefined) {
  return INPUT_MODES.find((m) => m.id === id) ?? INPUT_MODES[0];
}

export const QUALITY_LEVELS = [
  { id: 'standard', label: 'Standard detail' },
  { id: 'high', label: 'High detail' },
  { id: 'ultra', label: 'Ultra detail (8K, texture-accurate)' },
] as const;

export const IMAGE_TYPES = [
  'Portrait',
  'Couple',
  'Fashion',
  'Product',
  'Travel',
  'Cinematic',
  'Festival',
  'Wedding',
  'Social Media',
  'Other',
] as const;

export const POSES = [
  'Relaxed standing pose, hands in pockets',
  'Walking towards camera mid-stride',
  'Seated, leaning forward, elbows on knees',
  'Looking over the shoulder',
  'Candid laugh, head tilted back',
  'Arms crossed, direct eye contact',
  'Twirling, fabric caught mid-air',
  'Sitting on a low wall, feet dangling',
  'Hands adjusting a dupatta',
  'Back to camera, facing the horizon',
] as const;

export const LOCATIONS = [
  'Jaipur haveli courtyard',
  'Mumbai Marine Drive at dusk',
  'Kerala backwater houseboat',
  'Varanasi ghat at sunrise',
  'Delhi rooftop with string lights',
  'Rann of Kutch white desert',
  'Munnar tea estate slopes',
  'Old Goa colonial street',
  'Ladakh mountain pass',
  'Hampi boulder landscape',
  'Modern minimal photo studio',
  'Rain-soaked city street with neon reflections',
  'Marigold-decorated wedding mandap',
  'Bustling spice market lane',
] as const;

export const OUTFITS = [
  'Handloom cotton saree with a contrast border',
  'Tailored linen shirt and trousers',
  'Embroidered sherwani with a stole',
  'Lehenga with mirror work',
  'Streetwear: oversized tee and cargo pants',
  'Crisp white kurta pyjama',
  'Modern power suit',
  'Bandhani print co-ord set',
  'Silk kanjeevaram with temple jewellery',
  'Denim jacket over a graphic tee',
] as const;

export const EXPRESSIONS = [
  'Soft natural smile',
  'Confident neutral gaze',
  'Genuine laugh',
  'Thoughtful, eyes lowered',
  'Playful smirk',
  'Serene, eyes closed',
  'Intense, direct',
  'Surprised delight',
] as const;

export const BACKGROUNDS = [
  'Shallow depth of field, creamy bokeh',
  'Textured lime-washed wall',
  'Busy street blurred with motion',
  'Seamless studio backdrop',
  'Layered architectural depth',
  'Open sky with soft clouds',
  'Fairy lights bokeh at night',
  'Lush greenery',
] as const;

export const SORT_OPTIONS = [
  { id: 'trending', label: 'Trending' },
  { id: 'newest', label: 'Newest' },
  { id: 'most-copied', label: 'Most copied' },
  { id: 'most-liked', label: 'Most liked' },
  { id: 'most-viewed', label: 'Most viewed' },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]['id'];

export const ACCESS_FILTERS = [
  { id: 'all', label: 'All prompts' },
  { id: 'free', label: 'Free' },
  { id: 'premium', label: 'Premium' },
] as const;

export const PAGE_SIZE = 24;

/** Feature keys used by the entitlement system. */
export const FEATURES = {
  premiumPrompts: 'premium_prompts',
  unlimitedCopies: 'unlimited_copies',
  unlimitedFavorites: 'unlimited_favorites',
  advancedGenerator: 'advanced_generator',
  adFree: 'ad_free',
  premiumCollections: 'premium_collections',
  hdAssets: 'hd_assets',
  prioritySupport: 'priority_support',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

/** Setting keys with typed defaults — the admin panel writes to these. */
export const SETTING_KEYS = {
  siteName: 'site.name',
  siteTagline: 'site.tagline',
  siteDomain: 'site.domain',
  siteLogoUrl: 'site.logo_url',
  siteFaviconUrl: 'site.favicon_url',
  seoTitleTemplate: 'seo.title_template',
  seoDefaultDescription: 'seo.default_description',
  seoDefaultKeywords: 'seo.default_keywords',
  socialInstagram: 'social.instagram',
  socialX: 'social.x',
  socialYoutube: 'social.youtube',
  socialTelegram: 'social.telegram',
  contactEmail: 'contact.email',
  contactPhone: 'contact.phone',
  contactAddress: 'contact.address',
  freeCopiesPerDay: 'limits.free.copies_per_day',
  freeFavorites: 'limits.free.favorites',
  freeGeneratorPerDay: 'limits.free.generator_per_day',
  premiumCopiesPerDay: 'limits.premium.copies_per_day',
  premiumFavorites: 'limits.premium.favorites',
  premiumGeneratorPerDay: 'limits.premium.generator_per_day',
  anonGeneratorPerDay: 'limits.anon.generator_per_day',
  anonCopiesPerDay: 'limits.anon.copies_per_day',
  currency: 'payments.currency',
  paymentsEnabled: 'payments.enabled',
  maintenanceMode: 'ops.maintenance_mode',
  adsEnabled: 'ops.ads_enabled',
  analyticsEnabled: 'ops.analytics_enabled',
  registrationEnabled: 'ops.registration_enabled',
  requireEmailVerification: 'ops.require_email_verification',
} as const;
