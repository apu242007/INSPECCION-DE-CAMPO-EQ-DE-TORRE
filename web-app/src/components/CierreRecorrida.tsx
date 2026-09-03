import { useMemo, useState } from "react";
import { puedeCerrarRecorrida } from "../lib/validacion";
import type { ItemCatalogo, Recorrida } from "../types";
import { SignaturePad } from "./SignaturePad";

/**
 * Cierre con firma. Bloquea la edición y habilita "Reabrir".
 *
 * No se puede cerrar con NO OK / EN PROC sin foto: se listan los faltantes con acceso directo
 * a cada uno, para que arreglarlo sea un tap y no una búsqueda.
 */

interface Props {
  recorrida: Recorrida;
  catalogo: ReadonlyMap<number, ItemCatalogo>;
  onFirmar: (quien: "supervisor" | "cr", dataUrl: string | undefined) => void;
  onCerrar: () => Promise<void>;
  onReabrir: () => void;
  onAbrirItem: (itemId: number) => void;
}

export function CierreRecorrida({
  recorrida,
  catalogo,
  onFirmar,
  onCerrar,
  onReabrir,
  onAbrirItem,
}: Props) {
  const [cerrando, setCerrando] = useState(false);
  const resultado = useMemo(() => puedeCerrarRecorrida(recorrida), [recorrida]);

  if (recorrida.cerrada) {
    return (
      <section className="panel p-4 space-y-3">
        <h3 className="text-lg font-semibold">Recorrida cerrada</h3>
        <p className="text-sm">
          Cerrada el {new Date(recorrida.firmas?.fecha ?? recorrida.actualizadaEn).toLocaleString("es-AR")}.
          La edición está bloqueada.
        </p>
        <button type="button" className="boton-secundario" onClick={onReabrir}>
          Reabrir para editar
        </button>
      </section>
    );
  }

  return (
    <section className="panel p-4 space-y-4">
      <h3 className="text-lg font-semibold">Cerrar recorrida</h3>

      {resultado.motivos.length > 0 && (
        <div className="rounded-lg border-2 border-mayor-ink bg-mayor-suave p-3">
          <p className="font-bold">No se puede cerrar todavía:</p>
          <ul className="ml-5 mt-1 list-disc text-sm">
            {resultado.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>

          {resultado.faltantes.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold">Ítems sin foto — tocá para ir a cada uno:</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {resultado.faltantes.map((f) => (
                  <button
                    key={f.itemId}
                    type="button"
                    className="rounded border-2 border-critico-ink px-3 py-1 text-sm font-semibold text-critico-ink"
                    onClick={() => onAbrirItem(f.itemId)}
                  >
                    #{f.itemId} · {catalogo.get(f.itemId)?.zona ?? ""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <SignaturePad
          titulo="Firma del Supervisor"
          valor={recorrida.firmas?.supervisor}
          onChange={(d) => onFirmar("supervisor", d)}
        />
        <SignaturePad
          titulo="Firma del Company Representative"
          valor={recorrida.firmas?.cr}
          onChange={(d) => onFirmar("cr", d)}
        />
      </div>

      <button
        type="button"
        className="boton-primario"
        disabled={!resultado.puede || cerrando}
        onClick={async () => {
          setCerrando(true);
          try {
            await onCerrar();
          } finally {
            setCerrando(false);
          }
        }}
      >
        {cerrando ? "Cerrando…" : resultado.puede ? "Cerrar recorrida" : "Faltan requisitos"}
      </button>
    </section>
  );
}
