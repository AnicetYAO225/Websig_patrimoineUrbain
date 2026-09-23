import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthShell } from "../components/AuthShell";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      navigate("/dashboard");
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError("Email ou mot de passe incorrect.");
      } else if (!err?.response) {
        // Aucune réponse du tout = le backend n'est pas joignable
        // (arrêté, mauvaise URL VITE_API_URL, CORS...), pas un problème
        // d'identifiants — afficher un message différent évite de chercher
        // au mauvais endroit.
        setError("Impossible de contacter le serveur. Vérifie que le backend est démarré.");
      } else {
        setError("Une erreur est survenue lors de la connexion. Réessaie dans un instant.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-center font-display text-xl font-semibold text-ink-900">Connexion</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="vous@collectivite.fr"
            className="rounded-lg w-full border border-ink-300 px-3 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-copper-600"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700">Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="rounded-lg w-full border border-ink-300 px-3 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-copper-600"
          />
        </div>

        <div className="text-right">
          <Link to="/forgot-password" className="text-xs text-copper-600 hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>

        {error && (
          <p className="border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-sm text-signal-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg w-full bg-ink-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-60"
        >
          {isSubmitting ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-500">
        Pas encore de compte ?{" "}
        <Link to="/register" className="font-medium text-copper-600 hover:underline">
          Créer un compte
        </Link>
      </p>
    </AuthShell>
  );
}
