/**
 * Client-side helper for API routes that can take a while (Claude calls,
 * PDF compilation, batched DB writes). On Netlify's serverless functions a
 * slow request can hit the platform's own execution timeout, which returns
 * an HTML error page instead of JSON — `res.json()` then throws a cryptic
 * "Unexpected token '<' ... not valid JSON" error, or gets silently
 * swallowed by a `.catch(() => ({}))` into a meaningless generic fallback
 * message. This checks the content type first so callers can show something
 * the user can actually act on.
 */
export async function parseJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`The server took too long to respond (status ${res.status}). This step can be slow — please try again.`);
  }
  return res.json();
}
