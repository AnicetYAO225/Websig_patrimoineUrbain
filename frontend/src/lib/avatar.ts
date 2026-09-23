import { API_URL } from "../api/client";
import type { User } from "../types";

/**
 * L'API renvoie `avatar_url` en chemin relatif (ex: "/media/avatars/xxx.jpg").
 * Cette fonction le transforme en URL absolue pointant vers le backend,
 * utilisable directement dans un <img src=... />.
 */
export function getAvatarUrl(user: User | null | undefined): string | null {
  if (!user?.avatar_url) return null;
  return `${API_URL}${user.avatar_url}`;
}

/** Initiales affichées comme avatar de secours quand aucune photo n'est définie. */
export function getInitials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}
