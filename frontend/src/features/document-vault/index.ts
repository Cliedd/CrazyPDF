import { $, $$, escape, size, toast, download, dialog } from '../../shared/ui';
import { user, requireAuth } from '../../entities/user';
import { api } from '../../shared/api';
import { navigate } from '../../shared/lib/router';
import { titles, type Job } from '../../entities/document';
let jobs:Job[]=[],filter='all',query='';
export async function setupVault(){
  const table=$('table')!;table.classList.add('vault-table');table.parentElement!.classList.add('table-wrap');
  $$('[data-filter]').forEach(btn=>btn.onclick=()=>{filter=btn.dataset.filter!;renderVault()});
  const input=$('input[type="text"],input[type="search"]') as HTMLInputElement;
  if(input){input.setAttribute('aria-label','Rechercher dans mes documents');input.value=query;input.oninput=()=>{query=input.value;renderVault()}}
  $('#batchExportBtn')!.onclick=async()=>{if(!await requireAuth())return;try{const response=await fetch('/api/jobs/export.zip');if(!response.ok)throw new Error('Aucun export disponible.');const url=URL.createObjectURL(await response.blob());download(url);setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e:any){toast(e.message)}};
  $$('button').filter(e=>e.textContent?.includes('Nouveau Document')).forEach(e=>e.onclick=()=>navigate('/'));
  if(!user){$('tbody')!.innerHTML='<tr><td colspan="5" class="empty-vault">Connectez-vous pour retrouver vos documents.<br><button class="primary mt-4" data-action="account">Se connecter gratuitement</button></td></tr>';return}
  try{jobs=await api<Job[]>('/jobs');if(location.pathname==='/documents')renderVault()}catch(e:any){toast(e.message)}
}
function category(j:Job){return ['photo','cutout'].includes(j.mode)?'photo-visa':j.mode.includes('pptx')?'pptx':'word-pdf'}
export function renderVault(){
  if(location.pathname!=='/documents')return;
  const labels:Record<string,string>={all:'Tous','word-pdf':'Conversions Word/PDF',pptx:'Présentations PPTX','photo-visa':'Photos & détourage'};
  $$('[data-filter]').forEach(btn=>{const f=btn.dataset.filter!;btn.textContent=`${labels[f]} (${jobs.filter(j=>f==='all'||category(j)===f).length})`;btn.classList.toggle('bg-surface-container-lowest',filter===f);btn.setAttribute('aria-pressed',String(filter===f))});
  const visible=jobs.filter(j=>(filter==='all'||category(j)===filter)&&j.filename.toLowerCase().includes(query.toLowerCase()));
  $('tbody')!.innerHTML=visible.length?visible.map(j=>`<tr class="border-b border-outline-variant/40"><td class="p-4"><strong>${escape(j.filename)}</strong><p class="text-sm text-on-surface-variant">${new Date(j.created*1000).toLocaleString('fr-FR')} · ${j.id.slice(0,8)}</p></td><td class="p-4">${escape(titles[j.mode])}</td><td class="p-4">${j.size?size(j.size):'—'}<p class="text-sm">${j.metadata.width_px?j.metadata.width_px+' × '+j.metadata.height_px+' px':''}${j.metadata.pages?j.metadata.pages+' pages':''}</p></td><td class="p-4"><span class="${j.status==='failed'?'job-error':'text-secondary'}">${j.status==='completed'?'Export prêt':j.status==='processing'?'Traitement en cours':j.status==='queued'?'En attente':'Échec'}</span><p class="text-sm">${escape(j.error||j.metadata.note||j.metadata.status||'')}</p></td><td class="p-4 whitespace-nowrap">${j.download_url?`<a class="vault-action" title="Télécharger" aria-label="Télécharger ${escape(j.filename)}" href="${j.download_url}"><span class="material-symbols-outlined">download</span></a><button class="vault-action" title="Aperçu" aria-label="Aperçu de ${escape(j.filename)}" data-preview="${j.id}"><span class="material-symbols-outlined">visibility</span></button>`:j.status==='failed'?`<button class="vault-action" data-retry="${j.id}">Réessayer</button>`:''}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-vault">'+(jobs.length?'Aucun document ne correspond à cette recherche.':'Votre coffre-fort est prêt. Importez votre premier document ou votre photo.')+'</td></tr>';
  const empty=$('#emptyState');if(empty)empty.hidden=true;
  // Replace mock statistics without disturbing the original card composition.
  $$('main div,main span').filter(e=>e.children.length===0&&/5 Documents Disponibles/.test(e.textContent||'')).forEach(e=>e.textContent=`${jobs.length} documents archivés`);
}
export async function preview(id:string){const job=jobs.find(j=>j.id===id)!;const url=job.download_url!+'?inline=true';const image=['photo','cutout'].includes(job.mode)&&job.metadata.export_type!=='sheet';dialog(`<h2>${escape(job.filename)}</h2>${image?`<img src="${url}" alt="Aperçu de l’export">`:['word-pdf','pptx-pdf'].includes(job.mode)||job.metadata.export_type==='sheet'?`<iframe src="${url}" title="Aperçu du PDF"></iframe>`:'<p class="notice">Téléchargez ce fichier pour l’ouvrir dans votre application.</p>'}<div class="dialog-actions"><a class="primary" href="${job.download_url}">Télécharger gratuitement</a></div>`)}

setInterval(()=>{if(location.pathname==='/documents'&&user&&jobs.some(j=>['queued','processing'].includes(j.status)))api<Job[]>('/jobs').then(data=>{jobs=data;renderVault()}).catch(()=>{})},2000);
