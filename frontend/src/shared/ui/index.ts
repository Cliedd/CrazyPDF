export const $ = <T extends HTMLElement = HTMLElement>(selector:string, root:ParentNode=document) => root.querySelector<T>(selector);
export const $$ = <T extends HTMLElement = HTMLElement>(selector:string, root:ParentNode=document) => Array.from(root.querySelectorAll<T>(selector));
const modal = document.querySelector<HTMLDialogElement>("#modal")!;
let toastTimer:ReturnType<typeof setTimeout>;
export const escape=(s:any)=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const size=(n:number)=>n<1e6?`${(n/1000).toFixed(1)} Ko`:`${(n/1e6).toFixed(1)} Mo`;
export function toast(message:string){const el=$('#toast')!;el.textContent=message;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',6000)}
export function dialog(content:string){modal.innerHTML=`<button class="close secondary-button" data-action="close" aria-label="Fermer">×</button>${content}`;if(!modal.open)modal.showModal()}
export function close(){modal.close()}
export function download(url:string){const link=document.createElement('a');link.href=url;link.download='';document.body.append(link);link.click();link.remove()}
export async function busy(button:HTMLButtonElement|null,action:()=>Promise<void>){const old=button?.innerHTML;if(button){button.disabled=true;button.textContent='Traitement en cours…'}try{await action()}catch(e:any){toast(e.message)}finally{if(button){button.disabled=false;button.innerHTML=old!}}}export function chooseFiles(multiple:boolean,callback:(files:File[])=>void){
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=multiple;input.onchange=()=>{if(input.files?.length)callback(Array.from(input.files))};input.click();
}
export function loadPortrait(url:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Image illisible.'));image.src=url})}

// Bound segmentation uploads before the server decodes them on its memory-limited worker.
export async function boundedPortrait(file:File):Promise<File>{
  const url=URL.createObjectURL(file);
  try{
    const image=await loadPortrait(url),longest=Math.max(image.naturalWidth,image.naturalHeight);
    if(longest<=2048)return file;
    const canvas=document.createElement('canvas'),scale=2048/longest;
    canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
    canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Impossible de préparer cette photo.')),'image/png'));
    return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.png',{type:'image/png'});
  }finally{URL.revokeObjectURL(url)}
}
