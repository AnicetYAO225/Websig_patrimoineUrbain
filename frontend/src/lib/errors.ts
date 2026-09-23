/**
 * FastAPI renvoie `detail` sous deux formes différentes selon le type
 * d'erreur :
 * - une chaîne de texte pour les erreurs métier (ex: "Email déjà utilisé")
 * - un TABLEAU d'objets {loc, msg, type...} pour les erreurs de validation
 *   Pydantic (422) — ex: mot de passe trop court, email mal formé
 *
 * Afficher ce tableau directement dans du JSX (`{error}`) fait planter
 * React ("Objects are not valid as a React child"). Cette fonction
 * normalise les deux cas en une chaîne lisible.
 */
export function getErrorMessage(err: any, fallback = "Une erreur est survenue."): string {
  // Aucune réponse du tout = le backend n'est pas joignable (arrêté,
  // mauvaise URL VITE_API_URL, CORS...) — un message différent évite de
  // faire chercher le problème du mauvais côté (identifiants, formulaire...).
  if (!err?.response) {
    return "Impossible de contacter le serveur. Vérifie que le backend est démarré et accessible.";
  }

  const detail = err.response?.data?.detail;

  if (!detail) return fallback;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => {
        if (typeof d === "string") return d;
        const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null;
        return field ? `${field} : ${d.msg}` : d.msg;
      })
      .filter(Boolean)
      .join(" · ");
  }

  return fallback;
}
