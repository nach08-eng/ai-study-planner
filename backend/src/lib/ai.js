const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

function stripCodeFences(text) {
  return String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractResponseText(payload) {
  if (!payload) {
    return "";
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const segments = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        segments.push(content.text);
      }
    }
  }

  return segments.join("").trim();
}

async function callOpenAIJson({
  instructions,
  input,
  schemaName,
  schema,
  fallback
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallback();
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        instructions,
        input,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            schema,
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${errorText}`);
    }

    const payload = await response.json();
    const text = extractResponseText(payload);
    const parsed = JSON.parse(stripCodeFences(text));
    return parsed;
  } catch (error) {
    console.warn("OpenAI structured call failed, using fallback:", error.message);
    return fallback();
  }
}

module.exports = {
  callOpenAIJson
};
