# INSPECCIÓN DE CAMPO · EQUIPO DE TORRE

App de recorrida de **pre-auditoría** de equipos de torre de la flota de TACKER SRL. Verifica los
**94 ítems** del checklist general (17 zonas), consolidado de lo que observan las inspectoras
externas (OIL DASSA) para las operadoras.

**Producción:** https://apu242007.github.io/INSPECCION-DE-CAMPO-EQ-DE-TORRE/

---

## Qué resuelve

Antes de que venga la inspectora, alguien sube al mástil con arnés y recorre el equipo. La app
está diseñada para **ese momento**, no para el escritorio:

- **Un ítem por pantalla**, cuatro botones de ≥ 72 px en la zona del pulgar, avance automático al
  marcar OK o N/A. Se opera con una mano, con guantes, a pleno sol.
- **Cero tipeo obligatorio en altura.** En campo solo se pide estado, foto y un toggle. Responsable,
  plazo, criticidad y acción correctiva se completan después, en modo oficina.
- **Foto obligatoria.** Ningún ítem en NO OK o EN PROC se guarda sin al menos una foto tomada desde
  la app. La regla vive en `lib/validacion.ts` y la aplican **todos** los caminos de escritura:
  modo campo, modo oficina, `storage.ts`, importación de JSON y cierre de recorrida. El botón
  deshabilitado es comodidad; la barrera está en el modelo.
- **Reiterativo vs nuevo, propuesto por la app.** Al marcar un hallazgo, se cruza con las recorridas
  anteriores del mismo equipo y con la semilla de informes externos, y se propone
  `REITERATIVO ×N` con las fechas. El inspector confirma o corrige con un tap.
- **Todo offline.** La recorrida vive en IndexedDB y se retoma donde quedó. La sincronización con
  SharePoint es una cola con reintentos que se retoma sola cuando vuelve la señal.

---

## Arquitectura

```
[Celular / tablet, sin señal]
        │  IndexedDB: borrador + fotos + cola de envío
        ▼
[SPA React en GitHub Pages]
        │  HTTPS POST (JSON) — endpoint público, sin login
        ▼
[Power Automate · 5 flujos HTTP]
        ├─▶ INSPECCION DE CAMPO EQ TORRE                    (padre + PDF + firmas)
        ├─▶ INSPECCION DE CAMPO EQ TORRE - ITEMS            (una fila por ítem + fotos)
        ├─▶ INSPECCION DE CAMPO EQ TORRE - CATALOGO EXTRA
        └─▶ Correo a QHSE con el PDF
```

**SharePoint es la fuente de verdad.** El celular guarda borradores y una cola; nada más.

| Flujo | Qué hace |
|---|---|
| **EQT-01** | Crea la recorrida: cabecera + KPIs + las 94 filas de ítems + PDF y firmas. **Sin fotos.** |
| **EQT-02** | Sube las fotos de **un** ítem. Una llamada por ítem, encolada desde la SPA. |
| **EQT-03** | Historial del equipo. Alimenta la propuesta automática de reiteración. |
| **EQT-04** | Modo oficina: responsable, plazo, acción correctiva, estado final, fotos extra. |
| **EQT-05** | Cierre: firmas, KPIs finales, reemplazo del PDF y mail. |

Cada uno está documentado con las expresiones `fx` exactas en [`power-automate/`](power-automate/).

---

## Correr en local

```bash
cd web-app
npm ci
npm run dev      # http://localhost:5173
npm test         # Vitest
npm run build    # tsc --noEmit + vite build
```

Sin variables de entorno la app arranca en **modo demo**: valida todo, arma el PDF y el payload,
lo imprime en la consola y **no manda nada a la red**. Para apuntar a los flujos reales, copiar
`web-app/.env.example` a `web-app/.env` y completar las URLs.

---

## Puesta en marcha

**Ya está instalado y funcionando.** Todo el backend se levanta con un comando:

```powershell
.\Instalar-Todo.ps1
```

Es idempotente: lo que ya existe se saltea. Modos útiles:

| Comando | Qué hace |
|---|---|
| `.\Instalar-Todo.ps1 -SoloVerificar` | Reporta qué falta, no toca nada |
| `.\Instalar-Todo.ps1 -Probar ...` | Prueba de humo: 200 con la clave, 401 sin ella |
| `.\Instalar-Todo.ps1 -ProbarCompleto ...` | Crea una recorrida real, la verifica en SharePoint y la borra |
| `.\Instalar-Todo.ps1 -VerHistorial '01 Crear'` | El historial de corridas con la acción exacta que falló |
| `.\Instalar-Todo.ps1 -ListarOperaciones` | Los `operationId` reales del conector, del swagger |
| `.\Instalar-Todo.ps1 -BuscarLookups` | Cómo nombran las lookups los flujos que ya andan |
| `.\Instalar-Todo.ps1 -Limpiar` | Borra las filas de prueba |

