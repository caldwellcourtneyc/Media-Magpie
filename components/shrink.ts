"use client";

// Shrinks a picked image on the device before it's sent, so a phone screenshot of several MB
// goes up as a JPEG of a few hundred KB. Long side up to 1800px keeps a lock screen's small
// print (podcast, episode, time) readable for Claude later.

const LONG_SIDE = 1800;
const TARGET = 450 * 1024;

export type Shrunk = { type: "image/jpeg"; data: string; width: number; height: number; bytes: number; url: string };

async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {
    // Older Safari: fall back to an <img>, which also honors the photo's orientation.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't shrink that image"))), "image/jpeg", q));

const dataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Couldn't read that image"));
    r.readAsDataURL(b);
  });

export async function shrinkImage(file: File): Promise<Shrunk> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("That isn't an image");
  let img: Awaited<ReturnType<typeof decode>>;
  try {
    img = await decode(file);
  } catch {
    throw new Error("Couldn't open that image. Try a screenshot or a JPEG.");
  }
  try {
    let scale = Math.min(1, LONG_SIDE / Math.max(img.w, img.h));
    for (let round = 0; round < 4; round++) {
      const w = Math.max(1, Math.round(img.w * scale));
      const h = Math.max(1, Math.round(img.h * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      // JPEG has no transparency: a transparent PNG gets a white ground rather than black.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img.src, 0, 0, w, h);
      for (const q of [0.82, 0.7, 0.6]) {
        const blob = await toBlob(c, q);
        if (blob.size <= TARGET || (round === 3 && q === 0.6)) {
          const url = await dataUrl(blob);
          return { type: "image/jpeg", data: url.slice(url.indexOf(",") + 1), width: w, height: h, bytes: blob.size, url };
        }
      }
      scale *= 0.75;
    }
    throw new Error("Couldn't shrink that image");
  } finally {
    img.done();
  }
}
