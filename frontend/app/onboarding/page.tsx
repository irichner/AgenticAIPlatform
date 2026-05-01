"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";

// Deterministic system role IDs from migration 0014
const ROLE_ORG_ADMIN  = "00000000-0000-0000-0000-000000000002";
const ROLE_ORG_MEMBER = "00000000-0000-0000-0000-000000000003";

const TOTAL_STEPS = 5;

interface Invite {
  email: string;
  role_id: string;
}

// ── Slug helper ───────────────────────────────────────────────────────────────

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

// ── Step components ───────────────────────────────────────────────────────────

function StepOrgIdentity({
  orgName, setOrgName,
  slug, setSlug,
  logoUrl, setLogoUrl,
}: {
  orgName: string; setOrgName: (v: string) => void;
  slug: string; setSlug: (v: string) => void;
  logoUrl: string; setLogoUrl: (v: string) => void;
}) {
  const [slugTouched, setSlugTouched] = useState(false);
  const [logoError, setLogoError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleNameChange(v: string) {
    setOrgName(v);
    if (!slugTouched) setSlug(toSlug(v));
  }

  function handleSlugChange(v: string) {
    setSlugTouched(true);
    setSlug(toSlug(v));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo must be under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setLogoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm text-text-2 mb-1">Organisation name <span className="text-red-400">*</span></label>
        <input
          type="text"
          required
          autoFocus
          value={orgName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Acme Corp"
          className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm
                     text-text-1 placeholder-text-3 focus:outline-none focus:ring-2
                     focus:ring-violet/50 focus:border-violet transition"
        />
      </div>

      <div>
        <label className="block text-sm text-text-2 mb-1">URL slug <span className="text-red-400">*</span></label>
        <div className="flex items-center rounded-lg border border-border bg-surface-0 overflow-hidden
                        focus-within:ring-2 focus-within:ring-violet/50 focus-within:border-violet transition">
          <span className="px-3 py-2 text-sm text-text-3 select-none border-r border-border bg-surface-1">
            lanara.app/
          </span>
          <input
            type="text"
            required
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="acme-corp"
            className="flex-1 px-3 py-2 text-sm text-text-1 placeholder-text-3 bg-transparent
                       focus:outline-none"
          />
        </div>
        <p className="mt-1 text-xs text-text-3">Lowercase letters, numbers, and hyphens only.</p>
      </div>

      <div>
        <label className="block text-sm text-text-2 mb-1">Logo <span className="text-text-3">(optional)</span></label>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo preview"
              className="h-12 w-12 rounded-lg object-contain border border-border bg-surface-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg border border-dashed border-border bg-surface-0 flex items-center justify-center">
              <svg className="w-5 h-5 text-text-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm text-violet hover:underline"
            >
              {logoUrl ? "Change logo" : "Upload logo"}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={() => { setLogoUrl(""); if (fileRef.current) fileRef.current.value = ""; }}
                className="ml-3 text-sm text-text-3 hover:text-text-2"
              >
                Remove
              </button>
            )}
            <p className="text-xs text-text-3 mt-0.5">PNG, JPG or SVG — max 2 MB</p>
          </div>
        </div>
        {logoError && <p className="mt-1 text-xs text-red-400">{logoError}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleLogoChange}
        />
      </div>
    </div>
  );
}

function StepUserProfile({
  fullName, setFullName,
  jobTitle, setJobTitle,
}: {
  fullName: string; setFullName: (v: string) => void;
  jobTitle: string; setJobTitle: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm text-text-2 mb-1">Display name <span className="text-red-400">*</span></label>
        <input
          type="text"
          required
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Alex Rivera"
          className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm
                     text-text-1 placeholder-text-3 focus:outline-none focus:ring-2
                     focus:ring-violet/50 focus:border-violet transition"
        />
      </div>

      <div>
        <label className="block text-sm text-text-2 mb-1">Job title <span className="text-text-3">(optional)</span></label>
        <input
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="Head of Revenue Operations"
          className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm
                     text-text-1 placeholder-text-3 focus:outline-none focus:ring-2
                     focus:ring-violet/50 focus:border-violet transition"
        />
      </div>

      <p className="text-xs text-text-3">
        Your name and title are visible to teammates in your organization.
      </p>
    </div>
  );
}

