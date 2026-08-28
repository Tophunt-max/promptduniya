import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/* =========================================================================
 * Conventions
 * -------------------------------------------------------------------------
 * - ids are ULID-ish text primary keys (sortable, generated in `src/lib/id.ts`)
 * - timestamps are unix epoch seconds (integer) for cheap indexing/sorting
 * - booleans are integers with { mode: 'boolean' }
 * - money is stored in the smallest currency unit (paise) as integers
 * ======================================================================= */

const now = sql`(unixepoch())`;

const timestamps = {
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
};

/* ============================ Identity ================================= */

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(), // admin | editor | creator | user
  description: text('description'),
  ...timestamps,
});

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    emailVerifiedAt: integer('email_verified_at'),
    /** bcrypt hash — never a plaintext password. Null for OAuth-only users. */
    passwordHash: text('password_hash'),
    name: text('name').notNull(),
    username: text('username').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    /** Denormalised cache of entitlement state; ALWAYS re-validated server-side
     * against the `subscriptions` table before granting premium access. */
    premiumCachedUntil: integer('premium_cached_until'),
    status: text('status').notNull().default('active'), // active | suspended | deleted
    oauthProvider: text('oauth_provider'),
    oauthSubject: text('oauth_subject'),
    lastLoginAt: integer('last_login_at'),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: integer('locked_until'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_norm_uq').on(t.emailNormalized),
    uniqueIndex('users_username_uq').on(t.username),
    index('users_status_idx').on(t.status),
    index('users_created_idx').on(t.createdAt),
    index('users_oauth_idx').on(t.oauthProvider, t.oauthSubject),
  ],
);

export const userRoles = sqliteTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index('user_roles_role_idx').on(t.roleId)],
);

/** Extended profile — kept separate so the hot `users` row stays small. */
export const profiles = sqliteTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  website: text('website'),
  instagram: text('instagram'),
  youtube: text('youtube'),
  location: text('location'),
  /** Creator-ready fields (creator uploads can be enabled later). */
  isCreator: integer('is_creator', { mode: 'boolean' }).notNull().default(false),
  creatorApprovedAt: integer('creator_approved_at'),
  creatorHeadline: text('creator_headline'),
  ...timestamps,
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque session token — the raw token only lives in the cookie. */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('sessions_token_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

/** Single-use tokens for email verification and password resets. */
export const authTokens = sqliteTable(
  'auth_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // email_verify | password_reset
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash),
    index('auth_tokens_user_type_idx').on(t.userId, t.type),
  ],
);

/* ============================ Taxonomy ================================= */

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    icon: text('icon'),
    /** Tailwind-ish gradient token used by the CategoryCard component. */
    accent: text('accent').notNull().default('indigo'),
    coverImageUrl: text('cover_image_url'),
    parentId: text('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    promptCount: integer('prompt_count').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('categories_slug_uq').on(t.slug),
    index('categories_active_idx').on(t.isActive),
    index('categories_parent_idx').on(t.parentId),
    index('categories_sort_idx').on(t.sortOrder),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    usageCount: integer('usage_count').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('tags_slug_uq').on(t.slug), index('tags_usage_idx').on(t.usageCount)],
);

/* ============================= Prompts ================================= */

