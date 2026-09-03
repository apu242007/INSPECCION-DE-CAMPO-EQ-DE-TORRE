import { useEffect, useState } from "react";
import { formatearTamaño } from "../lib/imageUtils";
import { esModoDemo } from "../services/api";
import {
  reintentarPendientes,
  suscribirSync,
  type EstadoSincronizacion,
} from "../services/sync";
import * as storage from "../storage";
import type { Recorrida } from "../types";

/**
 * Estado de sincronización por recorrida: cuántos ítems con fotos se subieron, cuánto se
 * envió y cuál fue el último error, con botón de reintento.
 *
 * Se muestra siempre, no solo cuando algo falla: si el inspector no ve el estado, asume que
 * salió bien y borra la app.
 */

interface Props {
  recorrida: Recorrida;
  onEnviar: () => void;
  enviando: boolean;
  onCambio: () => void;
}

export function SyncPanel({ recorrida, onEnviar, enviando, onCambio }: Props) {
  const [estado, setEstado] = useState<EstadoSincronizacion | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => suscribirSync(setEstado), []);

  useEffect(() => {
    const actualizar = () => setOnline(navigator.onLine);
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);

  useEffect(() => {
    void storage
      .leerCola()
      .then((c) => setPendientes(c.filter((t) => t.recorridaId === recorrida.id).length));
  }, [recorrida.id, estado]);

  const conFotos = recorrida.registros.filter((r) => r.evidencia.length > 0).length;
  const subidos = recorrida.registros.filter((r) => r.sync === "SINCRONIZADO").length;
  const enError = recorrida.registros.filter((r) => r.sync === "ERROR").length;
  const demo = esModoDemo("EQT01");

  return (
    <section className="tarjeta space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-lg font-bold">Sincronización con SharePoint</h3>
        <span className={`badge ${online ? "bg-ok" : "bg-stone-500"}`}>
          {online ? "CON SEÑAL" : "SIN SEÑAL"}
        </span>
      </div>

      {demo && (
        <p className="rounded border-2 border-enProc bg-orange-50 p-3 text-sm font-bold">
          Modo demo: no hay URL de flujo configurada. La app valida y arma el payload, lo
          imprime en la consola, pero <strong>no envía nada</strong>.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="font-bold uppercase text-stone-600">Registro en SharePoint</dt>
          <dd>{recorrida.sharepointId ? `ID ${recorrida.sharepointId}` : "todavía no creado"}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase text-stone-600">Ítems con fotos</dt>
          <dd>
            {subidos} de {conFotos} subidos
            {enError > 0 && <span className="ml-1 font-bold text-noOk">· {enError} con error</span>}
          </dd>
        </div>
        {estado && (
          <div>
            <dt className="font-bold uppercase text-stone-600">Enviado</dt>
            <dd>{formatearTamaño(estado.bytesEnviados)}</dd>
          </div>
        )}
        <div>
          <dt className="font-bold uppercase text-stone-600">En cola</dt>
          <dd>{pendientes}</dd>
        </div>
      </dl>

      {estado?.ultimoError && (
        <p className="rounded border-2 border-noOk bg-red-50 p-3 text-sm">
          <strong>Último error:</strong> {estado.ultimoError}
        </p>
      )}

      {recorrida.sharepointUrl && (
        <a
          href={recorrida.sharepointUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="boton-secundario w-full"
        >
          Ver en SharePoint
        </a>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="boton-primario flex-[2]"
          disabled={enviando || (!online && !demo)}
          onClick={onEnviar}
        >
          {enviando ? "Enviando…" : recorrida.sharepointId ? "Reenviar / completar" : "Enviar a SharePoint"}
        </button>
        {pendientes > 0 && (
          <button
            type="button"
            className="boton-secundario flex-1"
            disabled={enviando || !online}
            onClick={() => void reintentarPendientes(recorrida.id).then(onCambio)}
          >
            Reintentar {pendientes}
          </button>
        )}
      </div>

      {!online && !demo && (
        <p className="text-sm text-stone-600">
          Sin señal no se envía nada, y está bien: la recorrida queda guardada en el teléfono y la
          cola se retoma sola cuando vuelva la conexión.
        </p>
      )}
    </section>
  );
}
