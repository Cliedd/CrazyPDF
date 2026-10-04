import { $, $$, escape, toast, busy, download } from '../../shared/ui';
import { requireAuth } from '../../entities/user';
import { submit, waitJob, fileUrl } from '../../entities/document';
export let backgroundFiles:File[]=[];export let selectedFile=0;let backgroundColor='#FFFFFF',comparison='split';const processedUrls=new Map<File,string>();
export function setupBackground(){
  const original=$('#originalImg') as HTMLImageElement || $('img', $('#originalLayer')||document) as HTMLImageElement;
  // Stable IDs vary between Stitch variants; bind using the existing comparison controls.
  const control=$('#sliderControl') as HTMLInputElement;
  const area=control.parentElement!;
  area.id='background-viewport';
  const imgs=$$('img',area) as HTMLImageElement[];imgs.forEach((img,i)=>{img.dataset.layer=i===0?'processed':'original'});
  const compareBtns=$$('button').filter(b=>/Split Comparatif|Côte à Côte/.test(b.textContent||''));compareBtns.forEach((btn,i)=>btn.onclick=()=>{comparison=i?'side':'split';updateComparison()});
  control.oninput=()=>updateComparison();
  const zoom=$('#zoomBtn');if(zoom)zoom.onclick=()=>{const active=zoom.getAttribute('aria-pressed')!=='true';zoom.setAttribute('aria-pressed',String(active));$$('img',area).forEach(img=>img.style.transform=active?'scale(1.5)':'');zoom.title=active?'Revenir à la vue normale':'Agrandir les contours'};
  $$('.color-swatch-btn').forEach(btn=>btn.onclick=()=>{backgroundColor=btn.dataset.bg!;$$('.color-swatch-btn').forEach(b=>b.classList.toggle('ring-2',b===btn));updateBackgroundPreview()});
  $$('.toggle-btn').forEach(btn=>{btn.dataset.checked='false';btn.setAttribute('aria-pressed','false');btn.classList.remove('bg-primary');btn.classList.add('bg-surface-container-highest');btn.firstElementChild?.classList.remove('translate-x-5');btn.onclick=()=>{const checked=btn.dataset.checked!=='true';btn.dataset.checked=String(checked);btn.setAttribute('aria-pressed',String(checked));btn.classList.toggle('bg-primary',checked);btn.firstElementChild?.classList.toggle('translate-x-5',checked)}});
  $$('a,button').filter(b=>/Envoyer vers le Studio/.test(b.textContent||'')).forEach(b=>b.dataset.action='send-studio');
  const stats=$$('main div').filter(e=>e.children.length===0&&/99\.|0\.42|Alpha 1/.test(e.textContent||''));stats.forEach(e=>e.textContent='À vérifier');
  if(backgroundFiles.length)selectBackgroundFile(selectedFile);
}
export async function importBackground(files:File[]){
  if(files.length>20){toast('20 photos maximum.');return}
  if(files.some(f=>f.size>100*1024*1024)){toast('100 Mo maximum par photo.');return}
  backgroundFiles=files;selectedFile=0;processedUrls.forEach(u=>URL.revokeObjectURL(u));processedUrls.clear();await selectBackgroundFile(0);
}
export async function selectBackgroundFile(index:number){
  selectedFile=index;const file=backgroundFiles[index];if(!file)return;
  $('#batch-files')!.innerHTML=backgroundFiles.map((f,i)=>`<button class="batch-file ${i===index?'active-file':''}" data-file-index="${i}">${escape(f.name)}</button>`).join('');
  const url=URL.createObjectURL(file),area=$('#background-viewport')!;const imgs=$$('img',area) as HTMLImageElement[];
  // The first image belongs to the processed layer in the original Stitch screen.
  for(const image of imgs)image.src=url;
  if(processedUrls.has(file))imgs[0].src=processedUrls.get(file)!;
  updateBackgroundPreview();
}
function updateBackgroundPreview(){
  const area=$('#background-viewport');if(!area)return;
  const imgs=$$('img',area) as HTMLImageElement[];
  if(imgs[0]){imgs[0].style.background=backgroundColor==='transparent'?'repeating-conic-gradient(#e2e7ff 0% 25%,white 0% 50%) 0/20px 20px':backgroundColor;imgs[0].style.objectFit='contain'}
  updateComparison();
}
function updateComparison(){
  const area=$('#background-viewport');if(!area)return;const range=$('#sliderControl') as HTMLInputElement;
  const slider=$('#sliderHandle')||$('#sliderDivider')||$$('div',area).find(e=>e.classList.contains('cursor-ew-resize'));
  const original=$('#originalLayerClip');
  const value=comparison==='side'?50:Number(range.value);
  const processed=$('#processedLayer');
  if(processed){processed.style.width=comparison==='side'?'50%':'100%';processed.style.left=comparison==='side'?'50%':'0'}
  if(original){original.style.width=comparison==='side'?'50%':'100%';original.style.clipPath=comparison==='side'?'none':`inset(0 ${100-value}% 0 0)`}
  if(slider)slider.style.display=comparison==='side'?'none':'';
  if(slider)slider.style.left=value+'%';range.disabled=comparison==='side';
}
export async function exportBackground(){
  if(!await requireAuth())return;if(!backgroundFiles.length){toast('Importez vos photos avant de les détourer.');return}
  const toggles=$$('.toggle-btn').map(b=>b.dataset.checked==='true');
  await busy($('#downloadBtn') as HTMLButtonElement,async()=>{
    for(const file of backgroundFiles){
      const job=await waitJob(await submit(file,'cutout',{background:backgroundColor,shadow:toggles[0],sharpness:toggles[1],exposure:toggles[2]}));
      const url=await fileUrl(job);processedUrls.set(file,url);
      if(location.pathname==='/background'&&file===backgroundFiles[selectedFile]){const img=$('img',$('#background-viewport')!) as HTMLImageElement;img.src=url;updateBackgroundPreview()}
      download(job.download_url!);
    }
    toast('Les images sont traitées et archivées. Téléchargements également disponibles dans Mes Documents.');
  });
}
