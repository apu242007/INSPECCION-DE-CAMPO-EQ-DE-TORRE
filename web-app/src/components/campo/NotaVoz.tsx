import { useEffect, useRef, useState } from "react";
import { blobDeFoto, notaDesdeBlob } from "../../lib/imageUtils";
import type { Foto } from "../../types";
import { vibrar } from "../../ui";

/**
 * Nota de voz opcional. En altura no se tipea: si el inspector quiere dejar una observación,
 * la dicta. El texto corto queda como alternativa para quien prefiera escribir.
 */

interface Props {
  itemId: number;
  nota: Foto | undefined;
  texto: string | undefined;
  onNota: (nota: Foto | undefined) => void;
  onTexto: (texto: string) => void;
}

export function NotaVoz({ itemId, nota, texto, onNota, onTexto }: Props) {
  const [grabando, setGrabando] = useState(false);
  const [soportado, setSoportado] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setSoportado(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices));
  }, []);

  useEffect(() => {
    if (!nota) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blobDeFoto(nota));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [nota]);

  async function arrancar() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        for (const t of stream.getTracks()) t.stop();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        onNota(await notaDesdeBlob(blob, `item-${itemId}-nota.webm`));
      };
      rec.start();
      recorderRef.current = rec;
      setGrabando(true);
      vibrar();
    } catch {
      setSoportado(false);
    }
  }

  function frenar() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setGrabando(false);
    vibrar();
  }

  return (
    <div className="space-y-2">
      {soportado && (
        <div className="flex gap-2">
          <button
            type="button"
            className={`boton-secundario flex-1 ${grabando ? "border-noOk text-noOk" : ""}`}
            onClick={() => (grabando ? frenar() : void arrancar())}
          >
            {grabando ? "⏹ Frenar grabación" : "🎤 Nota de voz"}
          </button>
          {nota && (
            <button type="button" className="boton-secundario" onClick={() => onNota(undefined)}>
              Borrar
            </button>
          )}
        </div>
      )}

      {url && <audio controls src={url} className="w-full" />}

      <textarea
        className="campo"
        rows={2}
        placeholder="Observación (opcional)"
        value={texto ?? ""}
        onChange={(e) => onTexto(e.target.value)}
      />
    </div>
  );
}
