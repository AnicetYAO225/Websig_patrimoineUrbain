import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, KeyRound, User as UserIcon } from "lucide-react";
import { Layout } from "../components/Layout";
import { Cartouche, SectionLabel } from "../components/Panel";
import { useAuth } from "../context/AuthContext";
import * as authApi from "../api/auth";
import { getAvatarUrl, getInitials } from "../lib/avatar";
import { roleLabel } from "../lib/roles";
import { getErrorMessage } from "../lib/errors";

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user?.username ?? "");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  if (!user) return null;

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileMessage(null);
    setProfileError(null);
    try {
      await authApi.updateProfile({ username });
      await refreshUser();
      setProfileMessage("Profil mis à jour.");
    } catch (err: any) {
      setProfileError(getErrorMessage(err, "Erreur lors de la mise à jour."));
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    try {
      await authApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      setPasswordMessage("Mot de passe modifié avec succès.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPasswordError(getErrorMessage(err, "Erreur lors du changement de mot de passe."));
    }
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      await authApi.uploadAvatar(file);
      await refreshUser();
    } catch (err: any) {
      setAvatarError(getErrorMessage(err, "Erreur lors de l'envoi de la photo."));
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const avatarUrl = getAvatarUrl(user);

  return (
    <Layout>
      <div className="mx-auto max-w-2xl p-8">
        <p className="font-data text-xs uppercase tracking-widest text-copper-600">Compte</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">Mon profil</h1>
        <p className="mt-1 text-sm text-ink-500">Gère tes informations personnelles.</p>

        {/* --- Photo de profil --- */}
        <Cartouche className="mt-6 flex items-center gap-5 p-5">
          {avatarUrl ? (
            <img src={avatarUrl} alt={user.username} className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-copper-600 text-xl font-semibold text-white">
              {getInitials(user.username)}
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-ink-800">Photo de profil</p>
            <p className="text-xs text-ink-500">JPG, PNG ou WEBP, 2 Mo max.</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="rounded-lg mt-2 flex items-center gap-1.5 border border-ink-300 px-3 py-1.5 text-xs text-ink-700 hover:bg-paper-100 disabled:opacity-60"
            >
              <Camera size={13} />
              {isUploadingAvatar ? "Envoi..." : "Changer la photo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
            {avatarError && <p className="mt-2 text-xs text-signal-600">{avatarError}</p>}
          </div>
        </Cartouche>

        {/* --- Informations --- */}
        <Cartouche className="mt-6 p-5">
          <SectionLabel icon={UserIcon}>Informations</SectionLabel>
          <form onSubmit={handleProfileSubmit}>
            <label className="mb-1 block text-xs font-medium text-ink-700">Nom d'utilisateur</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              className="rounded-lg mb-3 w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
            />

            <label className="mb-1 block text-xs font-medium text-ink-700">Email</label>
            <input
              value={user.email}
              disabled
              className="rounded-lg mb-1 w-full border border-ink-300/50 bg-paper-100 px-3 py-2 text-sm text-ink-400"
            />
            <p className="mb-3 text-xs text-ink-400">L'email ne peut pas être modifié.</p>

            <div className="mb-3">
              <span className="font-data rounded-full bg-copper-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-copper-600">
                {roleLabel(user.role)}
              </span>
            </div>

            {profileMessage && <p className="mb-3 text-sm text-pine-700">{profileMessage}</p>}
            {profileError && <p className="mb-3 text-sm text-signal-600">{profileError}</p>}

            <button
              type="submit"
              className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-copper-600"
            >
              Enregistrer
            </button>
          </form>
        </Cartouche>

        {/* --- Mot de passe --- */}
        <Cartouche className="mt-6 p-5">
          <SectionLabel icon={KeyRound}>Mot de passe</SectionLabel>
          <form onSubmit={handlePasswordSubmit}>
            <label className="mb-1 block text-xs font-medium text-ink-700">Mot de passe actuel</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="rounded-lg mb-3 w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
            />

            <label className="mb-1 block text-xs font-medium text-ink-700">Nouveau mot de passe</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="rounded-lg mb-3 w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
            />

            {passwordMessage && <p className="mb-3 text-sm text-pine-700">{passwordMessage}</p>}
            {passwordError && <p className="mb-3 text-sm text-signal-600">{passwordError}</p>}

            <button
              type="submit"
              className="rounded-lg border border-ink-900 px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-white"
            >
              Mettre à jour le mot de passe
            </button>
          </form>
        </Cartouche>
      </div>
    </Layout>
  );
}
