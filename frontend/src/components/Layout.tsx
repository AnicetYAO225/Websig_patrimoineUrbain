import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { RoleGuard } from "./RoleGuard";
import { getAvatarUrl, getInitials } from "../lib/avatar";
import { roleLabel } from "../lib/roles";

const navItems = [
  { to: "/dashboard", label: "Tableau de bord", code: "01" },
  { to: "/map", label: "Carte", code: "02" },
  { to: "/layers", label: "Couches", code: "03" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const avatarUrl = getAvatarUrl(user);
  // Sidebar repliée par défaut sur mobile : sur desktop (md+), elle reste
  // toujours visible et cet état n'a aucun effet (voir classes de <aside>).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive
      ? "bg-white text-ink-900 font-medium shadow-sm"
      : "text-white/65 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <div className="flex h-screen flex-col bg-paper-100 print:hidden">
      {/* --- Barre supérieure --- */}
      <header className="rounded-lg flex h-13 flex-shrink-0 items-center justify-between border-b border-ink-300/40 border-t-2 border-t-copper-600 bg-white px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Bouton menu, visible seulement en dessous de md */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-700 hover:bg-paper-100 md:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu size={18} />
          </button>

          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center">
            <img src="/logo-mark.png" alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="font-display text-sm font-semibold text-ink-900">WebSIG</p>
            <p className="hidden font-data text-[10px] uppercase tracking-widest text-ink-500 sm:block">
              Patrimoine Urbain
            </p>
          </div>
        </div>

        <NavLink to="/profil" className="flex items-center gap-2 hover:opacity-80 sm:gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium text-ink-900">{user?.username}</p>
            <p className="font-data text-[10px] uppercase tracking-wide text-ink-500">{roleLabel(user?.role)}</p>
          </div>
          {avatarUrl ? (
            <img src={avatarUrl} alt={user?.username} className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-copper-600 text-xs font-semibold text-white">
              {user ? getInitials(user.username) : "?"}
            </div>
          )}
        </NavLink>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Fond assombri derrière le tiroir, mobile uniquement */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-30 bg-ink-900/50 md:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
        )}

        {/* --- Sidebar navigation ---
            Mobile : tiroir superposé (position fixed, coulisse depuis la gauche).
            Desktop (md+) : colonne statique toujours visible, comme avant. */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-shrink-0 flex-col bg-ink-900 py-4 shadow-xl transition-transform duration-200 ease-out
            md:static md:z-auto md:w-60 md:translate-x-0 md:shadow-none
            ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <button
            onClick={() => setMobileNavOpen(false)}
            className="mb-2 flex h-9 w-9 flex-shrink-0 items-center justify-center self-end rounded-lg px-3 text-white/60 hover:bg-white/5 md:hidden"
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>

          <nav className="flex-1 space-y-1 px-3">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass} onClick={() => setMobileNavOpen(false)}>
                {item.label}
              </NavLink>
            ))}

            {/* Visible seulement pour ADMIN et SUPER_ADMIN */}
            <RoleGuard roles={["ADMIN", "SUPER_ADMIN"]}>
              <NavLink to="/admin" className={navLinkClass} onClick={() => setMobileNavOpen(false)}>
                Administration
              </NavLink>
            </RoleGuard>
          </nav>

          <div className="mt-4 border-t border-white/10 px-3 pt-4">
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-white/10">
                <LogOut size={13} strokeWidth={2} />
              </span>
              Déconnexion
            </button>
          </div>
        </aside>

        {/* --- Contenu principal --- */}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
