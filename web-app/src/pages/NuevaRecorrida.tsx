import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { aplicarSemilla, crearRecorrida, duplicarRecorrida } from "../lib/recorrida";
import * as storage from "../storage";
import { OPERADORAS, EMPRESA_DEFAULT } from "../types";
import type { SemillaEquipo } from "../types";

/**
 * Alta de recorrida. Al crearla se generan los 94 registros en SIN_REVISAR.
 *
 * Sin `required` en los inputs: el popup nativo del navegador dispara ANTES del onSubmit y
 * bloquea la validación propia. Todo se valida en JS y se muestra la lista de pendientes.
 */
export function NuevaRecorrida() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const duplicarDe = params.get("duplicarDe");

  const [equipo, setEquipo] = useState("");
  const [empresa, setEmpresa] = useState(EMPRESA_DEFAULT);
  const [operadora, setOperadora] = useState("");
  const [contrato, setContrato] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 16));
  const [pozo, setPozo] = useState("");
  const [auditoria, setAuditoria] = useState("");
  const [equipoRecorrida, setEquipoRecorrida] = useState("");
  const [cr, setCr] = useState("");
  const [notas, setNotas] = useState("");

  const [equipos, setEquipos] = useState<string[]>([]);
  const [semilla, setSemilla] = useState<SemillaEquipo | undefined>();
  const [usarSemilla, setUsarSemilla] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void storage.equiposConocidos().then(setEquipos);
    if (duplicarDe) {
      void storage.leerRecorrida(duplicarDe).then((r) => {
        if (!r) return;
        setEquipo(r.equipo);
        setEmpresa(r.empresa);
        setOperadora(r.operadora ?? "");
        setContrato(r.contrato ?? "");
        setEquipoRecorrida(r.equipoRecorrida);
        setCr(r.companyRepresentative ?? "");
      });
    }
  }, [duplicarDe]);

  useEffect(() => {
    if (!equipo.trim()) {
      setSemilla(undefined);
      return;
    }
    void storage.semillaDeEquipo(equipo).then(setSemilla);
  }, [equipo]);

  const pendientes: string[] = [];
  if (!equipo.trim()) pendientes.push("Equipo");
  if (!pozo.trim()) pendientes.push("Pozo / locación");
  if (!equipoRecorrida.trim()) pendientes.push("Quiénes recorren");
  const puedeCrear = pendientes.length === 0 && !guardando;

  async function crear() {
    if (!puedeCrear) return;
    setGuardando(true);
    try {
      const datos = {
        equipo,
        empresa,
        operadora: operadora || undefined,
        contrato: contrato || undefined,
        // El input datetime-local da hora local; se guarda en UTC (SharePoint espera UTC).
        fechaRelevamiento: new Date(fecha).toISOString(),
        pozoLocacion: pozo,
        auditoriaProgramada: auditoria || undefined,
        equipoRecorrida,
        companyRepresentative: cr || undefined,
        notas: notas || undefined,
      };

      const anterior = duplicarDe ? await storage.leerRecorrida(duplicarDe) : undefined;
      const catalogo = await storage.catalogoCompleto();

      let nueva = anterior
        ? duplicarRecorrida(anterior, datos, catalogo)
        : crearRecorrida(datos, catalogo);

      if (semilla && usarSemilla) nueva = aplicarSemilla(nueva, semilla);

      await storage.guardarRecorrida(nueva);
      navigate(`/recorrida/${nueva.id}`, { replace: true });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3 p-3">
      <h1 className="text-2xl font-bold">
        {duplicarDe ? "Duplicar recorrida" : "Nueva recorrida"}
      </h1>

      {duplicarDe && (
        <p className="tarjeta text-sm">
          Se arrastran responsable, plazo y acción correctiva de los ítems que quedaron NO OK o en
          proceso. <strong>No se arrastran las fotos</strong>: la evidencia de una recorrida no vale
          como evidencia de la siguiente, así que esos ítems quedan sin revisar.
        </p>
      )}

      <div className="tarjeta grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-bold">
          Equipo *
          <input
            className="campo mt-1"
            list="equipos-conocidos"
            value={equipo}
            onChange={(e) => setEquipo(e.target.value)}
            placeholder="TACK-6 / TKR-06"
            autoComplete="off"
          />
          <datalist id="equipos-conocidos">
            {equipos.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>

        <label className="block text-sm font-bold">
          Empresa
          <input className="campo mt-1" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
        </label>

        <label className="block text-sm font-bold">
          Operadora
          <select className="campo mt-1" value={operadora} onChange={(e) => setOperadora(e.target.value)}>
            <option value="">—</option>
            {OPERADORAS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-bold">
          Contrato
          <input className="campo mt-1" value={contrato} onChange={(e) => setContrato(e.target.value)} />
        </label>

        <label className="block text-sm font-bold">
          Fecha de relevamiento
          <input
            type="datetime-local"
            className="campo mt-1"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>

        <label className="block text-sm font-bold">
          Pozo / locación *
          <input className="campo mt-1" value={pozo} onChange={(e) => setPozo(e.target.value)} placeholder="LACH-197" />
        </label>

        <label className="block text-sm font-bold">
          Auditoría externa programada
          <input
            type="date"
            className="campo mt-1"
            value={auditoria}
            onChange={(e) => setAuditoria(e.target.value)}
          />
        </label>

        <label className="block text-sm font-bold">
          Company Representative
          <input className="campo mt-1" value={cr} onChange={(e) => setCr(e.target.value)} />
        </label>

        <label className="block text-sm font-bold sm:col-span-2">
          Quiénes recorren *
          <input
            className="campo mt-1"
            value={equipoRecorrida}
            onChange={(e) => setEquipoRecorrida(e.target.value)}
            placeholder="J. Castro (QHSE), M. Pérez (Jefe de equipo)"
          />
        </label>

        <label className="block text-sm font-bold sm:col-span-2">
          Notas / limitaciones de la recorrida
          <textarea
            className="campo mt-1"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej.: no se accedió a corona por viento"
          />
        </label>
      </div>

      {semilla && (
        <div className="tarjeta space-y-2 border-violet-700">
          <p className="text-base font-bold">Hay una semilla de historial para este equipo</p>
          <p className="text-sm">{semilla.referencia}</p>
          <p className="text-sm">
            {Object.keys(semilla.aparicionesPrevias).length} ítem(s) con apariciones previas en
            informes externos y {semilla.corregidosUltimaInspeccion.length} corregidos en la última
            inspección.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={usarSemilla}
              onChange={(e) => setUsarSemilla(e.target.checked)}
            />
            <span>
              Aplicar la semilla: los corregidos se precargan en OK con la observación de
              seguimiento, y los demás alimentan la propuesta automática de reiteración.
            </span>
          </label>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="rounded-lg border-2 border-enProc bg-orange-50 p-3">
          <p className="font-bold">Falta completar:</p>
          <ul className="ml-5 list-disc text-sm">
            {pendientes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className="boton-secundario flex-1" onClick={() => navigate("/")}>
          Cancelar
        </button>
        <button type="button" className="boton-primario flex-[2]" disabled={!puedeCrear} onClick={() => void crear()}>
          {guardando ? "Creando…" : "Crear recorrida"}
        </button>
      </div>
    </div>
  );
}