### Lo que hace, en orden

1. **Autentica** con el refresh token cacheado; si venció, pide un device code una vez.
2. **SharePoint**: crea las dos listas auxiliares, las 53 columnas y la lookup `Recorrida`.
3. **Power Automate**: crea o actualiza los 5 flujos vía la API de administración, tomando los
   nombres de instancia de las conexiones de un flujo del entorno que ya las use.
4. **Secrets**: carga las 5 URLs de disparador y sincroniza `VITE_TACKER_KEY` con la
   `claveEsperada` de los flujos, para que no puedan desfasarse.

### Estado actual

| Pieza | Estado |
|---|---|
| Listas y columnas de SharePoint | Creadas (25 + 21 + 7) |
| Columna lookup `Recorrida` | Creada por REST |
| Los 5 flujos | Creados y activos |
| Secrets del repo | Los 6 cargados |
| Prueba end-to-end | Verde: crea, adjunta, escribe hijas, sube foto, historial, limpia |
| App publicada | Con las URLs reales, fuera de modo demo |

### Lo único que no se puede automatizar

La **autorización de una conexión** de Power Automate: es un objeto del entorno con su propio
token OAuth y el consentimiento es humano. En este tenant no hizo falta porque ya existían de
otras apps, y el script las reutiliza.

Y **probar la app en un celular real**. Wake Lock, cámara, y el comportamiento al bloquear la
pantalla no se reproducen en un emulador.

### Semilla de historial (opcional, por equipo)

Para que la primera recorrida de un equipo no proponga «nuevo» en hallazgos que ya salieron
tres veces en informes externos.

La de TACK-6 viene incluida (`src/data/semillas/tack6.ts`). Para otro equipo: **Configuración →
Importar semilla** con un JSON así:

```json
{
  "equipo": "TACK-3",
  "referencia": "Informes OIL DASSA 2025-2026",
  "aparicionesPrevias": { "42": 2, "81": 3 },
  "corregidosUltimaInspeccion": [19, 27],
  "itemsIAuditorYPF": { "90": 39 }
}
```

- `aparicionesPrevias`: `itemId → en cuántos informes externos apareció`. Se usa como
  `vecesPrevias` con fuente `AUDITORIA_EXTERNA`.
- `corregidosUltimaInspeccion`: se precargan en **OK** con la observación
  *"Corregido en inspección abr-2026 (verificar que se mantenga)"*.

---

## Modelo de seguridad — leer antes de tocar nada

Esta app expone **endpoints HTTP públicos y sin autenticación**. Es una decisión consciente, no un
descuido: el operario que sube al mástil no puede tener credenciales de SharePoint, y el flujo
corre como un usuario real de M365 (el dueño del flujo) que sí las tiene.

**Todo lo que empieza con `VITE_` es público.** Se inlinea en el bundle de JavaScript en tiempo de
build y cualquiera lo ve abriendo DevTools o mirando el código publicado en Pages:

- **Las URLs de los flujos son públicas por diseño.** Tienen que serlo: el navegador las llama. La
  firma tipo SAS de la URL no es un secreto que se pueda esconder. Cualquiera puede hacer POST.
- **`VITE_TACKER_KEY` NO es un secreto.** También viaja en el bundle. Es un badén contra bots de
  rastreo, nada más. No la trates como autenticación.

Se guardan como *secrets* de GitHub para que no queden en el código fuente, **no** para que queden
ocultas en el resultado.

**Nunca** poner un secreto real (contraseña de SharePoint, client secret de Graph, token de Outlook)
en una variable `VITE_`. Esos viven únicamente dentro de las conexiones del flujo, que corren del
lado del servidor.

### Mitigaciones activas

1. `Check_key` como primera acción de cada flujo: 401 + Terminar si no coincide.
2. Validación de forma del payload antes de tocar SharePoint.
3. Tope de tamaño del PDF en el cliente (4 MB en base64), con recompresión progresiva de las fotos
   incrustadas antes de rechazar.
4. `FechaCierre` la pone el flujo con `utcNow()`, nunca el payload: un sello que viene del cliente
   viene del reloj del teléfono.

### La postura honesta

Es una **herramienta interna con una URL pública**, protegida por oscuridad y por su bajo valor
para un atacante. No hay identidad por persona: quien tenga el link, opera. La contención real es
la trazabilidad (qué se cargó, cuándo, con qué fotos) y el contrato, no un control de acceso.

