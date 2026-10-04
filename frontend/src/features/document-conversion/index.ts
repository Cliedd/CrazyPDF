import { $, $$, escape, toast } from '../../shared/ui';
import { requireAuth } from '../../entities/user';
import { submit, waitJob, titles } from '../../entities/document';
import { navigate } from '../../shared/lib/router';
export let mode='word-pdf';
export function chooseMode(value:string){mode=value}
export function setupHome(){
  const fileInput=$('#file-upload') as HTMLInputElement;
  fileInput.multiple=true;
  const dropzone=$('#dropzone')!;
  dropzone.setAttribute('role','button');dropzone.tabIndex=0;dropzone.setAttribute('aria-label','Importer un document à convertir');
  dropzone.addEventListener('click',async(e)=>{if((e.target as HTMLElement).closest('#job-results'))return;if(await requireAuth())fileInput.click()});
  fileInput.addEventListener('click',e=>e.stopPropagation());
  fileInput.addEventListener('change',()=>{if(fileInput.files)convertFiles(Array.from(fileInput.files));fileInput.value=''});
  dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.classList.add('ring-2','ring-primary')});
  dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('ring-2','ring-primary'));
  dropzone.addEventListener('drop',async e=>{e.preventDefault();dropzone.classList.remove('ring-2','ring-primary');if(await requireAuth())convertFiles(Array.from(e.dataTransfer?.files||[]))});
  $('#progress-indicator')?.remove();
  dropzone.parentElement!.insertAdjacentHTML('beforeend','<div id="job-results" aria-live="polite"></div>');
  $$('.tab-btn').forEach(btn=>btn.onclick=()=>btn.dataset.mode==='visa-studio'?navigate('/studio'):setMode(btn.dataset.mode!));
  setMode(mode);
  $$('a,button').filter(e=>!e.closest('header')&&!e.closest('footer')).forEach(el=>{
    const text=el.textContent?.trim()||'';
    if(/Activer mon coffre|Google ou Email/.test(text))el.dataset.action='account';
    else if(/^Convertir/.test(text))el.dataset.action='mode-word';
    else if(/^Traiter/.test(text))el.dataset.action='mode-pptx';
    else if(/^Calibrer|Tester le studio/.test(text))el.dataset.action='studio';
    else if(/^Détourer/.test(text))el.dataset.action='background';
    else if(/Commencer maintenant/.test(text))el.dataset.action='start';
  });
}
export function setMode(value:string){
  mode=value;
  $$('.tab-btn').forEach(btn=>{const active=btn.dataset.mode===mode;btn.classList.toggle('bg-primary',active);btn.classList.toggle('text-on-primary',active);btn.setAttribute('aria-selected',String(active));btn.setAttribute('role','tab')});
  const extension=mode==='word-pdf'?'.docx,.doc':mode==='pptx-pdf'?'.pptx,.ppt':'.pdf';
  ($('#file-upload') as HTMLInputElement).accept=extension;
  $('#dropzone-title')!.textContent=`Glissez et déposez ${mode.startsWith('pdf')?'votre PDF':mode==='word-pdf'?'votre document Word':'votre présentation'} ici`;
  $('#cta-label')!.textContent=`Choisir un fichier (${extension.split(',')[0]})`;
  $('#dropzone-desc')!.textContent=mode==='pdf-pptx'?'Chaque page sera une image dans une diapositive PowerPoint.':mode==='pdf-word'?'Texte modifiable, avec OCR pour les pages numérisées. Vérifiez la mise en page.':'Les fichiers sont traités sur le serveur et archivés dans votre compte.';
}
async function convertFiles(files:File[]){
  if(!await requireAuth())return;if(files.length>20){toast('20 fichiers maximum par lot.');return}
  const selectedMode=mode, version=location.pathname;
  for(const file of files){
    const container=$('#job-results');if(!container)break;
    const row=document.createElement('div');row.className='job-card';row.innerHTML=`<div><strong>${escape(file.name)}</strong><p>${escape(titles[selectedMode])} · <span class="job-status">Envoi…</span></p></div>`;container.prepend(row);
    try{const initial=await submit(file,selectedMode);waitJob(initial,j=>{const status=$('.job-status',row);if(status)status.textContent=j.status==='queued'?'En attente':j.status==='processing'?'Traitement en cours':j.status==='completed'?'Prêt':'Échec'}).then(j=>{row.insertAdjacentHTML('beforeend',`<a class="secondary-button" href="${j.download_url}">Télécharger gratuitement</a>`);toast(`${file.name} : export prêt.`)}).catch(e=>{$('.job-status',row)!.textContent=e.message;row.classList.add('job-error')})}catch(e:any){$('.job-status',row)!.textContent=e.message;row.classList.add('job-error')}
    if(version!==location.pathname)break;
  }
}
