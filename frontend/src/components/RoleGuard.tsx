import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types";

/**
 * Cache son contenu (ou affiche un message) si le rôle de l'utilisateur
 * connecté ne fait pas partie de `roles`.
 *
 * IMPORTANT : c'est un confort UI, pas une mesure de sécurité — le vrai
 * contrôle d'accès (RBAC) est fait côté backend (voir app/api/deps.py,
 * `require_roles`). Un utilisateur malveillant pourrait toujours appeler
 * l'API directement ; c'est le backend qui refuse (403), pas ce composant.
 */
export function RoleGuard({
  roles,
  children,
  fallback = null,
}: {
  roles: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
