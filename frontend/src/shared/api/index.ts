export class ApiError extends Error {
  constructor(message:string, public readonly status:number){super(message);this.name='ApiError'}
}
export async function api<T=any>(url:string, init:RequestInit={}):Promise<T>{
  const response=await fetch('/api'+url,{...init,credentials:'same-origin',cache:'no-store'});
  if(!response.ok){let msg='Le service est temporairement indisponible.';try{const body=await response.json();msg=typeof body.detail==='string'?body.detail:body.detail?.[0]?.msg||msg}catch{}if(response.status===401&&!['/auth/login','/auth/register'].includes(url))window.dispatchEvent(new CustomEvent('session:expired'));throw new ApiError(msg,response.status)}
  return response.json();
}
