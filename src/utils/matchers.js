
// src/utils/matchers.js
import { getClipSession, embedImage, l2norm } from './clipSession';

export function cosineSim(a,b){let dot=0.0; for(let i=0;i<a.length;i++) dot+=a[i]*b[i]; return dot;}

export async function prepareRefIndex(refs){
  const session=await getClipSession();
  const vectors=[],meta=[];
  for(const r of refs){
    const img=await new Promise((res,rej)=>{const el=new Image(); el.crossOrigin='anonymous'; el.onload=()=>res(el); el.onerror=rej; el.src=r.url;});
    const t=await embedImage(img,session);
    const v=l2norm(t.data); vectors.push(v);
    meta.push({url:r.url,name:r.name??r.key??'',key:r.key??r.name??r.url});
  }
  return {vectors,meta};
}

export function findBestMatch(queryVec,index){
  if(!queryVec||!index?.vectors?.length) return null;
  const q=l2norm(queryVec); let best=-2,bestIdx=-1;
  for(let i=0;i<index.vectors.length;i++){ const score=cosineSim(q,index.vectors[i]); if(score>best){best=score; bestIdx=i;} }
  if(bestIdx<0) return null;
  const ref=index.meta[bestIdx];
  return {score:best, idx:bestIdx, key:ref.key, name:ref.name, url:ref.url, ref};
}
