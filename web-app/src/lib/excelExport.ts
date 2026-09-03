import * as XLSX from "xlsx";
import { calcularKPIs, calcularSemaforo, criticidadEfectiva, estaEscalado, resumenPorZona } from "./metrics";
import { badgeOrigen, ETIQUETA_FUENTE } from "./reiteracion";
import type { Criticidad, ItemCatalogo, Recorrida } from "../types";
import { ETIQUETA_CRITICIDAD, ETIQUETA_ESTADO, fechaAR, fechaSoloDia } from "../ui";

/** Exportación a .xlsx: hojas Checklist, Adicionales y Dashboard. */

export function generarExcel(
  recorrida: Recorrida,
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  hoy: Date = new Date(),
): Blob {
  const libro = XLSX.utils.book_new();
  const idsAdicionales = new Set(recorrida.itemsAdicionales.map((a) => a.id));

  // ---------------------------------------------------------------- Checklist
  const checklist = recorrida.registros
    .filter((r) => !idsAdicionales.has(r.itemId))
    .map((r) => {
      const info = catalogo.get(r.itemId);
      const criticidad = criticidadEfectiva(r, catalogo) as Criticidad;
      return {
        "#": r.itemId,
        "Zona/Sistema": info?.zona ?? "",
        "Crit.": ETIQUETA_CRITICIDAD[criticidad] + (estaEscalado(r, catalogo, hoy) ? " (ESCALADO)" : ""),
        Origen: r.origen ? badgeOrigen(r.origen, r.reiteracion) : "",
        "Fuente reiteración": r.reiteracion ? ETIQUETA_FUENTE[r.reiteracion.fuente] : "",
        "Item a verificar": info?.item ?? "",
        Estado: ETIQUETA_ESTADO[r.estado],
        "Fecha verif.": r.fechaVerif ? fechaAR(r.fechaVerif) : "",
        Responsable: r.responsable ?? "",
        Plazo: fechaSoloDia(r.plazo) === "—" ? "" : fechaSoloDia(r.plazo),
        "Acción correctiva": r.accionCorrectiva ?? "",
        Evidencia: r.evidencia.length > 0 ? `${r.evidencia.length} foto(s)` : "",
        "Estado final": r.estadoFinal ?? "",
        Observaciones: r.observaciones ?? "",
      };
    });

  const hojaChecklist = XLSX.utils.json_to_sheet(checklist);
  hojaChecklist["!cols"] = [
    { wch: 5 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 70 },
    { wch: 11 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 40 }, { wch: 12 },
    { wch: 12 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(libro, hojaChecklist, "Checklist");

  // ---------------------------------------------------------------- Adicionales
  const adicionales = recorrida.itemsAdicionales.map((a) => {
    const r = recorrida.registros.find((x) => x.itemId === a.id);
    return {
      "#": a.id,
      "Zona/Sistema": a.zona,
      "Crit.": ETIQUETA_CRITICIDAD[a.criticidadRef],
      "Detectado en recorrida": a.item,
      Estado: r ? ETIQUETA_ESTADO[r.estado] : "",
      Evidencia: r?.evidencia.length ? `${r.evidencia.length} foto(s)` : "",
      Responsable: r?.responsable ?? "",
      Plazo: fechaSoloDia(r?.plazo) === "—" ? "" : fechaSoloDia(r?.plazo),
      "Acción correctiva": r?.accionCorrectiva ?? "",
      "Promovido al catálogo": a.promovidoACatalogo ? "Sí" : "No",
    };
  });
  const hojaAdicionales = XLSX.utils.json_to_sheet(
    adicionales.length > 0 ? adicionales : [{ "#": "", "Zona/Sistema": "Sin ítems adicionales" }],
  );
  hojaAdicionales["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 12 }, { wch: 60 }, { wch: 11 }];
  XLSX.utils.book_append_sheet(libro, hojaAdicionales, "Adicionales");

  // ---------------------------------------------------------------- Dashboard
  const kpis = calcularKPIs(recorrida, catalogo, hoy);
  const encabezado = [
    ["Recorrida", recorrida.folio ?? recorrida.id],
    ["Equipo", recorrida.equipo],
    ["Operadora", recorrida.operadora ?? ""],
    ["Pozo / locación", recorrida.pozoLocacion],
    ["Fecha", fechaAR(recorrida.fechaRelevamiento, true)],
    ["Semáforo", calcularSemaforo(recorrida, catalogo, hoy)],
    ["% avance (excluye N/A)", kpis.pctAvance],
    ["Total", kpis.total],
    ["OK", kpis.ok],
    ["NO OK", kpis.noOk],
    ["En proceso", kpis.enProc],
    ["N/A", kpis.na],
    ["Sin revisar", kpis.sinRevisar],
    ["Nuevos", kpis.noOkNuevos],
    ["Reiterativos", kpis.noOkReiterativos],
    ["Adicionales", kpis.adicionales],
    ["Escalados a crítico", kpis.escalados],
    [],
    ["Zona", "Total", "OK", "NO OK", "En proc.", "N/A", "Sin revisar", "Reiterativos", "% OK"],
    ...resumenPorZona(recorrida, catalogo).map((f) => [
      f.zona, f.total, f.ok, f.noOk, f.enProc, f.na, f.sinRevisar, f.reiterativos, f.pctOk,
    ]),
  ];
  const hojaDashboard = XLSX.utils.aoa_to_sheet(encabezado);
  hojaDashboard["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 13 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(libro, hojaDashboard, "Dashboard");

  const buffer = XLSX.write(libro, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function nombreExcel(recorrida: Recorrida): string {
  return `Recorrida-${recorrida.folio ?? recorrida.id}.xlsx`;
}
