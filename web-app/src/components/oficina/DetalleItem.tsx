import { useEffect, useState } from "react";
import { plazoSugerido } from "../../data/catalogo";
import { criticidadEfectiva } from "../../lib/metrics";
import { requiereFoto } from "../../lib/validacion";
import type { Criticidad, Foto, ItemCatalogo, Origen, Recorrida, Reiteracion } from "../../types";
import { CLASE_CRITICIDAD, CLASE_ESTADO, ETIQUETA_CRITICIDAD, ETIQUETA_ESTADO } from "../../ui";
import type { UseRecorrida } from "../../hooks/useRecorrida";
import { BotonesEstado } from "../campo/BotonesEstado";
import { CapturaFoto } from "../campo/CapturaFoto";
import { ToggleReiteracion } from "../campo/ToggleReiteracion";

/**
 * MODO OFICINA — el detalle editable de un ítem.
 *
 * Todo lo que no se puede pedir en altura vive acá: criticidad, responsable, plazo, acción
 * correctiva y estado final. La foto sigue siendo obligatoria: cambiar a NO OK desde el
 * escritorio no habilita a guardar sin evidencia.
 */

interface Props {
  ctx: UseRecorrida;
  recorrida: Recorrida;
  itemId: number;
  responsablesFrecuentes: readonly string[];
  onCerrar: () => void;
}

