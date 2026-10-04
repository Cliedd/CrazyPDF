import { user, setUser, type User } from '../../entities/user';
import { api } from '../../shared/api';
import { $, dialog, close, escape, toast } from '../../shared/ui';
let authMode='login';
export function showAuth(){
  if(user){showAccount();return}
  const register=authMode==='register';
  dialog(`<div class="text-primary font-bold mb-4">DocuVisa.AI · 100% gratuit</div><h2>${register?'Créer mon compte':'Bienvenue dans votre studio'}</h2><p>Connectez-vous pour traiter vos fichiers et retrouver vos exports.</p><form id="auth-form">${register?'<label>Votre nom<input name="name" autocomplete="name" required maxlength="100"></label>':''}<label>Adresse email<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Mot de passe<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="10" maxlength="128" required></label><p class="text-sm text-on-surface-variant">10 caractères minimum. Vos exports sont conservés dans votre compte ; l’interface ne propose pas de suppression.</p><p class="error" id="auth-error" role="alert"></p><button class="primary" type="submit">${register?'Créer mon compte gratuit':'Se connecter'}</button></form><div class="dialog-actions"><button class="secondary-button" data-action="auth-switch">${register?'J’ai déjà un compte':'Créer un compte gratuit'}</button><a class="secondary-button" id="google-login" href="/api/auth/google" hidden>Continuer avec Google</a></div>`);
  api('/config').then(c=>{const link=$('#google-login');if(link&&c.google_enabled)link.hidden=false}).catch(()=>{});
}
export function showAccount(){
  if(!user){showAuth();return}
  dialog(`<h2>Mon compte</h2><p>${escape(user.email)}</p><form id="profile-form"><label>Votre nom<input name="name" required maxlength="100" value="${escape(user.name)}"></label><p class="error" id="auth-error"></p><button class="primary">Enregistrer</button></form><div class="dialog-actions"><button class="secondary-button" data-action="vault">Mes documents</button><button class="secondary-button" data-action="logout">Se déconnecter</button></div><p class="notice">Vos fichiers sont personnels. Aucun bouton de suppression n’est proposé dans le coffre-fort. Consultez la politique de confidentialité pour les questions de données personnelles.</p>`)
}

export function switchAuth(){authMode=authMode==='login'?'register':'login';showAuth()}
export async function logout(){await api('/auth/logout',{method:'POST'});setUser(null);close();window.dispatchEvent(new CustomEvent('account:changed'));toast('Vous êtes déconnecté.')}
document.addEventListener('submit',async event=>{
  const form=event.target as HTMLFormElement;if(!['auth-form','profile-form'].includes(form.id))return;event.preventDefault();const data=Object.fromEntries(new FormData(form));
  const btn=$('button[type="submit"],button.primary',form) as HTMLButtonElement;btn.disabled=true;
  try{const result=await api<User>(form.id==='profile-form'?'/auth/me':'/auth/'+authMode,{method:form.id==='profile-form'?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});setUser(result);close();window.dispatchEvent(new CustomEvent('account:changed'));toast(form.id==='profile-form'?'Profil enregistré.':'Bienvenue '+result.name+' !')}catch(e:any){$('#auth-error')!.textContent=e.message}finally{btn.disabled=false}
});
