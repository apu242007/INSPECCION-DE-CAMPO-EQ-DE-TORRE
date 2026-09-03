import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  analisisEquipo,
  calcularKPIs,
  calcularSemaforo,
  diasHastaAuditoria,
  resumenPorZona,
  vencimientos,
} from "../lib/metrics";
import { agruparPorNivel, listaPrioridad } from "../lib/prioridad";
import type { Criticidad, ItemCatalogo, Recorrida, RecorridaHistorial } from "../types";
import {
  CLASE_CRITICIDAD,
  CLASE_SEMAFORO,
  COLOR_ESTADO,
  ETIQUETA_CRITICIDAD,
  EXPLICACION_SEMAFORO,
  fechaSoloDia,
} from "../ui";

interface Props {
  recorrida: Recorrida;
  catalogo: ReadonlyMap<number, ItemCatalogo>;
  historial: readonly RecorridaHistorial[];
  onAbrirItem: (itemId: number) => void;
}

export function Dashboard({ recorrida, catalogo, historial, onAbrirItem }: Props) {
  const hoy = new Date();
  const kpis = useMemo(() => calcularKPIs(recorrida, catalogo, hoy), [recorrida, catalogo]);
  const semaforo = calcularSemaforo(recorrida, catalogo, hoy);
  const porZona = useMemo(() => resumenPorZona(recorrida, catalogo), [recorrida, catalogo]);
  const prioridad = useMemo(() => listaPrioridad(recorrida, catalogo, hoy), [recorrida, catalogo]);
  const vencs = useMemo(() => vencimientos(recorrida, catalogo, hoy), [recorrida, catalogo]);
  const diasAuditoria = diasHastaAuditoria(recorrida, hoy);
  const equipo = useMemo(() => analisisEquipo(historial, catalogo), [historial, catalogo]);

  const datosCriticidad = (["CRITICA", "MAYOR", "MENOR", "GENERAL"] as Criticidad[]).map((c) => ({
    nombre: ETIQUETA_CRITICIDAD[c],
    cantidad: kpis.porCriticidad[c],
    color: c === "CRITICA" ? "#b91c1c" : c === "MAYOR" ? "#c2410c" : c === "MENOR" ? "#a16207" : "#52525b",
  }));

  const datosOrigen = [
    { nombre: "Nuevos", valor: kpis.noOkNuevos, color: "#1d4ed8" },
    { nombre: "Reiterativos", valor: kpis.noOkReiterativos, color: "#6d28d9" },
  ].filter((d) => d.valor > 0);

  return (
    <div className="space-y-4">
      <div className={`rounded-lg p-4 text-white ${CLASE_SEMAFORO[semaforo]}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold">SEMÁFORO {semaforo}</span>
          <span className="text-xl font-semibold">{kpis.pctAvance}% de avance</span>
        </div>
        <p className="mt-1 text-sm opacity-90">{EXPLICACION_SEMAFORO[semaforo]}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Kpi titulo="Total" valor={kpis.total} />
        <Kpi titulo="OK" valor={kpis.ok} color="text-conforme-ink" />
        <Kpi titulo="NO OK" valor={kpis.noOk} color="text-critico-ink" />
        <Kpi titulo="En proceso" valor={kpis.enProc} color="text-mayor-ink" />
        <Kpi titulo="N/A" valor={kpis.na} />
        <Kpi titulo="Sin revisar" valor={kpis.sinRevisar} />
        <Kpi titulo="Nuevos" valor={kpis.noOkNuevos} color="text-nuevo-ink" />
        <Kpi titulo="Reiterativos" valor={kpis.noOkReiterativos} color="text-reiterado-ink" />
      </div>

      {(diasAuditoria !== null || kpis.escalados > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {diasAuditoria !== null && (
            <div className="panel p-4">
              <p className="text-sm font-semibold text-acero-700">Auditoría programada</p>
              <p className="text-2xl font-semibold">
                {diasAuditoria < 0
                  ? `Pasó hace ${Math.abs(diasAuditoria)} día(s)`
                  : `Faltan ${diasAuditoria} día(s)`}
              </p>
              <p className="text-sm">{fechaSoloDia(recorrida.auditoriaProgramada)}</p>
            </div>
          )}
          {kpis.escalados > 0 && (
            <div className="panel p-4 border-critico">
              <p className="text-sm font-semibold text-critico-ink">Escalados a crítico</p>
              <p className="text-2xl font-semibold text-critico-ink">{kpis.escalados}</p>
              <p className="text-sm">MAYOR con plazo vencido sin cerrar (regla YPF).</p>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ gráficos */}
      <section className="panel p-4">
        <h3 className="mb-2 text-lg font-semibold">Estado por zona</h3>
        <div className="tabla-scroll">
          <div style={{ minWidth: 640, height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porZona} margin={{ top: 5, right: 5, bottom: 70, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="zona" angle={-45} textAnchor="end" height={90} interval={0} fontSize={11} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend verticalAlign="top" />
                <Bar dataKey="ok" stackId="e" name="OK" fill={COLOR_ESTADO.OK} />
                <Bar dataKey="noOk" stackId="e" name="NO OK" fill={COLOR_ESTADO.NO_OK} />
                <Bar dataKey="enProc" stackId="e" name="En proc." fill={COLOR_ESTADO.EN_PROC} />
                <Bar dataKey="na" stackId="e" name="N/A" fill={COLOR_ESTADO.NA} />
                <Bar dataKey="sinRevisar" stackId="e" name="Sin revisar" fill={COLOR_ESTADO.SIN_REVISAR} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h3 className="mb-2 text-lg font-semibold">No conformes por criticidad</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosCriticidad}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nombre" fontSize={12} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="cantidad" name="Cantidad">
                  {datosCriticidad.map((d) => (
                    <Cell key={d.nombre} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-4">
          <h3 className="mb-3 text-lg font-semibold">Nuevos y reiterativos</h3>
          {datosOrigen.length === 0 ? (
            <p className="py-12 text-center text-acero-500">Todavía no hay hallazgos.</p>
          ) : datosOrigen.length === 1 ? (
            /* Una torta de una sola porción es un círculo lleno: no informa nada. */
            <p className="py-10 text-center">
              <span className="kpi-valor block text-4xl font-semibold">{datosOrigen[0].valor}</span>
              <span className="text-acero-700">
                {datosOrigen[0].nombre.toLowerCase()}, ninguno{" "}
                {datosOrigen[0].nombre === "Nuevos" ? "reiterativo" : "nuevo"}
              </span>
            </p>
          ) : (
            <>
              <div className="flex h-8 overflow-hidden rounded">
                {datosOrigen.map((d) => (
                  <div
                    key={d.nombre}
                    className="flex items-center justify-center text-sm font-semibold text-white"
                    style={{
                      width: `${(d.valor / datosOrigen.reduce((a, x) => a + x.valor, 0)) * 100}%`,
                      background: d.color,
                    }}
                  >
                    {d.valor}
                  </div>
                ))}
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {datosOrigen.map((d) => (
                  <li key={d.nombre} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-3 w-3 rounded-sm"
                      style={{ background: d.color }}
                    />
                    <span className="flex-1">{d.nombre}</span>
                    <span className="cifras font-semibold">{d.valor}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------------ prioridad */}
      <section className="panel p-4">
        <h3 className="mb-2 text-lg font-semibold">Prioridad de resolución</h3>
        {prioridad.length === 0 ? (
          <p className="text-acero-500">No hay hallazgos abiertos.</p>
        ) : (
          agruparPorNivel(prioridad).map((grupo) => (
            <div key={grupo.nivel} className="mb-3">
              <p className="mb-1 text-sm font-semibold text-acero-700">
                {grupo.nivel}. {grupo.etiqueta} ({grupo.items.length})
              </p>
              <ul className="divide-y divide-acero-200 rounded border border-acero-200">
                {grupo.items.map((i) => (
                  <li key={i.itemId}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-2 p-2 text-left"
                      onClick={() => onAbrirItem(i.itemId)}
                    >
                      <span className={`badge ${CLASE_CRITICIDAD[i.criticidad]}`}>
                        {ETIQUETA_CRITICIDAD[i.criticidad]}
                      </span>
                      <span className="text-sm font-semibold">#{i.itemId}</span>
                      {i.vecesPrevias > 0 && (
                        <span className="badge bg-reiterado">×{i.vecesPrevias}</span>
                      )}
                      {i.escalado && <span className="badge bg-critico">ESCALADO</span>}
                      <span className="flex-1 text-sm">{i.item}</span>
                      {i.plazo && <span className="text-xs text-acero-500">{fechaSoloDia(i.plazo)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* ------------------------------------------------------------ vencimientos */}
      <section className="panel p-4">
        <h3 className="mb-2 text-lg font-semibold">Vencimientos (vencidos y ≤ 7 días)</h3>
        {vencs.length === 0 ? (
          <p className="text-acero-500">Sin vencimientos próximos.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-acero-200 text-left">
                  <th className="p-2">#</th>
                  <th className="p-2">Criticidad</th>
                  <th className="p-2">Plazo</th>
                  <th className="p-2">Días</th>
                  <th className="p-2">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {vencs.map((v) => (
                  <tr key={v.itemId} className={v.vencido ? "bg-critico-suave" : ""}>
                    <td className="p-2">
                      <button className="font-semibold underline" onClick={() => onAbrirItem(v.itemId)}>
                        #{v.itemId}
                      </button>
                    </td>
                    <td className="p-2">
                      <span className={`badge ${CLASE_CRITICIDAD[v.criticidad]}`}>
                        {ETIQUETA_CRITICIDAD[v.criticidad]}
                      </span>
                      {v.escalado && <span className="badge ml-1 bg-critico">ESCALADO</span>}
                    </td>
                    <td className="p-2">{fechaSoloDia(v.plazo)}</td>
                    <td className={`p-2 font-bold ${v.vencido ? "text-critico-ink" : ""}`}>
                      {v.vencido ? `vencido hace ${Math.abs(v.dias)}` : `en ${v.dias}`}
                    </td>
                    <td className="p-2">{v.responsable ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ histórico */}
      {historial.length > 0 && (
        <section className="panel p-4">
          <h3 className="mb-2 text-lg font-semibold">Histórico del equipo {recorrida.equipo}</h3>

          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={equipo.evolucion}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="folio" fontSize={10} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="noConformes" name="No conformes" fill="#b91c1c" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h4 className="mb-1 mt-3 text-base font-semibold">Top 10 ítems más reiterados</h4>
          <ol className="space-y-1 text-sm">
            {equipo.topReiterados.map((t) => (
              <li key={t.itemId} className="flex gap-2">
                <span className="badge bg-reiterado">×{t.apariciones}</span>
                <button className="flex-1 text-left underline" onClick={() => onAbrirItem(t.itemId)}>
                  #{t.itemId} · {t.zona} — {t.item}
                </button>
              </li>
            ))}
          </ol>

          <h4 className="mb-1 mt-3 text-base font-semibold">Zonas con más hallazgos</h4>
          <ul className="text-sm">
            {equipo.zonasConMasHallazgos.slice(0, 6).map((z) => (
              <li key={z.nombre}>
                {z.nombre}: <strong>{z.cantidad}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, color }: { titulo: string; valor: number; color?: string }) {
  return (
    <div className="panel px-3 py-3">
      <p className={`kpi-valor text-3xl font-semibold leading-none ${color ?? ""}`}>{valor}</p>
      <p className="mt-1.5 text-sm leading-tight text-acero-700">{titulo}</p>
    </div>
  );
}
