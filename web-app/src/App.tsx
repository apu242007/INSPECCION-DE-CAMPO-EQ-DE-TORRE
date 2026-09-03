import { useEffect } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Configuracion } from "./pages/Configuracion";
import { NuevaRecorrida } from "./pages/NuevaRecorrida";
import { RecorridaPage } from "./pages/RecorridaPage";
import { Recorridas } from "./pages/Recorridas";
import { iniciarAutoSync } from "./services/sync";
import * as storage from "./storage";
import { aplicarContraste } from "./ui";

/**
 * HashRouter: en GitHub Pages funciona sin configuración de servidor y sobrevive al refresh
 * en cualquier ruta profunda.
 *
 * El shell cambia de forma según el dispositivo, no solo de tamaño:
 *   - Celular: una barra fina arriba. Todo el alto es para el ítem.
 *   - Escritorio: navegación lateral persistente, porque acá se salta entre recorridas y
 *     configuración todo el tiempo, y un menú que aparece y desaparece cuesta un clic de más.
 */
export default function App() {
  useEffect(() => {
    void storage.leerConfig().then((c) => aplicarContraste(c.altoContraste));
    // Retoma la cola de envío al abrir y cuando vuelve la conexión.
    iniciarAutoSync();
  }, []);

  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}

function Shell() {
  const { pathname } = useLocation();
  // Dentro de una recorrida manda su propia cabecera: dos barras apiladas comen media pantalla.
  const enRecorrida = pathname.startsWith("/recorrida/");

  if (enRecorrida) {
    return (
      <Routes>
        <Route path="/recorrida/:id" element={<RecorridaPage />} />
      </Routes>
    );
  }

  return (
    <div className="flex min-h-[100dvh]">
      <NavLateral />
      <div className="min-w-0 flex-1">
        <BarraMovil />
        <Routes>
          <Route path="/" element={<Recorridas />} />
          <Route path="/nueva" element={<NuevaRecorrida />} />
          <Route path="/config" element={<Configuracion />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

const ENLACES = [
  { a: "/", texto: "Recorridas" },
  { a: "/nueva", texto: "Nueva recorrida" },
  { a: "/config", texto: "Configuración" },
];

function NavLateral() {
  return (
    <nav
      aria-label="Secciones"
      className="hidden w-56 shrink-0 flex-col border-r border-acero-200 bg-papel lg:flex"
    >
      <div className="border-b border-acero-200 px-4 py-4">
        <p className="text-[0.95rem] font-semibold leading-tight">Inspección de campo</p>
        <p className="text-sm text-acero-500">Equipo de torre</p>
      </div>

      <ul className="flex-1 py-2">
        {ENLACES.map((e) => (
          <li key={e.a}>
            <NavLink
              to={e.a}
              end={e.a === "/"}
              className={({ isActive }) =>
                `block px-4 py-2.5 text-[0.95rem] font-medium ${
                  isActive
                    ? "border-l-[3px] border-acero-900 bg-acero-50 pl-[13px] font-semibold"
                    : "border-l-[3px] border-transparent text-acero-700"
                }`
              }
            >
              {e.texto}
            </NavLink>
          </li>
        ))}
      </ul>

      <p className="border-t border-acero-200 px-4 py-3 text-xs text-acero-500">TACKER SRL · QHSE</p>
    </nav>
  );
}

function BarraMovil() {
  return (
    <header className="flex items-center gap-3 border-b border-acero-200 bg-papel px-3 py-2 lg:hidden">
      <NavLink to="/" className="text-[0.95rem] font-semibold">
        Inspección de campo
      </NavLink>
      <NavLink to="/config" className="ml-auto text-sm font-medium underline">
        Configuración
      </NavLink>
    </header>
  );
}
