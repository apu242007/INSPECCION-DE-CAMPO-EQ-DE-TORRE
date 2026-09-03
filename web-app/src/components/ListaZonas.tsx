import { useMemo, useState } from "react";
import { HALLAZGO_DERIVADO, ZONAS } from "../data/catalogo";
import { badgeOrigen } from "../lib/reiteracion";
import { criticidadEfectiva, estaEscalado } from "../lib/metrics";
import type { Criticidad, Estado, ItemCatalogo, Origen, Recorrida, RegistroItem } from "../types";
import {
  CLASE_CRITICIDAD,
  CLASE_ESTADO,
  ETIQUETA_CRITICIDAD,
  ETIQUETA_ESTADO,
  ETIQUETA_ESTADO_CORTA,
} from "../ui";

/**
 * Vista "Lista": las 17 zonas como acordeones.
 *
 * Van todas dentro de UN panel con separadores finos, no como 17 tarjetas sueltas: una tarjeta
 * por zona convierte un índice de 17 líneas en un scroll de tres pantallas, y el usuario deja
 * de poder abarcar la recorrida de un vistazo, que es justo para lo que sirve esta vista.
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

function hayFiltrosAvanzados(f: Filtros): boolean {
  return Boolean(f.zona || f.criticidad || f.estado || f.origen || f.fuente);
}

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
    if (
      f.soloPendientes &&
      r.estado !== "SIN_REVISAR" &&
      r.estado !== "NO_OK" &&
      r.estado !== "EN_PROC"
    )
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
  /** Ítems a resaltar (por ejemplo, los que bloquean el cierre por falta de foto). */
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
      const zona =
        catalogo.get(r.itemId)?.zona ??
        recorrida.itemsAdicionales.find((a) => a.id === r.itemId)?.zona ??
        "Sin zona";
      const lista = mapa.get(zona);
      if (lista) lista.push(r);
      else mapa.set(zona, [r]);
    }
    // Los adicionales van al final de su zona.
    for (const lista of mapa.values()) {
      lista.sort((a, b) => {
        const adA = idsAdicionales.has(a.itemId) ? 1 : 0;
        const adB = idsAdicionales.has(b.itemId) ? 1 : 0;
        return adA - adB || a.itemId - b.itemId;
      });
    }
    return mapa;
  }, [visibles, catalogo, recorrida.itemsAdicionales, idsAdicionales]);

  const zonasOrdenadas = [
    ...ZONAS,
    ...[...porZona.keys()].filter((z) => !ZONAS.includes(z)),
  ].filter((z) => porZona.has(z));

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

      {zonasOrdenadas.length === 0 ? (
        <p className="panel px-6 py-10 text-center text-acero-700">
          Ningún ítem coincide con los filtros.
        </p>
      ) : (
        <div className="panel overflow-hidden">
          {zonasOrdenadas.map((zona) => {
            const registros = porZona.get(zona) ?? [];
            const revisados = registros.filter((r) => r.estado !== "SIN_REVISAR").length;
            const noOk = registros.filter(
              (r) => r.estado === "NO_OK" || r.estado === "EN_PROC",
            ).length;
            const reiterativos = registros.filter((r) => r.origen === "REITERATIVO").length;
            const abierta = abiertas.has(zona);
            const completa = revisados === registros.length;

            return (
              <section key={zona} className="fila">
                <h3>
                  <button
                    type="button"
                    aria-expanded={abierta}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left md:px-4"
                    onClick={() => alternar(zona)}
                  >
                    <span aria-hidden className="w-3 shrink-0 text-acero-500">
                      {abierta ? "▾" : "▸"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{zona}</span>

                    {noOk > 0 && <span className="badge bg-critico">{noOk} NO OK</span>}
                    {reiterativos > 0 && <span className="badge bg-reiterado">×{reiterativos}</span>}
                    <span
                      className={`cifras w-14 shrink-0 text-right text-sm ${
                        completa ? "text-conforme-ink" : "text-acero-500"
                      }`}
                    >
                      {revisados}/{registros.length}
                    </span>
                  </button>
                </h3>

                {abierta && (
                  <ul className="border-t border-acero-200 bg-acero-50">
                    {registros.map((r) => {
                      const info =
                        catalogo.get(r.itemId) ??
                        recorrida.itemsAdicionales.find((a) => a.id === r.itemId);
                      const criticidad = criticidadEfectiva(r, catalogo) as Criticidad;
                      const escalado = estaEscalado(r, catalogo);
                      const sinRevisar = r.estado === "SIN_REVISAR";

                      return (
                        <li
                          key={r.itemId}
                          className={`fila ${resaltados?.has(r.itemId) ? "bg-critico-suave" : ""}`}
                        >
                          <button
                            type="button"
                            className="w-full px-3 py-2.5 text-left md:px-4"
                            onClick={() => onAbrirItem(r.itemId)}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="cifras text-sm font-semibold text-acero-500">
                                #{r.itemId}
                              </span>
                              <span className={`badge ${CLASE_CRITICIDAD[criticidad]}`}>
                                {ETIQUETA_CRITICIDAD[criticidad]}
                              </span>
                              {/* «Sin revisar» es el estado por defecto: no merece un badge sólido
                                  compitiendo con los estados que sí dicen algo. */}
                              {sinRevisar ? (
                                <span className="text-sm text-acero-500">
                                  {ETIQUETA_ESTADO_CORTA.SIN_REVISAR}
                                </span>
                              ) : (
                                <span className={`badge ${CLASE_ESTADO[r.estado]}`}>
                                  {ETIQUETA_ESTADO[r.estado]}
                                </span>
                              )}
                              {idsAdicionales.has(r.itemId) && (
                                <span className="badge bg-acero-900">Adicional</span>
                              )}
                              {r.origen && (
                                <span
                                  className={`badge ${
                                    r.origen === "NUEVO" ? "bg-nuevo" : "bg-reiterado"
                                  }`}
                                >
                                  {badgeOrigen(r.origen, r.reiteracion)}
                                  {r.reiteracion?.detectadaAutomaticamente ? " ◆" : ""}
                                </span>
                              )}
                              {escalado && <span className="badge bg-critico">Escalado</span>}
                              {r.evidencia.length > 0 && (
                                <span className="cifras text-sm text-acero-500">
                                  {r.evidencia.length} foto{r.evidencia.length === 1 ? "" : "s"}
                                </span>
                              )}
                              {r.sync && (
                                <span
                                  title={r.syncError ?? r.sync}
                                  className={`text-sm ${
                                    r.sync === "SINCRONIZADO"
                                      ? "text-conforme-ink"
                                      : r.sync === "ERROR"
                                        ? "text-critico-ink"
                                        : "text-acero-500"
                                  }`}
                                >
                                  {r.sync === "SINCRONIZADO"
                                    ? "enviado"
                                    : r.sync === "ERROR"
                                      ? "error de envío"
                                      : "por enviar"}
                                </span>
                              )}
                            </div>

                            <p className="mt-0.5 text-[0.95rem] leading-snug">{info?.item}</p>
                          </button>

                          {info?.hallazgoTipico && (
                            <div className="px-3 pb-2 md:px-4">
                              <button
                                type="button"
                                className="text-sm font-semibold underline"
                                aria-expanded={ayudaDe === r.itemId}
                                onClick={() => setAyudaDe(ayudaDe === r.itemId ? null : r.itemId)}
                              >
                                {ayudaDe === r.itemId
                                  ? "Ocultar la ayuda"
                                  : "Cómo se redacta si falla"}
                              </button>
                              {ayudaDe === r.itemId && (
                                <div className="mt-2 border-l-4 border-acero-900 bg-papel p-3 text-sm">
                                  <p>{info.hallazgoTipico}</p>
                                  {HALLAZGO_DERIVADO.has(info.id) && (
                                    <p className="mt-2 text-acero-500">
                                      Redacción derivada de la condición, todavía no tomada del
                                      informe original.
                                    </p>
                                  )}
                                </div>
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
        </div>
      )}
    </div>
  );
}

/**
 * En celular solo se muestran la búsqueda y «Solo pendientes», que es lo que se usa casi
 * siempre. Los otros cinco filtros viven detrás de un botón: desplegados ocupaban media
 * pantalla antes de mostrar un solo ítem.
 */
function BarraFiltros({
  filtros,
  onFiltros,
  visibles,
}: {
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  visibles: number;
}) {
  const [abiertos, setAbiertos] = useState(false);
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onFiltros({ ...filtros, [k]: v });
  const avanzados = hayFiltrosAvanzados(filtros);

  return (
    <div className="panel p-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          className="campo min-w-[10rem] flex-1"
          placeholder="Buscar en los ítems"
          value={filtros.texto}
          onChange={(e) => set("texto", e.target.value)}
          aria-label="Buscar en los ítems"
        />
        <button
          type="button"
          aria-pressed={filtros.soloPendientes}
          className={`min-h-[48px] shrink-0 rounded border-2 px-3 font-semibold ${
            filtros.soloPendientes
              ? "border-acero-900 bg-acero-900 text-white"
              : "border-acero-300 bg-papel"
          }`}
          onClick={() => set("soloPendientes", !filtros.soloPendientes)}
        >
          Solo pendientes
        </button>
        <button
          type="button"
          aria-expanded={abiertos}
          className="min-h-[48px] shrink-0 rounded border-2 border-acero-300 bg-papel px-3 font-semibold"
          onClick={() => setAbiertos((v) => !v)}
        >
          Filtros{avanzados ? " ●" : ""}
        </button>
      </div>

      {abiertos && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select
            className="campo"
            value={filtros.zona}
            onChange={(e) => set("zona", e.target.value)}
            aria-label="Zona"
          >
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
            aria-label="Criticidad"
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
            aria-label="Estado"
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
            aria-label="Origen"
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
            aria-label="Fuente de la reiteración"
          >
            <option value="">Toda fuente</option>
            <option value="RECORRIDA_INTERNA">Recorrida interna</option>
            <option value="AUDITORIA_EXTERNA">Auditoría externa</option>
            <option value="AMBAS">Ambas</option>
          </select>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-sm text-acero-700">
        <span className="cifras">
          {visibles} {visibles === 1 ? "ítem" : "ítems"}
        </span>
        {(avanzados || filtros.texto || filtros.soloPendientes) && (
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => onFiltros(FILTROS_VACIOS)}
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
