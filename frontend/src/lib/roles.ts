import type { UserRole } from "../types";

/**
 * L'API travaille avec des constantes techniques (SUPER_ADMIN, CITIZEN...),
 * mais l'interface ne doit jamais afficher ces valeurs brutes à l'utilisateur.
 * Ce mapping centralise la traduction technique -> libellé humain.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN: "Administrateur",
  AGENT: "Agent de terrain",
  CITIZEN: "Citoyen",
};

export function roleLabel(role: UserRole | string | undefined | null): string {
  if (!role) return "—";
  return ROLE_LABELS[role as UserRole] ?? role;
}