export const prompts = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    shortDescription: text('short_description').notNull(),
    /** The full prompt body. */
    promptText: text('prompt_text').notNull(),
    negativePrompt: text('negative_prompt'),
    /** Extra guidance shown by "Copy With Instructions". */
    usageInstructions: text('usage_instructions'),

    aiModel: text('ai_model').notNull(), // gemini | chatgpt | midjourney | flux | ...
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    subcategoryId: text('subcategory_id').references(() => categories.id, {
      onDelete: 'set null',
    }),

    style: text('style'),
    gender: text('gender'), // male | female | couple | group | any
    ageGroup: text('age_group'),
    location: text('location'),
    aspectRatio: text('aspect_ratio'),
    cameraStyle: text('camera_style'),
    lighting: text('lighting'),
    mood: text('mood'),
    difficulty: text('difficulty').notNull().default('beginner'),

    isPremium: integer('is_premium', { mode: 'boolean' }).notNull().default(false),
    isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
    isTrending: integer('is_trending', { mode: 'boolean' }).notNull().default(false),
    isEditorsPick: integer('is_editors_pick', { mode: 'boolean' }).notNull().default(false),
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
    publishedAt: integer('published_at'),
    scheduledFor: integer('scheduled_for'),

    coverImageUrl: text('cover_image_url'),
    coverImageAlt: text('cover_image_alt'),

    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),

    viewCount: integer('view_count').notNull().default(0),
    copyCount: integer('copy_count').notNull().default(0),
    likeCount: integer('like_count').notNull().default(0),
    favoriteCount: integer('favorite_count').notNull().default(0),
    /** Rolling popularity score recomputed by the trending job. */
    trendingScore: real('trending_score').notNull().default(0),

    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    /** Denormalised lowercase haystack: title + description + tags + prompt. */
    searchText: text('search_text').notNull().default(''),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('prompts_slug_uq').on(t.slug),
    index('prompts_category_idx').on(t.categoryId),
    index('prompts_model_idx').on(t.aiModel),
    index('prompts_published_idx').on(t.isPublished, t.publishedAt),
    index('prompts_premium_idx').on(t.isPremium),
    index('prompts_trending_idx').on(t.isTrending, t.trendingScore),
    index('prompts_featured_idx').on(t.isFeatured),
    index('prompts_created_idx').on(t.createdAt),
    index('prompts_copy_idx').on(t.copyCount),
    index('prompts_like_idx').on(t.likeCount),
    index('prompts_view_idx').on(t.viewCount),
    index('prompts_author_idx').on(t.authorId),
    index('prompts_style_idx').on(t.style),
    index('prompts_gender_idx').on(t.gender),
    index('prompts_aspect_idx').on(t.aspectRatio),
    index('prompts_search_idx').on(t.searchText),
  ],
);

/** Media records — binary data lives in object storage, never in the DB. */
export const promptImages = sqliteTable(
  'prompt_images',
  {
    id: text('id').primaryKey(),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    alt: text('alt'),
    width: integer('width'),
    height: integer('height'),
    fileSize: integer('file_size'),
    mimeType: text('mime_type'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('prompt_images_prompt_idx').on(t.promptId, t.sortOrder)],
);

export const promptTags = sqliteTable(
  'prompt_tags',
  {
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.promptId, t.tagId] }), index('prompt_tags_tag_idx').on(t.tagId)],
);

/* ======================= Engagement / activity ========================= */

export const likes = sqliteTable(
  'likes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.promptId] }),
    index('likes_prompt_idx').on(t.promptId),
    index('likes_created_idx').on(t.createdAt),
  ],
);

export const favorites = sqliteTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    collectionName: text('collection_name'),
    note: text('note'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.promptId] }),
    index('favorites_prompt_idx').on(t.promptId),
    index('favorites_user_created_idx').on(t.userId, t.createdAt),
  ],
);

export const promptViews = sqliteTable(
  'prompt_views',
  {
    id: text('id').primaryKey(),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Salted hash of the visitor identifier — no raw IPs are retained. */
    visitorHash: text('visitor_hash'),
    referrer: text('referrer'),
    dayBucket: text('day_bucket').notNull(), // YYYY-MM-DD for cheap aggregation
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('prompt_views_prompt_idx').on(t.promptId),
    index('prompt_views_day_idx').on(t.dayBucket),
    index('prompt_views_dedupe_idx').on(t.promptId, t.visitorHash, t.dayBucket),
  ],
);

export const promptCopies = sqliteTable(
  'prompt_copies',
  {
    id: text('id').primaryKey(),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    visitorHash: text('visitor_hash'),
    variant: text('variant').notNull().default('plain'), // plain | instructions | download
    dayBucket: text('day_bucket').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('prompt_copies_prompt_idx').on(t.promptId),
    index('prompt_copies_user_day_idx').on(t.userId, t.dayBucket),
    index('prompt_copies_day_idx').on(t.dayBucket),
  ],
);

export const generatedPrompts = sqliteTable(
  'generated_prompts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    visitorHash: text('visitor_hash'),
    mode: text('mode').notNull().default('advanced'), // advanced | random
    aiModel: text('ai_model').notNull(),
    /** JSON blob of the generator form input. */
    inputJson: text('input_json').notNull(),
    output: text('output').notNull(),
    negativeOutput: text('negative_output'),
    engine: text('engine').notNull().default('template'), // template | gemini | openai
    title: text('title'),
    isSaved: integer('is_saved', { mode: 'boolean' }).notNull().default(false),
    dayBucket: text('day_bucket').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('generated_user_idx').on(t.userId, t.createdAt),
    index('generated_user_day_idx').on(t.userId, t.dayBucket),
    index('generated_visitor_day_idx').on(t.visitorHash, t.dayBucket),
    index('generated_saved_idx').on(t.userId, t.isSaved),
  ],
);

