import { apiClient } from "./client";
import type { User, UserRole } from "../types";

export async function listUsers(): Promise<User[]> {
  const { data } = await apiClient.get("/api/admin/users");
  return data;
}

export async function updateUserRole(userId: number, role: UserRole): Promise<User> {
  const { data } = await apiClient.put(`/api/admin/users/${userId}/role`, { role });
  return data;
}

export async function updateUserStatus(userId: number, is_active: boolean): Promise<User> {
  const { data } = await apiClient.put(`/api/admin/users/${userId}/status`, { is_active });
  return data;
}

export async function deleteUser(userId: number): Promise<void> {
  await apiClient.delete(`/api/admin/users/${userId}`);
}
