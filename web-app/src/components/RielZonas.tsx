import { useMemo } from "react";
import type { ItemCatalogo, Recorrida } from "../types";

/**
 * RIEL DE ZONAS — el progreso como lo que realmente es: una subida.
 *
 * La recorrida física va de abajo hacia arriba: chasis y bomba, piso de trabajo, escaleras,
 * piso de enganche, mástil, corona. Una barra horizontal de "23 de 94" dice cuánto falta pero
 * no dice *dónde estás parado*. Este riel sí: las zonas se apilan en el orden configurado para
 * el equipo, la primera abajo, y se van llenando a medida que se sube.
 *
 * Es además el índice: tocar una zona salta a su primer ítem.
 */

export interface EstadoZona {
  zona: string;
  total: number;
  revisados: number;
  noConformes: number;
}

export function estadoPorZona(
  recorrida: Recorrida,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  ordenZonas: readonly string[],
): EstadoZona[] {
  const mapa = new Map<string, EstadoZona>();

  for (const r of recorrida.registros) {
    const zona =
      catalogo.get(r.itemId)?.zona ??
      recorrida.itemsAdicionales.find((a) => a.id === r.itemId)?.zona ??
      "Sin zona";
    const e = mapa.get(zona) ?? {
      zona,
      total: 0,
      revisados: 0,
      noConformes: 0,
    };
    e.total += 1;
    if (r.estado !== "SIN_REVISAR") e.revisados += 1;
    if (r.estado === "NO_OK" || r.estado === "EN_PROC") e.noConformes += 1;
    mapa.set(zona, e);
  }

  const peso = new Map(ordenZonas.map((z, i) => [z, i]));
  return [...mapa.values()].sort(
    (a, b) =>
      (peso.get(a.zona) ?? 999) - (peso.get(b.zona) ?? 999) ||
      a.zona.localeCompare(b.zona, "es"),
  );
}

interface Props {
  zonas: readonly EstadoZona[];
  zonaActual?: string;
  onIrAZona: (zona: string) => void;
  /** Compacto: sin contadores, para pantallas angostas. */
  compacto?: boolean;
}

export function RielZonas({ zonas, zonaActual, onIrAZona, compacto }: Props) {
  // La primera zona de la recorrida va ABAJO: el riel se lee como se sube al equipo.
  const deAbajoHaciaArriba = useMemo(() => [...zonas].reverse(), [zonas]);

  return (
    <nav aria-label="Zonas de la recorrida" className="flex h-full flex-col">
      <p className="px-3 pb-1 pt-3 text-sm font-semibold text-acero-700">
        Recorrida
      </p>

      <ol className="flex flex-1 flex-col overflow-y-auto">
        {deAbajoHaciaArriba.map((z) => {
          const completa = z.revisados === z.total;
          const actual = z.zona === zonaActual;

          return (
            <li key={z.zona} className="relative">
              <button
                type="button"
                aria-current={actual ? "step" : undefined}
                onClick={() => onIrAZona(z.zona)}
                className={`relative flex w-full items-center gap-2 py-2 pl-4 pr-3 text-left ${
                  actual ? "bg-acero-900 text-white" : "text-acero-900"
                }`}
              >
                {/* El larguero del mástil: una línea continua que atraviesa todo el riel. */}
                <span
                  aria-hidden
                  className={`absolute bottom-0 left-[9px] top-0 w-[3px] ${
                    completa ? "bg-conforme" : "bg-acero-300"
                  }`}
                />
                {/* El travesaño: se pinta lleno cuando la zona está terminada. */}
                <span
                  aria-hidden
                  className={`absolute left-[4px] h-[13px] w-[13px] rounded-full border-2 ${
                    z.noConformes > 0
                      ? "border-critico bg-critico"
                      : completa
                        ? "border-conforme bg-conforme"
                        : actual
                          ? "border-white bg-white"
                          : "border-acero-300 bg-papel"
                  }`}
                />

                <span className="ml-3 min-w-0 flex-1">
                  <span className="block truncate text-[0.9rem] font-semibold leading-tight">
                    {z.zona}
                  </span>
                  {!compacto && (
                    <span
                      className={`cifras block text-xs leading-tight ${
                        actual ? "text-acero-300" : "text-acero-500"
                      }`}
                    >
                      {z.revisados}/{z.total}
                      {z.noConformes > 0 && (
                        <span
                          className={
                            actual ? " text-white" : " text-critico-ink"
                          }
                        >
                          {" "}
                          · {z.noConformes} NO OK
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="border-t border-acero-200 px-4 py-2 text-xs text-acero-500">
        De abajo hacia arriba, como se recorre el equipo.
      </p>
    </nav>
  );
}
