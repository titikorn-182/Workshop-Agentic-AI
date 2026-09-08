import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';
import { toGeminiSchema } from '../tool-schema';

interface GeminiContent { role: 'user' | 'model'; parts: Array<Record<string, unknown>>; }

export async function runGeminiConversation(apiKey: string | undefined, model: string, systemPrompt: string,
  history: ChatMessage[], tools: McpTool[], callTool: ToolCaller): Promise<ChatTurnResult> {
  if (!apiKey) return { reply: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY สำหรับ provider นี้', toolTrace: [] };
  const contents: GeminiContent[] = history.map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
  const trace: ToolTraceEntry[] = [];
  const declarations = tools.length ? [{ functionDeclarations: tools.map((tool) => ({ name: `${tool.serverId}__${tool.name}`, description: tool.description, parameters: toGeminiSchema(tool.inputSchema) })) }] : undefined;
  for (let round = 0; round < 4; round++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents, ...(declarations ? { tools: declarations } : {}) }),
    });
    if (!response.ok) return { reply: `Gemini ตอบกลับด้วยข้อผิดพลาด (${response.status})`, toolTrace: trace };
    const data = await response.json() as any;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((part: any) => part.functionCall);
    if (!calls.length) return { reply: parts.map((part: any) => part.text ?? '').join('') || 'ไม่พบข้อความตอบกลับจาก Gemini', toolTrace: trace };
    const results = [];
    for (const part of calls) {
      const name = part.functionCall.name; const args = part.functionCall.args ?? {};
      try { const result = await callTool(name, args); trace.push({ tool: name, arguments: args, result }); results.push({ functionResponse: { name, response: { result } } }); }
      catch (error) { const message = error instanceof Error ? error.message : 'tool error'; trace.push({ tool: name, arguments: args, error: message }); results.push({ functionResponse: { name, response: { error: message } } }); }
    }
    contents.push({ role: 'model', parts });
    contents.push({ role: 'user', parts: results });
  }
  return { reply: 'การเรียกใช้เครื่องมือเกินจำนวนรอบที่กำหนด', toolTrace: trace };
}