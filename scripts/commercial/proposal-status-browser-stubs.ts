export function useSearchParams() { return new URLSearchParams(); }
export function createClient() {
  return { rpc: async (name: string, args: unknown) => {
    try {
      const response = await fetch('/rpc', { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({name,args}) });
      return await response.json();
    } catch (error) { return {data:null,error:{message:String(error)}}; }
  } };
}
