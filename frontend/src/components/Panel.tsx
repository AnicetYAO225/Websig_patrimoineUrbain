import type { ReactNode } from "react";
import { PanelBottom, type LucideIcon } from "lucide-react";

/** Cadre "cartouche" (coins arrondis, ombre légère) réutilisé partout dans l'app. */
export function Cartouche({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`cartouche ${className}`}>{children}</div>;
}

/** En-tête de section en petites capitales, avec icône optionnelle — inspiré des cartouches topographiques. */
export function SectionLabel({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 font-data text-[11px] font-medium uppercase tracking-widest text-ink-500">
      {Icon && <Icon size={13} strokeWidth={2} className="text-copper-600" />}
      {children}
    </p>
  );
}

/** Ligne d'indicateur clé : icône en pastille + libellé + valeur, réutilisée dans Dashboard et panneaux carte. */
export function KpiRow({
  icon: Icon,
  label,
  value,
  tone = "ink",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: "ink" | "copper" | "pine";
}) {
  const toneClasses = {
    ink: "bg-ink-900/5 text-ink-700",
    copper: "bg-copper-100 text-copper-600",
    pine: "bg-pine-100 text-pine-700",
  }[tone];

  return (
    <div className="rounded-lg flex items-center gap-3 border border-ink-300/30 bg-white px-3 py-2.5">
      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${toneClasses}`}>
        <Icon size={15} strokeWidth={2} />
      </span>
      <span className="flex-1 text-sm text-ink-700">{label}</span>
      <span className="font-data text-sm text-ink-900">{value}</span>
    </div>
  );
}

/**
 * Indicateur de statut discret (point de couleur + texte en casse normale),
 * pensé pour remplacer les badges pilule uppercase répétés dans les tableaux.
 * `as="button"` permet de le rendre cliquable (ex: bascule actif/inactif).
 */
export function StatusDot({
  active,
  activeLabel,
  inactiveLabel,
  as = "span",
  onClick,
  disabled,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  as?: "span" | "button";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const dot = (
    <span
      className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${active ? "bg-pine-600" : "bg-ink-300"
        }`}
    />
  );

  if (as === "button") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 text-xs text-ink-600 disabled:opacity-50"
      >
        {dot}
        {active ? activeLabel : inactiveLabel}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
      {dot}
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

/** Classe partagée pour les en-têtes de tableau : sobre, casse normale (pas de majuscules criées partout). */
export const TABLE_HEAD_CLASS = "bg-paper-100 text-xs font-medium text-ink-500";
