"use client";

import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  type KeyboardEvent,
} from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Bot, Check } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useThreads, type ChatMessage } from "@/components/shared/ThreadsProvider";
import { useBranding } from "@/components/shared/BrandingProvider";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import { api, type AiModel } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { getOrgItem, setOrgItem, removeOrgItem } from "@/lib/org-storage";
import { cn } from "@/lib/cn";

export default function AssistantPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const { messages, addMessage } = useThreads();
  const { appName } = useBranding();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingThought, setStreamingThought] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const rawRef = useRef(""); // accumulates the full raw stream including <think> tags
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasMessages = messages.length > 0;

  const { data: allModels = [] } = useSWR("ai-models", () => api.aiModels.list());
  const enabledModels = allModels.filter((m) => m.enabled);

  const [selectedModelId, setSelectedModelId] = useState<string>("");

  // Load last-used model from org-scoped storage when org is known
  useEffect(() => {
    if (!orgId) return;
    setSelectedModelId(getOrgItem(orgId, "default-model-id") ?? "");
  }, [orgId]);

  const handleModelChange = (id: string) => {
    setSelectedModelId(id);
    if (id) setOrgItem(orgId, "default-model-id", id);
    else removeOrgItem(orgId, "default-model-id");
  };

  const activeModelId = selectedModelId && enabledModels.some((m) => m.id === selectedModelId)
    ? selectedModelId
    : (enabledModels[0]?.id ?? undefined);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingThought, streamingContent]);

  // Focus on mount and after each response completes.
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (!loading) inputRef.current?.focus(); }, [loading]);

  // Refs for the thinking→answer transition timer
  const thinkingSeenRef      = useRef(false);  // have we detected </think> yet?
  const thinkingTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnswerRef     = useRef("");      // answer accumulates while timer is pending
  const pendingFinalAnswerRef = useRef("");     // final answer held until thinking hold completes
  const streamDoneRef        = useRef(false);  // true once [DONE] received while timer pending

  // How long the thinking bubble stays visible after reasoning ends.
  // Long enough for the user to read, before the answer slides in.
  const THOUGHT_HOLD_MS = 1500;

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    addMessage("user", text);
    setLoading(true);
    setStreamingThought("");
    setStreamingContent("");
    rawRef.current             = "";
    thinkingSeenRef.current    = false;
    pendingAnswerRef.current   = "";
    pendingFinalAnswerRef.current = "";
    streamDoneRef.current      = false;
    if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }

    const cleanAnswer = (text: string) =>
      text
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .replace(/Running `[^`]+`…\s*/g, "")
        .trim();

    const parseRaw = (raw: string) => {
      const thinkEnd = raw.indexOf("</think>");
      if (thinkEnd !== -1) {
        const thinkStart = raw.indexOf("<think>");
        const thought = thinkStart !== -1 ? raw.slice(thinkStart + 7, thinkEnd) : "";
        const answer  = cleanAnswer(raw.slice(thinkEnd + 8).trimStart());

        pendingAnswerRef.current = answer;

        if (!thinkingSeenRef.current) {
          thinkingSeenRef.current = true;

          if (thought) {
            setStreamingThought(thought);
            thinkingTimerRef.current = setTimeout(() => {
              thinkingTimerRef.current = null;
              setStreamingThought("");
              if (streamDoneRef.current) {
                // Stream finished while we were in the hold — reveal the answer now.
                const msg = pendingFinalAnswerRef.current;
                pendingFinalAnswerRef.current = "";
                streamDoneRef.current = false;
                addMessage("assistant", msg || "…");
                setStreamingContent("");
                setLoading(false);
              } else {
                setStreamingContent(pendingAnswerRef.current);
              }
            }, THOUGHT_HOLD_MS);
          } else {
            setStreamingThought("");
            setStreamingContent(answer);
          }
        } else if (!thinkingTimerRef.current) {
          // Timer already fired — update streaming answer directly
          setStreamingContent(answer);
        }
        // If timer is still pending, pendingAnswerRef already updated above
      } else {
        const thinkStart = raw.lastIndexOf("<think>");
        if (thinkStart !== -1) {
          // Still inside a thinking block — stream thought progressively
          setStreamingThought(raw.slice(thinkStart + 7));
          setStreamingContent("");
        } else {
          // No thinking tags — regular response
          setStreamingThought("");
          setStreamingContent(cleanAnswer(raw) || raw);
        }
      }
    };

    const finalAnswer = (raw: string) => cleanAnswer(raw);

    const cleanup = () => {
      if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
      pendingFinalAnswerRef.current = "";
      streamDoneRef.current = false;
      setStreamingThought("");
      setStreamingContent("");
      setLoading(false);
    };

    await api.ask(
      text,
      history,
      (chunk) => {
        rawRef.current += chunk;
        parseRaw(rawRef.current);
      },
      () => {
        if (thinkingTimerRef.current) {
          // Thinking hold in progress — stash the answer and let the timer reveal it
          // so the answer doesn't appear simultaneously with the thinking bubble.
          pendingFinalAnswerRef.current = finalAnswer(rawRef.current) || "…";
          streamDoneRef.current = true;
        } else {
          addMessage("assistant", finalAnswer(rawRef.current) || "…");
          cleanup();
        }
      },
      (err) => {
        addMessage("assistant", `Error: ${err}`);
        cleanup();
      },
      activeModelId,
      appName,
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-6 h-14 border-b border-border shrink-0">
          <Sparkles className="w-4 h-4 text-violet" />
          <span className="text-sm font-semibold text-text-1">Assistant</span>
        </div>

        <AnimatePresence mode="wait">
          {!hasMessages ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center flex-1 gap-10 px-6"
            >
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet to-cyan flex items-center justify-center shadow-lg">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-text-1 tracking-tight">
                    What would you like to build?
                  </h1>
                  <p className="text-text-3 text-sm mt-2 max-w-xs">
                    Ask {appName} to build agents, analyze sales performance, or optimize your commission plans.
                  </p>
                </div>
              </div>

              <ChatInput
                ref={inputRef}
                value={input}
                onChange={setInput}
                onKeyDown={handleKeyDown}
                onSubmit={submit}
                loading={loading}
                className="w-full max-w-2xl"
                enabledModels={enabledModels}
                activeModelId={activeModelId}
                onModelChange={handleModelChange}
              />

              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="text-xs px-3 py-1.5 glass rounded-full text-text-3 hover:text-text-2 hover:border-violet/30 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="max-w-2xl mx-auto space-y-5">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                  <AnimatePresence>
                    {streamingThought && !streamingContent && (
                      <ThinkingBubble key="thinking" content={streamingThought} />
                    )}
                  </AnimatePresence>
                  {loading && !streamingContent && !streamingThought && <TypingIndicator />}
                  {streamingContent && <StreamingBubble content={streamingContent} />}
                  <div ref={bottomRef} />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border">
                <ChatInput
                  ref={inputRef}
                  value={input}
                  onChange={setInput}
                  onKeyDown={handleKeyDown}
                  onSubmit={submit}
                  loading={loading}
                  className="w-full max-w-2xl mx-auto"
                  enabledModels={enabledModels}
                  activeModelId={activeModelId}
                  onModelChange={handleModelChange}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "Build a quota forecaster for EMEA",
  "Detect clawback exposure for Q1",
  "Optimize SPIF for enterprise reps",
  "Analyze attainment vs. plan",
];

const ChatInput = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
    onSubmit: () => void;
    loading: boolean;
    className?: string;
    enabledModels: AiModel[];
    activeModelId: string | undefined;
    onModelChange: (id: string) => void;
  }
>(function ChatInput({ value, onChange, onKeyDown, onSubmit, loading, className, enabledModels, activeModelId, onModelChange }, ref) {
  const { appName } = useBranding();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  const activeModel = enabledModels.find((m) => m.id === activeModelId);

  return (
    <div className={className}>
      <div className="glass rounded-2xl flex items-end gap-3 px-4 py-3 focus-within:ring-1 focus-within:ring-violet/40 transition-all">
        <Sparkles className="w-4 h-4 text-violet shrink-0 mb-0.5" />
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
          }}
          onKeyDown={onKeyDown}
          placeholder={`Ask ${appName} anything… (Enter to send, Shift+Enter for newline)`}
          disabled={loading}
          rows={1}
          className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-3 outline-none resize-none overflow-y-auto leading-relaxed"
          style={{ minHeight: "24px", maxHeight: "160px" }}
        />
        <div ref={pickerRef} className="relative shrink-0 mb-0.5">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            title={activeModel ? `Model: ${activeModel.name}` : "Select model"}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
              pickerOpen
                ? "bg-violet/15 text-violet"
                : "text-text-3 hover:text-text-2 hover:bg-surface-2",
            )}
          >
            <Bot className="w-3.5 h-3.5" />
            {activeModel
              ? <span className="max-w-[80px] truncate hidden sm:block">{activeModel.name}</span>
              : <span className="hidden sm:block">Model</span>
            }
          </button>

          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full right-0 mb-2 w-72 bg-surface-1 rounded-xl border border-border-strong shadow-2xl overflow-hidden z-50"
              >
                <p className="px-3 py-2 text-[10px] font-medium text-text-3 uppercase tracking-widest border-b border-border">
                  Model
                </p>
                {enabledModels.length === 0 ? (
                  <div className="px-3 py-4 text-center space-y-1">
                    <p className="text-xs text-text-2">No models enabled</p>
                    <p className="text-[10px] text-text-3">
                      Enable a model in{" "}
                      <a href="/admin?tab=ai" className="text-violet hover:underline">
                        Admin → AI → Models
                      </a>
                    </p>
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto">
                    {enabledModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { onModelChange(m.id); setPickerOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                          m.id === activeModelId
                            ? "bg-violet/10 text-text-1"
                            : "text-text-2 hover:bg-surface-2",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium truncate">{m.name}</p>
                            <span className={cn(
                              "shrink-0 text-[9px] px-1 py-0.5 rounded font-medium leading-none",
                              m.type === "local"
                                ? "bg-cyan/10 text-cyan"
                                : "bg-violet/10 text-violet",
                            )}>
                              {m.type === "local" ? "Local" : "External"}
                            </span>
                          </div>
                          <p className="text-[10px] text-text-3 truncate">{m.provider} · {m.model_id}</p>
                        </div>
                        {m.id === activeModelId && <Check className="w-3.5 h-3.5 text-violet shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={onSubmit}
          disabled={!value.trim() || loading}
          className="shrink-0 w-8 h-8 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
        >
          {loading ? (
            <span className="w-3.5 h-3.5 border border-violet/50 border-t-violet rounded-full animate-spin block" />
          ) : (
            <ArrowRight className="w-4 h-4 text-violet" />
          )}
        </button>
      </div>
    </div>
  );
});

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex", isUser ? "justify-end" : "")}
    >
      <div
        className={cn(
          "px-4 py-3 rounded-2xl max-w-[82%]",
          isUser
            ? "bg-violet/10 border border-violet/15 rounded-tr-sm text-sm text-text-1 whitespace-pre-wrap leading-relaxed"
            : "glass rounded-tl-sm",
        )}
      >
        {isUser ? message.content : <MarkdownContent content={message.content} />}
      </div>
    </motion.div>
  );
}

function ThinkingBubble({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      className="flex"
    >
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm glass max-w-[82%] opacity-60">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] font-medium text-text-3 uppercase tracking-widest">Thinking</span>
          <span className="flex gap-0.5">
            {[0, 150, 300].map((d) => (
              <span key={d} className="w-1 h-1 rounded-full bg-violet/50 animate-bounce block" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        </div>
        <p className="text-xs text-text-3 leading-relaxed whitespace-pre-wrap">{content}</p>
      </div>
    </motion.div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex"
    >
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm glass max-w-[82%]">
        <MarkdownContent content={content} />
        <span className="inline-block w-0.5 h-3.5 bg-violet/70 ml-0.5 animate-pulse align-middle" />
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex"
    >
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm glass flex items-center gap-1.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-violet/60 animate-bounce block"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </motion.div>
  );
}
