import { useMemo, useState } from "react";
import { HALLAZGO_DERIVADO, ZONAS } from "../data/catalogo";
import { badgeOrigen } from "../lib/reiteracion";
import { criticidadEfectiva, estaEscalado } from "../lib/metrics";
import type {
  Criticidad,
  Estado,
  Foto,
  ItemCatalogo,
  Origen,
  Recorrida,
  RegistroItem,
} from "../types";
import { CLASE_CRITICIDAD, ETIQUETA_CRITICIDAD, ETIQUETA_ESTADO } from "../ui";
import { CapturaFoto } from "./campo/CapturaFoto";
import { SelectorEstado } from "./SelectorEstado";

/**
 * Vista "Lista": las 17 zonas, y dentro de cada una los ítems con sus cuatro botones de estado
 * A LA VISTA.
 *
 * La regla que manda acá es la velocidad: marcar un ítem es UN toque. Nada de abrir el ítem
 * para poder marcarlo. Las zonas arrancan desplegadas por lo mismo — se baja scrolleando y
 * marcando, que es como se hace un check de 94 ítems.
 *
 * El detalle de oficina (responsable, plazo, acción correctiva) vive detrás de un enlace
 * chico: es trabajo de escritorio y no tiene por qué estorbar al que está marcando.
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
  /** Marcar el estado desde la fila. Es la acción principal de esta pantalla. */
  onCambiarEstado: (itemId: number, estado: Estado) => void;
  /** Fotos desde la fila: un NO OK no se puede dejar sin evidencia. */
  onFotos: (itemId: number, fotos: Foto[]) => void;
  /** Abre el detalle de oficina (responsable, plazo, acción correctiva). */
  onAbrirItem: (itemId: number) => void;
  resaltados?: ReadonlySet<number>;
}

