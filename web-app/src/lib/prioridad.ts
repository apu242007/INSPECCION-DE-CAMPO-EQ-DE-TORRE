import type { Criticidad, ItemCatalogo, Recorrida, RegistroItem } from "../types";
import { criticidadConEscalado, estaEscalado } from "./metrics";

/**
 * Orden de resolucion. El criterio no es solo la criticidad: un MENOR que salio tres veces
 * seguidas es un problema de sistema, y las inspectoras lo miran distinto que uno nuevo.
 *
 *   1) Criticos pendientes (incluye MAYOR escalado por plazo vencido)
 *   2) Reiterativos con >= 3 apariciones
 *   3) Reiterativos con 2 apariciones
 *   4) Mayores nuevos
 *   5) Menores y generales
 */
export const NIVELES_PRIORIDAD = [
  { nivel: 1, etiqueta: "Críticos pendientes" },
  { nivel: 2, etiqueta: "Reiterativos ×3 o más" },
  { nivel: 3, etiqueta: "Reiterativos ×2" },
  { nivel: 4, etiqueta: "Mayores nuevos" },
  { nivel: 5, etiqueta: "Menores y generales" },
] as const;

export type NivelPrioridad = 1 | 2 | 3 | 4 | 5;

export interface ItemPriorizado {
  itemId: number;
  nivel: NivelPrioridad;
  etiqueta: string;
  criticidad: Criticidad;
  zona: string;
  item: string;
  estado: RegistroItem["estado"];
  vecesPrevias: number;
  escalado: boolean;
  responsable?: string;
  plazo?: string;
}

export function nivelDePrioridad(
  registro: RegistroItem,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  hoy: Date = new Date(),
): NivelPrioridad {
  const criticidad = criticidadConEscalado(registro, catalogo, hoy);
  if (criticidad === "CRITICA") return 1;

  const veces = registro.origen === "REITERATIVO" ? (registro.reiteracion?.vecesPrevias ?? 1) : 0;
  if (veces >= 3) return 2;
  if (veces === 2) return 3;

  if (criticidad === "MAYOR") return 4;
  return 5;
}

/**
 * Lista de prioridad de resolucion. Solo entran los no conformes que siguen abiertos:
 * lo cerrado ya no se prioriza.
 */
export function listaPrioridad(
  recorrida: Recorrida,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  hoy: Date = new Date(),
): ItemPriorizado[] {
  const etiquetas = new Map(NIVELES_PRIORIDAD.map((n) => [n.nivel, n.etiqueta]));

  return recorrida.registros
    .filter(
      (r) => (r.estado === "NO_OK" || r.estado === "EN_PROC") && r.estadoFinal !== "CERRADO",
    )
    .map((r) => {
      const nivel = nivelDePrioridad(r, catalogo, hoy);
      const info = catalogo.get(r.itemId);
      return {
        itemId: r.itemId,
        nivel,
        etiqueta: etiquetas.get(nivel) ?? "",
        criticidad: criticidadConEscalado(r, catalogo, hoy),
        zona: info?.zona ?? "Sin zona",
        item: info?.item ?? `Ítem ${r.itemId}`,
        estado: r.estado,
        vecesPrevias: r.reiteracion?.vecesPrevias ?? 0,
        escalado: estaEscalado(r, catalogo, hoy),
        responsable: r.responsable,
        plazo: r.plazo,
      };
    })
    .sort(
      (a, b) =>
        a.nivel - b.nivel ||
        // Dentro del mismo nivel, primero lo que mas veces se repitio, despues por id.
        b.vecesPrevias - a.vecesPrevias ||
        a.itemId - b.itemId,
    );
}

/** Agrupa la lista de prioridad por nivel, para renderizarla en secciones. */
export function agruparPorNivel(items: readonly ItemPriorizado[]): {
  nivel: NivelPrioridad;
  etiqueta: string;
  items: ItemPriorizado[];
}[] {
  return NIVELES_PRIORIDAD.map((n) => ({
    nivel: n.nivel as NivelPrioridad,
    etiqueta: n.etiqueta,
    items: items.filter((i) => i.nivel === n.nivel),
  })).filter((g) => g.items.length > 0);
}
