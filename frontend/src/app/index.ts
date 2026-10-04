import { $, $$, toast, close, dialog, chooseFiles } from '../shared/ui';
import { navigate } from '../shared/lib/router';
import { user, setUser, loadUser, requireAuth } from '../entities/user';
import { loadPresets } from '../entities/preset';
import { api } from '../shared/api';
import { showAuth, switchAuth, logout } from '../features/auth';
import { chooseMode } from '../features/document-conversion';
import { importPhoto, exportPhoto, studioCutout } from '../features/photo-editor';
import { importBackground, exportBackground, selectBackgroundFile, selectedBackgroundPhoto, backgroundFiles, selectedFile } from '../features/background-removal';
import { setupVault, preview } from '../features/document-vault';
import { navigation } from '../widgets/header';
import { renderHome } from '../pages/home';
import { renderStudio } from '../pages/studio';
import { renderBackground } from '../pages/background';
import { renderDocuments } from '../pages/documents';
import { staticPage } from '../pages/information';
const app=$('#app')!; const modal=$('#modal') as HTMLDialogElement;
function render(){
  const path=location.pathname;
  if(['/privacy','/legal','/standards'].includes(path)){staticPage(path.slice(1),app);return}
  ({'/studio':renderStudio,'/background':renderBackground,'/documents':renderDocuments}[path]||renderHome)(app);
  navigation();if(path==='/account')showAuth();
}
document.addEventListener('click',async event=>{
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-file-index],[data-preview],[data-retry],a[href]');if(!target)return;
  const action=target.dataset.action;
  if(action){event.preventDefault();
    if(action==='close')close();else if(action==='account')showAuth();else if(action==='auth-switch'){switchAuth()}
    else if(action==='logout'){await logout();navigate('/')}
    else if(action==='vault'){close();navigate('/documents')}
    else if(action==='studio')navigate('/studio');else if(action==='background')navigate('/background');
    else if(action==='mode-word'||action==='mode-pptx'){chooseMode(action==='mode-word'?'word-pdf':'pptx-pdf');navigate('/');$('#dropzone')?.scrollIntoView({behavior:'smooth'})}
    else if(action==='start'){if(await requireAuth())$('#dropzone')?.scrollIntoView({behavior:'smooth'})}
    else if(action==='upload-photo'){if(await requireAuth())chooseFiles(false,f=>importPhoto(f[0]))}
    else if(action==='upload-background'){if(await requireAuth())chooseFiles(true,importBackground)}
    else if(action==='export-photo')exportPhoto();else if(action==='studio-cutout')studioCutout();else if(action==='export-background')exportBackground();
    else if(action==='send-studio'){const photo=selectedBackgroundPhoto();if(!photo){toast('Importez d’abord une photo.');return}await importPhoto(photo,photo!==backgroundFiles[selectedFile]);navigate('/studio')}
    else if(action==='language')dialog('<h2>Langue de l’interface</h2><p>Cette version de DocuVisa.AI est disponible en français. Vos documents peuvent être traités en français et en anglais avec le moteur OCR.</p><button class="primary mt-4" data-action="close">Continuer en français</button>');
    return;
  }
  if(target.dataset.fileIndex){selectBackgroundFile(Number(target.dataset.fileIndex));return}
  if(target.dataset.preview){preview(target.dataset.preview);return}
  if(target.dataset.retry){try{await api('/jobs/'+target.dataset.retry+'/retry',{method:'POST'});setupVault();toast('Traitement relancé.')}catch(e:any){toast(e.message)}return}
  if(target.tagName==='A'){const href=target.getAttribute('href')!;if(href.startsWith('/')&&!href.startsWith('/api/')&&!href.startsWith('/assets/')){event.preventDefault();navigate(href)}}
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&(e.target as HTMLElement).getAttribute('role')==='button'){e.preventDefault();(e.target as HTMLElement).click()}});
window.addEventListener('popstate',render);
window.addEventListener('route:changed',render);
window.addEventListener('auth:required',showAuth);
window.addEventListener('session:expired',()=>setUser(null));
window.addEventListener('session:unavailable',()=>toast('Impossible de vérifier votre session. Réessayez dans quelques instants.'));
window.addEventListener('account:changed',()=>{navigation();if(location.pathname==='/documents')setupVault()});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});
async function init(){const results=await Promise.allSettled([loadPresets(),loadUser()]);for(const result of results)if(result.status==='rejected')toast(result.reason?.message||'Le service est temporairement indisponible.');render()}
init();