/* ==================== Billing: plans & subscriptions =================== */

export const plans = sqliteTable(
  'plans',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(), // free | monthly | yearly | lifetime
    name: text('name').notNull(),
    description: text('description'),
    /** Price in the smallest currency unit (paise for INR). */
    priceMinor: integer('price_minor').notNull().default(0),
    currency: text('currency').notNull().default('INR'),
    /** month | year | lifetime | none */
    billingPeriod: text('billing_period').notNull().default('none'),
    intervalCount: integer('interval_count').notNull().default(1),
    trialDays: integer('trial_days').notNull().default(0),
    /** JSON array of marketing bullet points. */
    featuresJson: text('features_json').notNull().default('[]'),
    /** JSON object of entitlement limits; -1 means unlimited. */
    limitsJson: text('limits_json').notNull().default('{}'),
    razorpayPlanId: text('razorpay_plan_id'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    isPopular: integer('is_popular', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('plans_code_uq').on(t.code), index('plans_active_idx').on(t.isActive)],
);

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull().default('razorpay'), // razorpay | manual | mock
    providerSubscriptionId: text('provider_subscription_id'),
    /** created | active | past_due | cancelled | expired | halted */
    status: text('status').notNull().default('created'),
    startDate: integer('start_date'),
    endDate: integer('end_date'),
    cancelledAt: integer('cancelled_at'),
    autoRenew: integer('auto_renew', { mode: 'boolean' }).notNull().default(false),
    couponId: text('coupon_id'),
    notesJson: text('notes_json'),
    ...timestamps,
  },
  (t) => [
    index('subs_user_status_idx').on(t.userId, t.status),
    index('subs_status_end_idx').on(t.status, t.endDate),
    uniqueIndex('subs_provider_id_uq').on(t.providerSubscriptionId),
  ],
);

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: text('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    subscriptionId: text('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    /** Authoritative amount, always derived server-side from the plan. */
    amountMinor: integer('amount_minor').notNull(),
    discountMinor: integer('discount_minor').notNull().default(0),
    currency: text('currency').notNull().default('INR'),
    provider: text('provider').notNull().default('razorpay'),
    providerOrderId: text('provider_order_id'),
    providerPaymentId: text('provider_payment_id'),
    providerSignature: text('provider_signature'),
    /** created | authorized | captured | failed | refunded | partially_refunded */
    status: text('status').notNull().default('created'),
    paymentMethod: text('payment_method'), // upi | card | netbanking | wallet | ...
    failureReason: text('failure_reason'),
    couponId: text('coupon_id'),
    refundedMinor: integer('refunded_minor').notNull().default(0),
    receiptId: text('receipt_id'),
    ...timestamps,
  },
  (t) => [
    index('payments_user_idx').on(t.userId, t.createdAt),
    index('payments_status_idx').on(t.status),
    uniqueIndex('payments_order_uq').on(t.providerOrderId),
    index('payments_provider_payment_idx').on(t.providerPaymentId),
    index('payments_created_idx').on(t.createdAt),
  ],
);

/** Raw provider webhook/callback log. `eventKey` gives us idempotency. */
export const paymentEvents = sqliteTable(
  'payment_events',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull().default('razorpay'),
    eventType: text('eventType').notNull(),
    /** Unique per delivered event; a replay is ignored via the unique index. */
    eventKey: text('event_key').notNull(),
    paymentId: text('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    subscriptionId: text('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    payloadJson: text('payload_json').notNull(),
    signatureValid: integer('signature_valid', { mode: 'boolean' }).notNull().default(false),
    processedAt: integer('processed_at'),
    processingError: text('processing_error'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('payment_events_key_uq').on(t.provider, t.eventKey),
    index('payment_events_type_idx').on(t.eventType),
  ],
);

/** Immutable ledger of money movements (separate from provider payments). */
export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    paymentId: text('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    subscriptionId: text('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull(), // charge | refund | adjustment
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('INR'),
    /** Guards against double-writing the same logical transaction. */
    idempotencyKey: text('idempotency_key').notNull(),
    description: text('description'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('transactions_idem_uq').on(t.idempotencyKey),
    index('transactions_user_idx').on(t.userId, t.createdAt),
  ],
);

/** Resolved capability grants — the single source of truth for access checks. */
export const entitlements = sqliteTable(
  'entitlements',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').references(() => subscriptions.id, {
      onDelete: 'cascade',
    }),
    /** e.g. premium_prompts, unlimited_copies, advanced_generator, ad_free */
    feature: text('feature').notNull(),
    /** -1 = unlimited, 0 = denied, n = per-day quota */
    quota: integer('quota').notNull().default(-1),
    source: text('source').notNull().default('plan'), // plan | grant | promo
    startsAt: integer('starts_at'),
    expiresAt: integer('expires_at'),
    revokedAt: integer('revoked_at'),
    ...timestamps,
  },
  (t) => [
    index('entitlements_user_feature_idx').on(t.userId, t.feature),
    index('entitlements_expiry_idx').on(t.expiresAt),
  ],
);

