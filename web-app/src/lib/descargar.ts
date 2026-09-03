/**
 * Descarga de un blob. Vive aparte de excelExport para que importarla no arrastre SheetJS:
 * la pantalla de configuración la usa y no tiene por qué cargar 400 KB de xlsx.
 */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar en el próximo tick: hacerlo sincrónicamente aborta la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
