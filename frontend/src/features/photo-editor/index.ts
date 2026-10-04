import { $, $$, escape, toast, loadPortrait, busy, download } from '../../shared/ui';
import { requireAuth } from '../../entities/user';
import { presets } from '../../entities/preset';
import { submit, waitJob, fileUrl, type Job } from '../../entities/document';
export let photoFile:File|null=null;let portrait:HTMLImageElement|null=null;
let presetId='campus-cm',zoom=1,rotation=0,brightness=0,offsetX=0,offsetY=0,removed=false;let lastPhotoJob:Job|null=null;
export async function importPhoto(file:File){
  if(file.size>100*1024*1024){toast('Photo trop volumineuse.');return}
  try{const url=URL.createObjectURL(file);portrait=await loadPortrait(url);URL.revokeObjectURL(url);photoFile=file;removed=false;lastPhotoJob=null;zoom=1;rotation=0;brightness=0;offsetX=offsetY=0;if(location.pathname==='/studio'){setupSliderValues();drawPhoto();$('#photo-name')!.textContent=file.name}}catch(e:any){toast(e.message)}
}
export function setupStudio(){
  const select=$('#preset-select') as HTMLSelectElement;
  select.innerHTML=Object.entries(presets).map(([id,p])=>`<option value="${id}">${escape(p.label)}</option>`).join('');select.value=presetId;
  select.onchange=()=>{presetId=select.value;removed=false;zoom=1;offsetX=offsetY=0;applyPreset();drawPhoto()};
  $$('[data-preset]').forEach(card=>{card.tabIndex=0;card.setAttribute('role','button');card.onclick=()=>{presetId=Object.keys(presets).find(id=>presets[id].country===card.dataset.preset)!;select.value=presetId;zoom=1;offsetX=offsetY=0;applyPreset();drawPhoto()}});
  $('#slider-zoom')!.oninput=e=>{zoom=Number((e.target as HTMLInputElement).value)/100;$('#zoom-val')!.textContent=Math.round(zoom*100)+'%';drawPhoto()};
  $('#slider-rotate')!.oninput=e=>{rotation=Number((e.target as HTMLInputElement).value);$('#rotate-val')!.textContent=rotation.toFixed(1)+'°';drawPhoto()};
  $('#slider-bright')!.oninput=e=>{brightness=Number((e.target as HTMLInputElement).value);$('#bright-val')!.textContent=brightness+'%';drawPhoto()};
  $('#reset-view-btn')!.onclick=()=>{zoom=1;rotation=brightness=offsetX=offsetY=0;setupSliderValues();drawPhoto()};
  $('#toggle-grid-btn')!.onclick=()=>{const hud=$('#biometric-hud')!;hud.hidden=!hud.hidden;$('#toggle-grid-btn')!.setAttribute('aria-pressed',String(!hud.hidden))};
  const canvas=$('#photo-canvas') as HTMLCanvasElement;
  let drag:{x:number;y:number;ox:number;oy:number}|null=null;
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,ox:offsetX,oy:offsetY};canvas.setPointerCapture(e.pointerId)};
  canvas.onpointermove=e=>{if(!drag)return;const rect=canvas.getBoundingClientRect();offsetX=Math.max(-1,Math.min(1,drag.ox+(e.clientX-drag.x)/rect.width));offsetY=Math.max(-1,Math.min(1,drag.oy+(e.clientY-drag.y)/rect.height));drawPhoto()};
  canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
  $$('input[name="export_type"]').forEach(e=>e.onchange=()=>{$$('.export-opt').forEach(l=>l.classList.toggle('export-select',!!$('input:checked',l)))});
  setupSliderValues();applyPreset();
  if(portrait)drawPhoto();else{const demo=$('img[alt="Miniature"]') as HTMLImageElement;loadPortrait(demo.src).then(image=>{if(location.pathname==='/studio'&&!photoFile){portrait=image;drawPhoto()}})}
  $('#photo-name')!.textContent=photoFile?photoFile.name:'Portrait de démonstration · importez votre photo';
  // Replace invented audit results with a clear, useful live inspector.
  const score=$$('main div').find(e=>e.children.length===0&&e.textContent?.trim()==='—');
  if(score)score.textContent='À vérifier';
}
function setupSliderValues(){for(const [id,value]of [['slider-zoom',zoom*100],['slider-rotate',rotation],['slider-bright',brightness]] as [string,number][]){const el=$('#'+id) as HTMLInputElement;if(el)el.value=String(value)}if($('#zoom-val'))$('#zoom-val')!.textContent=Math.round(zoom*100)+'%';if($('#rotate-val'))$('#rotate-val')!.textContent=rotation+'°';if($('#bright-val'))$('#bright-val')!.textContent=brightness+'%'}
function applyPreset(){
  const p=presets[presetId];if(!p)return;
  $$('[data-preset]').forEach(card=>{card.classList.toggle('ring-2',card.dataset.preset===p.country);card.classList.toggle('ring-primary',card.dataset.preset===p.country)});
  $('#preset-note')!.innerHTML=`${escape(p.note)} <a href="${p.source}" target="_blank" rel="noopener">Règles officielles</a>`;
  $('#live-photo-specs')!.textContent=`${p.width_px||Math.round(p.width_mm/25.4*p.dpi)} × ${p.height_px||Math.round(p.height_mm/25.4*p.dpi)} px · ${p.width_mm} × ${p.height_mm} mm · ${p.dpi} DPI${p.max_kb?' · ≤ '+p.max_kb+' Ko':''}`;
  const slider=$('#slider-bright') as HTMLInputElement;slider.disabled=!!p.no_retouch;if(p.no_retouch){brightness=0;slider.value='0';$('#bright-val')!.textContent='0%'}
  const format=$('#photo-format') as HTMLSelectElement;format.disabled=!!p.max_kb;if(p.max_kb)format.value='JPEG';
  ($('#btn-ai-remove-bg') as HTMLButtonElement).disabled=!!p.no_retouch;
  $$('main span').filter(e=>e.textContent?.includes('413 × 531')).forEach(e=>e.textContent=`${p.width_mm} × ${p.height_mm} mm · ${p.max_kb?`≤ ${p.max_kb} Ko`:'300 DPI'}`);
  const frame=$('#viewport-frame')!;frame.style.setProperty('aspect-ratio',`${p.width_mm}/${p.height_mm}`,'important');
  const hud=$('#biometric-hud')!;const all=$$('span',hud);all.forEach(e=>{const t=e.textContent||'';if(t.includes('Sommet'))e.textContent=p.head_max_mm?`Sommet · tête max. ${p.head_max_mm} mm`:'Sommet du crâne · repère';if(t.includes('Menton'))e.textContent=p.head_min_mm?`Menton · tête min. ${p.head_min_mm} mm`:'Bas du menton · repère';if(t.includes('80%')||t.includes('70%'))e.textContent='Guide visuel';if(t.includes('Tête:'))e.textContent='Dimensions vérifiées à l’export'});
  // Honest status: no fabricated face/eye measurement.
  const list=$$('main div').find(e=>e.classList.contains('space-y-space-xs')&&e.id!=='export-options-group');
  if(list&&list.textContent?.includes('Proportions'))list.innerHTML=`<p class="notice">${p.width_mm} × ${p.height_mm} mm · ${p.dpi} DPI${p.max_kb?' · ≤ '+p.max_kb+' Ko':''}<br>Pose, expression, tête et éclairage : contrôle visuel requis. Aucun score biométrique certifié.</p>`;
}
function drawPhoto(){
  const canvas=$('#photo-canvas') as HTMLCanvasElement;if(!canvas||!portrait)return;
  const p=presets[presetId];if(!p)return;
  canvas.width=p.width_px||Math.round(p.width_mm/25.4*p.dpi);canvas.height=p.height_px||Math.round(p.height_mm/25.4*p.dpi);
  const ctx=canvas.getContext('2d')!, scale=Math.max(canvas.width/portrait.naturalWidth,canvas.height/portrait.naturalHeight)*zoom;
  ctx.fillStyle=p.background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(canvas.width/2+offsetX*canvas.width,canvas.height/2+offsetY*canvas.height);ctx.rotate(rotation*Math.PI/180);ctx.filter=`brightness(${100+brightness}%)`;ctx.drawImage(portrait,-portrait.naturalWidth*scale/2,-portrait.naturalHeight*scale/2,portrait.naturalWidth*scale,portrait.naturalHeight*scale);ctx.restore();
}
export async function exportPhoto(){
  if(!await requireAuth())return;if(!photoFile){toast('Importez votre photo avant de l’exporter.');return}
  await busy($('#btn-download-photo') as HTMLButtonElement,async()=>{
    const job=await waitJob(await submit(photoFile!,'photo',{preset:presetId,zoom,rotation,brightness,offset_x:offsetX,offset_y:offsetY,remove_bg:removed,format:($('#photo-format') as HTMLSelectElement).value,export_type:($('input[name="export_type"]:checked') as HTMLInputElement).value,sheet_count:Number(($('#sheet-count') as HTMLSelectElement).value)}));lastPhotoJob=job;download(job.download_url!);toast('Photo exportée et archivée gratuitement.');
  });
}
export async function studioCutout(){
  if(!await requireAuth())return;if(!photoFile){toast('Importez votre photo.');return}if(presets[presetId].no_retouch){toast('Cette démarche interdit la retouche du fond.');return}
  await busy($('#btn-ai-remove-bg') as HTMLButtonElement,async()=>{const job=await waitJob(await submit(photoFile!,'cutout',{background:'transparent'}));const url=await fileUrl(job);portrait=await loadPortrait(url);URL.revokeObjectURL(url);removed=true;drawPhoto();toast('Fond supprimé. Vérifiez les contours avant export.');});
}
