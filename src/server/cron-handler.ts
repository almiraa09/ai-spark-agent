import { generateDailyBrief } from "../services/news-service";

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeTimingCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Server-side Cron Handler for Daily Brief generation (/api/cron/daily-brief).
 *
 * Security:
 * - Requires Authorization header with Bearer token matching CRON_SECRET.
 * - CRON_SECRET is strictly read from server runtime environment (env / process.env).
 * - Never leaks secret value, tokens, or credential details in logs, headers, or responses.
 */
export async function handleDailyBriefCron(request: Request, env?: unknown): Promise<Response> {
  // 1. Method verification (allow GET and POST)
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          Allow: "GET, POST"
        }
      }
    );
  }

  // 2. Read CRON_SECRET strictly from server environment
  const expectedSecret =
    ((env as any)?.CRON_SECRET as string) ||
    (typeof process !== "undefined" && process.env?.["CRON_SECRET"]) ||
    "";

  if (!expectedSecret) {
    console.error("Cron endpoint error: CRON_SECRET is not configured on server.");
    return new Response(
      JSON.stringify({ success: false, error: "Server configuration error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // 3. Validate Authorization header
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token || !safeTimingCompare(token, expectedSecret)) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // 4. Trigger existing generateDailyBrief() workflow
  try {
    const brief = await generateDailyBrief({
      newsApiKey: (env as any)?.NEWS_API_KEY,
      geminiApiKey: (env as any)?.GEMINI_API_KEY
    });

    return new Response(
      JSON.stringify({
        success: true,
        brief_date: brief.brief_date,
        topics_count: brief.topics?.length || 0,
        news_count: brief.news_items?.length || 0
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (err: any) {
    console.error("Daily brief cron execution failure:", err?.message || "Unknown error");
    return new Response(
      JSON.stringify({
        success: false,
        error: "Daily brief generation failed"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
