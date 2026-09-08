import type { Env } from '../env';
import { errorJson, json } from '../lib/http';
import { runGeminiConversation } from './providers/gemini';
import { runOpenAiCompatConversation } from './providers/openai-compat';
import type { ChatMessage, ChatProvider, ChatTurnResult, McpTool, ToolCaller } from './types';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export function buildSystemPrompt(): string {
  return 'คุณคือผู้ช่วย AI ภาษาไทยที่สุภาพ กระชับ และช่วยผู้ใช้แก้ปัญหาอย่างเป็นประโยชน์';
}
export function resolveProvider(value: unknown, env: Env): ChatProvider {
  return value === 'openai' || value === 'openai-compat' || value === 'gemini' ? value : (env.DEFAULT_CHAT_PROVIDER === 'openai' || env.DEFAULT_CHAT_PROVIDER === 'openai-compat' ? env.DEFAULT_CHAT_PROVIDER : 'gemini');
}
export function defaultModelFor(provider: ChatProvider, env: Env): string {
  return provider === 'gemini' ? env.GEMINI_MODEL || 'gemini-flash-latest' : provider === 'openai' ? env.OPENAI_MODEL || 'gpt-4o-mini' : env.OPENAI_COMPAT_MODEL || 'gpt-4o-mini';
}
function resolveApiKey(provider: ChatProvider, env: Env): string | undefined { return provider === 'gemini' ? env.GEMINI_API_KEY : provider === 'openai' ? env.OPENAI_API_KEY : env.OPENAI_COMPAT_API_KEY; }
function resolveBaseUrl(provider: ChatProvider, env: Env): string | undefined { return provider === 'gemini' ? undefined : provider === 'openai' ? OPENAI_BASE_URL : env.OPENAI_COMPAT_BASE_URL; }
function resolveTools(): McpTool[] { return []; }

export async function runChatTurn(input: { message: string; history?: ChatMessage[]; provider?: unknown; model?: string }, env: Env): Promise<ChatTurnResult & { provider: ChatProvider; model: string }> {
  const provider = resolveProvider(input.provider, env); const model = input.model?.trim() || defaultModelFor(provider, env);
  const history = [...(input.history || []).filter((item) => (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string'), { role: 'user' as const, content: input.message }];
  const tools = resolveTools(); const callTool: ToolCaller = async () => { throw new Error('ยังไม่มี MCP tools ใน Module 1.1'); };
  const result = provider === 'gemini' ? await runGeminiConversation(resolveApiKey(provider, env), model, buildSystemPrompt(), history, tools, callTool) : await runOpenAiCompatConversation(resolveBaseUrl(provider, env), resolveApiKey(provider, env), model, buildSystemPrompt(), history, tools, callTool);
  return { ...result, provider, model };
}

export async function handleChatRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('รองรับเฉพาะ POST เท่านั้น', 405);
  try {
    const body = await request.json() as any;
    if (typeof body.message !== 'string' || !body.message.trim()) return errorJson('กรุณาระบุ message', 400);
    return json(await runChatTurn({ message: body.message.trim(), history: body.history, provider: body.provider, model: body.model }, env));
  } catch { return errorJson('รูปแบบ request ไม่ถูกต้อง', 400); }
}