import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CierreRecorrida } from "../components/CierreRecorrida";
import { FILTROS_VACIOS, ListaZonas, type Filtros } from "../components/ListaZonas";
import { SyncPanel } from "../components/SyncPanel";
import { ItemAdicionalNuevo, siguienteIdAdicional } from "../components/campo/ItemAdicionalNuevo";
import { PasoAPaso } from "../components/campo/PasoAPaso";
import { DetalleItem } from "../components/oficina/DetalleItem";
import { TablaOficina } from "../components/oficina/TablaOficina";
import { useRecorrida } from "../hooks/useRecorrida";
import { descargar } from "../lib/descargar";
import { calcularSemaforo } from "../lib/metrics";
import { cerrarEnSharePoint, enviarRecorrida, MAX_PDF_BYTES } from "../services/sync";
import * as storage from "../storage";
import type { ItemAdicional, RegistroItem } from "../types";
import { CLASE_SEMAFORO, fechaAR } from "../ui";

/**
 * recharts, jsPDF y SheetJS se cargan bajo demanda. En campo, con señal mala, no tiene
 * sentido bajar 900 KB de librerías de reporte para marcar 94 ítems con el pulgar.
 */
const Dashboard = lazy(() =>
  import("../components/Dashboard").then((m) => ({ default: m.Dashboard })),
);

const cargarPdf = () => import("../lib/pdfGenerator");
const cargarExcel = () => import("../lib/excelExport");

type Vista = "campo" | "lista" | "oficina" | "dashboard" | "envio";

const VISTAS: { v: Vista; texto: string }[] = [
  { v: "campo", texto: "Campo" },
  { v: "lista", texto: "Lista" },
  { v: "oficina", texto: "Oficina" },
  { v: "dashboard", texto: "Dashboard" },
  { v: "envio", texto: "Envío y cierre" },
];

/**
 * Un dispositivo de mano no se reconoce por el ancho: una tablet de 834px en el piso de
 * trabajo es un equipo de campo, y un monitor de 1024px no. Lo que los separa es el puntero:
 * grueso = dedo. Es la señal correcta para entrar en modo paso a paso.
 */
const esDeMano = () =>
  window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 1279px)").matches;