function StepInviteTeam({
  invites, setInvites,
}: {
  invites: Invite[];
  setInvites: (v: Invite[]) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(ROLE_ORG_MEMBER);

  function addInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || invites.some((i) => i.email === trimmed)) return;
    setInvites([...invites, { email: trimmed, role_id: role }]);
    setEmail("");
  }

  function removeInvite(index: number) {
    setInvites(invites.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-3">
        Add teammates now or skip — you can always invite more from the admin panel.
      </p>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addInvite(); } }}
          placeholder="colleague@company.com"
          className="flex-1 rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm
                     text-text-1 placeholder-text-3 focus:outline-none focus:ring-2
                     focus:ring-violet/50 focus:border-violet transition"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm
                     text-text-1 focus:outline-none focus:ring-2 focus:ring-violet/50 transition"
        >
          <option value={ROLE_ORG_MEMBER}>Member</option>
          <option value={ROLE_ORG_ADMIN}>Admin</option>
        </select>
        <button
          type="button"
          onClick={addInvite}
          disabled={!email.trim()}
          className="rounded-lg bg-violet px-3 py-2 text-sm font-medium text-white
                     hover:opacity-90 disabled:opacity-40 transition"
        >
          Add
        </button>
      </div>

      {invites.length > 0 && (
        <ul className="space-y-1.5">
          {invites.map((invite, i) => (
            <li
              key={invite.email}
              className="flex items-center justify-between rounded-lg border border-border
                         bg-surface-0 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-text-1 truncate">{invite.email}</span>
                <span className="text-xs text-text-3">
                  {invite.role_id === ROLE_ORG_ADMIN ? "Admin" : "Member"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeInvite(i)}
                className="text-text-3 hover:text-text-2 ml-2 shrink-0"
                aria-label="Remove invite"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {invites.length === 0 && (
        <p className="text-xs text-text-3 italic">No invites added yet.</p>
      )}
    </div>
  );
}

function StepFirstTenant({
  tenantName, setTenantName,
  orgName,
}: {
  tenantName: string; setTenantName: (v: string) => void;
  orgName: string;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-3">
        A <strong className="text-text-2">workspace</strong> is your data environment — agents, documents, and quota data live here.
        You can create multiple workspaces later (e.g. by region or team).
      </p>

      <div>
        <label className="block text-sm text-text-2 mb-1">Workspace name <span className="text-red-400">*</span></label>
        <input
          type="text"
          required
          autoFocus
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          placeholder={orgName || "Global"}
          className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2 text-sm
                     text-text-1 placeholder-text-3 focus:outline-none focus:ring-2
                     focus:ring-violet/50 focus:border-violet transition"
        />
        <p className="mt-1 text-xs text-text-3">
          Common examples: &quot;Global&quot;, &quot;North America&quot;, &quot;EMEA&quot;, or your company name.
        </p>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5 mb-8">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
            i < step ? "bg-violet" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

function StepConnectGmail({ orgId }: { orgId: string | null }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    if (!orgId) return;
    setConnecting(true);
    setError("");
    try {
      const res = await fetch(`/api/integrations/google/auth-url?org_id=${orgId}`, {
        credentials: "include",
        headers: { "X-Org-Id": orgId },
      });
      const data = await res.json();
      if (data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        setError(data.detail ?? "Could not get authorization URL.");
        setConnecting(false);
      }
    } catch {
      setError("Failed to start Google connection.");
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-2">
        Connect your Gmail so Lanara can monitor your email activity and surface rep coaching insights.
        You can also do this later from <strong className="text-text-1">Integrations</strong>.
      </p>

      <button
        type="button"
        onClick={handleConnect}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-3 rounded-lg border border-border
                   bg-surface-0 px-4 py-3 text-sm font-medium text-text-1 hover:bg-surface-2
                   disabled:opacity-50 transition"
      >
        {connecting ? (
          <Loader2 size={16} className="animate-spin text-text-3" />
        ) : (
          <svg viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
        )}
        {connecting ? "Redirecting to Google…" : "Connect Gmail"}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Step metadata ─────────────────────────────────────────────────────────────

const STEPS = [
  { title: "Set up your organization", subtitle: "Name your org and choose a URL slug." },
  { title: "Your profile",             subtitle: "Let your team know who you are." },
  { title: "Invite teammates",         subtitle: "Bring your team along. You can skip this." },
  { title: "Your first workspace",     subtitle: "Name the workspace where your data lives." },
  { title: "Connect your inbox",       subtitle: "Let Lanara monitor your Gmail activity." },
];

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [orgName, setOrgName]   = useState("");
  const [slug, setSlug]         = useState("");
  const [logoUrl, setLogoUrl]   = useState("");

  // Step 2
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [jobTitle, setJobTitle] = useState(user?.job_title ?? "");

  // Step 3
  const [invites, setInvites]   = useState<Invite[]>([]);

  // Step 4
  const [tenantName, setTenantName] = useState("");

  // Step 5
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);

  function canAdvance(): boolean {
    if (step === 1) return orgName.trim().length > 0 && slug.trim().length > 0;
    if (step === 2) return fullName.trim().length > 0;
    if (step === 3) return true; // skippable
    if (step === 4) return tenantName.trim().length > 0;
    if (step === 5) return true; // skippable
    return false;
  }

  async function handleComplete() {
    setError("");
    setSubmitting(true);
    try {
      // 1. Create org (with correctly named first tenant)
      const orgRes = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: orgName.trim(),
          slug: slug.trim(),
          logo_url: logoUrl || null,
          first_tenant_name: tenantName.trim(),
        }),
      });
      if (!orgRes.ok) {
        const data = await orgRes.json().catch(() => null);
        throw new Error(data?.detail ?? "Failed to create organization.");
      }
      const org = await orgRes.json();
      localStorage.setItem("lanara_org_id", org.id);

      // 2. Update user profile
      await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          full_name: fullName.trim(),
          job_title: jobTitle.trim() || null,
        }),
      });

      // 3. Send invites (sequential — rate limits apply)
      for (const invite of invites) {
        await fetch(`/api/orgs/${org.id}/members/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Org-Id": org.id },
          credentials: "include",
          body: JSON.stringify({ email: invite.email, role_id: invite.role_id }),
        });
      }

      // 4. Mark onboarding complete
      await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ onboarding_completed: true }),
      });

      refresh();
      setCreatedOrgId(org.id);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const { title, subtitle } = STEPS[step - 1];

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-text-1 tracking-tight">Lanara</h1>
          <p className="text-sm text-text-3 mt-1">Let&apos;s get your account set up</p>
        </div>

        <div className="bg-surface-1 rounded-xl border border-border p-6 shadow-sm">
          <ProgressBar step={step} />

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
            >
              {/* Step header */}
              <div className="mb-6">
                <div className="text-xs font-medium text-violet uppercase tracking-wider mb-1">
                  Step {step} of {TOTAL_STEPS}
                </div>
                <h2 className="text-lg font-semibold text-text-1">{title}</h2>
                <p className="text-sm text-text-3 mt-0.5">{subtitle}</p>
              </div>

              {/* Step content */}
              {step === 1 && (
                <StepOrgIdentity
                  orgName={orgName} setOrgName={setOrgName}
                  slug={slug} setSlug={setSlug}
                  logoUrl={logoUrl} setLogoUrl={setLogoUrl}
                />
              )}
              {step === 2 && (
                <StepUserProfile
                  fullName={fullName} setFullName={setFullName}
                  jobTitle={jobTitle} setJobTitle={setJobTitle}
                />
              )}
              {step === 3 && (
                <StepInviteTeam invites={invites} setInvites={setInvites} />
              )}
              {step === 4 && (
                <StepFirstTenant
                  tenantName={tenantName} setTenantName={setTenantName}
                  orgName={orgName}
                />
              )}
              {step === 5 && (
                <StepConnectGmail orgId={createdOrgId} />
              )}

              {error && (
                <p className="mt-4 text-sm text-red-400">{error}</p>
              )}

              {/* Navigation */}
              <div className="flex justify-between mt-6 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={step === 1 || step === 5}
                  className="text-sm text-text-3 hover:text-text-2 disabled:opacity-0 disabled:pointer-events-none transition"
                >
                  Back
                </button>

                <div className="flex items-center gap-3">
                  {(step === 3 || step === 5) && (
                    <button
                      type="button"
                      onClick={() => step === 5 ? router.push("/") : setStep((s) => s + 1)}
                      className="text-sm text-text-3 hover:text-text-2 transition"
                    >
                      Skip
                    </button>
                  )}

                  {step < 4 && (
                    <button
                      type="button"
                      onClick={() => setStep((s) => s + 1)}
                      disabled={!canAdvance()}
                      className="rounded-lg bg-violet px-4 py-2 text-sm font-semibold text-white
                                 transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  )}
                  {step === 4 && (
                    <button
                      type="button"
                      onClick={handleComplete}
                      disabled={!canAdvance() || submitting}
                      className="rounded-lg bg-violet px-4 py-2 text-sm font-semibold text-white
                                 transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Setting up…" : "Continue"}
                    </button>
                  )}
                  {step === 5 && (
                    <button
                      type="button"
                      onClick={() => router.push("/")}
                      className="rounded-lg bg-violet px-4 py-2 text-sm font-semibold text-white
                                 transition hover:opacity-90"
                    >
                      Finish
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
