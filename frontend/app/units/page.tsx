"use client";

import { useState } from "react";
import useSWR from "swr";
import { LayoutGrid, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { UnitCard } from "@/components/units/UnitCard";
import { CommandBar } from "@/components/shared/CommandBar";
import { api, type BusinessUnit, type Agent, type AgentGroup } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

function useUnitsAndAgents() {
  const { currentOrg } = useAuth();
  const orgKey = currentOrg?.id ?? null;

  const { data: units, error: unitsErr, isLoading: unitsLoading, mutate: mutateUnits } =
    useSWR(orgKey ? ["business-units", orgKey] : null, () => api.businessUnits.list());

  const { data: agents, error: agentsErr, isLoading: agentsLoading, mutate: mutateAgents } =
    useSWR(orgKey ? ["agents", orgKey] : null, () => api.agents.list());

  const { data: groups, mutate: mutateGroups } =
    useSWR(orgKey ? ["groups", orgKey] : null, () => api.groups.list());

  return {
    units: units ?? [],
    agents: agents ?? [],
    groups: groups ?? [],
    loading: unitsLoading || agentsLoading,
    error: unitsErr ?? agentsErr,
    refresh: () => { mutateUnits(); mutateAgents(); mutateGroups(); },
  };
}

export default function UnitsPage() {
  const { units, agents, groups, loading, error, refresh } = useUnitsAndAgents();
  const [creating, setCreating] = useState(false);

  const agentsForUnit = (unitId: string) =>
    agents.filter((a: Agent) => a.business_unit_id === unitId);

  const groupsForUnit = (unitId: string) =>
    groups.filter((g: AgentGroup) => g.business_unit_id === unitId);

  const handleCreateAgent = async (unitId: string) => {
    setCreating(true);
    try {
      await api.agents.createPrebuilt("quota_forecaster", unitId);
      refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateGroup = async (unitId: string, name: string) => {
    await api.groups.create({ name, business_unit_id: unitId });
    refresh();
  };

  const handleDeleteGroup = async (groupId: string) => {
    await api.groups.delete(groupId);
    refresh();
  };

  const handleDeleteUnit = async (unitId: string) => {
    await api.businessUnits.delete(unitId);
    refresh();
  };

  const handleCommand = async (prompt: string) => {
    const lower = prompt.toLowerCase();
    const targetUnit = units[0];
    if (!targetUnit) return;

    let agentType = "quota_forecaster";
    if (lower.includes("spif")) agentType = "spif_optimizer";
    if (lower.includes("clawback")) agentType = "clawback_detector";

    setCreating(true);
    try {
      await api.agents.createPrebuilt(agentType, targetUnit.id);
      refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <CommandBar
            placeholder="Build me a clawback detection agent for EMEA…"
            onSubmit={handleCommand}
            loading={creating}
            className="mb-6 max-w-xl"
          />

          {loading && (
            <div className="flex items-center gap-2 text-text-3 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          )}

          {error && (
            <div className="text-rose text-sm glass rounded-xl p-4">
              {String(error)}
            </div>
          )}

          {!loading && !error && units.length === 0 && (
            <EmptyState message="No Business Units found. Create one via the + button in the sidebar." />
          )}

          {units.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <LayoutGrid className="w-4 h-4 text-text-3" />
                <h2 className="text-sm font-medium text-text-2">
                  {units.length} {units.length === 1 ? "unit" : "units"}
                </h2>
                <button
                  onClick={refresh}
                  className="ml-auto text-text-3 hover:text-text-2 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {units.map((unit: BusinessUnit, i: number) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    agents={agentsForUnit(unit.id)}
                    groups={groupsForUnit(unit.id)}
                    index={i}
                    onCreateAgent={handleCreateAgent}
                    onCreateGroup={handleCreateGroup}
                    onDeleteGroup={handleDeleteGroup}
                    onDeleteUnit={handleDeleteUnit}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-48 glass rounded-2xl text-center px-6"
    >
      <p className="text-text-3 text-sm">{message}</p>
    </motion.div>
  );
}
