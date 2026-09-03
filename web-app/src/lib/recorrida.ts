import { CATALOGO, plazoSugerido } from "../data/catalogo";
import { OBS_CORREGIDO } from "../data/semillas/tack6";
import { EMPRESA_DEFAULT } from "../types";
import type { ItemCatalogo, Recorrida, RegistroItem, SemillaEquipo } from "../types";
import { criticidadEfectiva } from "./metrics";
import { normalizarEquipo } from "./validacion";

/** Alta, duplicado y folio de recorridas. */

export interface DatosCabecera {
  equipo: string;
  empresa?: string;
  operadora?: string;
  contrato?: string;
  fechaRelevamiento?: string;
  pozoLocacion: string;
  auditoriaProgramada?: string;
  equipoRecorrida: string;
  companyRepresentative?: string;
  notas?: string;
}

/**
 * Folio REC-<EQUIPO>-<yyyyMMdd>-<HHmm>.
 * El equipo se reduce a ASCII alfanumerico: el folio viaja en nombres de archivo y en el
 * Title de SharePoint, donde una barra o un acento se vuelven un problema.
 */
export function generarFolio(equipo: string, fecha: Date = new Date()): string {
  const slug =
    normalizarEquipo(equipo)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "EQUIPO";
  const p = (n: number) => String(n).padStart(2, "0");
  const ymd = `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}`;
  const hm = `${p(fecha.getHours())}${p(fecha.getMinutes())}`;
  return `REC-${slug}-${ymd}-${hm}`;
}

function nuevoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function registroVacio(itemId: number): RegistroItem {
  return { itemId, estado: "SIN_REVISAR", evidencia: [] };
}

/** Crea la recorrida con un registro SIN_REVISAR por cada item del catalogo. */
export function crearRecorrida(
  datos: DatosCabecera,
  catalogo: readonly ItemCatalogo[] = CATALOGO,
  ahora: Date = new Date(),
): Recorrida {
  const iso = ahora.toISOString();
  return {
    id: nuevoId(),
    equipo: datos.equipo.trim(),
    empresa: datos.empresa?.trim() || EMPRESA_DEFAULT,
    operadora: datos.operadora,
    contrato: datos.contrato,
    fechaRelevamiento: datos.fechaRelevamiento ?? iso,
    pozoLocacion: datos.pozoLocacion.trim(),
    auditoriaProgramada: datos.auditoriaProgramada,
    equipoRecorrida: datos.equipoRecorrida.trim(),
    companyRepresentative: datos.companyRepresentative,
    notas: datos.notas,
    registros: catalogo.map((it) => registroVacio(it.id)),
    itemsAdicionales: [],
    cerrada: false,
    creadaEn: iso,
    actualizadaEn: iso,
    indiceActual: 0,
    folio: generarFolio(datos.equipo, ahora),
  };
}

/**
 * Aplica la semilla de informes externos: los items ya corregidos en la ultima inspeccion se
 * precargan en OK con la observacion de seguimiento. Los del mapa de apariciones NO se
 * precargan: solo alimentan la propuesta de reiteracion cuando el inspector los marque NO OK.
 */
export function aplicarSemilla(
  recorrida: Recorrida,
  semilla: SemillaEquipo,
  ahora: Date = new Date(),
): Recorrida {
  if (normalizarEquipo(semilla.equipo) !== normalizarEquipo(recorrida.equipo)) return recorrida;

  const corregidos = new Set(semilla.corregidosUltimaInspeccion);
  const iso = ahora.toISOString();

  return {
    ...recorrida,
    registros: recorrida.registros.map((r) =>
      corregidos.has(r.itemId) && r.estado === "SIN_REVISAR"
        ? { ...r, estado: "OK" as const, fechaVerif: iso, observaciones: OBS_CORREGIDO }
        : r,
    ),
    actualizadaEn: iso,
  };
}

/**
 * Duplica una recorrida anterior del mismo equipo: arrastra responsable, plazo y accion
 * correctiva de los items que quedaron NO_OK / EN_PROC y los deja ya marcados como
 * reiterativos, con las veces previas incrementadas.
 *
 * NO arrastra las fotos: la evidencia de una recorrida no vale como evidencia de la siguiente.
 * Por eso los items arrastrados quedan en SIN_REVISAR y hay que volver a fotografiarlos.
 */
export function duplicarRecorrida(
  anterior: Recorrida,
  datos: DatosCabecera,
  catalogo: readonly ItemCatalogo[] = CATALOGO,
  ahora: Date = new Date(),
): Recorrida {
  const nueva = crearRecorrida(datos, catalogo, ahora);
  const catalogoPorId = new Map(catalogo.map((it) => [it.id, it]));
  const previos = new Map(
    anterior.registros
      .filter((r) => r.estado === "NO_OK" || r.estado === "EN_PROC")
      .map((r) => [r.itemId, r]),
  );

  return {
    ...nueva,
    registros: nueva.registros.map((r) => {
      const prev = previos.get(r.itemId);
      if (!prev) return r;
      const criticidad = criticidadEfectiva(prev, catalogoPorId);
      return {
        ...r,
        criticidad: prev.criticidad,
        responsable: prev.responsable,
        plazo: prev.plazo ?? plazoSugerido(criticidad, ahora) ?? undefined,
        accionCorrectiva: prev.accionCorrectiva,
        // Se propone reiterativo, pero sigue en SIN_REVISAR: hay que verificarlo y fotografiarlo.
        origen: undefined,
        reiteracion: undefined,
      };
    }),
    notas: datos.notas ?? `Duplicada de ${anterior.folio ?? anterior.id}`,
  };
}

/** Items del catalogo que quedaron NO conformes, para armar el historial local. */
export function itemsNoConformes(recorrida: Recorrida): number[] {
  return recorrida.registros
    .filter((r) => r.estado === "NO_OK" || r.estado === "EN_PROC")
    .map((r) => r.itemId);
}
