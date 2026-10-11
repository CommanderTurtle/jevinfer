import {renderPaint} from './pigment/renderer.mjs';
// Pad rectangular compositions, then crop. Coordinates and pigment geometry retain
// their aspect ratio; the original square renderer remains unchanged.
self.onmessage=({data:{result,longEdge=560}})=>{
  try {
    const w=result.width,h=result.height,size=Math.max(w,h);
    const pixels=Array.from({length:size*size},(_,i)=>{
      const x=i%size,y=Math.floor(i/size);
      return result.pixels[Math.min(y,h-1)*w+Math.min(x,w-1)];
    });
    const rendered=renderPaint({...result,size,pixels},longEdge);
    // Preserve transparent pixels in imported/custom artwork.
    for(let y=0;y<longEdge;y++)for(let x=0;x<longEdge;x++){
      const p=pixels[Math.min(size-1,Math.floor(y*size/longEdge))*size+Math.min(size-1,Math.floor(x*size/longEdge))];
      if(p.rgba)rendered.pixels[(y*longEdge+x)*4+3]=p.rgba[3];
    }
    const source=new OffscreenCanvas(longEdge,longEdge);
    source.getContext('2d').putImageData(new ImageData(rendered.pixels,longEdge,longEdge),0,0);
    const width=Math.max(1,Math.round(longEdge*w/size)),height=Math.max(1,Math.round(longEdge*h/size));
    const out=new OffscreenCanvas(width,height);
    out.getContext('2d').drawImage(source,0,0,width,height,0,0,width,height);
    const bitmap=out.transferToImageBitmap();
    self.postMessage({bitmap,ms:rendered.ms},[bitmap]);
  } catch(e){self.postMessage({error:e.message});}
};
