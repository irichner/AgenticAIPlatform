"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Thread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

interface ThreadsCtx {
  messages: ChatMessage[];
  threads: Thread[];
  activeThreadId: string | null;
  addMessage: (role: "user" | "assistant", content: string) => void;
  startNewChat: () => void;
  loadThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
}

const ThreadsContext = createContext<ThreadsCtx>({
  messages: [],
  threads: [],
  activeThreadId: null,
  addMessage: () => {},
  startNewChat: () => {},
  loadThread: () => {},
  deleteThread: () => {},
});

function loadFromStorage(): Thread[] {
  try {
    const raw = localStorage.getItem("lanara_threads");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToStorage(threads: Thread[]) {
  try { localStorage.setItem("lanara_threads", JSON.stringify(threads)); } catch {}
}

export function ThreadsProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const threadsRef  = useRef<Thread[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    const loaded = loadFromStorage();
    // Deduplicate by id to heal any data corrupted by previous bugs
    const deduped = loaded.filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i);
    if (deduped.length !== loaded.length) saveToStorage(deduped);
    setThreads(deduped);
    threadsRef.current = deduped;
  }, []);

  useEffect(() => { threadsRef.current  = threads;  }, [threads]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content, timestamp: Date.now() },
    ]);
  }, []);

  const startNewChat = useCallback(() => {
    const currentMessages = messagesRef.current;
    if (currentMessages.length > 0) {
      const title =
        currentMessages.find((m) => m.role === "user")?.content.slice(0, 60) ?? "Chat";
      const thread: Thread = {
        id: crypto.randomUUID(),
        title,
        messages: currentMessages,
        createdAt: Date.now(),
      };
      const updated = [thread, ...threadsRef.current].slice(0, 50);
      setThreads(updated);
      saveToStorage(updated);
    }
    setMessages([]);
    setActiveThreadId(null);
  }, []);

  const loadThread = useCallback((threadId: string) => {
    const thread = threadsRef.current.find((t) => t.id === threadId);
    if (!thread) return;
    setMessages(thread.messages);
    setActiveThreadId(threadId);
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    const updated = threadsRef.current.filter((t) => t.id !== threadId);
    setThreads(updated);
    saveToStorage(updated);
    setActiveThreadId((prev) => (prev === threadId ? null : prev));
  }, []);

  return (
    <ThreadsContext.Provider
      value={{ messages, threads, activeThreadId, addMessage, startNewChat, loadThread, deleteThread }}
    >
      {children}
    </ThreadsContext.Provider>
  );
}

export const useThreads = () => useContext(ThreadsContext);
