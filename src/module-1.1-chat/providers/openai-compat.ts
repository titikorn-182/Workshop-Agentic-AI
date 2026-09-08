import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';

export async function runOpenAiCompatConversation(baseUrl: string | undefined, apiKey: string | undefined, model: string,
  systemPrompt: string, history: ChatMessage[], tools: McpTool[], callTool: ToolCaller): Promise<ChatTurnResult> {
  if (!baseUrl) return { reply: 'ยังไม่ได้ตั้งค่า base URL ของ OpenAI-compatible gateway', toolTrace: [] };
  if (!apiKey) return { reply: 'ยังไม่ได้ตั้งค่า API key สำหรับ provider นี้', toolTrace: [] };
  const messages: any[] = [{ role: 'system', content: systemPrompt }, ...history]; const trace: ToolTraceEntry[] = [];
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  for (let round = 0; round < 4; round++) {
    const body: any = { model, messages }; if (tools.length) { body.tools = tools.map((tool) => ({ type: 'function', function: { name: `${tool.serverId}__${tool.name}`, description: tool.description, parameters: tool.inputSchema } })); body.tool_choice = 'auto'; }
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
    if (!response.ok) return { reply: `OpenAI-compatible gateway ตอบกลับด้วยข้อผิดพลาด (${response.status})`, toolTrace: trace };
    const data = await response.json() as any; const message = data.choices?.[0]?.message;
    if (!message) return { reply: 'ไม่พบข้อความตอบกลับจาก gateway', toolTrace: trace };
    messages.push(message); if (!message.tool_calls?.length) return { reply: message.content || 'โมเดลไม่ได้ส่งข้อความตอบกลับ', toolTrace: trace };
    for (const call of message.tool_calls) { const args = JSON.parse(call.function.arguments || '{}'); try { const result = await callTool(call.function.name, args); trace.push({ tool: call.function.name, arguments: args, result }); messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) }); } catch (error) { const text = error instanceof Error ? error.message : 'tool error'; trace.push({ tool: call.function.name, arguments: args, error: text }); messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: text }) }); } }
  }
  return { reply: 'การเรียกใช้เครื่องมือเกินจำนวนรอบที่กำหนด', toolTrace: trace };
}