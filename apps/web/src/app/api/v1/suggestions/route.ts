import { NextResponse } from "next/server";
import { sql } from "@clicky/db";
import { parseProjectSettings, suggestionsRequestSchema, type SuggestionsResponse } from "@clicky/shared";
import { db } from "@/lib/db";
import { authorizeProject, corsHeaders, enforceRateLimit, parseBody, preflight, sdkErrorResponse } from "@/lib/sdk-request";

export const OPTIONS = preflight;

/**
 * Starting points for an empty chat: the team's starter questions, plus topics
 * that people (at least two different ones) needed help with on this page.
 * Only topic names are returned, never what other users typed.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await parseBody(request, suggestionsRequestSchema);
    const proj = await authorizeProject(body.projectKey, origin);
    enforceRateLimit(`suggest:${proj.id}:${body.anonymousId}`, 60);
    const { appearance } = parseProjectSettings(proj.settings);
    let topics: string[] = [];
    if (appearance.suggestTopics) {
      const path = body.path.split(/[?#]/)[0] || "/";
      const rows = (await db.execute(sql`
        select t.label
        from message m
        join conversation c on c.id = m.conversation_id
        join topic t on t.id = m.topic_id
        where c.project_id = ${proj.id} and m.role = 'user' and m.answered = true
          and m.created_at > now() - interval '30 days'
          and coalesce(nullif(regexp_replace(m.page_url, '^https?://[^/]+|[?#].*$', '', 'g'), ''), '/') = ${path}
        group by t.label
        having count(distinct c.end_user_id) >= 2
        order by count(*) desc
        limit 3`)) as unknown as { label: string }[];
      topics = rows.map((r) => r.label);
    }
    const response: SuggestionsResponse = { questions: appearance.starterQuestions, topics };
    return NextResponse.json(response, { headers: { ...corsHeaders(origin), "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return sdkErrorResponse(error, origin);
  }
}
