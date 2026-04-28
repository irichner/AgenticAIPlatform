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
import { useAuth } from "@/contexts/auth";
import { getOrgItem, setOrgItem, removeOrgItem } from "@/lib/org-storage";

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

function loadFromStorage(orgId: string): Thread[] {
  try {
    const raw = getOrgItem(orgId, "threads");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToStorage(orgId: string, threads: Thread[]) {
  setOrgItem(orgId, "threads", JSON.stringify(threads));
}

function loadDraft(orgId: string): DraftData | null {
  try {
    const raw = getOrgItem(orgId, "draft");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Migrate legacy format (plain array) to { id, messages }
    if (Array.isArray(parsed)) {
      return { id: crypto.randomUUID(), messages: parsed };
    }
    return parsed as DraftData;
  } catch { return null; }
}

function saveDraft(orgId: string, id: string, messages: ChatMessage[]) {
  setOrgItem(orgId, "draft", JSON.stringify({ id, messages }));
}

function clearDraft(orgId: string) {
  removeOrgItem(orgId, "draft");
}

export function ThreadsProvider({ children }: { children: ReactNode }) {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const threadsRef  = useRef<Thread[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const draftIdRef  = useRef<string | null>(null);
  const orgIdRef    = useRef<string | null>(null);

  // Re-initialize state whenever the active org changes
  useEffect(() => {
    if (!orgId || orgId === orgIdRef.current) return;
    orgIdRef.current = orgId;

    const loaded = loadFromStorage(orgId);
    const deduped = loaded.filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i);
    if (deduped.length !== loaded.length) saveToStorage(orgId, deduped);
    setThreads(deduped);
    threadsRef.current = deduped;

    draftIdRef.current = null;
    setMessages([]);
    setActiveThreadId(null);

    const draft = loadDraft(orgId);
    if (draft && draft.messages.length > 0) {
      draftIdRef.current = draft.id;
      setMessages(draft.messages);
    }
  }, [orgId]);

  useEffect(() => { threadsRef.current  = threads;  }, [threads]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Persist in-progress draft whenever messages change
  useEffect(() => {
    if (!orgId) return;
    if (activeThreadId !== null) return;
    if (messages.length === 0) {
      clearDraft(orgId);
      draftIdRef.current = null;
    } else {
      if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
      saveDraft(orgId, draftIdRef.current, messages);
    }
  }, [messages, activeThreadId, orgId]);

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content, timestamp: Date.now() },
    ]);
  }, []);

  const startNewChat = useCallback(() => {
    const currentMessages = messagesRef.current;
    const currentOrgId = orgIdRef.current;
    if (currentMessages.length > 0 && currentOrgId) {
      const threadId = draftIdRef.current ?? crypto.randomUUID();
      const title =
        currentMessages.find((m) => m.role === "user")?.content.slice(0, 60) ?? "Chat";
      const thread: Thread = {
        id: threadId,
        title,
        messages: currentMessages,
        createdAt: Date.now(),
      };
      const rest = threadsRef.current.filter((t) => t.id !== threadId);
      const updated = [thread, ...rest].slice(0, 50);
      setThreads(updated);
      saveToStorage(currentOrgId, updated);
    }
    draftIdRef.current = null;
    setMessages([]);
    setActiveThreadId(null);
    if (orgIdRef.current) clearDraft(orgIdRef.current);
  }, []);

  const loadThread = useCallback((threadId: string) => {
    const thread = threadsRef.current.find((t) => t.id === threadId);
    if (!thread) return;
    setMessages(thread.messages);
    setActiveThreadId(threadId);
    draftIdRef.current = null;
    if (orgIdRef.current) clearDraft(orgIdRef.current);
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    const updated = threadsRef.current.filter((t) => t.id !== threadId);
    setThreads(updated);
    if (orgIdRef.current) saveToStorage(orgIdRef.current, updated);
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
