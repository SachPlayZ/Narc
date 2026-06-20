import { z } from "zod";
import { loadRepoEnvFile, TradeIntentSchema, type Mandate, type TradeIntent } from "@narc/shared";
import { retryTransient } from "../network.js";

const DEFAULT_GROQ_MODEL = "qwen/qwen3-32b";
const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

const JsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const GroqAgentEnvSchema = z.object({
  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL: z.string().min(1).default(DEFAULT_GROQ_MODEL),
  GROQ_BASE_URL: z.string().url().default(DEFAULT_GROQ_BASE_URL)
});
export type GroqAgentEnv = z.infer<typeof GroqAgentEnvSchema>;

export const LlmDecisionSchema = z.object({
  intent: TradeIntentSchema,
  reasoning: z.string().min(1),
  signalInputs: z.record(z.string(), JsonScalarSchema).optional()
});
export type LlmDecision = z.infer<typeof LlmDecisionSchema>;

export type DecisionPromptInput = {
  mandate: Mandate;
  pair: string;
  midPrice: number;
  priceFeedTs: number;
  deepbookPoolId: string;
  signalInputs: Record<string, string | number | boolean | null>;
};

export type ChatRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type ChatRequester = (request: ChatRequest) => Promise<string>;

export function loadGroqAgentEnv(source: NodeJS.ProcessEnv = process.env): GroqAgentEnv {
  const fileEnv = source === process.env ? loadRepoEnvFile() : {};
  return GroqAgentEnvSchema.parse({
    GROQ_API_KEY: source.GROQ_API_KEY || fileEnv.GROQ_API_KEY,
    GROQ_MODEL: source.GROQ_MODEL || fileEnv.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    GROQ_BASE_URL: source.GROQ_BASE_URL || fileEnv.GROQ_BASE_URL || DEFAULT_GROQ_BASE_URL
  });
}

export async function generateLlmTradeDecision(
  input: DecisionPromptInput,
  env?: GroqAgentEnv,
  requester: ChatRequester = defaultChatRequester
): Promise<LlmDecision> {
  const resolvedEnv = env ?? getDefaultGroqEnv(requester);
  const responseText = await requestDecisionCompletion(resolvedEnv, input, requester);

  const response = parseChatCompletion(responseText);
  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Groq returned an empty decision payload.");
  }

  return LlmDecisionSchema.parse(JSON.parse(extractJsonObject(content)));
}

function getDefaultGroqEnv(requester: ChatRequester): GroqAgentEnv {
  if (requester === defaultChatRequester) {
    return loadGroqAgentEnv();
  }

  return {
    GROQ_API_KEY: "test-key",
    GROQ_MODEL: DEFAULT_GROQ_MODEL,
    GROQ_BASE_URL: DEFAULT_GROQ_BASE_URL
  };
}

async function requestDecisionCompletion(
  env: GroqAgentEnv,
  input: DecisionPromptInput,
  requester: ChatRequester
): Promise<string> {
  try {
    return await requester(buildChatRequest(env, input, true));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/json_validate_failed/i.test(message)) {
      throw error;
    }
    return requester(buildChatRequest(env, input, false));
  }
}

function buildChatRequest(env: GroqAgentEnv, input: DecisionPromptInput, jsonMode: boolean): ChatRequest {
  return {
    url: env.GROQ_BASE_URL,
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL,
      temperature: 0.1,
      max_completion_tokens: 500,
      reasoning_effort: "none",
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify(buildUserPayload(input))
        }
      ]
    })
  };
}

function buildSystemPrompt(): string {
  return [
    "You are the trading policy engine for a Sui testnet DeepBook trading agent.",
    "Return only JSON.",
    "Choose a small order that stays under the mandate.",
    "Use the provided pair exactly.",
    "If allowedSide is set, use it exactly.",
    "Keep sizeQuote conservative and above minOrderSizeQuote.",
    "Set limitPrice close to midPrice and aligned to tickSize.",
    'Output shape: {"intent":{"side":"bid|ask","pair":"PAIR","sizeQuote":1.23,"limitPrice":1.23456},"reasoning":"short explanation","signalInputs":{"k":"v"}}'
  ].join(" ");
}

function buildUserPayload(input: DecisionPromptInput) {
  return {
    mandate: {
      maxNotionalQuote: input.mandate.maxNotionalQuote,
      maxCumulativeNotionalQuote: input.mandate.maxCumulativeNotionalQuote,
      allowedPairs: input.mandate.allowedPairs,
      allowedSide: input.mandate.allowedSide ?? null,
      minOrderSizeQuote: input.mandate.minOrderSizeQuote,
      lotSizeQuote: input.mandate.lotSizeQuote,
      tickSize: input.mandate.tickSize,
      maxSlippageBps: input.mandate.maxSlippageBps,
      expiresAt: input.mandate.expiresAt
    },
    market: {
      pair: input.pair,
      midPrice: input.midPrice,
      priceFeedTs: input.priceFeedTs,
      deepbookPoolId: input.deepbookPoolId,
      signalInputs: input.signalInputs
    },
    task: "Return one conservative trade intent for the next tick."
  };
}

function parseChatCompletion(raw: string): z.infer<typeof ChatCompletionResponseSchema> {
  return ChatCompletionResponseSchema.parse(JSON.parse(raw));
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error(`Groq did not return a JSON object: ${trimmed}`);
}

async function defaultChatRequester(request: ChatRequest): Promise<string> {
  return retryTransient(async () => {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Groq chat completion failed (${response.status}): ${text}`);
    }

    return text;
  }, { label: "groqChatCompletion", maxAttempts: 3, baseDelayMs: 1000 });
}

const ChatCompletionResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable().optional()
      })
    })
  ).min(1)
});

export function deterministicBreachDecision(mandate: Mandate): LlmDecision {
  return {
    intent: {
      side: mandate.allowedSide ?? "bid",
      pair: mandate.allowedPairs[0] ?? "SUI_USDC",
      sizeQuote: mandate.maxNotionalQuote * 2,
      limitPrice: 1.25
    },
    reasoning: "Intentional demo breach: exceed maxNotionalQuote so the self-check records a risky decision.",
    signalInputs: {
      mode: "demo_breach",
      targetRule: "max_notional"
    }
  };
}

export function isTradeIntent(value: unknown): value is TradeIntent {
  return TradeIntentSchema.safeParse(value).success;
}
