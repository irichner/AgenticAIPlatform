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

interface DraftData {
  id: string;
  messages: ChatMessage[];
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

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem("lanara_draft");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Migrate legacy format (plain array) to { id, messages }
    if (Array.isArray(parsed)) {
      return { id: crypto.randomUUID(), messages: parsed };
    }
    return parsed as DraftData;
  } catch { return null; }
}

function saveDraft(id: string, messages: ChatMessage[]) {
  try { localStorage.setItem("lanara_draft", JSON.stringify({ id, messages })); } catch {}
}

function clearDraft() {
  try { localStorage.removeItem("lanara_draft"); } catch {}
}

export function ThreadsProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const threadsRef  = useRef<Thread[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  // Stable ID for the current draft — same draft always maps to the same thread entry
  const draftIdRef  = useRef<string | null>(null);

  useEffect(() => {
    const loaded = loadFromStorage();
    const deduped = loaded.filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i);
    if (deduped.length !== loaded.length) saveToStorage(deduped);
    setThreads(deduped);
    threadsRef.current = deduped;

    const draft = loadDraft();
    if (draft && draft.messages.length > 0) {
      draftIdRef.current = draft.id;
      setMessages(draft.messages);
    }
  }, []);

  useEffect(() => { threadsRef.current  = threads;  }, [threads]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Persist in-progress draft with its stable ID whenever messages change
  useEffect(() => {
    if (activeThreadId !== null) return;
    if (messages.length === 0) {
      clearDraft();
      draftIdRef.current = null;
    } else {
      if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
      saveDraft(draftIdRef.current, messages);
    }
  }, [messages, activeThreadId]);

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content, timestamp: Date.now() },
    ]);
  }, []);

  const startNewChat = useCallback(() => {
    const currentMessages = messagesRef.current;
    if (currentMessages.length > 0) {
      // Use the draft's stable ID so repeated calls upsert rather than duplicate
      const threadId = draftIdRef.current ?? crypto.randomUUID();
      const title =
        currentMessages.find((m) => m.role === "user")?.content.slice(0, 60) ?? "Chat";
      const thread: Thread = {
        id: threadId,
        title,
        messages: currentMessages,
        createdAt: Date.now(),
      };
      // Upsert: remove any existing entry with this ID before prepending
      const rest = threadsRef.current.filter((t) => t.id !== threadId);
      const updated = [thread, ...rest].slice(0, 50);
      setThreads(updated);
      saveToStorage(updated);
    }
    draftIdRef.current = null;
    setMessages([]);
    setActiveThreadId(null);
    clearDraft();
  }, []);

  const loadThread = useCallback((threadId: string) => {
    const thread = threadsRef.current.find((t) => t.id === threadId);
    if (!thread) return;
    setMessages(thread.messages);
    setActiveThreadId(threadId);
    draftIdRef.current = null;
    clearDraft();
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
