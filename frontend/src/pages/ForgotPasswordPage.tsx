import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <AuthShell>
      <h1 className="text-center font-display text-xl font-semibold text-ink-900">
        Mot de passe oublié
      </h1>

      {submitted ? (
        <p className="mt-6 border-l-2 border-pine-700 bg-pine-100 px-3 py-3 text-sm text-pine-700">
          Si un compte existe pour <strong>{email}</strong>, un administrateur de la plateforme a été
          notifié de ta demande de réinitialisation. En attendant, tu peux aussi contacter directement
          un administrateur.
        </p>
      ) : (
        <>
          <p className="mt-1 text-center text-xs text-ink-500">
            La réinitialisation automatique par email n'est pas encore disponible. Un administrateur
            peut réinitialiser ton mot de passe manuellement.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

            <button
              type="submit"
              className="rounded-lg w-full bg-ink-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-copper-600"
            >
              Envoyer la demande
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-xs text-ink-500">
        <Link to="/login" className="font-medium text-copper-600 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </AuthShell>
  );
}
