import { z } from 'zod';

import {
  ACCESS_FILTERS,
  AI_MODEL_IDS,
  ASPECT_RATIOS,
  DIFFICULTIES,
  GENDERS,
  INPUT_MODE_IDS,
  PAGE_SIZE,
  QUALITY_LEVELS,
  SORT_OPTIONS,
} from './constants';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password-bounds';

/* ============================== Primitives ============================== */

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('Enter a valid email address')
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30)
  .regex(/^[a-z0-9_.]+$/i, 'Use letters, numbers, dots and underscores only')
  .transform((v) => v.toLowerCase());

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slugs may contain lowercase letters, numbers and dashes');

export const idSchema = z.string().trim().min(6).max(60);

/** Strips control characters and trims — applied to all free-text input. */
export const cleanText = (max: number, min = 0) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim())
    .pipe(z.string().min(min).max(max));

const boolFromQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

/* ================================= Auth ================================= */

export const registerSchema = z.object({
  name: cleanText(80, 2),
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema.optional(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms to continue' }),
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH),
  remember: z.boolean().optional().default(true),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(10).max(200) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: cleanText(80, 2).optional(),
  username: usernameSchema.optional(),
  bio: cleanText(300).optional(),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
  location: cleanText(80).optional(),
  website: z.string().url().max(200).optional().or(z.literal('')),
  instagram: cleanText(60).optional(),
  youtube: cleanText(80).optional(),
});

/* =============================== Prompts ================================ */

const aiModelEnum = z.enum(AI_MODEL_IDS as [string, ...string[]]);
const sortEnum = z.enum(SORT_OPTIONS.map((s) => s.id) as [string, ...string[]]);
const accessEnum = z.enum(ACCESS_FILTERS.map((a) => a.id) as [string, ...string[]]);
const aspectEnum = z.enum(ASPECT_RATIOS.map((a) => a.id) as [string, ...string[]]);
const genderEnum = z.enum(GENDERS.map((g) => g.id) as [string, ...string[]]);
const difficultyEnum = z.enum(DIFFICULTIES.map((d) => d.id) as [string, ...string[]]);
const inputModeEnum = z.enum(INPUT_MODE_IDS as [string, ...string[]]);

export const promptListQuerySchema = z.object({
  q: cleanText(120).optional(),
  category: slugSchema.optional(),
  model: aiModelEnum.optional(),
  access: accessEnum.optional().default('all'),
  sort: sortEnum.optional().default('trending'),
  style: cleanText(60).optional(),
  gender: genderEnum.optional(),
  aspect: aspectEnum.optional(),
  tag: slugSchema.optional(),
  trending: boolFromQuery.optional(),
  featured: boolFromQuery.optional(),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(60).optional().default(PAGE_SIZE),
});

export type PromptListQuery = z.infer<typeof promptListQuerySchema>;

export const promptWriteSchema = z.object({
  title: cleanText(160, 4),
  slug: slugSchema.optional(),
  shortDescription: cleanText(300, 10),
  promptText: cleanText(8000, 20),
  negativePrompt: cleanText(2000).optional(),
  usageInstructions: cleanText(2000).optional(),
  aiModel: aiModelEnum,
  inputMode: inputModeEnum.optional().default('text-to-image'),
  categoryId: idSchema,
  subcategoryId: idSchema.optional().or(z.literal('')),
  style: cleanText(60).optional(),
  gender: genderEnum.optional(),
  ageGroup: cleanText(40).optional(),
  location: cleanText(120).optional(),
  aspectRatio: aspectEnum.optional(),
  cameraStyle: cleanText(120).optional(),
  lighting: cleanText(120).optional(),
  mood: cleanText(60).optional(),
  difficulty: difficultyEnum.optional().default('beginner'),
  tags: z.array(cleanText(40, 1)).max(15).optional().default([]),
  isPremium: z.boolean().optional().default(false),
  isFeatured: z.boolean().optional().default(false),
  isTrending: z.boolean().optional().default(false),
  isEditorsPick: z.boolean().optional().default(false),
  isPublished: z.boolean().optional().default(false),
  scheduledFor: z.number().int().positive().optional().nullable(),
  coverImageUrl: z.string().url().max(600).optional().or(z.literal('')),
  coverImageAlt: cleanText(200).optional(),
  exampleImages: z
    .array(
      z.object({
        url: z.string().url().max(600),
        alt: cleanText(200).optional(),
        width: z.number().int().positive().max(12000).optional(),
        height: z.number().int().positive().max(12000).optional(),
      }),
    )
    .max(8)
    .optional()
    .default([]),
  seoTitle: cleanText(200).optional(),
  seoDescription: cleanText(320).optional(),
});

