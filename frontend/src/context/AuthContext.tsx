import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import type { LoginPayload, User } from "../types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // isLoading = true tant qu'on n'a pas vérifié si un token existant est
  // encore valide (évite un "flash" vers la page de login au rechargement).
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("websig_token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    authApi
      .getCurrentUser()
      .then(setUser)
      .catch(() => localStorage.removeItem("websig_token"))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(payload: LoginPayload) {
    const token = await authApi.login(payload);
    localStorage.setItem("websig_token", token);
    const me = await authApi.getCurrentUser();
    setUser(me);
  }

  function logout() {
    localStorage.removeItem("websig_token");
    setUser(null);
  }

  // Recharge l'utilisateur courant depuis l'API (après upload d'avatar,
  // changement de nom d'utilisateur, etc.) pour que toute l'app (sidebar
  // incluse) reflète immédiatement les nouvelles données.
  async function refreshUser() {
    const me = await authApi.getCurrentUser();
    setUser(me);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook pratique pour consommer le contexte depuis n'importe quel composant :
// const { user, login, logout } = useAuth();
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur d'un <AuthProvider>");
  return ctx;
}
