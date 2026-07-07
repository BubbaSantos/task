import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_CATEGORIES = ["work", "personal", "health", "errands"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { transcript, today, instructions, knownTags } = await req.json() as {
      transcript: string;
      today: string;
      instructions?: string;
      knownTags?: string[];
    };

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY secret not set");

    const d = new Date(today);
    const tomorrow = new Date(d); tomorrow.setDate(d.getDate() + 1);
    const nextWeek = new Date(d); nextWeek.setDate(d.getDate() + 7);
    const fmt = (x: Date) => x.toISOString().slice(0, 10);

    const hasKnownTags = knownTags && knownTags.length > 0;

    const prompt = `Parse this voice task description into structured JSON. Return ONLY the JSON object, no explanation.

Voice input: "${transcript}"

Dates:
- today = ${today}
- tomorrow = ${fmt(tomorrow)}
- next week = ${fmt(nextWeek)}

Categories (pick the best fit):
- work: professional tasks, meetings, emails, projects, colleagues
- personal: personal life, family, home, relationships
- health: medical, exercise, wellness, appointments
- errands: shopping, chores, admin, errands

Tag rules (important):
${hasKnownTags
  ? `- You MUST only use tags from this existing list: ${knownTags.map(t => `"${t}"`).join(', ')}
- Do NOT invent new tags. If nothing fits, use an empty array.
- Only create a new tag if the user explicitly says "add tag [name]" or "new tag [name]" in their voice input.`
  : `- No existing tags yet. Only create a tag if the user explicitly says "add tag [name]" or "new tag [name]".`}
${instructions?.trim() ? `\nAdditional instructions from the user (apply these above all else):\n${instructions.trim()}` : ''}

Return this JSON shape exactly:
{
  "title": "concise action phrase only — no dates or categories here",
  "categoryId": "work|personal|health|errands",
  "dueDate": "YYYY-MM-DD or null if no date mentioned",
  "tags": ["only-existing-tags"],
  "notes": "any extra detail not captured in the other fields, or empty string"
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);

    const ai = await res.json();
    const raw = (ai.content[0].text as string).trim();

    // Extract JSON even if Claude wraps it in a code block
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in Claude response");

    const parsed = JSON.parse(match[0]);

    // Sanitise
    if (!parsed.title || typeof parsed.title !== "string") parsed.title = transcript;
    if (!VALID_CATEGORIES.includes(parsed.categoryId)) parsed.categoryId = "personal";
    if (!Array.isArray(parsed.tags)) parsed.tags = [];
    parsed.tags = parsed.tags.map((t: unknown) => String(t).toLowerCase().replace(/\s+/g, "-"));
    if (typeof parsed.notes !== "string") parsed.notes = "";
    if (parsed.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate)) parsed.dueDate = null;

    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("parse-task:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
});
