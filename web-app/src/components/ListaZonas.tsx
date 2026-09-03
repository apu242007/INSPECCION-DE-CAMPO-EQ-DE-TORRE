import { useMemo, useState } from "react";
import { HALLAZGO_DERIVADO, ZONAS } from "../data/catalogo";
import { badgeOrigen } from "../lib/reiteracion";
import { criticidadEfectiva, estaEscalado } from "../lib/metrics";
import type { Criticidad, Estado, ItemCatalogo, Origen, Recorrida, RegistroItem } from "../types";
import { CLASE_CRITICIDAD, CLASE_ESTADO, ETIQUETA_CRITICIDAD, ETIQUETA_ESTADO } from "../ui";

/**
 * Vista "Lista": acordeones por zona, en orden alfabético. Es la vista de revisión rápida y
 * el default en escritorio. En móvil, con la recorrida abierta, el default es paso a paso.
 */

export interface Filtros {
  zona: string;
  criticidad: string;
  estado: string;
  origen: string;
  fuente: string;
  texto: string;
  soloPendientes: boolean;
}

export const FILTROS_VACIOS: Filtros = {
  zona: "",
  criticidad: "",
  estado: "",
  origen: "",
  fuente: "",
  texto: "",
  soloPendientes: false,
};

export function aplicarFiltros(
  registros: readonly RegistroItem[],
  catalogo: ReadonlyMap<number, ItemCatalogo>,
  f: Filtros,
): RegistroItem[] {
  const texto = f.texto.trim().toLowerCase();
  return registros.filter((r) => {
    const info = catalogo.get(r.itemId);
    if (f.zona && info?.zona !== f.zona) return false;
    if (f.criticidad && criticidadEfectiva(r, catalogo) !== f.criticidad) return false;
    if (f.estado && r.estado !== f.estado) return false;
    if (f.origen && r.origen !== f.origen) return false;
    if (f.fuente && r.reiteracion?.fuente !== f.fuente) return false;
    if (f.soloPendientes && r.estado !== "SIN_REVISAR" && r.estado !== "NO_OK" && r.estado !== "EN_PROC")
      return false;
    if (texto) {
      const heno = `${r.itemId} ${info?.item ?? ""} ${info?.hallazgoTipico ?? ""} ${
        r.observaciones ?? ""
      } ${r.responsable ?? ""}`.toLowerCase();
      if (!heno.includes(texto)) return false;
    }
    return true;
  });
}

interface Props {
  recorrida: Recorrida;
  catalogo: ReadonlyMap<number, ItemCatalogo>;
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  onAbrirItem: (itemId: number) => void;
  /** Ítems que el usuario quiere ver resaltados (ej.: los que faltan foto al cerrar). */
  resaltados?: ReadonlySet<number>;
}