export type PromptWriteInput = z.infer<typeof promptWriteSchema>;

export const promptCopySchema = z.object({
  promptId: idSchema,
  variant: z.enum(['plain', 'instructions', 'download']).default('plain'),
});

export const promptIdSchema = z.object({ promptId: idSchema });

export const favoriteSchema = z.object({
  promptId: idSchema,
  collectionName: cleanText(60).optional(),
  note: cleanText(300).optional(),
});

/* ============================== Categories ============================== */

export const categoryWriteSchema = z.object({
  name: cleanText(60, 2),
  slug: slugSchema.optional(),
  description: cleanText(400).optional(),
  icon: cleanText(40).optional(),
  accent: cleanText(24).optional(),
  coverImageUrl: z.string().url().max(600).optional().or(z.literal('')),
  parentId: idSchema.optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
  isActive: z.boolean().optional().default(true),
  isFeatured: z.boolean().optional().default(false),
  seoTitle: cleanText(200).optional(),
  seoDescription: cleanText(320).optional(),
});

/* =============================== Generator ============================== */

export const generatorInputSchema = z.object({
  aiModel: aiModelEnum,
  imageType: cleanText(40).optional(),
  subject: cleanText(200).optional(),
  gender: genderEnum.optional(),
  style: cleanText(60).optional(),
  location: cleanText(120).optional(),
  outfit: cleanText(160).optional(),
  pose: cleanText(160).optional(),
  expression: cleanText(80).optional(),
  lighting: cleanText(120).optional(),
  camera: cleanText(120).optional(),
  background: cleanText(160).optional(),
  mood: cleanText(60).optional(),
  colorTone: cleanText(80).optional(),
  aspectRatio: aspectEnum.optional(),
  quality: z.enum(QUALITY_LEVELS.map((q) => q.id) as [string, ...string[]]).optional(),
  additionalInstructions: cleanText(600).optional(),
  useAi: z.boolean().optional().default(false),
});

export type GeneratorInput = z.infer<typeof generatorInputSchema>;

export const randomGeneratorSchema = z.object({
  aiModel: aiModelEnum.optional(),
  categorySlug: slugSchema.optional(),
});

export const saveGeneratedSchema = z.object({
  generatedId: idSchema,
  title: cleanText(160).optional(),
});

/* =============================== Payments =============================== */

export const createOrderSchema = z.object({
  /** Only the plan code travels from the browser — never the price. */
  planCode: z.string().trim().min(2).max(40),
  couponCode: z.string().trim().min(2).max(40).optional(),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(4).max(120),
  razorpay_payment_id: z.string().min(4).max(120),
  razorpay_signature: z.string().min(8).max(256),
});

export const couponCheckSchema = z.object({
  code: z.string().trim().min(2).max(40),
  planCode: z.string().trim().min(2).max(40),
});

export const couponWriteSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/i, 'Use letters, numbers, dashes and underscores'),
    description: cleanText(200).optional(),
    discountType: z.enum(['percentage', 'fixed']),
    percentage: z.coerce.number().int().min(1).max(100).optional(),
    amountMinor: z.coerce.number().int().min(1).optional(),
    startDate: z.number().int().optional().nullable(),
    endDate: z.number().int().optional().nullable(),
    usageLimit: z.coerce.number().int().min(1).optional().nullable(),
    perUserLimit: z.coerce.number().int().min(1).max(100).default(1),
    applicablePlans: z.array(z.string().max(40)).max(20).default([]),
    minAmountMinor: z.coerce.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  })
  .refine((v) => (v.discountType === 'percentage' ? Boolean(v.percentage) : Boolean(v.amountMinor)), {
    message: 'Provide a percentage for percentage coupons or an amount for fixed coupons',
    path: ['percentage'],
  });

