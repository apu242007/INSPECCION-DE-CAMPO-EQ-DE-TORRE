import { itemsSinFoto } from "../lib/validacion";
import type { Recorrida } from "../types";

/**
 * Barra de acción fija abajo.
 *
 * "Enviar" estaba detrás de una pestaña y por lo tanto no existía: la acción que cierra el
 * trabajo tiene que estar a la vista mientras se hace el trabajo, no en otra pantalla.
 *
 * Va en cromo, como la cabecera: es la app, no el contenido. El avance ya lo cuenta la
 * escalera de arriba, así que acá quedan solo la cifra y los dos botones que importan al
 * terminar — una segunda barra de progreso sería la misma información dos veces.
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

  return (
    /*
      `fixed` y no `sticky`: el reset tiene `overflow-x: hidden` en html/body, lo que convierte
      al body en contenedor de scroll y hace que `position: sticky` deje de anclarse al
      viewport. La barra quedaba abajo de todo, fuera de la pantalla — o sea, invisible, que
      es exactamente el problema que vino a resolver.
    */
    <div className="cromo cromo-borde-arriba fixed inset-x-0 bottom-0 z-30">
      {/*
        Un hallazgo sin foto no puede llegar a SharePoint. Sobre cromo, el aviso es una faja
        roja plena en vez de un panel rosado: es la franja de peligro del equipo, y a pleno
        sol un fondo tenue sobre chapa oscura directamente no existe.
      */}
      {faltantes.length > 0 && (
        <div className="bg-critico px-3 py-2 md:px-6">
          <p className="text-sm font-semibold text-white">
            {faltantes.length === 1
              ? "Falta la foto de 1 hallazgo. Sin eso no se puede enviar."
              : `Faltan las fotos de ${faltantes.length} hallazgos. Sin eso no se puede enviar.`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {faltantes.slice(0, 12).map((f) => (
              <button
                key={f.itemId}
                type="button"
                className="chapa bg-white text-critico-ink"
                onClick={() => onIrAItem(f.itemId)}
              >
                #{f.itemId}
              </button>
            ))}
            {faltantes.length > 12 && (
              <span className="self-center text-xs text-white/80">
                y {faltantes.length - 12} más
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-3 px-3 py-2.5 md:px-6">
        <p className="min-w-[7rem] flex-1 leading-tight">
          <span className="cifras block text-xl text-white" style={{ fontWeight: 700 }}>
            {revisados}/{total}
          </span>
          <span className="text-xs text-white/60">ítems revisados</span>
        </p>

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
        className="px-3 text-xs text-white/55 md:px-6"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        Al enviar se guarda la recorrida en SharePoint con el PDF adjunto, y el informe sale por
        correo a QHSE.
      </p>
    </div>
  );
}
