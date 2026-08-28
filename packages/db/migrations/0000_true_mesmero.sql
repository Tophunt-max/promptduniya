CREATE TABLE `admin_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`meta_json` text,
	`ip_hash` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `admin_logs_actor_idx` ON `admin_logs` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_logs_action_idx` ON `admin_logs` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text,
	`visitor_hash` text,
	`props_json` text,
	`day_bucket` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `analytics_name_day_idx` ON `analytics_events` (`name`,`day_bucket`);--> statement-breakpoint
CREATE INDEX `analytics_day_idx` ON `analytics_events` (`day_bucket`);--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`content` text NOT NULL,
	`featured_image_url` text,
	`category_id` text,
	`seo_title` text,
	`seo_description` text,
	`keywords` text,
	`author_id` text,
	`is_published` integer DEFAULT false NOT NULL,
	`published_at` integer,
	`view_count` integer DEFAULT 0 NOT NULL,
	`reading_minutes` integer DEFAULT 3 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_slug_uq` ON `articles` (`slug`);--> statement-breakpoint
CREATE INDEX `articles_published_idx` ON `articles` (`is_published`,`published_at`);--> statement-breakpoint
CREATE INDEX `articles_category_idx` ON `articles` (`category_id`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_hash_uq` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_tokens_user_type_idx` ON `auth_tokens` (`user_id`,`type`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`icon` text,
	`accent` text DEFAULT 'indigo' NOT NULL,
	`cover_image_url` text,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`prompt_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_uq` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `categories_active_idx` ON `categories` (`is_active`);--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `categories_sort_idx` ON `categories` (`sort_order`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text,
	`article_id` text,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`moderated_by` text,
	`moderated_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moderated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comments_prompt_idx` ON `comments` (`prompt_id`,`status`);--> statement-breakpoint
CREATE INDEX `comments_status_idx` ON `comments` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`ip_hash` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_status_idx` ON `contact_messages` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`coupon_id` text NOT NULL,
	`user_id` text NOT NULL,
	`payment_id` text,
	`discount_minor` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `coupon_redemptions_coupon_idx` ON `coupon_redemptions` (`coupon_id`);--> statement-breakpoint
