import { useMemo } from "react";
import { criticidadEfectiva, estaEscalado } from "../../lib/metrics";
import { badgeOrigen } from "../../lib/reiteracion";
import type { Criticidad, ItemCatalogo, Recorrida } from "../../types";
import { CLASE_CRITICIDAD, CLASE_ESTADO, ETIQUETA_CRITICIDAD, ETIQUETA_ESTADO, fechaSoloDia } from "../../ui";
import { aplicarFiltros, type Filtros } from "../ListaZonas";

/**
 * Vista tabla de escritorio. Es para trabajar el pendiente después de la recorrida:
 * asignar responsable y plazo, redactar la acción correctiva, cerrar hallazgos.
 */

interface Props {
  recorrida: Recorrida;
  catalogo: ReadonlyMap<number, ItemCatalogo>;
  filtros: Filtros;
  onAbrirItem: (itemId: number) => void;
  itemSeleccionado?: number;
}

export function TablaOficina({ recorrida, catalogo, filtros, onAbrirItem, itemSeleccionado }: Props) {
  const registros = useMemo(
    () => aplicarFiltros(recorrida.registros, catalogo, filtros),
    [recorrida.registros, catalogo, filtros],
  );
  const idsAdicionales = useMemo(
    () => new Set(recorrida.itemsAdicionales.map((a) => a.id)),
    [recorrida.itemsAdicionales],
  );

  return (
    <div className="tabla-scroll">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="sticky top-0 bg-acero-50">
          <tr className="border-b-2 border-acero-300 text-left">
            <th className="p-2">#</th>
            <th className="p-2">Zona</th>
            <th className="p-2">Crit.</th>
            <th className="p-2">Ítem</th>
            <th className="p-2">Estado</th>
            <th className="p-2">Origen</th>
            <th className="p-2">Resp.</th>
            <th className="p-2">Plazo</th>
            <th className="p-2">Fotos</th>
            <th className="p-2">Final</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => {
            const info =
              catalogo.get(r.itemId) ?? recorrida.itemsAdicionales.find((a) => a.id === r.itemId);
            const criticidad = criticidadEfectiva(r, catalogo) as Criticidad;
            const faltaFoto =
              (r.estado === "NO_OK" || r.estado === "EN_PROC") && r.evidencia.length === 0;
            return (
              <tr
                key={r.itemId}
                className={`cursor-pointer border-b border-acero-200 hover:bg-acero-50 ${
                  itemSeleccionado === r.itemId ? "bg-acero-50" : ""
                } ${faltaFoto ? "bg-critico-suave" : ""}`}
                onClick={() => onAbrirItem(r.itemId)}
              >
                <td className="p-2 font-bold">
                  #{r.itemId}
                  {idsAdicionales.has(r.itemId) && <span className="ml-1 text-xs">＋</span>}
                </td>
                <td className="p-2 whitespace-nowrap">{info?.zona}</td>
                <td className="p-2">
                  <span className={`badge ${CLASE_CRITICIDAD[criticidad]}`}>
                    {ETIQUETA_CRITICIDAD[criticidad]}
                  </span>
                  {estaEscalado(r, catalogo) && <span className="badge ml-1 bg-critico">ESC</span>}
                </td>
                <td className="p-2">{info?.item}</td>
                <td className="p-2">
                  {r.estado === "SIN_REVISAR" ? (
                    <span className="text-sm text-acero-500">Pendiente</span>
                  ) : (
                    <span className={`badge ${CLASE_ESTADO[r.estado]}`}>
                      {ETIQUETA_ESTADO[r.estado]}
                    </span>
                  )}
                </td>
                <td className="p-2 whitespace-nowrap">
                  {r.origen && (
                    <span className={`badge ${r.origen === "NUEVO" ? "bg-nuevo" : "bg-reiterado"}`}>
                      {badgeOrigen(r.origen, r.reiteracion)}
                    </span>
                  )}
                </td>
                <td className="p-2 whitespace-nowrap">{r.responsable ?? "—"}</td>
                <td className="p-2 whitespace-nowrap">{fechaSoloDia(r.plazo)}</td>
                <td className={`p-2 ${faltaFoto ? "font-bold text-critico-ink" : ""}`}>
                  {faltaFoto ? "falta" : r.evidencia.length || "—"}
                </td>
                <td className="p-2">{r.estadoFinal ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {registros.length === 0 && (
        <p className="p-4 text-center">Ningún ítem coincide con los filtros.</p>
      )}
    </div>
  );
}
