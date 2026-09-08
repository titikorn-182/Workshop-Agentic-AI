export type ChatProvider = 'gemini' | 'openai' | 'openai-compat';
export type ChatRole = 'user' | 'assistant';

export interface ChatMessage { role: ChatRole; content: string; }
export interface McpTool { serverId: string; name: string; description?: string; inputSchema: Record<string, unknown>; }
export interface ToolTraceEntry { tool: string; arguments?: unknown; result?: unknown; error?: string; }
export interface ChatTurnResult { reply: string; toolTrace: ToolTraceEntry[]; }
export type ToolCaller = (name: string, args: unknown) => Promise<unknown>;

export function toolFunctionName(tool: Pick<McpTool, 'serverId' | 'name'>): string {
  return `${tool.serverId}__${tool.name}`;
}