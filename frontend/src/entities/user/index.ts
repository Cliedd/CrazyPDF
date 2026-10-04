export type User = {id:string;name:string;email:string};

import { api } from '../../shared/api';
export let user: User | null = null;
export function setUser(value: User | null) { user = value; }
export async function loadUser() { setUser(await api<User>('/auth/me').catch(() => null)); }
export async function requireAuth(): Promise<boolean> {
  if (user) return true;
  window.dispatchEvent(new CustomEvent('auth:required'));
  return false;
}
