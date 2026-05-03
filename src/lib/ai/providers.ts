import { logger } from '@/lib/utils/logger';

export interface StructuredAiRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

export interface StructuredAiResponse<T> {
  provider: 'gemini' | 'openai' | 'heuristic';
  model: string;
  data: T;
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function parseJsonPayload<T>(value: string): T {
  const cleaned = stripCodeFence(value);
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const jsonText =
    firstBrace >= 0 && lastBrace >= firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned;

  return JSON.parse(jsonText) as T;
}

async function callGemini(request: StructuredAiRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: request.systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: request.userPrompt }],
          },
        ],
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('') || '';

  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return text;
}

async function callOpenAI(request: StructuredAiRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: request.temperature ?? 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: request.systemPrompt,
        },
        {
          role: 'user',
          content: request.userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const text = payload.choices?.[0]?.message?.content || '';
  if (!text) {
    throw new Error('OpenAI returned an empty response');
  }

  return text;
}

export async function generateStructuredJson<T>(
  request: StructuredAiRequest,
  fallback: T,
  preferredProviders?: Array<'gemini' | 'openai' | 'heuristic'>
): Promise<StructuredAiResponse<T>> {
  const order = preferredProviders && preferredProviders.length > 0
    ? preferredProviders
    : ['gemini', 'openai'];

  const providers: Array<[
    StructuredAiResponse<T>['provider'],
    string,
    () => Promise<string>
  ]> = [];

  for (const p of order) {
    if (p === 'gemini' && process.env.GEMINI_API_KEY) {
      providers.push([
        'gemini',
        process.env.GEMINI_MODEL || 'gemini-2.5-pro',
        () => callGemini(request),
      ]);
    }

    if (p === 'openai' && process.env.OPENAI_API_KEY) {
      providers.push([
        'openai',
        process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        () => callOpenAI(request),
      ]);
    }
  }

  for (const [provider, model, execute] of providers) {
    try {
      const payload = await execute();
      return {
        provider,
        model,
        data: parseJsonPayload<T>(payload),
      };
    } catch (error) {
      logger.warn(`Structured AI request failed for ${provider}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback deterministic heuristic
  return {
    provider: 'heuristic',
    model: 'deterministic-fallback',
    data: fallback,
  };
}