export function RecorridaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ctx = useRecorrida(id);
  const { recorrida } = ctx;

  const [vista, setVista] = useState<Vista>("lista");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [itemAbierto, setItemAbierto] = useState<number | null>(null);
  const [agregando, setAgregando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [responsables, setResponsables] = useState<string[]>([]);
  const [resaltados, setResaltados] = useState<Set<number>>(new Set());

  useEffect(() => {
    void storage.leerConfig().then((c) => setResponsables(c.responsablesFrecuentes));
  }, []);

  // En celular, una recorrida abierta y no cerrada entra en paso a paso: es el modo de campo.
  const [vistaInicialAplicada, setVistaInicialAplicada] = useState(false);
  useEffect(() => {
    if (!recorrida || vistaInicialAplicada) return;
    setVista(esDeMano() && !recorrida.cerrada ? "campo" : "lista");
    setVistaInicialAplicada(true);
  }, [recorrida, vistaInicialAplicada]);

  const abrirItem = useCallback((itemId: number) => {
    setItemAbierto(itemId);
    setVista((v) => (v === "campo" ? "lista" : v));
  }, []);

  const guardarAdicional = useCallback(
    (adicional: ItemAdicional, registro: RegistroItem) => {
      ctx.actualizar((r) => ({
        ...r,
        itemsAdicionales: [...r.itemsAdicionales, adicional],
        registros: [...r.registros, registro],
      }));
      if (adicional.promovidoACatalogo) {
        void storage
          .promoverACatalogo({
            zona: adicional.zona,
            criticidadRef: adicional.criticidadRef,
            item: adicional.item,
            hallazgoTipico: adicional.hallazgoTipico,
          })
          .then(() => void ctx.recargar());
      }
      setAgregando(null);
      setMensaje("Ítem adicional guardado.");
    },
    [ctx],
  );

  const enviar = useCallback(async () => {
    if (!recorrida) return;
    setEnviando(true);
    setMensaje(null);
    try {
      // El PDF se genera acá, en el cliente: es el mismo que ve el usuario y el que se adjunta.
      const { generarPDFConTope } = await cargarPdf();
      const pdf = await generarPDFConTope({ recorrida, catalogo: ctx.catalogoPorId }, MAX_PDF_BYTES);
      const estado = await enviarRecorrida(recorrida, pdf);
      await ctx.recargar();

      if (estado.ultimoError) {
        setMensaje(`Envío incompleto: ${estado.ultimoError}. El borrador sigue guardado.`);
      } else if (estado.itemsEnError > 0) {
        setMensaje(`${estado.itemsEnError} ítem(s) con error. Se pueden reintentar.`);
      } else {
        setMensaje("Enviado a SharePoint.");
      }
    } catch (e) {
      setMensaje(`No se pudo enviar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnviando(false);
    }
  }, [recorrida, ctx]);

  const cerrar = useCallback(async () => {
    if (!recorrida) return;
    const cerrada = {
      ...recorrida,
      cerrada: true,
      firmas: { ...recorrida.firmas, fecha: new Date().toISOString() },
    };
    await storage.guardarRecorrida(cerrada);
    ctx.actualizar(() => cerrada);

    if (recorrida.sharepointId) {
      const { generarPDFConTope } = await cargarPdf();
      const pdf = await generarPDFConTope(
        { recorrida: cerrada, catalogo: ctx.catalogoPorId },
        MAX_PDF_BYTES,
      );
      await cerrarEnSharePoint(cerrada, pdf);
    }
    setMensaje("Recorrida cerrada.");
    await ctx.recargar();
  }, [recorrida, ctx]);

  const exportarPDF = useCallback(async () => {
    if (!recorrida) return;
    setMensaje("Generando el PDF…");
    const { generarPDFConTope, nombrePDF } = await cargarPdf();
    const pdf = await generarPDFConTope({ recorrida, catalogo: ctx.catalogoPorId }, MAX_PDF_BYTES);
    descargar(pdf, nombrePDF(recorrida));
    setMensaje(null);
  }, [recorrida, ctx.catalogoPorId]);

  const siguienteId = useMemo(
    () => (recorrida ? siguienteIdAdicional(recorrida.registros.map((r) => r.itemId)) : 9000),
    [recorrida],
  );

  const semaforo = useMemo(
    () => (recorrida ? calcularSemaforo(recorrida, ctx.catalogoPorId) : "VERDE"),
    [recorrida, ctx.catalogoPorId],
  );

  if (ctx.cargando) return <p className="p-8 text-center text-acero-500">Cargando la recorrida…</p>;
  if (!recorrida) {
    return (
      <div className="p-6">
        <p className="text-lg font-semibold">No se encontró la recorrida.</p>
        <button className="boton-primario mt-3 w-auto px-5" onClick={() => navigate("/")}>
          Volver al listado
        </button>
      </div>
    );
  }

  if (agregando !== null) {
    return (
      <ItemAdicionalNuevo
        recorridaId={recorrida.id}
        zonaSugerida={agregando}
        siguienteId={siguienteId}
        onGuardar={guardarAdicional}
        onCancelar={() => setAgregando(null)}
      />
    );
  }

  if (vista === "campo" && !recorrida.cerrada) {
    return (
      <PasoAPaso
        ctx={ctx}
        recorrida={recorrida}
        onSalir={() => setVista("lista")}
        onAgregarAdicional={(zona) => setAgregando(zona)}
      />
    );
  }

  const conDetalle = itemAbierto !== null;

  return (
    <div className="min-h-[100dvh] bg-acero-100">
      <header className="sticky top-0 z-20 border-b border-acero-200 bg-papel">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 md:px-6">
          <button className="text-[0.95rem] font-semibold underline" onClick={() => navigate("/")}>
            ← Recorridas
          </button>
          <span aria-hidden className={`h-3 w-3 shrink-0 rounded-full ${CLASE_SEMAFORO[semaforo]}`} />
          <span className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold">
            {recorrida.equipo}
            <span className="font-normal text-acero-500">
              {" "}
              {recorrida.pozoLocacion} · {fechaAR(recorrida.fechaRelevamiento)}
            </span>
          </span>
          {recorrida.cerrada && <span className="badge bg-acero-900">Cerrada</span>}
          <span className="cifras shrink-0 text-xs text-acero-500">
            {ctx.guardado ? "Guardado" : "Guardando…"}
          </span>
        </div>

        <nav aria-label="Vistas de la recorrida" className="flex gap-1 overflow-x-auto px-3 pb-2 md:px-6">
          {VISTAS.map(({ v, texto }) => (
            <button
              key={v}
              type="button"
              disabled={v === "campo" && recorrida.cerrada}
              aria-current={vista === v ? "page" : undefined}
              className={`min-h-[40px] whitespace-nowrap rounded px-3 text-sm font-semibold ${
                vista === v ? "bg-acero-900 text-white" : "text-acero-700 disabled:opacity-40"
              }`}
              onClick={() => setVista(v)}
            >
              {texto}
            </button>
          ))}
        </nav>
      </header>

      {mensaje && (
        <p className="mx-3 mt-3 rounded border border-acero-900 bg-papel px-4 py-3 text-sm font-medium md:mx-6">
          {mensaje}
        </p>
      )}

      {/*
        Maestro-detalle en escritorio: el detalle se abre AL LADO, no debajo. Empujar la lista
        hacia abajo hace perder la fila en la que estabas y obliga a volver a buscarla.
      */}
      <div
        className={`mx-auto w-full max-w-[1600px] gap-4 p-3 md:p-6 ${
          conDetalle ? "lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start" : ""
        }`}
      >
        <div className="min-w-0">
          {vista === "lista" && (
            <ListaZonas
              recorrida={recorrida}
              catalogo={ctx.catalogoPorId}
              filtros={filtros}
              onFiltros={setFiltros}
              onAbrirItem={abrirItem}
              resaltados={resaltados}
            />
          )}

          {vista === "oficina" && (
            <div className="space-y-3">
              <FiltrosOficina filtros={filtros} onFiltros={setFiltros} />
              <div className="panel overflow-hidden">
                <TablaOficina
                  recorrida={recorrida}
                  catalogo={ctx.catalogoPorId}
                  filtros={filtros}
                  onAbrirItem={abrirItem}
                  itemSeleccionado={itemAbierto ?? undefined}
                />
              </div>
            </div>
          )}

          {vista === "dashboard" && (
            <Suspense
              fallback={<p className="p-8 text-center text-acero-500">Cargando el dashboard…</p>}
            >
              <Dashboard
                recorrida={recorrida}
                catalogo={ctx.catalogoPorId}
                historial={ctx.historial}
                onAbrirItem={abrirItem}
              />
            </Suspense>
          )}

          {vista === "envio" && (
            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
              <div className="space-y-4">
                <SyncPanel
                  recorrida={recorrida}
                  enviando={enviando}
                  onEnviar={() => void enviar()}
                  onCambio={() => void ctx.recargar()}
                />

                <section className="panel p-4">
                  <h2 className="mb-3 text-lg font-semibold">Exportar</h2>
                  <div className="flex flex-wrap gap-2">
                    <button className="boton-secundario" onClick={() => void exportarPDF()}>
                      Descargar PDF
                    </button>
                    <button
                      className="boton-secundario"
                      onClick={async () => {
                        const { generarExcel, nombreExcel } = await cargarExcel();
                        descargar(generarExcel(recorrida, ctx.catalogoPorId), nombreExcel(recorrida));
                      }}
                    >
                      Descargar Excel
                    </button>
                    <button
                      className="boton-secundario"
                      onClick={async () =>
                        descargar(
                          new Blob([await storage.exportarRecorridaJSON(recorrida)], {
                            type: "application/json",
                          }),
                          `Recorrida-${recorrida.folio ?? recorrida.id}.json`,
                        )
                      }
                    >
                      Descargar JSON
                    </button>
                  </div>
                </section>
              </div>

              <CierreRecorrida
                recorrida={recorrida}
                catalogo={ctx.catalogoPorId}
                onFirmar={(quien, dataUrl) =>
                  // Forma funcional siempre: las dos firmas escriben sobre el mismo objeto y con
                  // spread del estado capturado la segunda pisa a la primera.
                  ctx.actualizar((r) => ({ ...r, firmas: { ...r.firmas, [quien]: dataUrl } }))
                }
                onCerrar={cerrar}
                onReabrir={() => ctx.actualizar((r) => ({ ...r, cerrada: false }))}
                onAbrirItem={(itemId) => {
                  setResaltados(new Set([itemId]));
                  abrirItem(itemId);
                }}
              />
            </div>
          )}
        </div>

        {conDetalle && (
          <aside className="panel mt-3 p-4 lg:sticky lg:top-32 lg:mt-0 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
            <DetalleItem
              ctx={ctx}
              recorrida={recorrida}
              itemId={itemAbierto}
              responsablesFrecuentes={responsables}
              onCerrar={() => setItemAbierto(null)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function FiltrosOficina({
  filtros,
  onFiltros,
}: {
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <input
        type="search"
        className="campo min-w-[12rem] flex-1"
        placeholder="Buscar por texto, responsable o número de ítem"
        value={filtros.texto}
        onChange={(e) => onFiltros({ ...filtros, texto: e.target.value })}
        aria-label="Buscar ítems"
      />
      <button
        type="button"
        aria-pressed={filtros.soloPendientes}
        className={`min-h-[48px] rounded border-2 px-4 font-semibold ${
          filtros.soloPendientes
            ? "border-acero-900 bg-acero-900 text-white"
            : "border-acero-300 bg-papel"
        }`}
        onClick={() => onFiltros({ ...filtros, soloPendientes: !filtros.soloPendientes })}
      >
        Solo pendientes
      </button>
      <button type="button" className="boton-secundario" onClick={() => onFiltros(FILTROS_VACIOS)}>
        Limpiar
      </button>
    </div>
  );
}
