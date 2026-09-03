import type { Foto } from "../types";

/**
 * Compresion de imagenes en cliente, en dos capas (skill, seccion 5):
 *   1. al tomar la foto  -> el blob entra chico a IndexedDB y a los previews
 *   2. al armar el envio -> red de seguridad por si algun camino salteo la capa 1
 *
 * `comprimirImagen` es idempotente: si la entrada ya es JPEG <= maxSide y q ~0.7, vuelve
 * practicamente igual. Por eso aplicarla dos veces no degrada de forma apreciable.
 */

export const MAX_LADO_PX = 1280;
export const CALIDAD_JPEG = 0.7;

export async function comprimirImagen(
  file: Blob,
  maxLado = MAX_LADO_PX,
  calidad = CALIDAD_JPEG,
): Promise<Blob> {
  const tipo = file.type ?? "";
  if (!tipo.startsWith("image/") || tipo === "image/svg+xml") return file;

  try {
    const bmp = await createImageBitmap(file);
    const ratio = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * ratio));
    const h = Math.max(1, Math.round(bmp.height * ratio));

    // Siempre se re-codifica a JPEG aunque no haya que reducir: un PNG de 800x600
    // puede pesar 2 MB y bajar a ~120 KB solo con el cambio de formato.
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as HTMLCanvasElement).getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp as unknown as CanvasImageSource, 0, 0, w, h);
    bmp.close?.();

    const offscreen = canvas as unknown as OffscreenCanvas;
    if (typeof offscreen.convertToBlob === "function") {
      return await offscreen.convertToBlob({ type: "image/jpeg", quality: calidad });
    }
    return await new Promise<Blob>((resolve) => {
      (canvas as HTMLCanvasElement).toBlob((b) => resolve(b ?? file), "image/jpeg", calidad);
    });
  } catch {
    // Un navegador sin createImageBitmap o una imagen corrupta no pueden costar la foto:
    // se manda el original y que decida el limite de payload.
    return file;
  }
}

/** base64 pelado, SIN el prefijo `data:`. Es lo que espera `base64ToBinary` en el flujo. */
export async function blobABase64(blob: Blob): Promise<string> {
  const dataUrl = await blobADataUrl(blob);
  const coma = dataUrl.indexOf(",");
  return coma >= 0 ? dataUrl.slice(coma + 1) : dataUrl;
}

export function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(fr.error ?? new Error("No se pudo leer el archivo"));
    fr.readAsDataURL(blob);
  });
}

export function dataUrlABlob(dataUrl: string): Blob {
  const [cabecera, datos] = dataUrl.split(",");
  const tipo = /data:([^;]+)/.exec(cabecera)?.[1] ?? "application/octet-stream";
  const bin = atob(datos ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

/** Tamaño aproximado en bytes de un string base64. */
export function bytesDeBase64(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function formatearTamaño(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let contadorFotos = 0;

/** Nombre de archivo estable para SharePoint: item-<id>-<n>.jpg */
export function nombreFoto(itemId: number, indice: number): string {
  return `item-${itemId}-${indice + 1}.jpg`;
}

export function nuevoIdFoto(): string {
  contadorFotos += 1;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `foto-${Date.now()}-${contadorFotos}`;
}

/** Reconstruye el Blob de una Foto guardada. Ver el comentario de `Foto` en types.ts. */
export function blobDeFoto(foto: Foto): Blob {
  return new Blob([foto.bytes], { type: foto.tipo || "application/octet-stream" });
}

/** Comprime y convierte a Foto lista para guardar. Es la capa 1 de compresion. */
export async function fotoDesdeBlob(blob: Blob, nombre: string): Promise<Foto> {
  const comprimida = await comprimirImagen(blob);
  return {
    id: nuevoIdFoto(),
    nombre,
    bytes: await comprimida.arrayBuffer(),
    tipo: comprimida.type || "image/jpeg",
    tomadaEn: new Date().toISOString(),
  };
}

/** Nota de voz: no se comprime (ya viene en webm/opus), solo se envuelve. */
export async function notaDesdeBlob(blob: Blob, nombre: string): Promise<Foto> {
  return {
    id: nuevoIdFoto(),
    nombre,
    bytes: await blob.arrayBuffer(),
    tipo: blob.type || "audio/webm",
    tomadaEn: new Date().toISOString(),
  };
}

export function tamañoDeFoto(foto: Foto): number {
  return foto.bytes.byteLength;
}
