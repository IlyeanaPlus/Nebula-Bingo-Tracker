// 64-D shape signature utils (Sobel edges -> 8x8 pooled -> L2)
export function b64u8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeShape64(b64) {
  const u = b64u8(b64);
  const f = new Float32Array(64);
  let s = 0;
  for (let i = 0; i < 64; i++) { const v = u[i]/255; f[i]=v; s+=v*v; }
  s = Math.sqrt(Math.max(s, 1e-12));
  for (let i = 0; i < 64; i++) f[i] /= s;
  return f;
}

export function computeShape64(canvas) {
  const w = 32, h = 32;
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d");
  tctx.drawImage(canvas, 0, 0, w, h);
  const { data } = tctx.getImageData(0, 0, w, h);

  // grayscale
  const gray = new Float32Array(w*h);
  for (let i=0,p=0;i<data.length;i+=4,p++){
    gray[p] = (0.2989*data[i] + 0.5870*data[i+1] + 0.1140*data[i+2]) / 255;
  }

  // Sobel
  const gx = new Float32Array(w*h), gy = new Float32Array(w*h);
  const Kx = [1,0,-1, 2,0,-2, 1,0,-1];
  const Ky = [1,2, 1, 0,0,0, -1,-2,-1];
  for (let y=1; y<h-1; y++){
    for (let x=1; x<w-1; x++){
      let sx=0, sy=0, k=0;
      for (let yy=-1; yy<=1; yy++){
        for (let xx=-1; xx<=1; xx++){
          const v = gray[(y+yy)*w + (x+xx)];
          sx += v * Kx[k]; sy += v * Ky[k]; k++;
        }
      }
      const i = y*w + x;
      gx[i]=sx; gy[i]=sy;
    }
  }

  // 8x8 avg pool over 32x32
  const v = new Float32Array(64);
  for (let gyc=0; gyc<8; gyc++){
    for (let gxc=0; gxc<8; gxc++){
      let sum=0;
      for (let yy=0; yy<4; yy++){
        for (let xx=0; xx<4; xx++){
          const x=gxc*4+xx, y=gyc*4+yy, i=y*w+x;
          sum += Math.hypot(gx[i], gy[i]);
        }
      }
      v[gyc*8+gxc] = sum/16;
    }
  }
  // L2
  let s=0; for (let i=0;i<64;i++) s+=v[i]*v[i];
  s = Math.sqrt(Math.max(s, 1e-12));
  for (let i=0;i<64;i++) v[i]/=s;
  return v;
}
