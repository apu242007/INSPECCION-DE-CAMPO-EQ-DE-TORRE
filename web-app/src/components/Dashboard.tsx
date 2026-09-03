import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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
    <div className="space-y-4 p-3">
      <div className={`rounded-lg p-4 text-white ${CLASE_SEMAFORO[semaforo]}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-2xl font-bold">SEMÁFORO {semaforo}</span>
          <span className="text-xl font-bold">{kpis.pctAvance}% de avance</span>
        </div>
        <p className="mt-1 text-sm opacity-90">
          {semaforo === "ROJO"
            ? "Hay hallazgos críticos (o mayores escalados) abiertos, o ítems críticos sin revisar."
            : semaforo === "AMARILLO"
              ? "Hay hallazgos mayores abiertos."
              : "Todos los ítems están conformes o no aplican."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi titulo="Total" valor={kpis.total} />
        <Kpi titulo="OK" valor={kpis.ok} color="text-ok" />
        <Kpi titulo="NO OK" valor={kpis.noOk} color="text-noOk" />
        <Kpi titulo="En proceso" valor={kpis.enProc} color="text-enProc" />
        <Kpi titulo="N/A" valor={kpis.na} />
        <Kpi titulo="Sin revisar" valor={kpis.sinRevisar} />
        <Kpi titulo="Nuevos" valor={kpis.noOkNuevos} color="text-blue-700" />
        <Kpi titulo="Reiterativos" valor={kpis.noOkReiterativos} color="text-violet-700" />
      </div>

      {(diasAuditoria !== null || kpis.escalados > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {diasAuditoria !== null && (
            <div className="tarjeta">
              <p className="text-sm font-bold uppercase text-stone-600">Auditoría programada</p>
              <p className="text-2xl font-bold">
                {diasAuditoria < 0
                  ? `Pasó hace ${Math.abs(diasAuditoria)} día(s)`
                  : `Faltan ${diasAuditoria} día(s)`}
              </p>
              <p className="text-sm">{fechaSoloDia(recorrida.auditoriaProgramada)}</p>
            </div>
          )}
          {kpis.escalados > 0 && (
            <div className="tarjeta border-critica">
              <p className="text-sm font-bold uppercase text-noOk">Escalados a crítico</p>
              <p className="text-2xl font-bold text-noOk">{kpis.escalados}</p>
              <p className="text-sm">MAYOR con plazo vencido sin cerrar (regla YPF).</p>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ gráficos */}
      <section className="tarjeta">
        <h3 className="mb-2 text-lg font-bold">Estado por zona</h3>
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

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="tarjeta">
          <h3 className="mb-2 text-lg font-bold">No conformes por criticidad</h3>
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

        <section className="tarjeta">
          <h3 className="mb-2 text-lg font-bold">Nuevos vs reiterativos</h3>
          {datosOrigen.length === 0 ? (
            <p className="py-16 text-center text-stone-600">Todavía no hay hallazgos.</p>
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={datosOrigen} dataKey="valor" nameKey="nombre" label outerRadius={80}>
                    {datosOrigen.map((d) => (
                      <Cell key={d.nombre} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------------ prioridad */}
      <section className="tarjeta">
        <h3 className="mb-2 text-lg font-bold">Prioridad de resolución</h3>
        {prioridad.length === 0 ? (
          <p className="text-stone-600">No hay hallazgos abiertos.</p>
        ) : (
          agruparPorNivel(prioridad).map((grupo) => (
            <div key={grupo.nivel} className="mb-3">
              <p className="mb-1 text-sm font-bold uppercase text-stone-600">
                {grupo.nivel}. {grupo.etiqueta} ({grupo.items.length})
              </p>
              <ul className="divide-y divide-stone-200 rounded border border-stone-200">
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
                      <span className="text-sm font-bold">#{i.itemId}</span>
                      {i.vecesPrevias > 0 && (
                        <span className="badge bg-violet-700">×{i.vecesPrevias}</span>
                      )}
                      {i.escalado && <span className="badge bg-critica">ESCALADO</span>}
                      <span className="flex-1 text-sm">{i.item}</span>
                      {i.plazo && <span className="text-xs text-stone-600">{fechaSoloDia(i.plazo)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* ------------------------------------------------------------ vencimientos */}
      <section className="tarjeta">
        <h3 className="mb-2 text-lg font-bold">Vencimientos (vencidos y ≤ 7 días)</h3>
        {vencs.length === 0 ? (
          <p className="text-stone-600">Sin vencimientos próximos.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-stone-300 text-left">
                  <th className="p-2">#</th>
                  <th className="p-2">Criticidad</th>
                  <th className="p-2">Plazo</th>
                  <th className="p-2">Días</th>
                  <th className="p-2">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {vencs.map((v) => (
                  <tr key={v.itemId} className={v.vencido ? "bg-red-50" : ""}>
                    <td className="p-2">
                      <button className="font-bold underline" onClick={() => onAbrirItem(v.itemId)}>
                        #{v.itemId}
                      </button>
                    </td>
                    <td className="p-2">
                      <span className={`badge ${CLASE_CRITICIDAD[v.criticidad]}`}>
                        {ETIQUETA_CRITICIDAD[v.criticidad]}
                      </span>
                      {v.escalado && <span className="badge ml-1 bg-critica">ESCALADO</span>}
                    </td>
                    <td className="p-2">{fechaSoloDia(v.plazo)}</td>
                    <td className={`p-2 font-bold ${v.vencido ? "text-noOk" : ""}`}>
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
        <section className="tarjeta">
          <h3 className="mb-2 text-lg font-bold">Histórico del equipo {recorrida.equipo}</h3>

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

          <h4 className="mb-1 mt-3 text-base font-bold">Top 10 ítems más reiterados</h4>
          <ol className="space-y-1 text-sm">
            {equipo.topReiterados.map((t) => (
              <li key={t.itemId} className="flex gap-2">
                <span className="badge bg-violet-700">×{t.apariciones}</span>
                <button className="flex-1 text-left underline" onClick={() => onAbrirItem(t.itemId)}>
                  #{t.itemId} · {t.zona} — {t.item}
                </button>
              </li>
            ))}
          </ol>

          <h4 className="mb-1 mt-3 text-base font-bold">Zonas con más hallazgos</h4>
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
    <div className="tarjeta text-center">
      <p className="text-xs font-bold uppercase text-stone-600">{titulo}</p>
      <p className={`text-3xl font-bold ${color ?? ""}`}>{valor}</p>
    </div>
  );
}
