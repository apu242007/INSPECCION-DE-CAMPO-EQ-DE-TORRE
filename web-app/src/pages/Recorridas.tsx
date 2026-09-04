import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CATALOGO_POR_ID } from "../data/catalogo";
import { calcularKPIs, calcularSemaforo } from "../lib/metrics";
import * as storage from "../storage";
import type { EntradaIndice } from "../storage";
import type { Semaforo } from "../types";
import { LARGUERO_SEMAFORO, fechaAR } from "../ui";

/**
 * Listado de recorridas.
 *
 * Arranca con una franja de cromo que dice el estado de la flota de un vistazo: cuántas
 * recorridas están abiertas, cuántos hallazgos hay sin cerrar, cuántos son críticos y
 * cuánto quedó sin subir. Es la primera pregunta que se hace quien abre la app un lunes, y
 * antes había que sumarla a ojo leyendo la tabla.
 *
 * Abajo, en celular cada recorrida es una ficha con su montante pintado por el semáforo. En
 * escritorio pasa a tabla: ahí lo que se hace es comparar equipos y encontrar la que quedó a
 * medias, y para eso hacen falta muchas filas juntas, no fichas grandes.
 */

interface Fila extends EntradaIndice {
  pctAvance: number;
  noOk: number;
  criticos: number;
  reiterativos: number;
  pendientesSync: number;
  semaforo: Semaforo;
}

