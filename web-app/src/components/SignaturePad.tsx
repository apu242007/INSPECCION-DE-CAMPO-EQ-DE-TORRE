import { useEffect, useRef } from "react";

/**
 * Pad de firma.
 *
 * Trampas que resuelve (todas costaron un bug en producción antes):
 *  - Pointer Events + setPointerCapture: el trazo sobrevive al dedo saliéndose del canvas.
 *  - `touch-action: none`: sin esto el navegador scrollea mientras se firma.
 *  - El canvas NUNCA va dentro de un <label>: en táctil, el label se come el primer toque.
 *  - ResizeObserver con snapshot: cambiar `canvas.width` limpia el bitmap y borra la firma.
 *  - Guard de init: en StrictMode el efecto corre dos veces y la segunda borraría lo restaurado.
 *  - Un canvas vacío serializa como "data:," — se descarta en vez de guardarse como firma.
 */

interface Props {
  titulo: string;
  valor: string | undefined;
  onChange: (dataUrl: string | undefined) => void;
  deshabilitado?: boolean;
}

export function SignaturePad({ titulo, valor, onChange, deshabilitado }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujandoRef = useRef(false);
  const initRef = useRef(false);
  const hayTrazoRef = useRef(false);

  function ctx2d(): CanvasRenderingContext2D | null {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0c0a09";
    ctx.fillStyle = "#0c0a09";
    return ctx;
  }

  function resincronizar(): boolean {
    const c = canvasRef.current;
    if (!c) return false;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0) return false;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (c.width === w && c.height === h) return true;

    // Capturar ANTES de redimensionar: asignar width/height limpia el bitmap.
    const snapshot = hayTrazoRef.current ? c.toDataURL("image/png") : null;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.scale(dpr, dpr);

    if (snapshot) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = snapshot;
    }
    return true;
  }

  useEffect(() => {
    if (initRef.current) return;
    if (!resincronizar()) return;
    initRef.current = true;

    if (valor) {
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      if (c && ctx) {
        const rect = c.getBoundingClientRect();
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          hayTrazoRef.current = true;
        };
        img.src = valor;
      }
    }
    // Solo en el montaje: el guard de arriba impide el doble efecto de StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      if (dibujandoRef.current) return; // nunca en medio de un trazo
      resincronizar();
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  function coords(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function abajo(e: React.PointerEvent<HTMLCanvasElement>) {
    if (deshabilitado) return;
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = ctx2d();
    if (!c || !ctx) return;
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores lo rechazan; el trazo funciona igual */
    }
    dibujandoRef.current = true;
    hayTrazoRef.current = true;
    const { x, y } = coords(e);
    // Punto inicial visible: confirma que el pointerdown llegó aunque no haya movimiento.
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujandoRef.current) return;
    e.preventDefault();
    const ctx = ctx2d();
    if (!ctx) return;
    const { x, y } = coords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function arriba(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujandoRef.current) return;
    dibujandoRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ídem */
    }
    guardar();
  }

  function guardar() {
    const c = canvasRef.current;
    if (!c) return;
    const dataUrl = c.toDataURL("image/png");
    // Un canvas vacío devuelve "data:," o un PNG transparente diminuto: no es una firma.
    if (!dataUrl || dataUrl.length < 200 || dataUrl === "data:,") return;
    onChange(dataUrl);
  }

  function limpiar() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    hayTrazoRef.current = false;
    onChange(undefined);
  }

  return (
    <div className="space-y-2">
      {/* El título es un div, NO un label: envolver el canvas lo mata en táctil. */}
      <div className="text-base font-bold">{titulo}</div>
      <canvas
        ref={canvasRef}
        className="h-40 w-full rounded-lg border-2 border-stone-400 bg-white"
        style={{ touchAction: "none" }}
        onPointerDown={abajo}
        onPointerMove={mover}
        onPointerUp={arriba}
        onPointerCancel={arriba}
        aria-label={titulo}
        role="img"
      />
      {!deshabilitado && (
        <button type="button" className="boton-secundario" onClick={limpiar}>
          Borrar firma
        </button>
      )}
    </div>
  );
}
