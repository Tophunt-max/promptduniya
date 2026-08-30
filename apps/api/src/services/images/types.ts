/**
 * Image generation contract.
 *
 * Deliberately narrow: an engine turns an instruction (plus an optional
 * reference face) into raw image bytes. Everything else — validation, storage,
 * database writes — stays in the caller, so swapping providers cannot change
 * where files land or what gets recorded.
 */

export interface ReferenceImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ImageRequest {
  /** The full instruction handed to the model. */
  instruction: string;
  /** Things that must not appear, when the provider supports a negative prompt. */
  negative?: string;
  /**
   * A face to preserve. Only meaningful for providers that accept image input;
   * text-only providers ignore it and must say so via `usedReference: false`.
   */
  reference?: ReferenceImage;
  /** Aspect ratio hint, e.g. '4:5'. Providers approximate to the nearest size. */
  aspectRatio?: string;
}

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
  /** Engine that produced the bytes, recorded in the admin log. */
  engine: string;
  /** False when a reference face was supplied but the engine could not use it. */
  usedReference: boolean;
  /**
   * Why the preferred engine was not used, when a fallback produced the bytes.
   *
   * The engine name alone said *that* a fallback ran but never *why*, and the
   * reason only reached `console.warn` — invisible from the console that asked
   * for the image. A cover silently produced by a weaker model is the failure
   * this surfaces: it looks like a quality problem in the prompt rather than a
   * misconfigured or retired model id.
   */
  fallbackReason?: string;
}

export interface ImageEngine {
  readonly name: string;
  /** Whether this engine can preserve a face from a reference image. */
  readonly supportsReference: boolean;
  generate(request: ImageRequest): Promise<GeneratedImage>;
}

/** Decodes a base64 payload — both providers return images that way. */
export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes bytes for providers that take inline base64 image input. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked to avoid blowing the argument limit on large buffers.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
