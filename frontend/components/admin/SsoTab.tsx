"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Loader2, Plus, Trash2, CheckCircle2, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

export function SsoTab() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? "";

  const { data: config, mutate: mutateConfig } = useSWR(
    orgId ? `/orgs/${orgId}/sso` : null,
    () => api.orgs.sso.get(orgId),
  );
  const { data: domains, mutate: mutateDomains } = useSWR(
    orgId ? `/orgs/${orgId}/domains` : null,
    () => api.orgs.sso.domains.list(orgId),
  );

  const [ssoForm, setSsoForm] = useState({
    provider: "oidc",
    issuer_url: "",
    client_id: "",
    client_secret: "",
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  // Pre-fill form when config loads
  useEffect(() => {
    if (config) {
      setSsoForm((prev) => ({
        ...prev,
        provider: config.provider,
        issuer_url: config.issuer_url,
        client_id: config.client_id,
        enabled: config.enabled,
      }));
    }
  }, [config]);

  async function handleSaveSso(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      await api.orgs.sso.upsert(orgId, ssoForm);
      mutateConfig();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !newDomain) return;
    setAddingDomain(true);
    try {
      await api.orgs.sso.domains.add(orgId, newDomain);
      setNewDomain("");
      mutateDomains();
    } finally {
      setAddingDomain(false);
    }
  }

  async function handleVerify(domain: string) {
    if (!orgId) return;
    setVerifying(domain);
    try {
      await api.orgs.sso.domains.verify(orgId, domain);
      mutateDomains();
    } finally {
      setVerifying(null);
    }
  }

  async function handleRemoveDomain(domain: string) {
    if (!orgId || !confirm(`Remove domain ${domain}?`)) return;
    await api.orgs.sso.domains.remove(orgId, domain);
    mutateDomains();
  }

  if (!orgId) return <p className="text-sm text-text-3 p-4">No org selected.</p>;

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      {/* SSO provider config */}
      <section>
        <h3 className="text-sm font-semibold text-text-1 mb-4">OIDC / SSO Configuration</h3>
        <form onSubmit={handleSaveSso} className="space-y-3">
          <Field label="Provider">
            <select
              value={ssoForm.provider}
              onChange={(e) => setSsoForm((p) => ({ ...p, provider: e.target.value }))}
              className={inputCls}
            >
              <option value="oidc">Generic OIDC</option>
              <option value="okta">Okta</option>
              <option value="azure">Microsoft Entra ID (Azure AD)</option>
              <option value="google">Google Workspace</option>
              <option value="auth0">Auth0</option>
            </select>
          </Field>
          <Field label="Issuer URL">
            <input
              required
              type="url"
              value={ssoForm.issuer_url}
              onChange={(e) => setSsoForm((p) => ({ ...p, issuer_url: e.target.value }))}
              placeholder="https://your-org.okta.com"
              className={inputCls}
            />
          </Field>
          <Field label="Client ID">
            <input
              required
              value={ssoForm.client_id}
              onChange={(e) => setSsoForm((p) => ({ ...p, client_id: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Client Secret">
            <input
              type="password"
              value={ssoForm.client_secret}
              onChange={(e) => setSsoForm((p) => ({ ...p, client_secret: e.target.value }))}
              placeholder={config ? "••••••••" : "Paste secret"}
              className={inputCls}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-text-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ssoForm.enabled}
              onChange={(e) => setSsoForm((p) => ({ ...p, enabled: e.target.checked }))}
              className="accent-violet"
            />
            Enable SSO
          </label>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-violet px-4 py-2 text-sm
                       font-semibold text-white hover:opacity-90 disabled:opacity-50 mt-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save SSO Config
          </button>
        </form>
      </section>

      {/* Email domains */}
      <section>
        <h3 className="text-sm font-semibold text-text-1 mb-1">Email Domain Routing</h3>
        <p className="text-xs text-text-3 mb-4">
          Users whose email domain matches a verified domain will be routed through SSO.
          Add a DNS TXT record to verify ownership.
        </p>

        <form onSubmit={handleAddDomain} className="flex gap-2 mb-4">
          <input
            required
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="company.com"
            className={`flex-1 ${inputCls}`}
          />
          <button
            type="submit"
            disabled={addingDomain}
            className="flex items-center gap-1.5 rounded-lg bg-surface-2 border border-border
                       px-3 py-1.5 text-sm text-text-1 hover:bg-surface-1 disabled:opacity-50"
          >
            {addingDomain ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </form>

        <div className="space-y-2">
          {(domains ?? []).map((d) => (
            <div key={d.domain} className="flex items-center gap-3 rounded-lg border border-border
                                           bg-surface-1 px-3 py-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-text-1">{d.domain}</p>
                {!d.verified && d.verify_token && (
                  <p className="text-xs text-text-3 mt-0.5 font-mono break-all">
                    TXT record: <span className="text-text-2">{d.verify_token}</span>
                  </p>
                )}
              </div>
              {d.verified ? (
                <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              ) : (
                <button
                  onClick={() => handleVerify(d.domain)}
                  disabled={verifying === d.domain}
                  className="flex items-center gap-1 text-xs text-violet hover:underline disabled:opacity-50"
                >
                  {verifying === d.domain ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Clock size={12} />
                  )}
                  Verify
                </button>
              )}
              <button
                onClick={() => handleRemoveDomain(d.domain)}
                className="text-text-3 hover:text-red-400 transition p-1 shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-text-3 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-text-1 " +
  "placeholder-text-3 focus:outline-none focus:ring-2 focus:ring-violet/50";
