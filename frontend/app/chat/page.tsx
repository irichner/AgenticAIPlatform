"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Send, Trash2, Users, Hash, UserPlus, X, Check,
  Loader2, MessageSquare, User,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { api, type ChatRoom, type ChatMessage, type ChatUser } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/cn";

const DISPLAY_NAME_KEY = "lanara_chat_display_name";

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const COLORS = ["bg-violet/20 text-violet", "bg-cyan/20 text-cyan", "bg-amber/20 text-amber",
  "bg-rose/20 text-rose", "bg-emerald/20 text-emerald"];

function colorFor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function ChatPage() {
  const { currentOrg } = useAuth();
  const orgKey = currentOrg?.id ?? null;

  // ── display name ─────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(DISPLAY_NAME_KEY) ?? "" : ""
  );
  const [editingName, setEditingName] = useState(!displayName);
  const [nameInput, setNameInput] = useState(displayName);
  const saveName = () => {
    const n = nameInput.trim();
    if (!n) return;
    setDisplayName(n);
    localStorage.setItem(DISPLAY_NAME_KEY, n);
    setEditingName(false);
  };

  // ── data ─────────────────────────────────────────────────────
  const { data: users = [], mutate: mutateUsers } = useSWR(
    orgKey ? ["chat-users", orgKey] : null,
    () => api.chat.users.list(),
  );

  const { data: rooms = [], mutate: mutateRooms } = useSWR(
    orgKey ? ["chat-rooms", orgKey] : null,
    () => api.chat.rooms.list(),
  );

  // ── selected room ─────────────────────────────────────────────
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  const { data: messages = [], mutate: mutateMessages } = useSWR(
    activeRoomId ? ["chat-messages", activeRoomId] : null,
    ([, rid]) => api.chat.messages.list(rid),
    { refreshInterval: 3000 },
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── send message ──────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || !activeRoomId || !displayName) return;
    setSending(true);
    setInput("");
    try {
      await api.chat.messages.send(activeRoomId, { sender_name: displayName, content: text });
      mutateMessages();
    } finally { setSending(false); }
  };

  // ── create group ──────────────────────────────────────────────
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  const createGroup = async () => {
    const name = groupName.trim();
    if (!name) return;
    setSavingGroup(true);
    try {
      const room = await api.chat.rooms.create({ name, type: "group" });
      mutateRooms();
      setGroupName("");
      setCreatingGroup(false);
      setActiveRoomId(room.id);
    } finally { setSavingGroup(false); }
  };

  const deleteRoom = async (id: string) => {
    await api.chat.rooms.delete(id);
    mutateRooms();
    if (activeRoomId === id) setActiveRoomId(null);
  };

  // ── add / remove user ─────────────────────────────────────────
  const [addingUser, setAddingUser] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  const addUser = async () => {
    const email = userEmail.trim();
    if (!email) return;
    setSavingUser(true);
    try {
      await api.chat.users.create({ email, full_name: userName.trim() || undefined });
      mutateUsers();
      setUserEmail(""); setUserName(""); setAddingUser(false);
    } finally { setSavingUser(false); }
  };

  const openDirect = async (user: ChatUser) => {
    const name = user.full_name || user.email;
    const existing = rooms.find((r) => r.type === "direct" && r.name === name);
    if (existing) { setActiveRoomId(existing.id); return; }
    const room = await api.chat.rooms.create({ name, type: "direct" });
    mutateRooms();
    setActiveRoomId(room.id);
  };

  const groups  = rooms.filter((r) => r.type === "group");
  const directs = rooms.filter((r) => r.type === "direct");

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      {/* ── chat layout ── */}
      <div className="flex flex-1 min-w-0 overflow-hidden">

        {/* ── left panel ── */}
        <div className="w-64 shrink-0 flex flex-col border-r border-border glass overflow-hidden">

          {/* Display name */}
          <div className="px-3 py-3 border-b border-border shrink-0">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
                  placeholder="Your display name…"
                  autoFocus
                  className="flex-1 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-violet"
                />
                <button onClick={saveName} disabled={!nameInput.trim()} className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40">
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => { setNameInput(displayName); setEditingName(true); }}
                className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity">
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0", colorFor(displayName))}>
                  {initials(displayName)}
                </div>
                <span className="text-xs font-medium text-text-1 truncate">{displayName}</span>
              </button>
            )}
          </div>

          {/* Direct messages */}
          <div className="flex flex-col flex-1 overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-3 py-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <User className="w-3 h-3 text-text-3" />
                <p className="text-xs font-medium text-text-3 uppercase tracking-widest">People</p>
              </div>
              <button onClick={() => setAddingUser((v) => !v)}
                className="text-text-3 hover:text-text-2 transition-colors">
                <UserPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            <AnimatePresence>
              {addingUser && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} className="px-2 pb-2 space-y-1 shrink-0 overflow-hidden">
                  <input value={userName} onChange={(e) => setUserName(e.target.value)}
                    placeholder="Full name" className="w-full bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-violet" />
                  <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addUser(); }}
                    placeholder="Email address" className="w-full bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-violet" />
                  <div className="flex gap-1">
                    <button onClick={addUser} disabled={savingUser || !userEmail.trim()}
                      className="flex-1 py-1 rounded-lg bg-violet/20 text-violet text-xs font-medium disabled:opacity-40 hover:bg-violet/35 transition-colors">
                      {savingUser ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Add"}
                    </button>
                    <button onClick={() => { setAddingUser(false); setUserEmail(""); setUserName(""); }}
                      className="px-2 py-1 rounded-lg text-text-3 hover:text-text-2 hover:bg-surface-2 text-xs transition-colors">
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="overflow-y-auto flex-1 px-2 space-y-0.5 min-h-0">
              {users.length === 0 && (
                <p className="text-xs text-text-3 px-2 py-1 italic">No people yet</p>
              )}
              {users.map((u) => {
                const name = u.full_name || u.email;
                const directRoom = rooms.find((r) => r.type === "direct" && r.name === name);
                const isActive = directRoom?.id === activeRoomId;
                return (
                  <div key={u.id} className="group flex items-center gap-1">
                    <button onClick={() => openDirect(u)}
                      className={cn("flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                        isActive ? "bg-violet/15 text-violet" : "text-text-2 hover:text-text-1 hover:bg-surface-2")}>
                      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", colorFor(name))}>
                        {initials(name)}
                      </div>
                      <span className="truncate">{name}</span>
                    </button>
                    <button onClick={async () => { await api.chat.users.delete(u.id); mutateUsers(); }}
                      className="shrink-0 p-1 rounded-lg text-text-3 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Groups */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-border shrink-0">
              <div className="flex items-center gap-1.5">
                <Hash className="w-3 h-3 text-text-3" />
                <p className="text-xs font-medium text-text-3 uppercase tracking-widest">Groups</p>
              </div>
              <button onClick={() => setCreatingGroup((v) => !v)}
                className="text-text-3 hover:text-text-2 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <AnimatePresence>
              {creatingGroup && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} className="px-2 pb-2 space-y-1 shrink-0 overflow-hidden">
                  <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createGroup(); }}
                    placeholder="Group name…" autoFocus
                    className="w-full bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-violet" />
                  <div className="flex gap-1">
                    <button onClick={createGroup} disabled={savingGroup || !groupName.trim()}
                      className="flex-1 py-1 rounded-lg bg-violet/20 text-violet text-xs font-medium disabled:opacity-40 hover:bg-violet/35 transition-colors">
                      {savingGroup ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Create"}
                    </button>
                    <button onClick={() => { setCreatingGroup(false); setGroupName(""); }}
                      className="px-2 py-1 rounded-lg text-text-3 hover:text-text-2 hover:bg-surface-2 text-xs transition-colors">
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="overflow-y-auto px-2 space-y-0.5 pb-2" style={{ maxHeight: "40%" }}>
              {groups.length === 0 && (
                <p className="text-xs text-text-3 px-2 py-1 italic">No groups yet</p>
              )}
              {groups.map((room) => (
                <div key={room.id} className="group flex items-center gap-1">
                  <button onClick={() => setActiveRoomId(room.id)}
                    className={cn("flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                      room.id === activeRoomId ? "bg-violet/15 text-violet" : "text-text-2 hover:text-text-1 hover:bg-surface-2")}>
                    <Hash className="w-3 h-3 shrink-0" />
                    <span className="truncate">{room.name}</span>
                  </button>
                  <button onClick={() => deleteRoom(room.id)}
                    className="shrink-0 p-1 rounded-lg text-text-3 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── right panel: messages ── */}
        {activeRoom ? (
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 h-14 border-b border-border shrink-0">
              {activeRoom.type === "group"
                ? <Hash className="w-4 h-4 text-text-3" />
                : <User className="w-4 h-4 text-text-3" />}
              <p className="text-sm font-semibold text-text-1">{activeRoom.name}</p>
              <span className="text-xs text-text-3 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                {activeRoom.type}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <MessageSquare className="w-8 h-8 text-text-3" />
                  <p className="text-sm text-text-3">No messages yet. Say hello!</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isMe = msg.sender_name === displayName;
                const showSender = i === 0 || messages[i - 1].sender_name !== msg.sender_name;
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={cn("flex gap-3", isMe ? "flex-row-reverse" : "")}>
                    {showSender && (
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5", colorFor(msg.sender_name))}>
                        {initials(msg.sender_name)}
                      </div>
                    )}
                    {!showSender && <div className="w-8 shrink-0" />}
                    <div className={cn("max-w-md", isMe ? "items-end" : "items-start", "flex flex-col gap-1")}>
                      {showSender && (
                        <span className={cn("text-xs text-text-3", isMe ? "text-right" : "")}>
                          {msg.sender_name} · {timeLabel(msg.created_at)}
                        </span>
                      )}
                      <div className={cn(
                        "px-3.5 py-2.5 rounded-2xl text-sm text-text-1 leading-relaxed",
                        isMe ? "bg-violet/20 rounded-tr-sm" : "glass rounded-tl-sm",
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-5 py-4 border-t border-border shrink-0">
              {!displayName ? (
                <p className="text-sm text-text-3 text-center">Set your display name above to start chatting.</p>
              ) : (
                <div className="glass rounded-2xl flex items-end gap-3 px-4 py-3 focus-within:ring-1 focus-within:ring-violet/40 transition-all">
                  <textarea
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={`Message #${activeRoom.name}…`}
                    rows={1}
                    disabled={sending}
                    className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-3 outline-none resize-none leading-relaxed disabled:opacity-50"
                    style={{ minHeight: "24px", maxHeight: "120px" }}
                  />
                  <button onClick={send} disabled={!input.trim() || sending}
                    className="shrink-0 w-8 h-8 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-30 flex items-center justify-center transition-colors">
                    {sending ? <Loader2 className="w-4 h-4 text-violet animate-spin" /> : <Send className="w-4 h-4 text-violet" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-violet/10 border border-violet/20 flex items-center justify-center">
              <Users className="w-7 h-7 text-violet" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-1">Select a conversation</p>
              <p className="text-xs text-text-3 mt-1">
                Choose a person or group from the left, or create a new group.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
