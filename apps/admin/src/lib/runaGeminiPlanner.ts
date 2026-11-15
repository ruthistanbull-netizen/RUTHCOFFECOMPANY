import { randomUUID } from "node:crypto";

export const RUNA_GEMINI_PANEL_MODEL = "gemini-3.8-flash";

type JsonObject = Record<string, unknown>;
type GeminiContent = { role: "user" | "model"; parts: JsonObject[] };
type GeminiCall = { name: string; originalId?: string; content: GeminiContent };

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object).filter((item) => item !== undefined) : [];
}

function toolResult(output: string): JsonObject {
  try {
    return object(JSON.parse(output)) ?? { output };
  } catch {
    return { output };
  }
}

export function createRunaGeminiPlanner(apiKey: string, fetchImpl: typeof fetch) {
  const calls = new Map<string, GeminiCall>();
  const deadline = Date.now() + 60_000;

  return async (body: JsonObject): Promise<Response> => {
    // Each runtime invocation replays its input. Preserve each exact model turn
    // so Gemini receives its thought signatures along with the tool results.
    const contents: GeminiContent[] = [];
    const replayed = new Set<GeminiContent>();
    let responses: JsonObject[] = [];
    function flushResponses() {
      if (responses.length) contents.push({ role: "user", parts: responses });
      responses = [];
    }
    for (const item of objects(body.input)) {
      if (item.type === "function_call_output") {
        const call = calls.get(String(item.call_id));
        if (!call || typeof item.output !== "string") throw new Error("Invalid Gemini function result");
        responses.push({ functionResponse: {
          name: call.name,
          ...(call.originalId ? { id: call.originalId } : {}),
          response: toolResult(item.output),
        } });
        continue;
      }
      flushResponses();
      if (item.type === "function_call") {
        const call = calls.get(String(item.call_id));
        if (!call) throw new Error("Missing Gemini function call");
        if (!replayed.has(call.content)) {
          replayed.add(call.content);
          contents.push(call.content);
        }
      } else if ((item.role === "user" || item.role === "assistant") && typeof item.content === "string") {
        if (item.role === "assistant" && contents.length === 0) continue;
        contents.push({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] });
      }
    }
    flushResponses();

    const functionDeclarations = objects(body.tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.parameters,
    }));
    const timeLeft = deadline - Date.now();
    if (timeLeft <= 0) throw new DOMException("Runa Gemini planner deadline exceeded", "TimeoutError");
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${RUNA_GEMINI_PANEL_MODEL}:generateContent`,
      {
        method: "POST", cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(Math.min(timeLeft, 35_000)),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: body.instructions }] },
          contents,
          tools: [{ functionDeclarations }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          generationConfig: { thinkingConfig: { thinkingLevel: "LOW" } },
        }),
      },
    );
    if (!response.ok) return response;

    const data = object(await response.json());
    const result = objects(data?.candidates)[0];
    const parts = objects(object(result?.content)?.parts);
    if (!parts.length) throw new Error("Gemini returned no planner content");

    const content: GeminiContent = { role: "model", parts };
    const output: JsonObject[] = [];
    const text: string[] = [];
    for (const part of parts) {
      const call = object(part.functionCall);
      if (typeof call?.name === "string" && call.name.length > 0) {
        const id = randomUUID();
        calls.set(id, {
          name: call.name,
          originalId: typeof call.id === "string" ? call.id : undefined,
          content,
        });
        output.push({
          type: "function_call", name: call.name, call_id: id,
          arguments: JSON.stringify(object(call.args) ?? {}),
        });
      } else if (part.thought !== true && typeof part.text === "string") {
        text.push(part.text);
      }
    }
    if (text.length) output.push({
      type: "message", role: "assistant",
      content: [{ type: "output_text", text: text.join("\n") }],
    });
    if (!output.length) throw new Error("Gemini returned no planner result");
    const usage = object(data?.usageMetadata);
    return Response.json({
      id: data?.responseId,
      status: "completed",
      model: RUNA_GEMINI_PANEL_MODEL,
      output,
      output_text: text.join("\n"),
      usage: usage && {
        input_tokens: usage.promptTokenCount,
        output_tokens: usage.candidatesTokenCount,
        total_tokens: usage.totalTokenCount,
      },
    });
  };
}
