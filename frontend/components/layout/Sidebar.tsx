"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  House,
  Workflow,
  GitBranch,
  ChevronRight,
  Settings2,
  ShieldCheck,
  TrendingUp,
  DollarSign,
  Trophy,
  Brain,
  Plug,
  Check,
  MessageSquare,
  MessagesSquare,
  Sparkles,
  Plus,
  Trash2,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useThreads } from "@/components/shared/ThreadsProvider";
import { useBranding } from "@/components/shared/BrandingProvider";
import { useAuth } from "@/contexts/auth";

type CreateAction = "agent" | "workflow" | "chat" | null;

const navItems: { href: string; label: string; icon: React.ElementType; createAction: CreateAction }[] = [
  { href: "/assistant",    label: "Assistant",    icon: Sparkles,       createAction: "chat"     },
  { href: "/dashboard",    label: "Dashboard",    icon: House,          createAction: null       },
  { href: "/canvas",       label: "Agents",       icon: Workflow,       createAction: "agent"    },
  { href: "/workflow",     label: "Workflows",    icon: GitBranch,      createAction: "workflow" },
  { href: "/chat",         label: "Chat",         icon: MessagesSquare, createAction: null       },
  { href: "/crm",          label: "CRM",          icon: TrendingUp,     createAction: null       },
  { href: "/commission",   label: "Commission",   icon: DollarSign,     createAction: null       },
  { href: "/leaderboard",  label: "Leaderboard",  icon: Trophy,         createAction: null       },
  { href: "/coaching",     label: "AI Coach",     icon: Brain,          createAction: null       },
  { href: "/integrations", label: "Integrations", icon: Plug,           createAction: null       },
  { href: "/approvals",    label: "Approvals",    icon: ShieldCheck,    createAction: null       },
  { href: "/admin",        label: "Admin",        icon: Settings2,      createAction: null       },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { threads, activeThreadId, startNewChat, loadThread, deleteThread } = useThreads();
  const [collapsed, setCollapsed] = useState(false);
  const { appName, appIcon } = useBranding();
  const { user, currentOrg, setCurrentOrg, logout } = useAuth();
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const orgPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!orgPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (orgPickerRef.current && !orgPickerRef.current.contains(e.target as Node))
        setOrgPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [orgPickerOpen]);

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "?";

  // ── New chat ───────────────────────────────────────────────────────────────
  const handleNewChat = () => {
    startNewChat();
    if (pathname !== "/assistant") router.push("/assistant");
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-full glass border-r border-border transition-all duration-200",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet to-cyan flex items-center justify-center shrink-0 overflow-hidden">
            {appIcon
              ? <img src={appIcon} alt="" className="w-full h-full object-cover" />
              : <span className="text-xs font-black text-white">L</span>
            }
          </div>
          {!collapsed && (
            <span className="font-semibold text-text-1 text-sm tracking-tight truncate">{appName}</span>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="shrink-0 text-text-3 hover:text-text-2 transition-colors"
        >
          <ChevronRight className={cn("w-4 h-4 transition-transform", !collapsed && "rotate-180")} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 shrink-0">
        {navItems.map(({ href, label, icon: Icon, createAction }) => (
          <div key={href}>
            <div className="flex items-center gap-0.5">
              <Link
                href={href}
                className={cn(
                  "flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors",
                  pathname === href || pathname.startsWith(href + "/")
                    ? "bg-violet/15 text-violet"
                    : "text-text-2 hover:text-text-1 hover:bg-surface-2",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>

              {createAction && !collapsed && (
                <button
                  onClick={() => {
                    if (createAction === "chat") handleNewChat();
                    if (createAction === "agent") router.push("/canvas?new=true");
                    if (createAction === "workflow") router.push("/workflow?new=true");
                  }}
                  title={
                    createAction === "chat" ? "New chat" :
                    createAction === "agent" ? "New agent" : "New workflow"
                  }
                  className="p-1.5 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

          </div>
        ))}
      </nav>

      {/* Threads */}
      {!collapsed && (
        <div className="flex flex-col gap-0.5 px-2 py-2 border-t border-border flex-1 overflow-hidden min-h-0">
          <div className="flex items-center gap-1.5 px-2 py-1 shrink-0">
            <MessageSquare className="w-3 h-3 text-text-3" />
            <p className="text-xs font-medium text-text-3 uppercase tracking-widest">Threads</p>
          </div>
          {threads.length === 0 ? (
            <p className="px-2 py-1 text-xs text-text-3 italic">No threads yet</p>
          ) : (
            <div className="overflow-y-auto flex-1 space-y-0.5 min-h-0">
              {threads.map((thread) => (
                <div key={thread.id} className="group flex items-center gap-0.5">
                  <button
                    onClick={() => { loadThread(thread.id); if (pathname !== "/assistant") router.push("/assistant"); }}
                    className={cn(
                      "flex-1 text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors truncate",
                      activeThreadId === thread.id
                        ? "bg-violet/15 text-violet"
                        : "text-text-2 hover:text-text-1 hover:bg-surface-2",
                    )}
                    title={thread.title}
                  >
                    {thread.title}
                  </button>
                  <button
                    onClick={() => deleteThread(thread.id)}
                    title="Delete thread"
                    className="shrink-0 p-1 rounded-lg text-text-3 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* User profile */}
      <div className="border-t border-border p-2 shrink-0">
        {user ? (
          <div className="relative" ref={orgPickerRef}>
            {/* Org picker dropdown */}
            {orgPickerOpen && (user.orgs?.length ?? 0) > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-1 rounded-xl border border-border shadow-xl overflow-hidden z-50">
                <p className="px-3 py-2 text-[10px] font-medium text-text-3 uppercase tracking-widest border-b border-border">
                  Switch org
                </p>
                {user.orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => { setCurrentOrg(org); setOrgPickerOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                      org.id === currentOrg?.id
                        ? "bg-violet/10 text-violet"
                        : "text-text-2 hover:bg-surface-2",
                    )}
                  >
                    <div className="w-5 h-5 rounded bg-gradient-to-br from-violet to-cyan flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{org.name}</p>
                      <p className="truncate text-[10px] text-text-3">{org.role_key.replace("org.", "")}</p>
                    </div>
                    {org.id === currentOrg?.id && <Check className="w-3 h-3 shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* Avatar + email */}
              <button
                onClick={() => (user.orgs?.length ?? 0) > 1 ? setOrgPickerOpen((v) => !v) : undefined}
                title={user.email}
                className={cn(
                  "flex items-center gap-2 flex-1 min-w-0 rounded-lg px-1.5 py-1.5 transition-colors",
                  (user.orgs?.length ?? 0) > 1 ? "hover:bg-surface-2 cursor-pointer" : "cursor-default",
                )}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet/60 to-cyan/60 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {initials}
                </div>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-1 truncate">
                      {currentOrg?.name ?? user.email}
                    </p>
                    <p className="text-[10px] text-text-3 truncate">{user.email}</p>
                  </div>
                )}
                {!collapsed && (user.orgs?.length ?? 0) > 1 && (
                  <ChevronDown className="w-3 h-3 text-text-3 shrink-0" />
                )}
              </button>

              {/* Logout */}
              <button
                onClick={logout}
                title="Sign out"
                className="shrink-0 p-1.5 rounded-lg text-text-3 hover:text-rose-400 hover:bg-surface-2 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          !collapsed && (
            <Link
              href="/login"
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-text-3 hover:text-text-1 hover:bg-surface-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign in</span>
            </Link>
          )
        )}
      </div>
    </aside>
  );
}
