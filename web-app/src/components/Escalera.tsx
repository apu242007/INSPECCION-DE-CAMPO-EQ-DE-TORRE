import type { EstadoZona } from "./RielZonas";

/**
 * ESCALERA — el avance como los tramos del mástil, no como una barra.
 *
 * Una barra continua contesta "cuánto falta". En una recorrida de 94 ítems repartidos en 17
 * zonas la pregunta real es otra: "¿qué tramo me quedó a medias?". Cada segmento es una zona,
 * en el mismo orden en el que se sube al equipo, y se llena con lo revisado de esa zona. Un
 * tramo con hallazgos abiertos se pinta en rojo aunque esté completo — terminado y conforme
 * no son lo mismo.
 *
 * Ocupa el mismo alto que la barra que reemplaza y dice bastante más. Sobre cromo, los tramos
 * vacíos se aclaran solos (ver `.cromo .escalera` en index.css).
 */

interface Props {
  zonas: readonly EstadoZona[];
  /** Zona en la que está parado el inspector. Se marca con un filete alrededor del tramo. */
  zonaActual?: string;
  /** Con handler, cada tramo es además el índice para saltar a esa zona. */
  onIrAZona?: (zona: string) => void;
}

export function Escalera({ zonas, zonaActual, onIrAZona }: Props) {
  const total = zonas.reduce((a, z) => a + z.total, 0);
  const revisados = zonas.reduce((a, z) => a + z.revisados, 0);

  return (
    <div
      className="escalera"
      role="progressbar"
      aria-valuenow={revisados}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`Ítems revisados: ${revisados} de ${total}`}
    >
      {zonas.map((z) => {
        const pct = z.total === 0 ? 0 : Math.round((z.revisados / z.total) * 100);
        const relleno = z.noConformes > 0 ? "es-no" : pct === 100 ? "es-ok" : "";
        const marcaActual = z.zona === zonaActual ? "escalera-actual" : undefined;
        const detalle = `${z.zona} — ${z.revisados}/${z.total}${
          z.noConformes > 0 ? ` · ${z.noConformes} NO OK` : ""
        }`;
        const barra = (
          <span className={`escalera-tramo-relleno ${relleno}`} style={{ width: `${pct}%` }} />
        );

        return onIrAZona ? (
          <button
            key={z.zona}
            type="button"
            title={detalle}
            aria-label={`Ir a ${z.zona}. ${z.revisados} de ${z.total} revisados.`}
            onClick={() => onIrAZona(z.zona)}
            className={marcaActual}
          >
            {barra}
          </button>
        ) : (
          <span key={z.zona} title={detalle} className={marcaActual}>
            {barra}
          </span>
        );
      })}
    </div>
  );
}