export function DetalleItem({ ctx, recorrida, itemId, responsablesFrecuentes, onCerrar }: Props) {
  const registro = recorrida.registros.find((r) => r.itemId === itemId);
  const info =
    ctx.catalogoPorId.get(itemId) ?? recorrida.itemsAdicionales.find((a) => a.id === itemId);
  const [ayuda, setAyuda] = useState(false);

  useEffect(() => {
    setAyuda(false);
  }, [itemId]);

  if (!registro || !info) {
    return (
      <div className="panel p-4">
        <p>No se encontró el ítem #{itemId}.</p>
        <button className="boton-secundario mt-2" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    );
  }

  const criticidad = criticidadEfectiva(registro, ctx.catalogoPorId) as Criticidad;
  const necesitaFoto = requiereFoto(registro);
  const sinFoto = necesitaFoto && registro.evidencia.length === 0;
  const bloqueado = recorrida.cerrada;

  const set = <K extends keyof typeof registro>(campo: K, valor: (typeof registro)[K]) =>
    ctx.actualizarRegistro(itemId, (r) => ({ ...r, [campo]: valor }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-acero-500">#{itemId}</span>
        <span className={`badge ${CLASE_CRITICIDAD[criticidad]}`}>
          {ETIQUETA_CRITICIDAD[criticidad]}
        </span>
        <span className={`badge ${CLASE_ESTADO[registro.estado]}`}>
          {ETIQUETA_ESTADO[registro.estado]}
        </span>
        <span className="text-sm text-acero-500">{info.zona}</span>
        <button
          type="button"
          className="ml-auto boton-secundario min-h-[40px] px-3 text-sm"
          onClick={() => setAyuda((v) => !v)}
        >
          ?
        </button>
        <button type="button" className="boton-secundario min-h-[40px] px-3 text-sm" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <p className="text-base leading-snug">{info.item}</p>

      {ayuda && (
        <div className="rounded border-l-4 border-acero-900 bg-acero-50 p-3 text-sm">
          <p className="font-bold">Cómo se redacta si falla:</p>
          <p className="mt-1">{info.hallazgoTipico}</p>
        </div>
      )}

      {!bloqueado && (
        <details className="panel p-4">
          <summary className="cursor-pointer text-base font-semibold">Cambiar el estado</summary>
          <div className="mt-3">
            <BotonesEstado
              actual={registro.estado}
              onElegir={(estado) => {
                const necesita = estado === "NO_OK" || estado === "EN_PROC";
                ctx.actualizarRegistro(itemId, (r) => ({
                  ...r,
                  estado,
                  fechaVerif: new Date().toISOString(),
                  origen: necesita ? (r.origen ?? ctx.proponer(itemId).origen) : undefined,
                  reiteracion: necesita ? (r.reiteracion ?? ctx.proponer(itemId).reiteracion) : undefined,
                  evidencia: necesita ? r.evidencia : [],
                  plazo: necesita
                    ? (r.plazo ?? plazoSugerido(criticidad) ?? undefined)
                    : undefined,
                }));
              }}
            />
          </div>
        </details>
      )}

      {necesitaFoto && (
        <>
          <div className="panel p-4 space-y-2">
            <p className="text-base font-semibold">
              Evidencia ({registro.evidencia.length})
              {sinFoto && <span className="ml-2 text-critico-ink">— obligatoria</span>}
            </p>
            {bloqueado ? (
              <GaleriaSoloLectura fotos={registro.evidencia} />
            ) : (
              <CapturaFoto
                itemId={itemId}
                fotos={registro.evidencia}
                onCambio={(fotos: Foto[]) => set("evidencia", fotos)}
                compacto
              />
            )}
          </div>

          {!bloqueado && (
            <div className="panel p-4">
              <ToggleReiteracion
                propuesta={ctx.proponer(itemId)}
                origen={registro.origen}
                reiteracion={registro.reiteracion}
                onCambio={(origen: Origen, reiteracion: Reiteracion | undefined) =>
                  ctx.actualizarRegistro(itemId, (r) => ({ ...r, origen, reiteracion }))
                }
              />
            </div>
          )}
        </>
      )}

      <div className="panel p-4 grid gap-3 sm:grid-cols-2">
        <label className="etiqueta">
          Criticidad
          <select
            className="campo mt-1"
            disabled={bloqueado}
            value={criticidad}
            onChange={(e) => set("criticidad", e.target.value as Criticidad)}
          >
            {(["CRITICA", "MAYOR", "MENOR", "GENERAL"] as Criticidad[]).map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CRITICIDAD[c]}
                {c === (info as ItemCatalogo).criticidadRef ? " (referencia)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="etiqueta">
          Responsable
          <input
            className="campo mt-1"
            list="responsables-frecuentes"
            disabled={bloqueado}
            value={registro.responsable ?? ""}
            onChange={(e) => set("responsable", e.target.value)}
            placeholder="Nombre y apellido"
          />
          <datalist id="responsables-frecuentes">
            {responsablesFrecuentes.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>

        <label className="etiqueta">
          Plazo
          <div className="mt-1 flex gap-2">
            <input
              type="date"
              className="campo"
              disabled={bloqueado}
              value={registro.plazo ?? ""}
              onChange={(e) => set("plazo", e.target.value)}
            />
            <button
              type="button"
              className="boton-secundario whitespace-nowrap px-2 text-xs"
              disabled={bloqueado}
              onClick={() => set("plazo", plazoSugerido(criticidad) ?? undefined)}
              title={
                criticidad === "CRITICA"
                  ? "Crítica: mismo día"
                  : criticidad === "MAYOR"
                    ? "Mayor: +15 días"
                    : criticidad === "MENOR"
                      ? "Menor: +30 días"
                      : "General: sin plazo obligatorio"
              }
            >
              Sugerido
            </button>
          </div>
        </label>

        <label className="etiqueta">
          Estado final
          <select
            className="campo mt-1"
            disabled={bloqueado}
            value={registro.estadoFinal ?? ""}
            onChange={(e) => set("estadoFinal", (e.target.value || undefined) as "CERRADO" | "PENDIENTE" | undefined)}
          >
            <option value="">—</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="CERRADO">Cerrado</option>
          </select>
        </label>

        <label className="etiqueta sm:col-span-2">
          Acción correctiva
          <textarea
            className="campo mt-1"
            rows={3}
            disabled={bloqueado}
            value={registro.accionCorrectiva ?? ""}
            onChange={(e) => set("accionCorrectiva", e.target.value)}
          />
        </label>

        <label className="etiqueta sm:col-span-2">
          Observaciones
          <textarea
            className="campo mt-1"
            rows={2}
            disabled={bloqueado}
            value={registro.observaciones ?? ""}
            onChange={(e) => set("observaciones", e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function GaleriaSoloLectura({ fotos }: { fotos: readonly Foto[] }) {
  if (fotos.length === 0) return <p className="text-sm text-acero-500">Sin fotos.</p>;
  return (
    <p className="text-sm text-acero-500">
      {fotos.length} foto(s) adjunta(s). La recorrida está cerrada: reabrila para editarlas.
    </p>
  );
}
