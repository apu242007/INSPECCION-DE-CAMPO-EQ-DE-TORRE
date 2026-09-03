import { CATALOGO } from "../../data/catalogo";
import type { Estado, Foto, Recorrida, RegistroItem } from "../../types";
import { crearRecorrida } from "../recorrida";

/** Helpers de test. No es un archivo de tests: vitest solo toma *.test.ts. */

export function fotoDePrueba(nombre = "item-1-1.jpg"): Foto {
  return {
    id: `f-${nombre}`,
    nombre,
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xdb]).buffer,
    tipo: "image/jpeg",
    tomadaEn: "2026-09-03T12:00:00.000Z",
  };
}

export function recorridaDePrueba(overrides: Partial<Recorrida> = {}): Recorrida {
  const base = crearRecorrida(
    {
      equipo: "TACK-3",
      pozoLocacion: "LACH-100",
      equipoRecorrida: "J. Castro, M. Pérez",
    },
    CATALOGO,
    new Date("2026-09-03T12:00:00.000Z"),
  );
  return { ...base, ...overrides };
}

export interface MarcaItem {
  itemId: number;
  estado: Estado;
  conFoto?: boolean;
  criticidad?: RegistroItem["criticidad"];
  origen?: RegistroItem["origen"];
  vecesPrevias?: number;
  plazo?: string;
  estadoFinal?: RegistroItem["estadoFinal"];
}

/** Aplica marcas a una recorrida sin tener que escribir el registro entero cada vez. */
export function marcar(recorrida: Recorrida, marcas: MarcaItem[]): Recorrida {
  const porId = new Map(marcas.map((m) => [m.itemId, m]));
  return {
    ...recorrida,
    registros: recorrida.registros.map((r) => {
      const m = porId.get(r.itemId);
      if (!m) return r;
      const necesitaFoto = m.estado === "NO_OK" || m.estado === "EN_PROC";
      return {
        ...r,
        estado: m.estado,
        criticidad: m.criticidad,
        plazo: m.plazo,
        estadoFinal: m.estadoFinal,
        origen: m.origen ?? (necesitaFoto ? "NUEVO" : undefined),
        reiteracion:
          m.origen === "REITERATIVO"
            ? {
                fuente: "RECORRIDA_INTERNA" as const,
                vecesPrevias: m.vecesPrevias ?? 1,
                detectadaAutomaticamente: true,
              }
            : undefined,
        evidencia:
          m.conFoto === false ? [] : necesitaFoto ? [fotoDePrueba(`item-${m.itemId}-1.jpg`)] : [],
      };
    }),
  };
}