export function Recorridas() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [equipos, setEquipos] = useState<string[]>([]);
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [cargando, setCargando] = useState(true);
  const navigate = useNavigate();

  const cargar = useCallback(async () => {
    setCargando(true);
    const indice = await storage.listarRecorridas();
    const cola = await storage.leerCola();

    const resultado: Fila[] = [];
    for (const e of indice) {
      const r = await storage.leerRecorrida(e.id);
      if (!r) continue;
      const kpis = calcularKPIs(r, CATALOGO_POR_ID);
      resultado.push({
        ...e,
        pctAvance: kpis.pctAvance,
        noOk: kpis.noOk + kpis.enProc,
        criticos: kpis.porCriticidad.CRITICA,
        reiterativos: kpis.noOkReiterativos,
        pendientesSync: cola.filter((t) => t.recorridaId === e.id).length,
        semaforo: calcularSemaforo(r, CATALOGO_POR_ID),
      });
    }
    setFilas(resultado);
    setEquipos(await storage.equiposConocidos());
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(
    () => (filtroEquipo ? filas.filter((f) => f.equipo === filtroEquipo) : filas),
    [filas, filtroEquipo],
  );

  // El resumen es de la flota entera, no del filtro: si filtrás por equipo seguís queriendo
  // saber cuántos críticos hay dando vueltas en total.
  const resumen = useMemo(
    () => ({
      abiertas: filas.filter((f) => !f.cerrada).length,
      hallazgos: filas.reduce((a, f) => a + f.noOk, 0),
      criticos: filas.reduce((a, f) => a + f.criticos, 0),
      porSubir: filas.reduce((a, f) => a + f.pendientesSync, 0),
    }),
    [filas],
  );

  async function eliminar(id: string, folio: string | undefined) {
    if (!confirm(`¿Eliminar la recorrida ${folio ?? id}? No se puede deshacer.`)) return;
    await storage.borrarRecorrida(id);
    await cargar();
  }

  function duplicar(id: string) {
    navigate(`/nueva?duplicarDe=${encodeURIComponent(id)}`);
  }

  return (
    <div>
      <header className="cromo cromo-borde-abajo">
        <div className="mx-auto w-full max-w-6xl px-3 pb-4 pt-5 md:px-6 md:pb-6 md:pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[2rem] leading-none text-white md:text-[2.75rem]">Recorridas</h1>
              <p className="mt-2 text-sm text-white/55">
                Pre-auditoría de equipos de torre · 94 ítems por equipo
              </p>
            </div>
            <Link to="/nueva" className="boton-primario w-auto shrink-0 px-5">
              Nueva recorrida
            </Link>
          </div>

          {filas.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden bg-white/10 sm:grid-cols-4">
              <Cifra etiqueta="Abiertas" valor={resumen.abiertas} />
              <Cifra etiqueta="Hallazgos sin cerrar" valor={resumen.hallazgos} />
              <Cifra
                etiqueta="Críticos"
                valor={resumen.criticos}
                regla={resumen.criticos > 0 ? "border-t-critico-luz" : undefined}
              />
              <Cifra
                etiqueta="Sin subir"
                valor={resumen.porSubir}
                regla={resumen.porSubir > 0 ? "border-t-mayor-luz" : undefined}
              />
            </dl>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl p-3 md:p-6">
        {equipos.length > 1 && (
          <select
            className="campo mb-4 md:max-w-xs"
            value={filtroEquipo}
            onChange={(e) => setFiltroEquipo(e.target.value)}
            aria-label="Filtrar por equipo"
          >
            <option value="">Todos los equipos</option>
            {equipos.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        )}

        {cargando && <p className="py-10 text-center text-acero-500">Cargando…</p>}

        {!cargando && visibles.length === 0 && (
          <div className="panel larguero px-6 py-12 text-center">
            <p className="text-xl font-semibold">Todavía no hay recorridas</p>
            <p className="mx-auto mt-2 max-w-md text-acero-700">
              Al crear una, la app genera los 94 ítems del catálogo en «sin revisar» y arranca en
              el checklist, con el modo campo disponible como opción para recorrer el equipo.
            </p>
            <Link to="/nueva" className="boton-primario mx-auto mt-5 w-fit px-6">
              Crear la primera recorrida
            </Link>
          </div>
        )}

        {/* Celular: fichas. */}
        {visibles.length > 0 && (
          <ul className="space-y-2 lg:hidden">
            {visibles.map((f) => (
              <li key={f.id} className={`panel p-4 ${LARGUERO_SEMAFORO[f.semaforo]}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xl" style={{ fontStretch: "86%", fontWeight: 700 }}>
                    {f.equipo}
                  </span>
                  {f.cerrada && <span className="badge bg-acero-900">Cerrada</span>}
                  {f.pendientesSync > 0 && (
                    <span className="badge bg-mayor">{f.pendientesSync} por subir</span>
                  )}
                </div>

                <p className="cifras mt-0.5 text-sm text-acero-500">
                  {f.pozoLocacion} · {fechaAR(f.fechaRelevamiento)}
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-[1px] bg-acero-200"
                    role="progressbar"
                    aria-valuenow={f.pctAvance}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Avance de la recorrida de ${f.equipo}`}
                  >
                    <div
                      className={`h-full ${f.pctAvance === 100 ? "bg-conforme" : "bg-acero-900"}`}
                      style={{ width: `${f.pctAvance}%` }}
                    />
                  </div>
                  <span className="cifras shrink-0 text-sm font-semibold">{f.pctAvance}%</span>
                </div>

                <div className="cifras mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className={f.noOk > 0 ? "text-critico-ink" : "text-acero-500"}>
                    NO OK <strong>{f.noOk}</strong>
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/recorrida/${f.id}`} className="boton-secundario flex-1">
                    Abrir
                  </Link>
                  <button type="button" className="boton-secundario" onClick={() => duplicar(f.id)}>
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="boton-secundario boton-peligro"
                    onClick={() => void eliminar(f.id, f.folio)}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Escritorio: tabla densa, para comparar equipos de un vistazo. */}
        {visibles.length > 0 && (
          <div className="panel hidden overflow-hidden lg:block">
            <table className="w-full text-left">
              <thead className="border-b border-acero-200 bg-acero-50 text-sm text-acero-700">
                <tr>
                  <th className="py-2 pl-4 pr-3 font-semibold">Equipo</th>
                  <th className="py-2 pr-3 font-semibold">Pozo</th>
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 text-right font-semibold">Avance</th>
                  <th className="py-2 pr-3 text-right font-semibold">NO OK</th>
                  <th className="py-2 pr-3 font-semibold">Envío</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.id} className="fila align-middle">
                    {/* El semáforo deja de ser un punto y pasa a ser el montante de la fila:
                        se ve barriendo la columna, sin tener que buscar un círculo de 12 px. */}
                    <td
                      className={`py-2.5 pl-3 pr-3 ${LARGUERO_SEMAFORO[f.semaforo]}`}
                      aria-label={`Semáforo ${f.semaforo.toLowerCase()}`}
                    >
                      <Link
                        to={`/recorrida/${f.id}`}
                        className="underline"
                        style={{ fontStretch: "90%", fontWeight: 700 }}
                      >
                        {f.equipo}
                      </Link>
                      {f.cerrada && <span className="badge ml-2 bg-acero-900">Cerrada</span>}
                    </td>
                    <td className="py-2.5 pr-3">{f.pozoLocacion}</td>
                    <td className="py-2.5 pr-3">{fechaAR(f.fechaRelevamiento)}</td>
                    <td className="cifras py-2.5 pr-3 text-right font-semibold">{f.pctAvance}%</td>
                    <td
                      className={`cifras py-2.5 pr-3 text-right font-semibold ${
                        f.noOk > 0 ? "text-critico-ink" : "text-acero-300"
                      }`}
                    >
                      {f.noOk || "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-sm">
                      {f.pendientesSync > 0 ? (
                        <span className="text-mayor-ink">{f.pendientesSync} por subir</span>
                      ) : f.sharepointId ? (
                        <span className="text-conforme-ink">En SharePoint</span>
                      ) : (
                        <span className="text-acero-500">Solo local</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex justify-end gap-3 text-sm">
                        <button type="button" className="underline" onClick={() => duplicar(f.id)}>
                          Duplicar
                        </button>
                        <button
                          type="button"
                          className="text-critico-ink underline"
                          onClick={() => void eliminar(f.id, f.folio)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Una cifra del resumen de flota. La regla de color de arriba solo aparece cuando el número
 * pide atención: un rojo permanente deja de significar nada a la tercera vez que se ve.
 */
function Cifra({ etiqueta, valor, regla }: { etiqueta: string; valor: number; regla?: string }) {
  return (
    /*
     * `flex-col-reverse` para poder escribir <dt> antes que <dd>, como exige el HTML, y aun
     * así mostrar el número arriba del rótulo. El montante de color corona la celda y solo
     * aparece cuando el número pide atención.
     */
    <div
      className={`flex flex-col-reverse border-t-[3px] bg-acero-950 px-3 pb-3 pt-2.5 md:px-4 ${
        regla ?? "border-t-white/25"
      }`}
    >
      <dt className="mt-1.5 text-xs leading-tight text-white/55" style={{ fontStretch: "92%" }}>
        {etiqueta}
      </dt>
      <dd
        className="kpi-valor m-0 text-3xl leading-none text-white md:text-4xl"
        style={{ fontWeight: 700 }}
      >
        {valor}
      </dd>
    </div>
  );
}
