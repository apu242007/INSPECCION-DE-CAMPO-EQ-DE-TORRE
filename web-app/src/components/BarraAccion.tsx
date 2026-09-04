import { itemsSinFoto } from "../lib/validacion";
import type { Recorrida } from "../types";

/**
 * Barra de acción fija abajo.
 *
 * "Enviar" estaba detrás de una pestaña y por lo tanto no existía: la acción que cierra el
 * trabajo tiene que estar a la vista mientras se hace el trabajo, no en otra pantalla. Acá va
 * el avance —para saber cuánto falta sin contar— y los dos botones que importan al terminar.
 */

interface Props {
  recorrida: Recorrida;
  enviando: boolean;
  generandoPdf: boolean;
  onEnviar: () => void;
  onPdf: () => void;
  onIrAItem: (itemId: number) => void;
}

export function BarraAccion({
  recorrida,
  enviando,
  generandoPdf,
  onEnviar,
  onPdf,
  onIrAItem,
}: Props) {
  const total = recorrida.registros.length;
  const revisados = recorrida.registros.filter((r) => r.estado !== "SIN_REVISAR").length;
  const faltantes = itemsSinFoto(recorrida);
  const pct = total === 0 ? 0 : Math.round((revisados / total) * 100);

  return (
    /*
      `fixed` y no `sticky`: el reset tiene `overflow-x: hidden` en html/body, lo que convierte
      al body en contenedor de scroll y hace que `position: sticky` deje de anclarse al
      viewport. La barra quedaba abajo de todo, fuera de la pantalla — o sea, invisible, que
      es exactamente el problema que vino a resolver.
    */
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-acero-300 bg-papel shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
      {/* Un hallazgo sin foto no puede llegar a SharePoint: se listan con acceso directo. */}
      {faltantes.length > 0 && (
        <div className="border-b border-critico bg-critico-suave px-3 py-2 md:px-6">
          <p className="text-sm font-semibold text-critico-ink">
            {faltantes.length === 1
              ? "Falta la foto de 1 hallazgo. Sin eso no se puede enviar."
              : `Faltan las fotos de ${faltantes.length} hallazgos. Sin eso no se puede enviar.`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {faltantes.slice(0, 12).map((f) => (
              <button
                key={f.itemId}
                type="button"
                className="cifras rounded border-2 border-critico-ink px-2 py-1 text-xs font-bold text-critico-ink"
                onClick={() => onIrAItem(f.itemId)}
              >
                #{f.itemId}
              </button>
            ))}
            {faltantes.length > 12 && (
              <span className="self-center text-xs text-critico-ink">
                y {faltantes.length - 12} más
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-2 px-3 py-2 md:px-6">
        <div className="min-w-[7.5rem] flex-1">
          <div className="flex items-baseline gap-2">
            <span className="cifras text-lg font-semibold">
              {revisados}/{total}
            </span>
            <span className="text-sm text-acero-700">revisados</span>
          </div>
          <div
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-acero-200"
            role="progressbar"
            aria-valuenow={revisados}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Ítems revisados"
          >
            <div
              className={`h-full ${pct === 100 ? "bg-conforme" : "bg-acero-900"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          className="boton-secundario shrink-0"
          disabled={generandoPdf}
          onClick={onPdf}
        >
          {generandoPdf ? "Generando…" : "PDF"}
        </button>

        <button
          type="button"
          className="boton-primario w-auto shrink-0 px-6"
          disabled={enviando || faltantes.length > 0}
          onClick={onEnviar}
        >
          {enviando ? "Enviando…" : "Enviar"}
        </button>
      </div>

      <p
        className="px-3 text-xs text-acero-500 md:px-6"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        Al enviar se guarda la recorrida en SharePoint con el PDF adjunto, y el informe sale por
        correo a QHSE.
      </p>
    </div>
  );
}
