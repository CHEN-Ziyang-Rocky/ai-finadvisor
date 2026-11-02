import axios from 'axios';
export const demoToken=()=>sessionStorage.getItem('portfolio_demo_token');
export const randomKey=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function demoRequest(path,body={}) { return axios.post(`/api/demo${path}`,body,{headers:{Authorization:`Bearer ${demoToken()}`},timeout:15000}); }
export async function startDemo() {
 let key=sessionStorage.getItem('portfolio_demo_key');if(!key){key=randomKey();sessionStorage.setItem('portfolio_demo_key',key);}
 const {data}=await axios.post('/api/demo/session',{}, {headers:{'Idempotency-Key':key},timeout:15000});sessionStorage.setItem('portfolio_demo_token',data.token);window.location.assign('/user');
}
export async function exitDemo(){await demoRequest('/exit');sessionStorage.removeItem('portfolio_demo_token');sessionStorage.removeItem('portfolio_demo_key');window.location.assign('/demo');}
