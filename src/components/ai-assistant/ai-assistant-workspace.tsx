"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Send,
  Paperclip,
  Trash2,
  Bot,
  User,
  Loader2,
  X,
  MessageSquare,
  Sparkles,
  FileText,
  BarChart3,
  Search,
  Database,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Conversation = {
  id: string;
  title: string;
  model: string;
  updatedAt: string;
  createdAt: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  fileUrl?: string | null;
  fileName?: string | null;
  model?: string | null;
  createdAt: string;
};

const QUICK_SUGGESTIONS = [
  { icon: Search, text: "分析亚马逊某品类的竞争格局", prompt: "请帮我分析亚马逊美国站某个品类的竞争格局，包括头部卖家、价格区间、评价数量分布等维度。" },
  { icon: Sparkles, text: "优化产品 Listing 文案", prompt: "请帮我优化一个亚马逊产品的 Listing 文案，包括标题、五点描述和产品描述。" },
  { icon: BarChart3, text: "计算产品利润率", prompt: "请帮我计算一个亚马逊FBA产品的利润率，我会提供采购成本、售价和头程费用。" },
  { icon: FileText, text: "撰写供应商开发信", prompt: "请帮我撰写一封给中国供应商的开发信，用于询价和建立合作关系。" },
];

export default function AiAssistantWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [toolCalls, setToolCalls] = useState<
    { tool: string; label: string; status: string }[]
  >([]);
  const [uploadedFile, setUploadedFile] = useState<{
    url: string;
    fileName: string;
    fileSize?: number;
    fileContent?: string | null;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  // Load conversations
  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    setLoadingConvos(true);
    try {
      const res = await fetch("/api/ai-assistant/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // ignore
    } finally {
      setLoadingConvos(false);
    }
  }

  async function loadConversation(id: string) {
    setActiveId(id);
    setMessages([]);
    try {
      const res = await fetch(`/api/ai-assistant/conversations/${id}`);
      const data = await res.json();
      if (data.conversation) {
        setMessages(data.conversation.messages || []);
      }
    } catch {
      // ignore
    }
  }

  async function createConversation(initialModel?: string) {
    try {
      const res = await fetch("/api/ai-assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: initialModel || "sonnet" }),
      });
      const data = await res.json();
      if (data.conversation) {
        setConversations((prev) => [data.conversation, ...prev]);
        setActiveId(data.conversation.id);
        setMessages([]);
        return data.conversation.id as string;
      }
    } catch {
      // ignore
    }
    return null;
  }

  async function deleteConversation(id: string) {
    try {
      await fetch(`/api/ai-assistant/conversations/${id}`, {
        method: "DELETE",
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("文件大小不能超过 10MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai-assistant/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadedFile({
          url: data.url,
          fileName: data.fileName,
          fileSize: data.fileSize,
          fileContent: data.fileContent,
        });
      } else {
        alert(data.message || "上传失败");
      }
    } catch {
      alert("上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendMessage(overrideMessage?: string) {
    const msg = overrideMessage || input.trim();
    if (!msg || sending) return;

    let convId = activeId;
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: msg,
      fileUrl: uploadedFile?.url,
      fileName: uploadedFile?.fileName,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setUploadedFile(null);
    setSending(true);
    setStreamingText("");
    setToolCalls([]);

    try {
      const res = await fetch("/api/ai-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          message: msg,
          fileUrl: uploadedFile?.url,
          fileName: uploadedFile?.fileName,
          fileContent: uploadedFile?.fileContent,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `请求失败 (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取响应");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === "delta") {
              accumulated += evt.text;
              setStreamingText(accumulated);
            } else if (evt.type === "tool_call") {
              setToolCalls((prev) => {
                const existing = prev.findIndex(
                  (t) => t.tool === evt.tool,
                );
                if (existing >= 0) {
                  const next = [...prev];
                  next[existing] = {
                    tool: evt.tool,
                    label: evt.label || evt.tool,
                    status: evt.status || "calling",
                  };
                  return next;
                }
                return [
                  ...prev,
                  {
                    tool: evt.tool,
                    label: evt.label || evt.tool,
                    status: evt.status || "calling",
                  },
                ];
              });
            } else if (evt.type === "done") {
              setToolCalls([]);
              setMessages((prev) => [
                ...prev,
                {
                  id: evt.messageId || `ai-${Date.now()}`,
                  role: "assistant",
                  content: accumulated,
                  createdAt: new Date().toISOString(),
                },
              ]);
              setStreamingText("");
              fetchConversations();
            } else if (evt.type === "error") {
              throw new Error(evt.message);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "发送失败";
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `**错误**: ${errMsg}`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreamingText("");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const activeConvo = conversations.find((c) => c.id === activeId);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50">
      {/* ── Left Sidebar ── */}
      <div className="w-64 flex-shrink-0 border-r bg-white flex flex-col">
        <div className="p-3 border-b">
          <Button
            className="w-full justify-start gap-2"
            variant="outline"
            onClick={() => createConversation()}
          >
            <Plus className="h-4 w-4" />
            新对话
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loadingConvos ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                暂无对话
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                    c.id === activeId
                      ? "bg-blue-50 text-blue-700"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                  onClick={() => loadConversation(c.id)}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0 opacity-50" />
                  <span className="flex-1 truncate">{c.title}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-12 border-b bg-white flex items-center px-4 gap-3">
          <Bot className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-sm">
            {activeConvo?.title || "AI 助手"}
          </span>
          <div className="ml-auto text-xs text-gray-400">
            全局模型由管理员设置
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !streamingText && !activeId ? (
            /* Welcome Page */
            <div className="flex flex-col items-center justify-center h-full px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                AI 助手
              </h2>
              <p className="text-gray-500 text-sm mb-8 text-center max-w-md">
                你的跨境电商智能助手，可以帮你分析市场、优化 Listing、计算利润、撰写邮件等
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                {QUICK_SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-xl border bg-white hover:bg-blue-50 hover:border-blue-200 transition-colors text-left"
                    onClick={() => sendMessage(s.prompt)}
                  >
                    <s.icon className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : messages.length === 0 && !streamingText && activeId ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              发送消息开始对话
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-4 px-4 space-y-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {toolCalls.length > 0 && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Database className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {toolCalls.map((tc) => (
                      <div
                        key={tc.tool}
                        className="inline-flex items-center gap-2 rounded-lg bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs text-violet-800"
                      >
                        {tc.status !== "done" ? (
                          <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
                        ) : (
                          <span className="h-3 w-3 text-center text-violet-500">✓</span>
                        )}
                        正在查询卖家精灵：{tc.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {streamingText && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border">
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingText}
                      </ReactMarkdown>
                    </div>
                    <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t bg-white p-4">
          <div className="max-w-3xl mx-auto">
            {uploadedFile && (
              <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
                <FileText className="h-4 w-4 text-blue-500" />
                <span className="flex-1 truncate text-blue-700">
                  {uploadedFile.fileName}
                  {uploadedFile.fileSize ? (
                    <span className="ml-1.5 text-blue-400 text-xs">
                      ({(uploadedFile.fileSize / 1024).toFixed(0)} KB)
                    </span>
                  ) : null}
                </span>
                {uploadedFile.fileContent && (
                  <span className="text-xs text-green-600 whitespace-nowrap">已解析</span>
                )}
                <button
                  onClick={() => setUploadedFile(null)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
                onChange={handleFileUpload}
              />
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 h-10 w-10"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Paperclip className="h-5 w-5 text-gray-400" />
                )}
              </Button>
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-resize
                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.min(e.target.scrollHeight, 200) + "px";
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息... (Shift+Enter 换行)"
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={1}
                  disabled={sending}
                />
              </div>
              <Button
                size="icon"
                className="flex-shrink-0 h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-700"
                onClick={() => sendMessage()}
                disabled={sending || !input.trim()}
              >
                {sending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser
            ? "bg-gray-200"
            : "bg-gradient-to-br from-blue-500 to-indigo-600"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-gray-600" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>
      <div
        className={`flex-1 max-w-[80%] ${
          isUser ? "flex flex-col items-end" : ""
        }`}
      >
        {message.fileName && (
          <div className="mb-1 flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded text-xs text-gray-500">
            <FileText className="h-3 w-3" />
            {message.fileName}
          </div>
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            isUser
              ? "bg-blue-600 text-white rounded-tr-sm"
              : "bg-white border shadow-sm rounded-tl-sm"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {!isUser && message.model && (
          <div className="mt-1 text-xs text-gray-400 ml-1">
            {message.model}
          </div>
        )}
      </div>
    </div>
  );
}
