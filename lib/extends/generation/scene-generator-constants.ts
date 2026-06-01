/** Shared constants for scene content generation retries. */
export const CONTENT_GENERATION_MAX_ATTEMPTS = 2;

/**
 * Upstream does not cap slide JSON length. Only honor the model window when known.
 */
export function resolveSlideContentMaxOutputTokens(
  modelOutputWindow?: number,
): number | undefined {
  if (modelOutputWindow == null || modelOutputWindow <= 0) {
    return undefined;
  }
  return modelOutputWindow;
}