export function ListaZonas({
  recorrida,
  catalogo,
  filtros,
  onFiltros,
  onCambiarEstado,
  onFotos,
  onAbrirItem,
  resaltados,
}: Props) {
  const [cerradas, setCerradas] = useState<Set<string>>(new Set());
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
    setCerradas((prev) => {
      const s = new Set(prev);
      if (s.has(zona)) s.delete(zona);
      else s.add(zona);
      return s;
    });
  }

  const bloqueado = recorrida.cerrada;
  const pendientes = recorrida.registros.filter((r) => r.estado === "SIN_REVISAR").length;

  return (
    <div className="space-y-3">
      <BarraFiltros
        filtros={filtros}
        onFiltros={onFiltros}
        visibles={visibles.length}
        pendientes={pendientes}
        onCerrarTodas={() => setCerradas(new Set(zonasOrdenadas))}
        onAbrirTodas={() => setCerradas(new Set())}
      />

      {zonasOrdenadas.length === 0 ? (
        <p className="panel px-6 py-10 text-center text-acero-700">
          Ningún ítem coincide con los filtros.
        </p>
      ) : (
        <div className="space-y-2">
          {zonasOrdenadas.map((zona) => {
            const registros = porZona.get(zona) ?? [];
            const revisados = registros.filter((r) => r.estado !== "SIN_REVISAR").length;
            const noOk = registros.filter(
              (r) => r.estado === "NO_OK" || r.estado === "EN_PROC",
            ).length;
            const abierta = !cerradas.has(zona);
            const completa = revisados === registros.length;

            return (
              <section key={zona} className="panel overflow-hidden">
                <h3 className="sticky top-0 z-[1] bg-acero-50">
                  <button
                    type="button"
                    aria-expanded={abierta}
                    className="flex w-full items-center gap-2.5 border-b border-acero-200 px-3 py-2 text-left"
                    onClick={() => alternar(zona)}
                  >
                    <span aria-hidden className="w-3 shrink-0 text-acero-500">
                      {abierta ? "▾" : "▸"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{zona}</span>
                    {noOk > 0 && <span className="badge bg-critico">{noOk} NO OK</span>}
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
                  <ul>
                    {registros.map((r) => {
                      const info =
                        catalogo.get(r.itemId) ??
                        recorrida.itemsAdicionales.find((a) => a.id === r.itemId);
                      const criticidad = criticidadEfectiva(r, catalogo) as Criticidad;
                      const noConforme = r.estado === "NO_OK" || r.estado === "EN_PROC";
                      const faltaFoto = noConforme && r.evidencia.length === 0;

                      return (
                        <li
                          key={r.itemId}
                          className={`fila px-3 py-2 ${
                            faltaFoto || resaltados?.has(r.itemId)
                              ? "bg-critico-suave"
                              : r.estado === "OK"
                                ? "bg-conforme-suave"
                                : ""
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="cifras mt-0.5 w-8 shrink-0 text-sm font-semibold text-acero-500">
                              #{r.itemId}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[0.95rem] leading-snug">{info?.item}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className={`badge ${CLASE_CRITICIDAD[criticidad]}`}>
                                  {ETIQUETA_CRITICIDAD[criticidad]}
                                </span>
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
                                  </span>
                                )}
                                {estaEscalado(r, catalogo) && (
                                  <span className="badge bg-critico">Escalado</span>
                                )}
                                {info?.hallazgoTipico && (
                                  <button
                                    type="button"
                                    aria-label={`Hallazgo típico del ítem ${r.itemId}`}
                                    aria-expanded={ayudaDe === r.itemId}
                                    className="flex h-6 w-6 items-center justify-center rounded-full border border-acero-500 text-xs font-bold text-acero-700"
                                    onClick={() =>
                                      setAyudaDe(ayudaDe === r.itemId ? null : r.itemId)
                                    }
                                  >
                                    ?
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-acero-700 underline"
                                  onClick={() => onAbrirItem(r.itemId)}
                                >
                                  Detalle
                                </button>
                              </div>
                            </div>
                          </div>

                          {ayudaDe === r.itemId && info && (
                            <div className="ml-10 mt-2 border-l-4 border-acero-900 bg-acero-50 p-2.5 text-sm">
                              <p>{info.hallazgoTipico}</p>
                              {HALLAZGO_DERIVADO.has(info.id) && (
                                <p className="mt-1.5 text-acero-500">
                                  Redacción derivada de la condición, todavía no tomada del
                                  informe original.
                                </p>
                              )}
                            </div>
                          )}

                          {/* La acción principal: marcar. Siempre visible, un toque. */}
                          <div className="ml-10 mt-1.5">
                            <SelectorEstado
                              actual={r.estado}
                              deshabilitado={bloqueado}
                              etiqueta={`Estado del ítem ${r.itemId}`}
                              onElegir={(estado) => onCambiarEstado(r.itemId, estado)}
                            />
                          </div>

                          {/* Un NO OK sin foto no se puede dejar así: la cámara aparece acá
                              mismo, sin abrir otra pantalla. */}
                          {noConforme && !bloqueado && (
                            <div className="ml-10 mt-2">
                              {faltaFoto && (
                                <p className="mb-1.5 text-sm font-semibold text-critico-ink">
                                  Falta la foto de este hallazgo.
                                </p>
                              )}
                              <CapturaFoto
                                itemId={r.itemId}
                                fotos={r.evidencia}
                                onCambio={(fotos) => onFotos(r.itemId, fotos)}
                                compacto
                              />
                            </div>
                          )}

                          {noConforme && bloqueado && (
                            <p className="ml-10 mt-1 text-sm text-acero-500">
                              {r.evidencia.length} foto(s) · {ETIQUETA_ESTADO[r.estado]}
                            </p>
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

function BarraFiltros({
  filtros,
  onFiltros,
  visibles,
  pendientes,
  onCerrarTodas,
  onAbrirTodas,
}: {
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  visibles: number;
  pendientes: number;
  onCerrarTodas: () => void;
  onAbrirTodas: () => void;
}) {
  const [abiertos, setAbiertos] = useState(false);
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onFiltros({ ...filtros, [k]: v });
  const avanzados = hayFiltrosAvanzados(filtros);

  return (
    <div className="panel p-2.5">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          className="campo min-w-[9rem] flex-1"
          placeholder="Buscar"
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
          Pendientes{pendientes > 0 ? ` (${pendientes})` : ""}
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

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-acero-700">
        <span className="cifras">
          {visibles} {visibles === 1 ? "ítem" : "ítems"}
        </span>
        <button type="button" className="underline" onClick={onAbrirTodas}>
          Desplegar todo
        </button>
        <button type="button" className="underline" onClick={onCerrarTodas}>
          Plegar todo
        </button>
        {(avanzados || filtros.texto || filtros.soloPendientes) && (
          <button
            type="button"
            className="ml-auto font-semibold underline"
            onClick={() => onFiltros(FILTROS_VACIOS)}
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
