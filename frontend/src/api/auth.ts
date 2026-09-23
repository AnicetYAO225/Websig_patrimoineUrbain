import { apiClient } from "./client";
import type { LoginPayload, RegisterPayload, User } from "../types";

export async function login(payload: LoginPayload): Promise<string> {
  // Le backend attend un formulaire OAuth2 (form-urlencoded), pas du JSON,
  // avec le champ "username" pour l'email (contrainte d'OAuth2PasswordRequestForm).
  const form = new URLSearchParams();
  form.append("username", payload.email);
  form.append("password", payload.password);

  const { data } = await apiClient.post("/api/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data.access_token as string;
}

export async function register(payload: RegisterPayload): Promise<User> {
  const { data } = await apiClient.post("/api/auth/register", payload);
  return data;
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await apiClient.get("/api/auth/me");
  return data;
}

export async function updateProfile(payload: { username?: string }): Promise<User> {
  const { data } = await apiClient.put("/api/auth/me", payload);
  return data;
}

export async function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<User> {
  const { data } = await apiClient.put("/api/auth/me/password", payload);
  return data;
}

export async function uploadAvatar(file: File): Promise<User> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post("/api/auth/me/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