export function ListaZonas({
  recorrida,
  catalogo,
  filtros,
  onFiltros,
  onAbrirItem,
  resaltados,
}: Props) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [ayudaDe, setAyudaDe] = useState<number | null>(null);

  const visibles = useMemo(
    () => aplicarFiltros(recorrida.registros, catalogo, filtros),
    [recorrida.registros, catalogo, filtros],
  );

  const idsAdicionales = useMemo(
    () => new Set(recorrida.itemsAdicionales.map((a) => a.id)),
    [recorrida.itemsAdicionales],
  );

  const porZona = useMemo(() => {
    const mapa = new Map<string, RegistroItem[]>();
    for (const r of visibles) {
      const zona = catalogo.get(r.itemId)?.zona ?? "Sin zona";
      const lista = mapa.get(zona);
      if (lista) lista.push(r);
      else mapa.set(zona, [r]);
    }
    // Los adicionales se muestran al final de su zona.
    for (const lista of mapa.values()) {
      lista.sort((a, b) => {
        const adA = idsAdicionales.has(a.itemId) ? 1 : 0;
        const adB = idsAdicionales.has(b.itemId) ? 1 : 0;
        return adA - adB || a.itemId - b.itemId;
      });
    }
    return mapa;
  }, [visibles, catalogo, idsAdicionales]);

  const zonasOrdenadas = [...ZONAS, ...[...porZona.keys()].filter((z) => !ZONAS.includes(z))].filter(
    (z) => porZona.has(z),
  );

  function alternar(zona: string) {
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(zona)) s.delete(zona);
      else s.add(zona);
      return s;
    });
  }

  return (
    <div className="space-y-3">
      <BarraFiltros filtros={filtros} onFiltros={onFiltros} visibles={visibles.length} />

      {zonasOrdenadas.map((zona) => {
        const registros = porZona.get(zona) ?? [];
        const revisados = registros.filter((r) => r.estado !== "SIN_REVISAR").length;
        const noOk = registros.filter((r) => r.estado === "NO_OK" || r.estado === "EN_PROC").length;
        const reiterativos = registros.filter((r) => r.origen === "REITERATIVO").length;
        const abierta = abiertas.has(zona);

        return (
          <section key={zona} className="tarjeta p-0">
            <button
              type="button"
              aria-expanded={abierta}
              className="flex w-full items-center gap-3 p-3 text-left"
              onClick={() => alternar(zona)}
            >
              <span className="text-xl font-bold" aria-hidden>
                {abierta ? "▾" : "▸"}
              </span>
              <span className="flex-1 text-lg font-bold">{zona}</span>
              <span className="text-sm text-stone-600">
                {revisados}/{registros.length}
              </span>
              {noOk > 0 && <span className="badge bg-noOk">{noOk} NO OK</span>}
              {reiterativos > 0 && <span className="badge bg-violet-700">×{reiterativos}</span>}
            </button>

            {abierta && (
              <ul className="divide-y divide-stone-200 border-t border-stone-200">
                {registros.map((r) => {
                  const info =
                    catalogo.get(r.itemId) ??
                    recorrida.itemsAdicionales.find((a) => a.id === r.itemId);
                  const criticidad = criticidadEfectiva(r, catalogo);
                  const escalado = estaEscalado(r, catalogo);
                  return (
                    <li
                      key={r.itemId}
                      className={`p-3 ${resaltados?.has(r.itemId) ? "bg-red-50" : ""}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-stone-500">#{r.itemId}</span>
                        <span className={`badge ${CLASE_CRITICIDAD[criticidad as Criticidad]}`}>
                          {ETIQUETA_CRITICIDAD[criticidad as Criticidad]}
                        </span>
                        <span className={`badge ${CLASE_ESTADO[r.estado]}`}>
                          {ETIQUETA_ESTADO[r.estado]}
                        </span>
                        {idsAdicionales.has(r.itemId) && (
                          <span className="badge bg-stone-800">ADICIONAL</span>
                        )}
                        {r.origen && (
                          <span
                            className={`badge ${
                              r.origen === "NUEVO" ? "bg-blue-700" : "bg-violet-700"
                            }`}
                          >
                            {badgeOrigen(r.origen, r.reiteracion)}
                            {r.reiteracion?.detectadaAutomaticamente ? " 🔎" : ""}
                          </span>
                        )}
                        {escalado && <span className="badge bg-critica">ESCALADO</span>}
                        {r.evidencia.length > 0 && (
                          <span className="text-sm">📷 {r.evidencia.length}</span>
                        )}
                        {r.sync && (
                          <span
                            title={r.syncError ?? r.sync}
                            className={
                              r.sync === "SINCRONIZADO"
                                ? "text-ok"
                                : r.sync === "ERROR"
                                  ? "text-noOk"
                                  : "text-stone-400"
                            }
                          >
                            ☁️
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-base leading-snug">{info?.item}</p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="boton-secundario min-h-[40px] px-3 text-sm"
                          onClick={() => onAbrirItem(r.itemId)}
                        >
                          Abrir
                        </button>
                        {info?.hallazgoTipico && (
                          <button
                            type="button"
                            className="boton-secundario min-h-[40px] px-3 text-sm"
                            aria-expanded={ayudaDe === r.itemId}
                            onClick={() => setAyudaDe(ayudaDe === r.itemId ? null : r.itemId)}
                          >
                            ?
                          </button>
                        )}
                      </div>

                      {ayudaDe === r.itemId && info && (
                        <div className="mt-2 rounded border-l-4 border-stone-800 bg-stone-100 p-3 text-sm">
                          <p className="font-bold">Cómo se redacta si falla:</p>
                          <p className="mt-1">{info.hallazgoTipico}</p>
                          {HALLAZGO_DERIVADO.has(info.id) && (
                            <p className="mt-2 italic text-stone-600">
                              Redacción derivada de la condición, todavía no tomada del informe real.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {zonasOrdenadas.length === 0 && (
        <p className="tarjeta text-center text-base">Ningún ítem coincide con los filtros.</p>
      )}
    </div>
  );
}

function BarraFiltros({
  filtros,
  onFiltros,
  visibles,
}: {
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  visibles: number;
}) {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onFiltros({ ...filtros, [k]: v });

  return (
    <div className="sticky top-0 z-10 space-y-2 border-b-2 border-stone-300 bg-stone-50 p-2">
      <input
        type="search"
        className="campo"
        placeholder="Buscar en los ítems…"
        value={filtros.texto}
        onChange={(e) => set("texto", e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select className="campo" value={filtros.zona} onChange={(e) => set("zona", e.target.value)}>
          <option value="">Todas las zonas</option>
          {ZONAS.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <select
          className="campo"
          value={filtros.criticidad}
          onChange={(e) => set("criticidad", e.target.value)}
        >
          <option value="">Toda criticidad</option>
          {(["CRITICA", "MAYOR", "MENOR", "GENERAL"] as Criticidad[]).map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CRITICIDAD[c]}
            </option>
          ))}
        </select>
        <select
          className="campo"
          value={filtros.estado}
          onChange={(e) => set("estado", e.target.value)}
        >
          <option value="">Todo estado</option>
          {(["SIN_REVISAR", "OK", "NO_OK", "EN_PROC", "NA"] as Estado[]).map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </option>
          ))}
        </select>
        <select
          className="campo"
          value={filtros.origen}
          onChange={(e) => set("origen", e.target.value)}
        >
          <option value="">Nuevos y reiterativos</option>
          {(["NUEVO", "REITERATIVO"] as Origen[]).map((o) => (
            <option key={o} value={o}>
              {o === "NUEVO" ? "Solo nuevos" : "Solo reiterativos"}
            </option>
          ))}
        </select>
        <select
          className="campo"
          value={filtros.fuente}
          onChange={(e) => set("fuente", e.target.value)}
        >
          <option value="">Toda fuente</option>
          <option value="RECORRIDA_INTERNA">Recorrida interna</option>
          <option value="AUDITORIA_EXTERNA">Auditoría externa</option>
          <option value="AMBAS">Ambas</option>
        </select>
        <button
          type="button"
          aria-pressed={filtros.soloPendientes}
          className={`min-h-[48px] rounded-lg border-2 px-3 font-bold ${
            filtros.soloPendientes
              ? "border-stone-900 bg-stone-900 text-white"
              : "border-stone-400 bg-white"
          }`}
          onClick={() => set("soloPendientes", !filtros.soloPendientes)}
        >
          Solo pendientes
        </button>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>{visibles} ítem(s)</span>
        <button type="button" className="font-bold underline" onClick={() => onFiltros(FILTROS_VACIOS)}>
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}