CREATE INDEX `coupon_redemptions_user_idx` ON `coupon_redemptions` (`user_id`,`coupon_id`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`discount_type` text DEFAULT 'percentage' NOT NULL,
	`percentage` integer,
	`amount_minor` integer,
	`currency` text DEFAULT 'INR' NOT NULL,
	`start_date` integer,
	`end_date` integer,
	`usage_limit` integer,
	`per_user_limit` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`applicable_plans_json` text DEFAULT '[]' NOT NULL,
	`min_amount_minor` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_uq` ON `coupons` (`code`);--> statement-breakpoint
CREATE INDEX `coupons_active_idx` ON `coupons` (`is_active`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subscription_id` text,
	`feature` text NOT NULL,
	`quota` integer DEFAULT -1 NOT NULL,
	`source` text DEFAULT 'plan' NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entitlements_user_feature_idx` ON `entitlements` (`user_id`,`feature`);--> statement-breakpoint
CREATE INDEX `entitlements_expiry_idx` ON `entitlements` (`expires_at`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`user_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`collection_name` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `prompt_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `favorites_prompt_idx` ON `favorites` (`prompt_id`);--> statement-breakpoint
CREATE INDEX `favorites_user_created_idx` ON `favorites` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `generated_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`visitor_hash` text,
	`mode` text DEFAULT 'advanced' NOT NULL,
	`ai_model` text NOT NULL,
	`input_json` text NOT NULL,
	`output` text NOT NULL,
	`negative_output` text,
	`engine` text DEFAULT 'template' NOT NULL,
	`title` text,
	`is_saved` integer DEFAULT false NOT NULL,
	`day_bucket` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generated_user_idx` ON `generated_prompts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `generated_user_day_idx` ON `generated_prompts` (`user_id`,`day_bucket`);--> statement-breakpoint
CREATE INDEX `generated_visitor_day_idx` ON `generated_prompts` (`visitor_hash`,`day_bucket`);--> statement-breakpoint
CREATE INDEX `generated_saved_idx` ON `generated_prompts` (`user_id`,`is_saved`);--> statement-breakpoint
CREATE TABLE `likes` (
	`user_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `prompt_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `likes_prompt_idx` ON `likes` (`prompt_id`);--> statement-breakpoint
CREATE INDEX `likes_created_idx` ON `likes` (`created_at`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`new_premium_prompts` integer DEFAULT true NOT NULL,
	`new_trending_prompts` integer DEFAULT true NOT NULL,
	`subscription_updates` integer DEFAULT true NOT NULL,
	`payment_updates` integer DEFAULT true NOT NULL,
	`product_updates` integer DEFAULT false NOT NULL,
	`email_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`href` text,
	`icon` text,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_unread_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `page_views` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`user_id` text,
	`visitor_hash` text,
	`referrer` text,
	`day_bucket` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `page_views_day_idx` ON `page_views` (`day_bucket`);--> statement-breakpoint
CREATE INDEX `page_views_path_idx` ON `page_views` (`path`,`day_bucket`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'razorpay' NOT NULL,
	`eventType` text NOT NULL,
	`event_key` text NOT NULL,
	`payment_id` text,
	`subscription_id` text,
	`payload_json` text NOT NULL,
	`signature_valid` integer DEFAULT false NOT NULL,
	`processed_at` integer,
	`processing_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_key_uq` ON `payment_events` (`provider`,`event_key`);--> statement-breakpoint
CREATE INDEX `payment_events_type_idx` ON `payment_events` (`eventType`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text,
	`subscription_id` text,
	`amount_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`provider` text DEFAULT 'razorpay' NOT NULL,
	`provider_order_id` text,
	`provider_payment_id` text,
	`provider_signature` text,
	`status` text DEFAULT 'created' NOT NULL,
	`payment_method` text,
	`failure_reason` text,
	`coupon_id` text,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`receipt_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_order_uq` ON `payments` (`provider_order_id`);--> statement-breakpoint
CREATE INDEX `payments_provider_payment_idx` ON `payments` (`provider_payment_id`);--> statement-breakpoint
CREATE INDEX `payments_created_idx` ON `payments` (`created_at`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`billing_period` text DEFAULT 'none' NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`trial_days` integer DEFAULT 0 NOT NULL,
	`features_json` text DEFAULT '[]' NOT NULL,
	`limits_json` text DEFAULT '{}' NOT NULL,
	`razorpay_plan_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_popular` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_code_uq` ON `plans` (`code`);--> statement-breakpoint
CREATE INDEX `plans_active_idx` ON `plans` (`is_active`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`website` text,
	`instagram` text,
	`youtube` text,
	`location` text,
	`is_creator` integer DEFAULT false NOT NULL,
	`creator_approved_at` integer,
	`creator_headline` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prompt_copies` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`user_id` text,
	`visitor_hash` text,
	`variant` text DEFAULT 'plain' NOT NULL,
	`day_bucket` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prompt_copies_prompt_idx` ON `prompt_copies` (`prompt_id`);--> statement-breakpoint
CREATE INDEX `prompt_copies_user_day_idx` ON `prompt_copies` (`user_id`,`day_bucket`);--> statement-breakpoint
CREATE INDEX `prompt_copies_day_idx` ON `prompt_copies` (`day_bucket`);--> statement-breakpoint
CREATE TABLE `prompt_images` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`object_key` text NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`alt` text,
	`width` integer,
	`height` integer,
	`file_size` integer,
	`mime_type` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompt_images_prompt_idx` ON `prompt_images` (`prompt_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `prompt_tags` (
	`prompt_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`prompt_id`, `tag_id`),
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompt_tags_tag_idx` ON `prompt_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `prompt_views` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`user_id` text,
	`visitor_hash` text,
	`referrer` text,
	`day_bucket` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prompt_views_prompt_idx` ON `prompt_views` (`prompt_id`);--> statement-breakpoint
CREATE INDEX `prompt_views_day_idx` ON `prompt_views` (`day_bucket`);--> statement-breakpoint
CREATE INDEX `prompt_views_dedupe_idx` ON `prompt_views` (`prompt_id`,`visitor_hash`,`day_bucket`);--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`short_description` text NOT NULL,
	`prompt_text` text NOT NULL,
	`negative_prompt` text,
	`usage_instructions` text,
	`ai_model` text NOT NULL,
	`category_id` text NOT NULL,
	`subcategory_id` text,
	`style` text,
	`gender` text,
	`age_group` text,
	`location` text,
	`aspect_ratio` text,
	`camera_style` text,
	`lighting` text,
	`mood` text,
	`difficulty` text DEFAULT 'beginner' NOT NULL,
	`is_premium` integer DEFAULT false NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`is_trending` integer DEFAULT false NOT NULL,
	`is_editors_pick` integer DEFAULT false NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`published_at` integer,
	`scheduled_for` integer,
	`cover_image_url` text,
	`cover_image_alt` text,
	`author_id` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`copy_count` integer DEFAULT 0 NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`favorite_count` integer DEFAULT 0 NOT NULL,
	`trending_score` real DEFAULT 0 NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`search_text` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subcategory_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompts_slug_uq` ON `prompts` (`slug`);--> statement-breakpoint
CREATE INDEX `prompts_category_idx` ON `prompts` (`category_id`);--> statement-breakpoint
CREATE INDEX `prompts_model_idx` ON `prompts` (`ai_model`);--> statement-breakpoint
CREATE INDEX `prompts_published_idx` ON `prompts` (`is_published`,`published_at`);--> statement-breakpoint
CREATE INDEX `prompts_premium_idx` ON `prompts` (`is_premium`);--> statement-breakpoint
CREATE INDEX `prompts_trending_idx` ON `prompts` (`is_trending`,`trending_score`);--> statement-breakpoint
CREATE INDEX `prompts_featured_idx` ON `prompts` (`is_featured`);--> statement-breakpoint
CREATE INDEX `prompts_created_idx` ON `prompts` (`created_at`);--> statement-breakpoint
CREATE INDEX `prompts_copy_idx` ON `prompts` (`copy_count`);--> statement-breakpoint
CREATE INDEX `prompts_like_idx` ON `prompts` (`like_count`);--> statement-breakpoint
CREATE INDEX `prompts_view_idx` ON `prompts` (`view_count`);--> statement-breakpoint
CREATE INDEX `prompts_author_idx` ON `prompts` (`author_id`);--> statement-breakpoint
CREATE INDEX `prompts_style_idx` ON `prompts` (`style`);--> statement-breakpoint
CREATE INDEX `prompts_gender_idx` ON `prompts` (`gender`);--> statement-breakpoint
CREATE INDEX `prompts_aspect_idx` ON `prompts` (`aspect_ratio`);--> statement-breakpoint
CREATE INDEX `prompts_search_idx` ON `prompts` (`search_text`);--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_reset_idx` ON `rate_limit_buckets` (`reset_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolution_note` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `search_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`normalized` text NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`user_id` text,
	`visitor_hash` text,
	`day_bucket` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `search_norm_idx` ON `search_queries` (`normalized`);--> statement-breakpoint
CREATE INDEX `search_day_idx` ON `search_queries` (`day_bucket`);--> statement-breakpoint
CREATE INDEX `search_user_idx` ON `search_queries` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`user_agent` text,
	`ip_hash` text,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_uq` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`value_type` text DEFAULT 'string' NOT NULL,
	`group` text DEFAULT 'general' NOT NULL,
	`label` text,
	`description` text,
	`is_public` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`provider` text DEFAULT 'razorpay' NOT NULL,
	`provider_subscription_id` text,
	`status` text DEFAULT 'created' NOT NULL,
	`start_date` integer,
	`end_date` integer,
	`cancelled_at` integer,
	`auto_renew` integer DEFAULT false NOT NULL,
	`coupon_id` text,
	`notes_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `subs_user_status_idx` ON `subscriptions` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `subs_status_end_idx` ON `subscriptions` (`status`,`end_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `subs_provider_id_uq` ON `subscriptions` (`provider_subscription_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_uq` ON `tags` (`slug`);--> statement-breakpoint
CREATE INDEX `tags_usage_idx` ON `tags` (`usage_count`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payment_id` text,
	`subscription_id` text,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`idempotency_key` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_idem_uq` ON `transactions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `transactions_user_idx` ON `transactions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_roles_role_idx` ON `user_roles` (`role_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_normalized` text NOT NULL,
	`email_verified_at` integer,
	`password_hash` text,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`avatar_url` text,
	`bio` text,
	`premium_cached_until` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`oauth_provider` text,
	`oauth_subject` text,
	`last_login_at` integer,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_norm_uq` ON `users` (`email_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
CREATE INDEX `users_created_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE INDEX `users_oauth_idx` ON `users` (`oauth_provider`,`oauth_subject`);