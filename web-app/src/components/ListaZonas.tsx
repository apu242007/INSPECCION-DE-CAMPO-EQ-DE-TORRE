import { useEffect, useMemo, useRef, useState } from "react";
import { ZONAS } from "../data/catalogo";
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
import { CLASE_CRITICIDAD, ETIQUETA_CRITICIDAD, ETIQUETA_ESTADO, claseLarguero } from "../ui";
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
  // Zonas forzadas manualmente (true = forzada abierta, false = forzada cerrada). Sin
  // entrada acá, el plegado es automático: se cierra sola al completarse.
  const [overrideZona, setOverrideZona] = useState<Map<string, boolean>>(new Map());
  // Item que, además, el usuario reabrió a mano para revisarlo de nuevo.
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [deshacer, setDeshacer] = useState<{ itemId: number; anterior: Estado } | null>(null);
  const deshacerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refsFila = useRef<Map<number, HTMLLIElement>>(new Map());

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

  // Orden real en pantalla: sirve para saber cuál es "el siguiente pendiente" después de marcar.
  const ordenVisible = useMemo(
    () => zonasOrdenadas.flatMap((z) => (porZona.get(z) ?? []).map((r) => r.itemId)),
    [zonasOrdenadas, porZona],
  );

  function alternarZona(zona: string, abiertaActual: boolean) {
    setOverrideZona((prev) => {
      const m = new Map(prev);
      m.set(zona, !abiertaActual);
      return m;
    });
  }

  const bloqueado = recorrida.cerrada;
  const pendientes = recorrida.registros.filter((r) => r.estado === "SIN_REVISAR").length;

  /** Marcar desde la fila: guarda el estado anterior por 5 s para poder deshacer, y baja
   *  el scroll al siguiente ítem pendiente. Sin esto, el colapso de la fila que se acaba
   *  de marcar mueve el contenido bajo el dedo, que es peor que no colapsar. */
  function marcar(itemId: number, estado: Estado) {
    const anterior = recorrida.registros.find((r) => r.itemId === itemId)?.estado ?? "SIN_REVISAR";
    onCambiarEstado(itemId, estado);

    if (deshacerTimer.current) clearTimeout(deshacerTimer.current);
    setDeshacer({ itemId, anterior });
    deshacerTimer.current = setTimeout(() => setDeshacer(null), 5000);

    const idx = ordenVisible.indexOf(itemId);
    const siguiente = ordenVisible
      .slice(idx + 1)
      .find((id) => recorrida.registros.find((r) => r.itemId === id)?.estado === "SIN_REVISAR");
    if (siguiente !== undefined) {
      requestAnimationFrame(() => {
        refsFila.current.get(siguiente)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }

  useEffect(() => () => {
    if (deshacerTimer.current) clearTimeout(deshacerTimer.current);
  }, []);

  return (
    <div className="space-y-3">
      <BarraFiltros
        filtros={filtros}
        onFiltros={onFiltros}
        visibles={visibles.length}
        pendientes={pendientes}
        onCerrarTodas={() => setOverrideZona(new Map(zonasOrdenadas.map((z) => [z, false])))}
        onAbrirTodas={() => setOverrideZona(new Map(zonasOrdenadas.map((z) => [z, true])))}
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
            const completa = revisados === registros.length;
            // Automático salvo que el usuario haya forzado el estado a mano. Una zona con
            // hallazgos abiertos nunca se pliega sola: eso hay que seguir viéndolo.
            const abierta = overrideZona.has(zona)
              ? (overrideZona.get(zona) as boolean)
              : !(completa && noOk === 0);

            return (
              /*
                El montante pintado por el estado de la zona. Apiladas, las secciones se leen
                como la celosía del mástil que se va subiendo: rojo donde hay hallazgos, verde
                donde está terminado, gris donde falta.
              */
              <section
                key={zona}
                className={`panel overflow-hidden ${claseLarguero({
                  noConformes: noOk,
                  revisados,
                  total: registros.length,
                })}`}
              >
                <h3 className="sticky top-0 z-[1] bg-acero-50">
                  <button
                    type="button"
                    aria-expanded={abierta}
                    className="flex w-full items-center gap-2.5 border-b border-acero-200 px-3 py-2 text-left"
                    onClick={() => alternarZona(zona, abierta)}
                  >
                    <span aria-hidden className="w-3 shrink-0 text-acero-500">
                      {abierta ? "▾" : "▸"}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate"
                      style={{ fontStretch: "88%", fontWeight: 700 }}
                    >
                      {zona}
                    </span>
                    {noOk > 0 && <span className="badge bg-critico">{noOk} NO OK</span>}
                    <span
                      className={`cifras w-14 shrink-0 text-right text-sm font-semibold ${
                        completa ? "text-conforme-ink" : "text-acero-500"
                      }`}
                    >
                      {revisados}/{registros.length}
                    </span>
                  </button>
                </h3>

                <div className="zona-cuerpo" data-plegada={!abierta}>
                  <div>
                    <ul>
                      {registros.map((r) => {
                      const info =
                        catalogo.get(r.itemId) ??
                        recorrida.itemsAdicionales.find((a) => a.id === r.itemId);
                      const criticidad = criticidadEfectiva(r, catalogo) as Criticidad;
                      const noConforme = r.estado === "NO_OK" || r.estado === "EN_PROC";
                      const faltaFoto = noConforme && r.evidencia.length === 0;
                      const resaltado = Boolean(resaltados?.has(r.itemId));
                      const marcado = r.estado !== "SIN_REVISAR";
                      const colapsada =
                        marcado && !faltaFoto && !resaltado && !expandidos.has(r.itemId);

                      if (colapsada) {
                        return (
                          <li
                            key={r.itemId}
                            ref={(el) => {
                              if (el) refsFila.current.set(r.itemId, el);
                              else refsFila.current.delete(r.itemId);
                            }}
                          >
                            <button
                              type="button"
                              className={`fila-hecha flex w-full items-center gap-2 px-3 text-left text-sm ${
                                r.estado === "OK" ? "text-conforme-ink" : ""
                              }`}
                              onClick={() =>
                                setExpandidos((prev) => new Set(prev).add(r.itemId))
                              }
                            >
                              <span className="chapa shrink-0">#{r.itemId}</span>
                              <span className="min-w-0 flex-1 truncate">{info?.item}</span>
                              <span className="shrink-0 font-semibold">
                                {r.estado === "OK" ? "✓ OK" : ETIQUETA_ESTADO[r.estado]}
                              </span>
                            </button>
                          </li>
                        );
                      }

                      return (
                        <li
                          key={r.itemId}
                          ref={(el) => {
                            if (el) refsFila.current.set(r.itemId, el);
                            else refsFila.current.delete(r.itemId);
                          }}
                          className={`fila px-3 py-2 ${
                            faltaFoto || resaltado
                              ? "bg-critico-suave"
                              : r.estado === "OK"
                                ? "bg-conforme-suave"
                                : ""
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {/* El número es con lo que se habla del hallazgo por radio y con lo
                                que aparece en el informe: va estampado, no en gris chico. */}
                            <span className="chapa mt-0.5">#{r.itemId}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[0.95rem] leading-snug">{info?.item}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {/* Solo CRÍTICA se destaca como badge: con ~70% de los ítems en
                                    MAYOR, un badge naranja en casi toda fila deja de ser señal.
                                    El resto de la criticidad ya se lee en el montante de la zona. */}
                                {criticidad === "CRITICA" && (
                                  <span className={`badge ${CLASE_CRITICIDAD[criticidad]}`}>
                                    {ETIQUETA_CRITICIDAD[criticidad]}
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
                                  </span>
                                )}
                                {estaEscalado(r, catalogo) && (
                                  <span className="badge bg-critico">Escalado</span>
                                )}
                                {/* Un solo control para ver el hallazgo típico y editar
                                    responsable/plazo/acción correctiva: el detalle ya
                                    incluye el hallazgo típico detrás de su propio "?". */}
                                <button
                                  type="button"
                                  aria-label={`Detalle del ítem ${r.itemId}`}
                                  className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border border-acero-500 px-1.5 text-xs font-bold text-acero-700"
                                  onClick={() => onAbrirItem(r.itemId)}
                                >
                                  ⋯
                                </button>
                                {marcado && (
                                  <button
                                    type="button"
                                    className="text-xs text-acero-500 underline"
                                    onClick={() =>
                                      setExpandidos((prev) => {
                                        const s = new Set(prev);
                                        s.delete(r.itemId);
                                        return s;
                                      })
                                    }
                                  >
                                    Listo, replegar
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* La acción principal: marcar. Siempre visible, un toque. */}
                          <div className="ml-9 mt-1.5">
                            <SelectorEstado
                              actual={r.estado}
                              deshabilitado={bloqueado}
                              etiqueta={`Estado del ítem ${r.itemId}`}
                              onElegir={(estado) => marcar(r.itemId, estado)}
                            />
                          </div>

                          {/* Un NO OK sin foto no se puede dejar así: la cámara aparece acá
                              mismo, sin abrir otra pantalla. */}
                          {noConforme && !bloqueado && (
                            <div className="ml-9 mt-2">
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
                            <p className="ml-9 mt-1 text-sm text-acero-500">
                              {r.evidencia.length} foto(s) · {ETIQUETA_ESTADO[r.estado]}
                            </p>
                          )}
                        </li>
                      );
                      })}
                    </ul>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {deshacer && (
        <div
          role="status"
          className="fixed inset-x-0 z-40 mx-auto flex w-fit items-center gap-3 rounded-[3px] bg-acero-950 px-4 py-2.5 text-sm text-white shadow-lg"
          style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <span>Ítem #{deshacer.itemId} marcado.</span>
          <button
            type="button"
            className="font-bold underline"
            onClick={() => {
              onCambiarEstado(deshacer.itemId, deshacer.anterior);
              setDeshacer(null);
            }}
          >
            Deshacer
          </button>
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
          className={`boton-secundario shrink-0 ${
            filtros.soloPendientes ? "bg-acero-900 text-papel" : "border-acero-300"
          }`}
          onClick={() => set("soloPendientes", !filtros.soloPendientes)}
        >
          Pendientes{pendientes > 0 ? ` (${pendientes})` : ""}
        </button>
        <button
          type="button"
          aria-expanded={abiertos}
          className="boton-secundario shrink-0 border-acero-300"
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
