"use client";

import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Bot, User } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useThreads, type ChatMessage } from "@/components/shared/ThreadsProvider";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

export default function ChatPage() {
  const { messages, addMessage } = useThreads();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (!hasMessages) inputRef.current?.focus();
  }, [hasMessages]);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    addMessage("user", text);
    setLoading(true);
    setStreamingContent("");

    let accumulated = "";
    await api.ask(
      text,
      history,
      (chunk) => {
        accumulated += chunk;
        setStreamingContent(accumulated);
      },
      () => {
        addMessage("assistant", accumulated || "…");
        setStreamingContent("");
        setLoading(false);
      },
      (err) => {
        addMessage("assistant", `Error: ${err}`);
        setStreamingContent("");
        setLoading(false);
      },
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
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-text-1 tracking-tight">
                    What would you like to build?
                  </h1>
                  <p className="text-text-3 text-sm mt-2 max-w-xs">
                    Ask Lanara to build agents, analyze sales performance, or optimize your commission plans.
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
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {loading && !streamingContent && <TypingIndicator />}
                {streamingContent && <StreamingBubble content={streamingContent} />}
                <div ref={bottomRef} />
              </div>

              <div className="px-6 py-4 border-t border-border">
                <ChatInput
                  ref={inputRef}
                  value={input}
                  onChange={setInput}
                  onKeyDown={handleKeyDown}
                  onSubmit={submit}
                  loading={loading}
                  className="w-full max-w-3xl mx-auto"
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
  }
>(function ChatInput({ value, onChange, onKeyDown, onSubmit, loading, className }, ref) {
  return (
    <div
      className={cn(
        "glass rounded-2xl flex items-end gap-3 px-4 py-3 focus-within:ring-1 focus-within:ring-violet/40 transition-all",
        className,
      )}
    >
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
        placeholder="Ask Lanara anything… (Enter to send, Shift+Enter for newline)"
        disabled={loading}
        rows={1}
        className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-3 outline-none resize-none overflow-y-auto leading-relaxed"
        style={{ minHeight: "24px", maxHeight: "160px" }}
      />
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
  );
});

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex gap-3 max-w-3xl", isUser ? "ml-auto flex-row-reverse" : "")}
    >
      <div
        className={cn(
          "w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5",
          isUser
            ? "bg-violet/20"
            : "bg-gradient-to-br from-violet to-cyan",
        )}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-violet" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-white" />
        )}
      </div>
      <div
        className={cn(
          "px-4 py-3 rounded-2xl text-sm text-text-1 whitespace-pre-wrap leading-relaxed glass",
          isUser ? "rounded-tr-sm" : "rounded-tl-sm",
        )}
      >
        {message.content}
      </div>
    </motion.div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 max-w-3xl"
    >
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet to-cyan shrink-0 flex items-center justify-center mt-0.5">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm glass text-sm text-text-1 whitespace-pre-wrap leading-relaxed">
        {content}
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
      className="flex gap-3 max-w-3xl"
    >
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet to-cyan shrink-0 flex items-center justify-center mt-0.5">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
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