export const planWriteSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
  name: cleanText(60, 2),
  description: cleanText(300).optional(),
  priceMinor: z.coerce.number().int().min(0).max(100_000_000),
  currency: z.string().length(3).default('INR'),
  billingPeriod: z.enum(['none', 'month', 'year', 'lifetime']),
  intervalCount: z.coerce.number().int().min(1).max(12).default(1),
  trialDays: z.coerce.number().int().min(0).max(90).default(0),
  features: z.array(cleanText(120, 1)).max(20).default([]),
  limits: z.record(z.string(), z.coerce.number().int().min(-1)).default({}),
  razorpayPlanId: z.string().max(120).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  isPopular: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

/* ================================ Content =============================== */

export const articleWriteSchema = z.object({
  title: cleanText(200, 4),
  slug: slugSchema.optional(),
  excerpt: cleanText(400).optional(),
  content: cleanText(60_000, 50),
  featuredImageUrl: z.string().url().max(600).optional().or(z.literal('')),
  categoryId: idSchema.optional().or(z.literal('')),
  seoTitle: cleanText(200).optional(),
  seoDescription: cleanText(320).optional(),
  keywords: cleanText(300).optional(),
  isPublished: z.boolean().default(false),
});

export const contactSchema = z.object({
  name: cleanText(80, 2),
  email: emailSchema,
  subject: cleanText(160, 3),
  message: cleanText(4000, 20),
  /** Honeypot — real users leave this empty. */
  website: z.string().max(0).optional(),
});

export const reportSchema = z.object({
  targetType: z.enum(['prompt', 'comment', 'user', 'article']),
  targetId: idSchema,
  reason: z.enum(['inappropriate', 'copyright', 'spam', 'broken', 'misleading', 'other']),
  details: cleanText(1000).optional(),
});

export const searchQuerySchema = z.object({
  q: cleanText(120).optional().default(''),
  page: z.coerce.number().int().min(1).max(200).optional().default(1),
});

export const suggestQuerySchema = z.object({
  q: cleanText(80).optional().default(''),
});

export const notificationPrefsSchema = z.object({
  newPremiumPrompts: z.boolean().optional(),
  newTrendingPrompts: z.boolean().optional(),
  subscriptionUpdates: z.boolean().optional(),
  paymentUpdates: z.boolean().optional(),
  productUpdates: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
});

export const analyticsEventSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_.:-]+$/i, 'Invalid event name'),
  path: cleanText(300).optional(),
  props: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});

export const settingsWriteSchema = z.object({
  values: z.record(z.string().min(1).max(80), z.union([z.string().max(2000), z.number(), z.boolean()])),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const adminUserQuerySchema = paginationSchema.extend({
  q: cleanText(120).optional(),
  role: z.enum(['admin', 'editor', 'creator', 'user']).optional(),
  premium: boolFromQuery.optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
});

/* ============================ Content studio ============================ */

/** Shared fields between a studio preview and a full studio run. */
const studioBase = {
  theme: cleanText(200, 3),
  categoryId: idSchema,
  aiModel: aiModelEnum,
  inputMode: inputModeEnum.optional().default('text-to-image'),
  isPremium: z.boolean().optional().default(false),
};

export const studioDraftSchema = z.object(studioBase);

export const studioRunSchema = z.object({
  ...studioBase,
  publishMode: z.enum(['draft', 'publish', 'schedule']).optional().default('draft'),
  /** Unix seconds. Only read when publishMode is 'schedule'. */
  scheduledFor: z.number().int().positive().optional().nullable(),
  skipCover: z.boolean().optional().default(false),
});

export type StudioDraftInput = z.infer<typeof studioDraftSchema>;
export type StudioRunInput = z.infer<typeof studioRunSchema>;

export const adminUserUpdateSchema = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  roles: z.array(z.enum(['admin', 'editor', 'creator', 'user'])).max(4).optional(),
  grantPremiumDays: z.coerce.number().int().min(1).max(3650).optional(),
  revokePremium: z.boolean().optional(),
});
