import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Trash2, Users } from "lucide-react";
import { Layout } from "../components/Layout";
import { Cartouche, SectionLabel, StatusDot, TABLE_HEAD_CLASS } from "../components/Panel";
import { useAuth } from "../context/AuthContext";
import * as usersApi from "../api/users";
import { ROLE_LABELS } from "../lib/roles";
import type { User, UserRole } from "../types";

const ROLES: UserRole[] = ["CITIZEN", "AGENT", "ADMIN", "SUPER_ADMIN"];
const PAGE_SIZE = 8;

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [page, setPage] = useState(1);

  function refresh() {
    setIsLoading(true);
    usersApi.listUsers().then((data) => {
      setUsers(data);
      setIsLoading(false);
    });
  }

  useEffect(refresh, []);

  async function handleRoleChange(userId: number, role: UserRole) {
    // Le backend refuse de toute façon si l'utilisateur courant n'est pas
    // SUPER_ADMIN (403) : ce composant n'a donc pas besoin de le vérifier lui-même.
    await usersApi.updateUserRole(userId, role);
    refresh();
  }

  async function handleToggleActive(u: User) {
    await usersApi.updateUserStatus(u.id, !u.is_active);
    refresh();
  }

  async function handleDelete(userId: number) {
    if (!confirm("Supprimer définitivement cet utilisateur ?")) return;
    await usersApi.deleteUser(userId);
    refresh();
  }

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        !search.trim() ||
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateRoleFilter(value: UserRole | "ALL") {
    setRoleFilter(value);
    setPage(1);
  }

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="font-data text-xs uppercase tracking-widest text-copper-600">Administration</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">
          Gestion des utilisateurs
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {isSuperAdmin
            ? "En tant que Super administrateur, vous pouvez changer les rôles et supprimer des comptes."
            : "En tant qu'Administrateur, vous pouvez activer ou désactiver des comptes. Le changement de rôle est réservé au Super administrateur."}
        </p>

        <Cartouche className="mt-6 p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionLabel icon={Users}>
              {filtered.length} utilisateur{filtered.length > 1 ? "s" : ""}
            </SectionLabel>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="rounded-lg flex flex-1 items-center border border-ink-300/40 bg-white sm:flex-none">
                <span className="pl-2.5 text-ink-400">
                  <Search size={14} />
                </span>
                <input
                  value={search}
                  onChange={(e) => updateSearch(e.target.value)}
                  placeholder="Rechercher un utilisateur..."
                  className="w-full px-2.5 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 sm:w-auto"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => updateRoleFilter(e.target.value as UserRole | "ALL")}
                className="rounded-lg border border-ink-300/40 bg-white px-2.5 py-2 text-sm text-ink-700 outline-none"
              >
                <option value="ALL">Tous les rôles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg overflow-x-auto border border-ink-300/30">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className={TABLE_HEAD_CLASS}>
                <tr>
                  <th className="px-4 py-2.5 font-medium">Utilisateur</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Rôle</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-300/20">
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-400">
                      Chargement...
                    </td>
                  </tr>
                )}
                {!isLoading && pageItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-400">
                      Aucun utilisateur ne correspond à ces critères.
                    </td>
                  </tr>
                )}
                {pageItems.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2.5 font-medium text-ink-800">{u.username}</td>
                    <td className="px-4 py-2.5 text-ink-500">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={u.role}
                        disabled={!isSuperAdmin}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                        className="rounded-lg border border-ink-300/40 bg-white px-2 py-1 text-xs text-ink-700 outline-none disabled:bg-paper-100 disabled:text-ink-400"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusDot
                        as="button"
                        active={u.is_active}
                        activeLabel="Actif"
                        inactiveLabel="Désactivé"
                        disabled={u.id === currentUser?.id}
                        onClick={() => handleToggleActive(u)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      {isSuperAdmin && u.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="flex items-center gap-1 text-xs text-signal-600 hover:underline"
                        >
                          <Trash2 size={13} />
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- Pagination --- */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-xs text-ink-500">
              <span>
                Page {page} sur {totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg flex h-7 w-7 items-center justify-center border border-ink-300/40 text-ink-600 disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg flex h-7 w-7 items-center justify-center border border-ink-300/40 text-ink-600 disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </Cartouche>
      </div>
    </Layout>
  );
}
