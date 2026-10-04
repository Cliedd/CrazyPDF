export type User = {id:string;name:string;email:string};

import { api } from '../../shared/api';
export let user: User | null = null;
let revision=0;
let pending:Promise<void>|null=null;
export function setUser(value: User | null) { user = value; revision++; }
export async function loadUser() {
  if(pending)return pending;
  const started=revision;
  pending=api<{user:User|null}>('/auth/session').then(result=>{
    // A response started before login/logout must not overwrite the new account.
    if(revision===started)setUser(result.user);
  }).finally(()=>{pending=null});
  return pending;
}
export async function requireAuth(): Promise<boolean> {
  if (user) return true;
  try{await loadUser()}catch{
    window.dispatchEvent(new CustomEvent('session:unavailable'));
    return false;
  }
  if(user)return true;
  window.dispatchEvent(new CustomEvent('auth:required'));
  return false;
}
