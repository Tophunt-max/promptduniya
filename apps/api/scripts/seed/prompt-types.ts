/**
 * Shape of a seeded prompt.
 *
 * All prompt text in the seed files is original, written for this project.
 * Nothing is scraped or copied from another site.
 */
export interface SeedPrompt {
  title: string;
  slug: string;
  shortDescription: string;
  promptText: string;
  negativePrompt?: string;
  usageInstructions?: string;
  aiModel: string;
  /**
   * How the reader supplies the subject. Omitted means 'text-to-image', which
   * is what every prompt written before the distinction existed was.
   */
  inputMode?: 'text-to-image' | 'photo-edit';
  categorySlug: string;
  style: string;
  gender: string;
  ageGroup?: string;
  location?: string;
  aspectRatio: string;
  cameraStyle?: string;
  lighting?: string;
  mood?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isPremium?: boolean;
  isFeatured?: boolean;
  isTrending?: boolean;
  isEditorsPick?: boolean;
  tags: string[];
  seoTitle?: string;
  seoDescription?: string;
}
