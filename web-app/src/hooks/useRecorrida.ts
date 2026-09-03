import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOGO, ORDEN_RECORRIDA_SUGERIDO } from "../data/catalogo";
import { proponerReiteracion, type PropuestaReiteracion } from "../lib/reiteracion";
import type {
  ItemCatalogo,
  Recorrida,
  RecorridaHistorial,
  RegistroItem,
  SemillaEquipo,
} from "../types";
import * as storage from "../storage";
import { refrescarHistorial } from "../services/sync";

/**
 * Carga la recorrida, su catálogo (base + promovidos), el historial del equipo y la semilla.
 * Guarda con debounce de 300 ms usando `guardarBorrador` (sin validar), para que el estado
 * intermedio —marcado NO OK pero todavía sin foto— sobreviva a un cierre de pestaña.
 */

const DEBOUNCE_MS = 300;

export interface UseRecorrida {
  recorrida: Recorrida | undefined;
  catalogo: ItemCatalogo[];
  catalogoPorId: Map<number, ItemCatalogo>;
  historial: RecorridaHistorial[];
  semilla: SemillaEquipo | undefined;
  cargando: boolean;
  guardado: boolean;
  /** Orden de zonas del equipo, para el recorrido físico. */
  ordenZonas: string[];
  actualizar: (fn: (r: Recorrida) => Recorrida) => void;
  actualizarRegistro: (itemId: number, fn: (r: RegistroItem) => RegistroItem) => void;
  proponer: (itemId: number) => PropuestaReiteracion;
  recargar: () => Promise<void>;
}

export function useRecorrida(id: string | undefined): UseRecorrida {
  const [recorrida, setRecorrida] = useState<Recorrida | undefined>();
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>(CATALOGO);
  const [historial, setHistorial] = useState<RecorridaHistorial[]>([]);
  const [semilla, setSemilla] = useState<SemillaEquipo | undefined>();
  const [ordenZonas, setOrdenZonas] = useState<string[]>([...ORDEN_RECORRIDA_SUGERIDO]);
  const [cargando, setCargando] = useState(true);
  const [guardado, setGuardado] = useState(true);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendienteRef = useRef<Recorrida | null>(null);
  const recienCargadaRef = useRef(true);

  const cargar = useCallback(async () => {
    if (!id) {
      setCargando(false);
      return;
    }
    setCargando(true);
    recienCargadaRef.current = true;
    const r = await storage.leerRecorrida(id);
    setRecorrida(r);
    setCatalogo(await storage.catalogoCompleto());

    if (r) {
      setSemilla(await storage.semillaDeEquipo(r.equipo));
      setHistorial(await storage.historialDeEquipo(r.equipo, r.id));

      const config = await storage.leerConfig();
      const clave = r.equipo.trim().toUpperCase();
      setOrdenZonas(config.ordenZonasPorEquipo[clave] ?? [...ORDEN_RECORRIDA_SUGERIDO]);

      // Con señal, se refresca el historial remoto y se recalcula. Sin señal, se sigue con
      // el cache: la propuesta de reiteración nunca bloquea la recorrida.
      if (navigator.onLine) {
        void refrescarHistorial(r.equipo).then(async (ok) => {
          if (ok) setHistorial(await storage.historialDeEquipo(r.equipo, r.id));
        });
      }
    }
    setCargando(false);
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Autoguardado con debounce.
   *
   * Va en un efecto y NO adentro del updater de setState: en StrictMode el updater corre dos
   * veces, y disparar ahí un setState (`setGuardado`) más un timer es exactamente el tipo de
   * efecto duplicado que después aparece como un guardado fantasma difícil de rastrear.
   *
   * `recienCargadaRef` evita reescribir en disco lo que se acaba de leer de disco.
   */
  useEffect(() => {
    if (!recorrida) return;
    if (recienCargadaRef.current) {
      recienCargadaRef.current = false;
      return;
    }

    pendienteRef.current = recorrida;
    setGuardado(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const pend = pendienteRef.current;
      if (!pend) return;
      pendienteRef.current = null;
      void storage.guardarBorrador(pend).then(() => setGuardado(true));
    }, DEBOUNCE_MS);
  }, [recorrida]);

  // Al desmontar (o al cambiar de recorrida) se vacía lo que quedó en el debounce: si no, salir
  // de la pantalla dentro de los 300 ms se lleva el último cambio.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const pend = pendienteRef.current;
      if (pend) {
        pendienteRef.current = null;
        void storage.guardarBorrador(pend);
      }
    };
  }, [id]);

  const actualizar = useCallback((fn: (r: Recorrida) => Recorrida) => {
    // Forma funcional siempre: dos handlers que tocan el mismo objeto se pisan entre sí si
    // capturan el estado viejo (el bug de las firmas de la app de inspección vehicular).
    setRecorrida((prev) => (prev ? fn(prev) : prev));
  }, []);

  const actualizarRegistro = useCallback(
    (itemId: number, fn: (r: RegistroItem) => RegistroItem) => {
      actualizar((r) => ({
        ...r,
        registros: r.registros.map((reg) => (reg.itemId === itemId ? fn(reg) : reg)),
      }));
    },
    [actualizar],
  );

  const catalogoPorId = useMemo(() => new Map(catalogo.map((i) => [i.id, i])), [catalogo]);

  const proponer = useCallback(
    (itemId: number): PropuestaReiteracion =>
      proponerReiteracion(itemId, {
        equipo: recorrida?.equipo ?? "",
        historial,
        semilla,
      }),
    [recorrida?.equipo, historial, semilla],
  );

  return {
    recorrida,
    catalogo,
    catalogoPorId,
    historial,
    semilla,
    cargando,
    guardado,
    ordenZonas,
    actualizar,
    actualizarRegistro,
    proponer,
    recargar: cargar,
  };
}

/** Ordena los ítems según el recorrido físico configurado para el equipo. */
export function ordenarItems(
  catalogo: readonly ItemCatalogo[],
  ordenZonas: readonly string[],
): ItemCatalogo[] {
  const peso = new Map(ordenZonas.map((z, i) => [z, i]));
  return [...catalogo].sort(
    (a, b) => (peso.get(a.zona) ?? 999) - (peso.get(b.zona) ?? 999) || a.id - b.id,
  );
}