/* ============================= Coupons ================================= */

export const coupons = sqliteTable(
  'coupons',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    description: text('description'),
    discountType: text('discount_type').notNull().default('percentage'), // percentage | fixed
    percentage: integer('percentage'),
    amountMinor: integer('amount_minor'),
    currency: text('currency').notNull().default('INR'),
    startDate: integer('start_date'),
    endDate: integer('end_date'),
    usageLimit: integer('usage_limit'),
    perUserLimit: integer('per_user_limit').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    /** JSON array of plan codes; empty array = all plans. */
    applicablePlansJson: text('applicable_plans_json').notNull().default('[]'),
    minAmountMinor: integer('min_amount_minor').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('coupons_code_uq').on(t.code), index('coupons_active_idx').on(t.isActive)],
);

export const couponRedemptions = sqliteTable(
  'coupon_redemptions',
  {
    id: text('id').primaryKey(),
    couponId: text('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    paymentId: text('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    discountMinor: integer('discount_minor').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('coupon_redemptions_coupon_idx').on(t.couponId),
    index('coupon_redemptions_user_idx').on(t.userId, t.couponId),
  ],
);

/* ========================== Notifications ============================== */

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    href: text('href'),
    icon: text('icon'),
    readAt: integer('read_at'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt),
    index('notifications_unread_idx').on(t.userId, t.readAt),
  ],
);

export const notificationPreferences = sqliteTable('notification_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  newPremiumPrompts: integer('new_premium_prompts', { mode: 'boolean' }).notNull().default(true),
  newTrendingPrompts: integer('new_trending_prompts', { mode: 'boolean' }).notNull().default(true),
  subscriptionUpdates: integer('subscription_updates', { mode: 'boolean' }).notNull().default(true),
  paymentUpdates: integer('payment_updates', { mode: 'boolean' }).notNull().default(true),
  productUpdates: integer('product_updates', { mode: 'boolean' }).notNull().default(false),
  emailEnabled: integer('email_enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

/* ============================= Content ================================= */

export const articles = sqliteTable(
  'articles',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    excerpt: text('excerpt'),
    /** Markdown-ish body rendered through a sanitising renderer. */
    content: text('content').notNull(),
    featuredImageUrl: text('featured_image_url'),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    keywords: text('keywords'),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
    publishedAt: integer('published_at'),
    viewCount: integer('view_count').notNull().default(0),
    readingMinutes: integer('reading_minutes').notNull().default(3),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('articles_slug_uq').on(t.slug),
    index('articles_published_idx').on(t.isPublished, t.publishedAt),
    index('articles_category_idx').on(t.categoryId),
  ],
);

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    promptId: text('prompt_id').references(() => prompts.id, { onDelete: 'cascade' }),
    articleId: text('article_id').references(() => articles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: text('status').notNull().default('pending'), // pending | approved | rejected
    moderatedBy: text('moderated_by').references(() => users.id, { onDelete: 'set null' }),
    moderatedAt: integer('moderated_at'),
    ...timestamps,
  },
  (t) => [
    index('comments_prompt_idx').on(t.promptId, t.status),
    index('comments_status_idx').on(t.status, t.createdAt),
  ],
);

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reporterId: text('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: text('target_type').notNull(), // prompt | comment | user | article
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    details: text('details'),
    status: text('status').notNull().default('open'), // open | reviewing | resolved | dismissed
    resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    resolvedAt: integer('resolved_at'),
    ...timestamps,
  },
  (t) => [
    index('reports_status_idx').on(t.status, t.createdAt),
    index('reports_target_idx').on(t.targetType, t.targetId),
  ],
);

