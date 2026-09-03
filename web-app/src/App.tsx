import { useEffect } from "react";
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Configuracion } from "./pages/Configuracion";
import { NuevaRecorrida } from "./pages/NuevaRecorrida";
import { RecorridaPage } from "./pages/RecorridaPage";
import { Recorridas } from "./pages/Recorridas";
import { iniciarAutoSync } from "./services/sync";
import * as storage from "./storage";
import { aplicarContraste } from "./ui";

/**
 * HashRouter: en GitHub Pages funciona sin configuración de servidor y sobrevive al refresh
 * en cualquier ruta profunda. Para una app de una sola pantalla operativa, el `#` no molesta.
 */
export default function App() {
  useEffect(() => {
    void storage.leerConfig().then((c) => aplicarContraste(c.altoContraste));
    // Retoma la cola de envío al abrir y cuando vuelve la conexión.
    iniciarAutoSync();
  }, []);

  return (
    <HashRouter>
      <BarraSuperior />
      <Routes>
        <Route path="/" element={<Recorridas />} />
        <Route path="/nueva" element={<NuevaRecorrida />} />
        <Route path="/recorrida/:id" element={<RecorridaPage />} />
        <Route path="/config" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

function BarraSuperior() {
  const { pathname } = useLocation();
  // Dentro de una recorrida manda su propia cabecera: dos barras apiladas comen media pantalla.
  if (pathname.startsWith("/recorrida/")) return null;

  return (
    <header className="flex items-center gap-3 border-b-2 border-stone-300 bg-white px-3 py-2">
      <Link to="/" className="text-base font-bold">
        Inspección de campo · Eq. de torre
      </Link>
      <Link to="/config" className="ml-auto text-sm font-bold underline">
        Configuración
      </Link>
    </header>
  );
}
