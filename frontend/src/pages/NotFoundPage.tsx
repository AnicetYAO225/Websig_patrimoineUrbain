import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-paper-100 text-ink-700">
      <Compass size={40} strokeWidth={1.5} className="text-copper-600" />
      <h1 className="mt-3 font-display text-lg font-semibold text-ink-900">Page introuvable</h1>
      <p className="mt-1 text-sm text-ink-500">Cette page n'existe pas ou plus.</p>
      <Link to="/dashboard" className="mt-4 text-sm font-medium text-copper-600 hover:underline">
        Retour au tableau de bord
      </Link>
    </div>
  );
}
