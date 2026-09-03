import { useEffect, useMemo, useRef, useState } from "react";
import { blobDeFoto, fotoDesdeBlob, nombreFoto } from "../../lib/imageUtils";
import type { Foto } from "../../types";
import { vibrar } from "../../ui";

/**
 * Captura de evidencia. Abre la camara directamente (`capture="environment"`), sin pasos
 * intermedios: en altura, cada tap de mas es un tap que no se da.
 *
 * El boton "Listo" esta DESHABILITADO hasta que haya al menos una foto y dice "Falta foto".
 * Esta es la barrera visible; la barrera real esta en lib/validacion.ts, que se aplica
 * tambien al guardar, al importar JSON y al cerrar.
 */

interface Props {
  itemId: number;
  fotos: Foto[];
  onCambio: (fotos: Foto[]) => void;
  onListo?: () => void;
  /** Texto del botón de confirmación. Por defecto "Listo". */
  textoListo?: string;
  compacto?: boolean;
}

export function CapturaFoto({ itemId, fotos, onCambio, onListo, textoListo = "Listo", compacto }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);

  // Los object URL se crean una vez por set de fotos y se revocan al cambiar: crearlos en
  // el render filtra memoria en cada repintado.
  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(blobDeFoto(f))), [fotos]);
  useEffect(() => {
    return () => {
      for (const url of previews) URL.revokeObjectURL(url);
    };
  }, [previews]);

  async function agregar(archivos: FileList | null) {
    if (!archivos?.length) return;
    setProcesando(true);
    try {
      const nuevas: Foto[] = [];
      for (let i = 0; i < archivos.length; i += 1) {
        nuevas.push(await fotoDesdeBlob(archivos[i], nombreFoto(itemId, fotos.length + i)));
      }
      vibrar();
      onCambio([...fotos, ...nuevas]);
    } finally {
      setProcesando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const sinFotos = fotos.length === 0;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void agregar(e.target.files)}
      />

      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {fotos.map((f, i) => (
            <div key={f.id} className="relative">
              <img
                src={previews[i]}
                alt={`Evidencia ${i + 1} del ítem ${itemId}`}
                className="h-24 w-full rounded border-2 border-stone-400 object-cover"
              />
              <button
                type="button"
                aria-label={`Quitar la foto ${i + 1}`}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center
                           rounded-full bg-stone-900 text-lg font-bold text-white"
                onClick={() => onCambio(fotos.filter((x) => x.id !== f.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="boton-secundario w-full"
        disabled={procesando}
        onClick={() => inputRef.current?.click()}
      >
        {procesando ? "Procesando…" : sinFotos ? "📷 Tomar foto" : "📷 Otra foto"}
      </button>

      {onListo && (
        <button
          type="button"
          className="boton-primario"
          disabled={sinFotos}
          onClick={() => {
            vibrar();
            onListo();
          }}
        >
          {sinFotos ? "Falta foto" : textoListo}
        </button>
      )}

      {sinFotos && !compacto && (
        <p className="text-center text-sm font-bold text-noOk">
          Sin foto no se puede guardar este ítem.
        </p>
      )}
    </div>
  );
}
