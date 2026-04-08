/**
 * Shared API helpers used across game modules.
 */

export type ApiError = {
  detail?: string;
  error?: string;
};

/**
 * Parse a fetch Response as JSON, throwing on HTTP errors or
 * application-level error fields.
 */
export async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;

  if (!response.ok) {
    throw new Error(payload.detail ?? payload.error ?? "Request failed.");
  }

  if (payload && typeof payload === "object" && "error" in payload && payload.error) {
    throw new Error(payload.error);
  }

  return payload as T;
}
