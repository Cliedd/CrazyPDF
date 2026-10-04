import { $$ } from '../../shared/ui';
import { user } from '../../entities/user';
export function navigation(){
  $$('[data-path="connexion-et-compte"] span:last-child').forEach(e=>e.textContent=user?user.name:'Connexion / Mon Compte');
  // Language is a real preference; the initial release retains the French design.
  $$('header span').filter(e=>e.textContent?.trim()==='EN').forEach(e=>{e.setAttribute('role','button');e.tabIndex=0;e.dataset.action='language'});
}
