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
import { cerrarEnSharePoint, enviarRecorrida, MAX_PDF_BYTES } from "../services/sync";
import * as storage from "../storage";
import type { ItemAdicional, RegistroItem } from "../types";

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

const esMovil = () => window.matchMedia("(max-width: 767px)").matches;

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

  // En móvil, una recorrida abierta y no cerrada entra en paso a paso: es el modo de campo.
  const [vistaInicialAplicada, setVistaInicialAplicada] = useState(false);
  useEffect(() => {
    if (!recorrida || vistaInicialAplicada) return;
    setVista(esMovil() && !recorrida.cerrada ? "campo" : "lista");
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
      const pdf = await generarPDFConTope(
        { recorrida, catalogo: ctx.catalogoPorId },
        MAX_PDF_BYTES,
      );
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
      const pdf = await generarPDFConTope({ recorrida: cerrada, catalogo: ctx.catalogoPorId }, MAX_PDF_BYTES);
      await cerrarEnSharePoint(cerrada, pdf);
    }
    setMensaje("Recorrida cerrada.");
    await ctx.recargar();
  }, [recorrida, ctx]);

  const exportarPDF = useCallback(async () => {
    if (!recorrida) return;
    setMensaje("Generando PDF…");
    const { generarPDFConTope, nombrePDF } = await cargarPdf();
    const pdf = await generarPDFConTope({ recorrida, catalogo: ctx.catalogoPorId }, MAX_PDF_BYTES);
    descargar(pdf, nombrePDF(recorrida));
    setMensaje(null);
  }, [recorrida, ctx.catalogoPorId]);

  const siguienteId = useMemo(
    () => (recorrida ? siguienteIdAdicional(recorrida.registros.map((r) => r.itemId)) : 9000),
    [recorrida],
  );

  if (ctx.cargando) return <p className="p-4 text-center">Cargando recorrida…</p>;
  if (!recorrida) {
    return (
      <div className="p-4">
        <p className="text-lg font-bold">No se encontró la recorrida.</p>
        <button className="boton-primario mt-3" onClick={() => navigate("/")}>
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

  return (
    <div className="pb-6">
      <header className="sticky top-0 z-20 border-b-2 border-stone-300 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button className="text-base font-bold underline" onClick={() => navigate("/")}>
            ← Recorridas
          </button>
          <span className="flex-1 truncate text-base font-bold">
            {recorrida.equipo} · {recorrida.pozoLocacion}
          </span>
          <span className="text-xs text-stone-500">{ctx.guardado ? "Guardado" : "Guardando…"}</span>
        </div>

        <nav className="mt-2 flex gap-1 overflow-x-auto">
          {(
            [
              ["campo", "Campo"],
              ["lista", "Lista"],
              ["oficina", "Oficina"],
              ["dashboard", "Dashboard"],
              ["envio", "Envío y cierre"],
            ] as [Vista, string][]
          ).map(([v, texto]) => (
            <button
              key={v}
              type="button"
              disabled={v === "campo" && recorrida.cerrada}
              aria-current={vista === v}
              className={`min-h-[44px] whitespace-nowrap rounded px-3 text-sm font-bold ${
                vista === v ? "bg-stone-900 text-white" : "bg-stone-200 disabled:opacity-40"
              }`}
              onClick={() => setVista(v)}
            >
              {texto}
            </button>
          ))}
        </nav>
      </header>

      {mensaje && (
        <p className="m-3 rounded border-2 border-stone-800 bg-stone-100 p-3 text-sm font-bold">
          {mensaje}
        </p>
      )}

      {itemAbierto !== null && (
        <div className="m-3 rounded-lg border-2 border-stone-900 p-3">
          <DetalleItem
            ctx={ctx}
            recorrida={recorrida}
            itemId={itemAbierto}
            responsablesFrecuentes={responsables}
            onCerrar={() => setItemAbierto(null)}
          />
        </div>
      )}

      {vista === "lista" && (
        <div className="p-3">
          <ListaZonas
            recorrida={recorrida}
            catalogo={ctx.catalogoPorId}
            filtros={filtros}
            onFiltros={setFiltros}
            onAbrirItem={abrirItem}
            resaltados={resaltados}
          />
        </div>
      )}

      {vista === "oficina" && (
        <div className="space-y-3 p-3">
          <ListaFiltrosOficina filtros={filtros} onFiltros={setFiltros} />
          <TablaOficina
            recorrida={recorrida}
            catalogo={ctx.catalogoPorId}
            filtros={filtros}
            onAbrirItem={abrirItem}
            itemSeleccionado={itemAbierto ?? undefined}
          />
        </div>
      )}

      {vista === "dashboard" && (
        <Suspense fallback={<p className="p-4 text-center">Cargando dashboard…</p>}>
          <Dashboard
            recorrida={recorrida}
            catalogo={ctx.catalogoPorId}
            historial={ctx.historial}
            onAbrirItem={abrirItem}
          />
        </Suspense>
      )}

      {vista === "envio" && (
        <div className="space-y-3 p-3">
          <SyncPanel
            recorrida={recorrida}
            enviando={enviando}
            onEnviar={() => void enviar()}
            onCambio={() => void ctx.recargar()}
          />

          <section className="tarjeta space-y-2">
            <h3 className="text-lg font-bold">Exportar</h3>
            <div className="flex flex-wrap gap-2">
              <button className="boton-secundario" onClick={() => void exportarPDF()}>
                PDF
              </button>
              <button
                className="boton-secundario"
                onClick={async () => {
                  const { generarExcel, nombreExcel } = await cargarExcel();
                  descargar(generarExcel(recorrida, ctx.catalogoPorId), nombreExcel(recorrida));
                }}
              >
                Excel
              </button>
              <button
                className="boton-secundario"
                onClick={async () =>
                  descargar(
                    new Blob([await storage.exportarRecorridaJSON(recorrida)], { type: "application/json" }),
                    `Recorrida-${recorrida.folio ?? recorrida.id}.json`,
                  )
                }
              >
                JSON de la recorrida
              </button>
            </div>
          </section>

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
  );
}

function ListaFiltrosOficina({
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
        className="campo flex-1"
        placeholder="Buscar…"
        value={filtros.texto}
        onChange={(e) => onFiltros({ ...filtros, texto: e.target.value })}
      />
      <button
        type="button"
        aria-pressed={filtros.soloPendientes}
        className={`min-h-[48px] rounded-lg border-2 px-3 font-bold ${
          filtros.soloPendientes ? "border-stone-900 bg-stone-900 text-white" : "border-stone-400 bg-white"
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