Si algún día hace falta rate limiting de verdad, el camino es poner los flujos detrás de Azure API
Management o de un Worker de Cloudflare. Para un checklist interno es exagerado hoy.

---

## Estructura

```
web-app/
├── src/
│   ├── data/catalogo.ts              # los 94 ítems, 17 zonas, literal
│   ├── data/semillas/tack6.ts
│   ├── types.ts
│   ├── lib/
│   │   ├── validacion.ts             # FOTO OBLIGATORIA: fuente única de verdad
│   │   ├── reiteracion.ts            # propuesta automática nuevo/reiterativo
│   │   ├── metrics.ts                # KPIs, semáforo, escalado de MAYOR vencido
│   │   ├── prioridad.ts              # orden de resolución
│   │   ├── recorrida.ts              # alta, duplicado, semilla, folio
│   │   ├── imageUtils.ts             # compresión en dos capas
│   │   ├── pdfGenerator.ts           # jsPDF + Roboto embebida (acentos)
│   │   └── excelExport.ts            # SheetJS
│   ├── storage.ts                    # IndexedDB: borrador, cola, cache de historial
│   ├── services/{api,sync}.ts        # 5 flujos + cola con reintentos + modo demo
│   ├── components/campo/             # modo campo: paso a paso, cámara, toggle, nota de voz
│   ├── components/oficina/           # modo oficina: tabla y detalle editable
│   └── pages/
├── scripts/build-font.mjs            # regenera la fuente VFS de jsPDF
└── public/                           # manifest, service worker, iconos
sharepoint/Setup-Columns-EQT.ps1      # columnas idempotentes (body UTF-8, BOM)
power-automate/Flow-EQT-0{1..5}.md    # cada flujo con sus fx exactas
```

---

## Tests

```bash
cd web-app && npm test
```

79 tests sobre lo que puede romperse en silencio:

- **Catálogo**: 94 ítems, ids 1..94 sin repetir, 10 CRÍTICA / 59 MAYOR / 21 MENOR / 4 GENERAL,
  17 zonas, ningún ítem sin texto.
- **Foto obligatoria**, en los cinco caminos: `validarRegistro`, `validarRecorrida`, `storage`,
  importación de JSON y `puedeCerrarRecorrida` (que además lista los ítems que faltan).
- **Reiteración**: automática por historial, por semilla externa, la suma de ambas en `AMBAS`,
  la manual, y que la semilla de otro equipo no contamine.
- **Métricas**: % de avance excluyendo N/A, semáforo (incluye crítica sin revisar = ROJO),
  escalado de MAYOR vencido y su efecto en KPIs y prioridad.
- **Sincronización** con `fetch` mockeado: EQT-01 que falla no borra el borrador; EQT-02 que falla
  en el ítem 3 de 5 deja los 2 primeros sincronizados y el 3 reintentable; un corte de red a mitad
  de cola se retoma; un 400 no se reintenta; un 202 sin cuerpo se trata como error y no como éxito.

Lo que **no** cubren: los flujos y SharePoint. Eso se verifica con la prueba de aceptación de abajo.

---

## Prueba de aceptación (en un celular real, no en el emulador)

Wake Lock, la cámara, el push en iOS y el comportamiento al bloquear la pantalla **no se
reproducen en DevTools**.

1. Abrir la app en el celular, poner el equipo en modo avión.
2. Nueva recorrida. Recorrer en paso a paso, marcar varios NO OK con foto.
3. Confirmar que **no deja avanzar** un NO OK sin foto (el botón dice "Falta foto").
4. Cerrar la app del todo y volver a abrirla: la recorrida retoma en el mismo ítem.
5. Reconectar → **Enviar a SharePoint**.
6. Verificar en SharePoint:
   - la fila padre, con `Recorrida-<folio>.pdf` adjunto;
   - las 94 filas hijas, con la lookup apuntando al padre;
   - las fotos adjuntas en las filas de los ítems que las tienen;
   - el correo, con el PDF adjunto y los acentos bien.
7. Abrir el PDF: los acentos tienen que verse (`Inspección`, no `InspecciÃ³n`).

---

## Pendiente

**21 `hallazgoTipico` derivados.** Los ítems 74 a 94 llegaron sin la redacción textual de los
informes OIL DASSA / iAuditor YPF, así que su `hallazgoTipico` está **derivado de la condición**,
no tomado de un informe real. Están marcados en `HALLAZGO_DERIVADO` (`src/data/catalogo.ts`) y la
UI lo aclara en el globo de ayuda. Reemplazar por la redacción original cuando se tenga: son 21
strings, no invalida nada más.
