import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as authApi from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { AuthShell } from "../components/AuthShell";
import { getErrorMessage } from "../lib/errors";

export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await authApi.register({ username, email, password });
      await login({ email, password });
      navigate("/dashboard");
    } catch (err: any) {
      setError(getErrorMessage(err, "Erreur lors de l'inscription."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-center font-display text-xl font-semibold text-ink-900">Créer un compte</h1>
      <p className="mt-1 text-center text-xs text-ink-500">Accès citoyen — consultation et signalement</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700">Nom d'utilisateur</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            className="rounded-lg w-full border border-ink-300 px-3 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-copper-600"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
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
            minLength={8}
            className="rounded-lg w-full border border-ink-300 px-3 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-copper-600"
          />
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
          {isSubmitting ? "Création..." : "Créer mon compte"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-500">
        Déjà un compte ?{" "}
        <Link to="/login" className="font-medium text-copper-600 hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