export const contactMessages = sqliteTable(
  'contact_messages',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    ipHash: text('ip_hash'),
    status: text('status').notNull().default('new'), // new | read | replied | spam
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('contact_status_idx').on(t.status, t.createdAt)],
);

/* ========================= Ops / analytics ============================= */

export const adminLogs = sqliteTable(
  'admin_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metaJson: text('meta_json'),
    ipHash: text('ip_hash'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('admin_logs_actor_idx').on(t.actorId, t.createdAt),
    index('admin_logs_action_idx').on(t.action, t.createdAt),
  ],
);

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  /** string | number | boolean | json — used for parsing on read. */
  valueType: text('value_type').notNull().default('string'),
  group: text('group').notNull().default('general'),
  label: text('label'),
  description: text('description'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
});

export const pageViews = sqliteTable(
  'page_views',
  {
    id: text('id').primaryKey(),
    path: text('path').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    visitorHash: text('visitor_hash'),
    referrer: text('referrer'),
    dayBucket: text('day_bucket').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('page_views_day_idx').on(t.dayBucket),
    index('page_views_path_idx').on(t.path, t.dayBucket),
  ],
);

export const searchQueries = sqliteTable(
  'search_queries',
  {
    id: text('id').primaryKey(),
    query: text('query').notNull(),
    normalized: text('normalized').notNull(),
    resultCount: integer('result_count').notNull().default(0),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    visitorHash: text('visitor_hash'),
    dayBucket: text('day_bucket').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('search_norm_idx').on(t.normalized),
    index('search_day_idx').on(t.dayBucket),
    index('search_user_idx').on(t.userId, t.createdAt),
  ],
);

export const analyticsEvents = sqliteTable(
  'analytics_events',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    visitorHash: text('visitor_hash'),
    propsJson: text('props_json'),
    dayBucket: text('day_bucket').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('analytics_name_day_idx').on(t.name, t.dayBucket),
    index('analytics_day_idx').on(t.dayBucket),
  ],
);

/** Durable rate-limit buckets (used when RATE_LIMIT_DRIVER=memory is not enough). */
export const rateLimitBuckets = sqliteTable(
  'rate_limit_buckets',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull().default(0),
    resetAt: integer('reset_at').notNull(),
  },
  (t) => [index('rate_limit_reset_idx').on(t.resetAt)],
);

/* ============================ Relations ================================ */

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  roles: many(userRoles),
  prompts: many(prompts),
  favorites: many(favorites),
  likes: many(likes),
  subscriptions: many(subscriptions),
  payments: many(payments),
  notifications: many(notifications),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const promptsRelations = relations(prompts, ({ one, many }) => ({
  category: one(categories, { fields: [prompts.categoryId], references: [categories.id] }),
  author: one(users, { fields: [prompts.authorId], references: [users.id] }),
  images: many(promptImages),
  tags: many(promptTags),
}));

export const promptTagsRelations = relations(promptTags, ({ one }) => ({
  prompt: one(prompts, { fields: [promptTags.promptId], references: [prompts.id] }),
  tag: one(tags, { fields: [promptTags.tagId], references: [tags.id] }),
}));

export const promptImagesRelations = relations(promptImages, ({ one }) => ({
  prompt: one(prompts, { fields: [promptImages.promptId], references: [prompts.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  payments: many(payments),
  entitlements: many(entitlements),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  plan: one(plans, { fields: [payments.planId], references: [plans.id] }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  prompt: one(prompts, { fields: [favorites.promptId], references: [prompts.id] }),
}));

export const likesRelations = relations(likes, ({ one }) => ({
  user: one(users, { fields: [likes.userId], references: [users.id] }),
  prompt: one(prompts, { fields: [likes.promptId], references: [prompts.id] }),
}));

export const articlesRelations = relations(articles, ({ one }) => ({
  author: one(users, { fields: [articles.authorId], references: [users.id] }),
  category: one(categories, { fields: [articles.categoryId], references: [categories.id] }),
}));

/* ======================= Inferred model types ========================== */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
export type PromptImage = typeof promptImages.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type GeneratedPrompt = typeof generatedPrompts.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type SiteSetting = typeof siteSettings.$inferSelect;
