import axios from "axios";

// URL du backend FastAPI. En dev, Vite lit VITE_API_URL depuis le fichier
// .env du frontend (voir .env.example). Par défaut : localhost:8000.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: API_URL,
});

// Intercepteur de requête : ajoute automatiquement le header
// "Authorization: Bearer <token>" sur chaque appel si un token est stocké.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("websig_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercepteur de réponse : si le token est invalide/expiré (401), on
// déconnecte proprement l'utilisateur et on le renvoie vers /login.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("websig_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
