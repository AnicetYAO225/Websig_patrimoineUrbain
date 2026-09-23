import type { ReactNode } from "react";
import { Cartouche } from "./Panel";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-900 px-4 py-10">
      {/* Image de fond pleine page, désaturée et assombrie pour la lisibilité */}
      <img
        src="/login-background.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover grayscale"
      />
      <div className="absolute inset-0 bg-ink-900/75" />
      <div className="grid-paper absolute inset-0" />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <Cartouche className="animate-rise-in w-full p-8">
          <div className="flex flex-col items-center text-center">
            <img src="/logo-mark.png" alt="WebSIG" className="h-14 w-14" />
            <p className="mt-3 font-display text-base font-semibold text-ink-900">WebSIG</p>
            <p className="font-data text-[10px] uppercase tracking-widest text-ink-500">
              Patrimoine Urbain
            </p>
          </div>

          <div className="mt-6">{children}</div>
        </Cartouche>

        {/* --- Signature : crédit du concepteur, intégré sobrement --- */}
        <div className="mt-6 flex items-center gap-3">
          <img
            src="/profile-photo.jpg"
            alt="Anicet Yao"
            className="h-9 w-9 rounded-full object-cover ring-1 ring-white/30"
          />
          <div className="leading-tight">
            <p className="text-xs font-medium text-white">Anicet Yao</p>
            <p className="font-data text-[11px] text-white/60">Géomaticien - Développeur SIGWeb</p>
          </div>
        </div>
      </div>
    </div>
  );
}
