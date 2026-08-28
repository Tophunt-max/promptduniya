import { serializeJsonLd } from '@/lib/seo';

/**
 * Renders a structured-data block.
 *
 * The payload is JSON-serialised with `<` escaped, so page data can never break
 * out of the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
