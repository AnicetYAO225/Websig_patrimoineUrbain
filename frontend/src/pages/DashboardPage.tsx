import { useEffect, useState } from "react";
import { MapPin, Eye, ShieldCheck, Table2 } from "lucide-react";
import { Layout } from "../components/Layout";
import { Cartouche, SectionLabel, KpiRow, StatusDot, TABLE_HEAD_CLASS } from "../components/Panel";
import * as layersApi from "../api/layers";
import { useAuth } from "../context/AuthContext";
import { roleLabel } from "../lib/roles";
import type { Layer } from "../types";

export function DashboardPage() {
  const { user } = useAuth();
  const [layers, setLayers] = useState<Layer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    layersApi
      .listLayers()
      .then(setLayers)
      .finally(() => setIsLoading(false));
  }, []);

  const totalFeatures = layers.reduce((sum, l) => sum + l.feature_count, 0);
  const visibleLayers = layers.filter((l) => l.is_visible).length;

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="font-data text-xs uppercase tracking-widest text-copper-600">Tableau de bord</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">
          Bienvenue, {user?.username}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Vue d'ensemble du patrimoine urbain géré sur la plateforme.
        </p>

        {isLoading ? (
          <p className="mt-6 text-sm text-ink-500">Chargement...</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-3 lg:gap-8">
            {/* --- Panneau indicateurs, façon légende de carte --- */}
            <Cartouche className="p-5 lg:col-span-1">
              <SectionLabel>Indicateurs clés</SectionLabel>
              <div className="space-y-2">
                <KpiRow icon={Table2} label="Couches SIG" value={layers.length} tone="ink" />
                <KpiRow icon={MapPin} label="Objets géographiques" value={totalFeatures} tone="ink" />
                <KpiRow icon={Eye} label="Couches visibles" value={visibleLayers} tone="ink" />
                <KpiRow icon={ShieldCheck} label="Votre rôle" value={roleLabel(user?.role)} tone="ink" />
              </div>
            </Cartouche>

            {/* --- Détail par couche --- */}
            <Cartouche className="p-5 lg:col-span-2">
              <SectionLabel icon={Table2}>Détail par couche</SectionLabel>
              <div className="rounded-lg overflow-x-auto border border-ink-300/30">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className={TABLE_HEAD_CLASS}>
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Couche</th>
                      <th className="px-4 py-2.5 font-medium">Géométrie</th>
                      <th className="px-4 py-2.5 font-medium">Objets</th>
                      <th className="px-4 py-2.5 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-300/20">
                    {layers.map((layer) => (
                      <tr key={layer.id}>
                        <td className="px-4 py-2.5 font-medium text-ink-800">{layer.name}</td>
                        <td className="font-data px-4 py-2.5 text-ink-500">{layer.geometry_type}</td>
                        <td className="font-data px-4 py-2.5 text-ink-500">{layer.feature_count}</td>
                        <td className="px-4 py-2.5">
                          <StatusDot active={layer.is_visible} activeLabel="Visible" inactiveLabel="Masquée" />
                        </td>
                      </tr>
                    ))}
                    {layers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-ink-400">
                          Aucune couche pour le moment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Cartouche>
          </div>
        )}
      </div>
    </Layout>
  );
}
