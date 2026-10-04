export type Job = {id:string;filename:string;mode:string;status:string;error:string;size:number;created:number;metadata:Record<string,any>;download_url:string|null};
import { api } from '../../shared/api';
export const titles:Record<string,string>={'word-pdf':'Word → PDF','pdf-word':'PDF → Word','pptx-pdf':'PPTX → PDF','pdf-pptx':'PDF → PPTX',photo:'Photo visa',cutout:'Détourage'};
export async function submit(file:File,jobMode:string,options:Record<string,any>={}):Promise<Job>{
  if(file.size>100*1024*1024)throw new Error('100 Mo maximum par fichier.');
  const body=new FormData();body.set('file',file);body.set('mode',jobMode);body.set('options',JSON.stringify(options));return api<Job>('/jobs',{method:'POST',body});
}
export async function waitJob(job:Job,onUpdate?:(job:Job)=>void):Promise<Job>{
  const deadline=Date.now()+10*60*1000;
  while(!['completed','failed'].includes(job.status)&&Date.now()<deadline){onUpdate?.(job);await new Promise(r=>setTimeout(r,800));job=await api<Job>('/jobs/'+job.id)}
  onUpdate?.(job);if(job.status==='failed')throw new Error(job.error);if(job.status!=='completed')throw new Error('Le traitement continue. Retrouvez son résultat dans Mes Documents.');return job;
}
export async function fileUrl(job:Job){const response=await fetch(job.download_url!,{credentials:'same-origin'});if(!response.ok)throw new Error('Impossible de récupérer l’export.');return URL.createObjectURL(await response.blob())}
