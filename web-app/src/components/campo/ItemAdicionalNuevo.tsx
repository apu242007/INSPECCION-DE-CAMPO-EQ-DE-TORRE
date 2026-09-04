import { useEffect, useRef, useState } from "react";
import { ZONAS } from "../../data/catalogo";
import { nuevoIdFoto } from "../../lib/imageUtils";
import type { Criticidad, Foto, ItemAdicional, RegistroItem } from "../../types";
import { CLASE_CRITICIDAD, ETIQUETA_CRITICIDAD, vibrar } from "../../ui";
import { CapturaFoto } from "./CapturaFoto";

/**
 * "+ Ítem detectado en recorrida".
 *
 * Orden deliberado: la cámara PRIMERO. El hallazgo se documenta con la foto que se está
 * viendo; describirlo después, desde el piso, es cuando se pierde el detalle.
 * Sin foto no se guarda, igual que cualquier NO OK.
 */

const CRITICIDADES: Criticidad[] = ["CRITICA", "MAYOR", "MENOR", "GENERAL"];

interface Props {
  recorridaId: string;
  zonaSugerida: string;
  /** Primer id libre para adicionales de esta recorrida. */
  siguienteId: number;
  onGuardar: (adicional: ItemAdicional, registro: RegistroItem) => void;
  onCancelar: () => void;
}

export function ItemAdicionalNuevo({
  recorridaId,
  zonaSugerida,
  siguienteId,
  onGuardar,
  onCancelar,
}: Props) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [zona, setZona] = useState(zonaSugerida);
  const [criticidad, setCriticidad] = useState<Criticidad>("MAYOR");
  const [descripcion, setDescripcion] = useState("");
  const [promover, setPromover] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const sinFoto = fotos.length === 0;
  const sinDescripcion = descripcion.trim().length < 5;
  const puedeGuardar = !sinFoto && !sinDescripcion;

  function guardar() {
    if (!puedeGuardar) return;
    vibrar();
    const adicional: ItemAdicional = {
      id: siguienteId,
      zona,
      criticidadRef: criticidad,
      item: descripcion.trim(),
      hallazgoTipico: descripcion.trim(),
      personalizado: true,
      recorridaId,
      promovidoACatalogo: promover,
    };
    const registro: RegistroItem = {
      itemId: siguienteId,
      estado: "NO_OK",
      criticidad,
      origen: "NUEVO",
      fechaVerif: new Date().toISOString(),
      evidencia: fotos,
    };
    onGuardar(adicional, registro);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-papel">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Agregar ítem detectado en recorrida"
        className="mx-auto max-w-xl space-y-3 p-3 pb-24"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Ítem detectado</h2>
          <button type="button" className="text-base font-semibold underline" onClick={onCancelar}>
            Cancelar
          </button>
        </div>

        <div className="panel p-4 space-y-3">
          <p className="text-base font-semibold">1 · Foto (obligatoria)</p>
          <CapturaFoto itemId={siguienteId} fotos={fotos} onCambio={setFotos} compacto />
        </div>

        <div className="panel p-4 space-y-2">
          <p className="text-base font-semibold">2 · Zona</p>
          <div className="grid grid-cols-2 gap-2">
            {ZONAS.map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={zona === z}
                className={`min-h-[56px] rounded-lg border-2 px-2 text-sm font-semibold ${
                  zona === z ? "border-acero-900 bg-acero-900 text-white" : "border-acero-300 bg-papel"
                }`}
                onClick={() => setZona(z)}
              >
                {z}
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-4 space-y-2">
          <p className="text-base font-semibold">3 · Criticidad</p>
          <div className="grid grid-cols-2 gap-2">
            {CRITICIDADES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={criticidad === c}
                className={`boton-estado ${CLASE_CRITICIDAD[c]} ${
                  criticidad === c ? "ring-4 ring-acero-900 ring-offset-2" : "opacity-60"
                }`}
                onClick={() => setCriticidad(c)}
              >
                {ETIQUETA_CRITICIDAD[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-4 space-y-2">
          <p className="text-base font-semibold">4 · Qué se detectó</p>
          <textarea
            className="campo"
            rows={3}
            placeholder="Ej.: Baranda de plataforma de bomba con soldadura fisurada"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={promover}
              onChange={(e) => setPromover(e.target.checked)}
            />
            <span>
              Promover al catálogo general: pasa a aparecer en las próximas recorridas de{" "}
              <strong>todos</strong> los equipos.
            </span>
          </label>
        </div>

        {!puedeGuardar && (
          <p className="rounded border-2 border-mayor-ink bg-mayor-suave p-3 text-sm font-semibold">
            Falta: {[sinFoto && "una foto", sinDescripcion && "la descripción"].filter(Boolean).join(" y ")}.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 border-t-2 border-acero-200 bg-papel p-3">
        <button type="button" className="boton-primario" disabled={!puedeGuardar} onClick={guardar}>
          {sinFoto ? "Falta foto" : "Guardar ítem detectado"}
        </button>
      </div>
    </div>
  );
}

/** Id libre para el próximo adicional: arranca en 9000 para no chocar con catálogo ni extras. */
export const ID_BASE_ADICIONALES = 9000;

export function siguienteIdAdicional(usados: readonly number[]): number {
  return Math.max(ID_BASE_ADICIONALES - 1, ...usados) + 1;
}

export function idFotoAdicional(): string {
  return nuevoIdFoto();
}
