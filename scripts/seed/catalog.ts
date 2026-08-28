/**
 * Seed catalogue: plans, categories and tags.
 *
 * Prices here are development defaults only — an administrator edits them from
 * /admin/plans, and the server always reads the price from the database.
 */

export interface SeedPlan {
  code: string;
  name: string;
  description: string;
  priceMinor: number;
  billingPeriod: 'none' | 'month' | 'year' | 'lifetime';
  features: string[];
  limits: Record<string, number>;
  isPopular?: boolean;
  sortOrder: number;
}

export const SEED_PLANS: SeedPlan[] = [
  {
    code: 'free',
    name: 'Free',
    description: 'Everything you need to try the library out.',
    priceMinor: 0,
    billingPeriod: 'none',
    sortOrder: 0,
    features: [
      'Browse the full prompt library',
      'Search, filter and sort every prompt',
      '10 prompt copies per day',
      'Save up to 25 favourites',
      '10 generator runs per day',
      'Free prompts only',
    ],
    limits: { copiesPerDay: 10, favorites: 25, generatorPerDay: 10 },
  },
  {
    code: 'monthly',
    name: 'Monthly',
    description: 'Full access, cancel whenever you like.',
    priceMinor: 9_900, // ₹99
    billingPeriod: 'month',
    sortOrder: 1,
    features: [
      'Unlimited prompt copies',
      'Unlimited favourites',
      'Every premium-only prompt',
      'Advanced AI prompt generator',
      'Unlimited generator runs',
      'Premium collections',
      'Ad-free experience',
      'Premium badge on your profile',
    ],
    limits: { copiesPerDay: -1, favorites: -1, generatorPerDay: -1 },
  },
  {
    code: 'yearly',
    name: 'Yearly',
    description: 'Two months free compared to monthly.',
    priceMinor: 69_900, // ₹699
    billingPeriod: 'year',
    sortOrder: 2,
    isPopular: true,
    features: [
      'Everything in Monthly',
      'Save around 41% versus paying monthly',
      'Priority access to new prompt packs',
      'Early access to new generator features',
      'Priority email support',
    ],
    limits: { copiesPerDay: -1, favorites: -1, generatorPerDay: -1 },
  },
  {
    code: 'lifetime',
    name: 'Lifetime',
    description: 'One payment, premium access for good.',
    priceMinor: 199_900, // ₹1,999
    billingPeriod: 'lifetime',
    sortOrder: 3,
    features: [
      'Everything in Yearly',
      'One-time payment, no renewals',
      'All future premium prompt packs',
      'Founding member badge',
    ],
    limits: { copiesPerDay: -1, favorites: -1, generatorPerDay: -1 },
  },
];

export interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  icon: string;
  accent: string;
  featured?: boolean;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: 'Boys',
    slug: 'boys',
    icon: '🧑',
    accent: 'sky',
    featured: true,
    description:
      'Portrait and lifestyle prompts for men — streetwear, formal, festive and editorial looks with clean lighting setups.',
  },
  {
    name: 'Girls',
    slug: 'girls',
    icon: '👩',
    accent: 'rose',
    featured: true,
    description:
      'Portrait prompts for women across traditional, contemporary and editorial styling, with camera and lighting direction included.',
  },
  {
    name: 'Couples',
    slug: 'couples',
    icon: '💞',
    accent: 'marigold',
    featured: true,
    description:
      'Two-subject prompts that keep both faces consistent and the lighting matched — pre-wedding, candid and cinematic.',
  },
  {
    name: 'Family',
    slug: 'family',
    icon: '👨‍👩‍👧',
    accent: 'emerald',
    description:
      'Group portrait prompts for families, with posing and spacing guidance that keeps everyone in focus.',
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    icon: '👗',
    accent: 'violet',
    featured: true,
    description:
      'Editorial fashion prompts with lookbook framing, fabric detail and studio or location lighting.',
  },
  {
    name: 'Saree',
    slug: 'saree',
    icon: '🥻',
    accent: 'marigold',
    featured: true,
    description:
      'Saree-focused prompts covering handloom, silk, bandhani and contemporary drapes, with fabric texture emphasis.',
  },
  {
    name: 'Traditional',
    slug: 'traditional',
    icon: '🪔',
    accent: 'amber',
    featured: true,
    description:
      'Traditional Indian wear and settings — courtyards, temples, heritage architecture and warm practical light.',
  },
  {
    name: 'Wedding',
    slug: 'wedding',
    icon: '💍',
    accent: 'rose',
    featured: true,
    description:
      'Wedding photography prompts: mandap portraits, haldi candids, reception glamour and detail shots.',
  },
  {
    name: 'Festival',
    slug: 'festival',
    icon: '🎇',
    accent: 'marigold',
    featured: true,
    description:
      'Festival prompts for Diwali, Holi, Navratri, Onam, Pongal and Eid, with the right light for each occasion.',
  },
  {
    name: 'Birthday',
    slug: 'birthday',
    icon: '🎂',
    accent: 'violet',
    description:
      'Birthday and celebration prompts — cake moments, decor setups and joyful candid framing.',
  },
  {
    name: 'Travel',
    slug: 'travel',
    icon: '🧳',
    accent: 'teal',
    featured: true,
    description:
      'Travel prompts across Indian landscapes and streets, from Ladakh passes to Kerala backwaters.',
  },
  {
    name: 'Cars',
    slug: 'cars',
    icon: '🚗',
    accent: 'slate',
    description:
      'Automotive prompts with reflection control, rolling shots and showroom-grade lighting setups.',
  },
  {
    name: 'Bikes',
    slug: 'bikes',
    icon: '🏍️',
    accent: 'slate',
    description:
      'Motorcycle prompts covering cafe racers, tourers and street bikes, with rider and machine framing.',
  },
  {
    name: 'Luxury',
    slug: 'luxury',
    icon: '✨',
    accent: 'amber',
    description:
      'High-end prompts with rich materials, controlled highlights and restrained, expensive-looking colour.',
  },
  {
    name: 'Cinematic',
    slug: 'cinematic',
    icon: '🎬',
    accent: 'indigo',
    featured: true,
    description:
      'Film-style prompts with anamorphic framing, motivated lighting and considered colour grading.',
  },
  {
    name: 'Portrait',
    slug: 'portrait',
    icon: '🪞',
    accent: 'indigo',
    featured: true,
    description:
      'Classic portraiture — headshots, half-body and environmental portraits with precise lens choices.',
  },
  {
    name: 'Photography',
    slug: 'photography',
    icon: '📷',
    accent: 'teal',
    description:
      'Technique-led prompts for photographers: focal length, aperture, shutter feel and light direction.',
  },
  {
    name: 'Anime',
    slug: 'anime',
    icon: '🎨',
    accent: 'violet',
    description:
      'Illustrated and anime-style prompts with linework, cel shading and stylised colour palettes.',
  },
  {
    name: 'Fantasy',
    slug: 'fantasy',
    icon: '🐉',
    accent: 'indigo',
    description:
      'Mythic and fantasy prompts drawing on Indian folklore, epic scale and dramatic atmosphere.',
  },
  {
    name: 'Business',
    slug: 'business',
    icon: '💼',
    accent: 'sky',
    description:
      'Corporate headshots, team portraits and workspace prompts with clean, professional lighting.',
  },
  {
    name: 'Social Media',
    slug: 'social-media',
    icon: '📱',
    accent: 'rose',
    featured: true,
    description:
      'Prompts sized and styled for feeds, stories and reels, with scroll-stopping composition.',
  },
  {
    name: 'Instagram',
    slug: 'instagram',
    icon: '📸',
    accent: 'violet',
    description:
      'Instagram-first prompts in 4:5 and 9:16, built around a consistent grid aesthetic.',
  },
  {
    name: 'YouTube',
    slug: 'youtube',
    icon: '▶️',
    accent: 'rose',
    description:
      'Thumbnail and channel-art prompts in 16:9 with high contrast and clear focal hierarchy.',
  },
  {
    name: 'Product Photography',
    slug: 'product-photography',
    icon: '📦',
    accent: 'emerald',
    featured: true,
    description:
      'Commercial product prompts with seamless backdrops, controlled reflections and e-commerce framing.',
  },
  {
    name: 'Architecture',
    slug: 'architecture',
    icon: '🏛️',
    accent: 'slate',
    description:
      'Built-environment prompts covering heritage, modern and interior spaces with corrected verticals.',
  },
  {
    name: 'Nature',
    slug: 'nature',
    icon: '🌿',
    accent: 'emerald',
    description:
      'Landscape and nature prompts with weather, season and time-of-day direction built in.',
  },
];

export const SEED_TAGS = [
  'portrait',
  'cinematic',
  'saree',
  'wedding',
  'festival',
  'diwali',
  'streetwear',
  'editorial',
  'golden hour',
  'studio',
  'bokeh',
  'monochrome',
  'traditional',
  'candid',
  'product',
  'ecommerce',
  'travel',
  'landscape',
  'automotive',
  'anime',
  'fantasy',
  'corporate',
  'instagram',
  'reels',
  'thumbnail',
  'natural light',
  'jewellery',
  'handloom',
  'mumbai',
  'jaipur',
  'kerala',
  'ladakh',
];
