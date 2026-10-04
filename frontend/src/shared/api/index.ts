export async function api<T=any>(url:string, init:RequestInit={}):Promise<T>{
  const response=await fetch('/api'+url,{credentials:'same-origin',...init});
  if(!response.ok){let msg='Le service est temporairement indisponible.';try{const body=await response.json();msg=typeof body.detail==='string'?body.detail:body.detail?.[0]?.msg||msg}catch{}if(response.status===401)window.dispatchEvent(new CustomEvent('session:expired'));throw new Error(msg)}
  return response.json();
}
