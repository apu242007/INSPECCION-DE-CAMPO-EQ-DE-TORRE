# EQT-01 · Crear recorrida

**Nombre en Power Automate:** `WellService | EQ Torre | 01 Crear recorrida`
**Disparador:** `Cuando se recibe una solicitud HTTP` (HTTP request received)
**Secreto del repo:** `VITE_EQT01_URL`

Crea la fila padre en `INSPECCION DE CAMPO EQ TORRE`, adjunta el PDF y las firmas, crea una fila
hija por cada ítem del checklist y manda el mail con el PDF.

> **Las fotos NO viajan por acá.** Van una llamada por ítem vía EQT-02. Meterlas en este POST
> es lo que pone el payload y el tiempo de ejecución contra el gateway de ~110 s.

---

## Placeholders

| Placeholder | Valor |
|---|---|
| `<SITE_URL>` | `https://tackersrl505.sharepoint.com/sites/WellService` |
| `<LISTA_PADRE>` | `INSPECCION DE CAMPO EQ TORRE` (verificar el Title real con el script) |
| `<LISTA_ITEMS>` | `INSPECCION DE CAMPO EQ TORRE - ITEMS` |
| `<NOTIFY_EMAIL>` | `jcastro@tackertools.com` |
| `<TACKER_KEY>` | el valor que pongas en el secreto `VITE_TACKER_KEY` |

---

## Árbol final

```
Cuando se recibe una solicitud HTTP
├─ Check_key                    ← 401 + Terminar si no coincide
├─ Init_varFolio
├─ CreateHeaderItem             (Crear elemento en <LISTA_PADRE>)
├─ Respuesta                    ← 200 ACÁ, antes de los loops
├─ Loop_attachments             (concurrencia 1)  → Add_attachment
├─ Loop_items                   (concurrencia 20) → Create_item_EQT
├─ Loop_adicionales             (concurrencia 20) → Create_item_adicional
└─ Send_email_V2                (fuera de todo loop, run-after = solo correcto)
```

---

## 1 · Disparador

| Campo | Valor |
|---|---|
| ¿Quién puede desencadenar el flujo? | **Cualquier usuario** |
| Método (Mostrar opciones avanzadas) | `POST` |
| **Esquema JSON del cuerpo de la solicitud** | **VACÍO** |

> Dejar el esquema **vacío**, no "sincronizado". Con un esquema cargado, Power Automate valida
> cada `triggerBody()?['x']` contra él y rechaza en tiempo de diseño cualquier campo nuevo:
> *"'equipoRecorrida' ya no está presente en el esquema de la operación"*. La SPA es la fuente
> de verdad del payload; el esquema solo se queda viejo.

Después de **Guardar**, la URL aparece bajo el encabezado del disparador → **Copiar**.

---

## 2 · `Check_key` — Condición

Primera acción después del disparador.

| Lado | Valor (pestaña `fx Expresión`) |
|---|---|
| Izquierda | `triggerOutputs()?['headers']?['x-tacker-key']` |
| Operador | es igual a |
| Derecha | `<TACKER_KEY>` |

**Rama «Si no»:**
1. `Respuesta` — Código de estado `401`, cuerpo `{"error":"unauthorized"}`
2. `Terminar` — Estado `Failed`

**Rama «Si sí»:** vacía, el flujo sigue abajo.

> Esto es un **badén contra bots**, no autenticación. La clave viaja en el bundle de la SPA y
> cualquiera la ve en DevTools. Está documentado así en el README a propósito.

---

## 3 · `Init_varFolio` — Inicializar variable

| Campo | Valor |
|---|---|
| Nombre | `varFolio` |
| Tipo | `Cadena` |
| Valor (`fx`) | `if(empty(triggerBody()?['folio']), concat('REC-', formatDateTime(utcNow(),'yyyyMMdd-HHmmss')), triggerBody()?['folio'])` |

> Todas las variables se declaran en la **raíz**. `Inicializar variable` no se puede usar dentro
> de un `Aplicar a cada uno`, de un `Conmutador` ni de una `Condición`.

---

## 4 · `CreateHeaderItem` — SharePoint · Crear elemento

Renombrar la acción a **`CreateHeaderItem`** exactamente: todo lo de abajo la referencia por ese nombre.

| Campo | Valor |
|---|---|
| Dirección del sitio | `<SITE_URL>` |
| Nombre de la lista | `<LISTA_PADRE>` |

Cada campo con la pestaña **`fx Expresión`** (nunca arrastrando chips del panel de contenido
dinámico: los chips guardan referencias al esquema y se rompen cuando el disparador cambia).

| Columna | Expresión `fx` |
|---|---|
| `Title` | `variables('varFolio')` |
| `Equipo` | `triggerBody()?['equipo']` |
| `Operadora Value` | `if(empty(triggerBody()?['operadora']), null, triggerBody()?['operadora'])` |
| `Contrato` | `triggerBody()?['contrato']` |
| `FechaRelevamiento` | `coalesce(triggerBody()?['fechaRelevamiento'], utcNow())` |
| `Pozo` | `triggerBody()?['pozo']` |
| `AuditoriaProgramada` | `if(empty(triggerBody()?['auditoriaProgramada']), null, triggerBody()?['auditoriaProgramada'])` |
| `EquipoRecorrida` | `triggerBody()?['equipoRecorrida']` |
| `CompanyRepresentative` | `triggerBody()?['companyRepresentative']` |
| `Notas` | `triggerBody()?['notas']` |
| `TotalItems` | `if(equals(triggerBody()?['totalItems'], null), null, int(triggerBody()?['totalItems']))` |
| `ItemsOK` | `if(equals(triggerBody()?['itemsOK'], null), null, int(triggerBody()?['itemsOK']))` |
| `ItemsNoOK` | `if(equals(triggerBody()?['itemsNoOK'], null), null, int(triggerBody()?['itemsNoOK']))` |
| `ItemsEnProc` | `if(equals(triggerBody()?['itemsEnProc'], null), null, int(triggerBody()?['itemsEnProc']))` |
| `ItemsNA` | `if(equals(triggerBody()?['itemsNA'], null), null, int(triggerBody()?['itemsNA']))` |
| `ItemsSinRevisar` | `if(equals(triggerBody()?['itemsSinRevisar'], null), null, int(triggerBody()?['itemsSinRevisar']))` |
| `Reiterativos` | `if(equals(triggerBody()?['reiterativos'], null), null, int(triggerBody()?['reiterativos']))` |
| `Nuevos` | `if(equals(triggerBody()?['nuevos'], null), null, int(triggerBody()?['nuevos']))` |
| `Adicionales` | `if(equals(triggerBody()?['adicionales'], null), null, int(triggerBody()?['adicionales']))` |
| `PctAvance` | `if(equals(triggerBody()?['pctAvance'], null), null, float(triggerBody()?['pctAvance']))` |
| `Semaforo Value` | `coalesce(triggerBody()?['semaforo'], 'ROJO')` |
| `Cerrada` | `false` |
| `AppVersion` | `triggerBody()?['appVersion']` |

**Por qué los envoltorios:**

- **Choice opcional** → `if(empty(...), null, ...)`. `coalesce()` devuelve **cadena vacía**, no
  `null`, y el conector rechaza `""` para una opción vacía.
- **Number** → `int()` / `float()` explícito. Sin el cast, un `""` se coerce a `0` y quedan KPIs
  falsos en el reporte de Power BI.
- **DateTime obligatoria** → `coalesce(..., utcNow())`.
- **DateTime opcional** → `if(empty(...), null, ...)`; una fecha vacía tira 400.
- **Persona/Grupo** → no se puede llenar desde un flujo anónimo. No hay columnas de ese tipo acá.

---

## 5 · `Respuesta` — **ANTES de los loops**

| Campo | Valor |
|---|---|
| Código de estado | `200` |
| Encabezados | `Content-Type` : `application/json` |
| Cuerpo | ver abajo |

```
{
  "recorridaId": @{outputs('CreateHeaderItem')?['body/ID']},
  "folio": "@{variables('varFolio')}",
  "url": "@{concat('<SITE_URL>/_layouts/15/listform.aspx?PageType=4&ListId=', outputs('CreateHeaderItem')?['body/{Identifier}'], '&ID=', outputs('CreateHeaderItem')?['body/ID'])}"
}
```

> **Esto no es un detalle de performance, es la diferencia entre que ande y que no.** Con la
> `Respuesta` al final, el navegador espera a que terminen los loops y a los ~110 s el gateway
> corta con **502 NoResponse**, aunque el flujo después termine bien. El usuario ve un error y
> reintenta, y quedan dos filas.

> Si la `url` compuesta no resuelve, es preferible **no devolverla** que devolver una rota: la
> SPA solo muestra el botón «Ver en SharePoint» si viene el campo.

---

## 6 · `Loop_attachments` — Aplicar a cada uno

| Campo | Valor |
|---|---|
| Seleccionar una salida (`fx`) | `triggerBody()?['attachments']` |
| Configuración ⚙️ → Control de simultaneidad | **ACTIVADO, Grado de paralelismo = 1** |

> Concurrencia **1** es obligatoria: todas las iteraciones escriben sobre **la misma fila** de
> SharePoint, que usa concurrencia optimista por ETag. En paralelo aparecen fallos intermitentes
> de `Save Conflict` que además no se reproducen a pedido.

> Ojo con el campo «Seleccionar una salida»: hay que **borrar el chip** que Power Automate
> engancha solo y pegar la expresión en `fx`. Con `triggerBody()` a secas, el loop itera sobre
> las claves de primer nivel del payload y falla en cada una.

**Dentro del loop — `Add_attachment` (SharePoint · Agregar datos adjuntos):**

| Campo | Valor |
|---|---|
| Dirección del sitio | `<SITE_URL>` |
| Nombre de la lista | `<LISTA_PADRE>` |
| Id | `outputs('CreateHeaderItem')?['body/ID']` |
| Nombre de archivo (`fx`) | `items('Loop_attachments')?['name']` |
| Contenido del archivo (`fx`) | `base64ToBinary(items('Loop_attachments')?['contentBase64'])` |

### Verificar en «Ver código» — dos trampas que arruinan los adjuntos

Después de armar la acción, abrir **⋯ → Ver código** (Peek code) y confirmar que `body` sea
**exactamente** esto, una cadena que **termina en el paréntesis**:

```json
"body": "@base64ToBinary(items('Loop_attachments')?['contentBase64'])"
```

| Lo que aparece | Qué pasa | Cómo se ve |
|---|---|---|
| `"body": { "contentBytes": "...", "name": "..." }` | El selector de archivos metió un objeto JSON. Se serializa y **ese texto** queda como contenido del archivo. | El adjunto en SP abre como imagen rota; el archivo contiene `{"contentBytes":...`. |
| `"body": "@base64ToBinary(...)\r\n"` | El `\r\n` final convierte el valor en plantilla de cadena y el binario se coerce a texto. | Archivo con tamaño correcto que no abre. |

Si la interfaz vuelve a envolverlo, **borrar la acción `Add_attachment` y agregarla de nuevo**,
cargando cada campo por la pestaña `fx`, sin tocar el selector de archivos.

---

## 7 · `Loop_items` — Aplicar a cada uno

| Campo | Valor |
|---|---|
| Seleccionar una salida (`fx`) | `triggerBody()?['items']` |
| Concurrencia | ACTIVADO, **20** (son filas distintas: el paralelo es seguro) |

**Dentro — `Create_item_EQT` (SharePoint · Crear elemento en `<LISTA_ITEMS>`):**

| Columna | Expresión `fx` |
|---|---|
| `Title` | `concat('#', string(items('Loop_items')?['itemId']))` |
| **`Recorrida Id`** (lookup) | `outputs('CreateHeaderItem')?['body/ID']` |
| `ItemId` | `int(items('Loop_items')?['itemId'])` |
| `Zona` | `items('Loop_items')?['zona']` |
| `ItemTexto` | `items('Loop_items')?['itemTexto']` |
| `CriticidadRef` | `items('Loop_items')?['criticidadRef']` |
| `Criticidad Value` | `coalesce(items('Loop_items')?['criticidad'], 'GENERAL')` |
| `Estado Value` | `coalesce(items('Loop_items')?['estado'], 'SIN_REVISAR')` |
| `Origen Value` | `if(empty(items('Loop_items')?['origen']), null, items('Loop_items')?['origen'])` |
| `FuenteReiteracion Value` | `if(empty(items('Loop_items')?['fuenteReiteracion']), null, items('Loop_items')?['fuenteReiteracion'])` |
| `VecesPrevias` | `if(equals(items('Loop_items')?['vecesPrevias'], null), null, int(items('Loop_items')?['vecesPrevias']))` |
| `ReiteracionAuto` | `if(equals(items('Loop_items')?['reiteracionAuto'], null), false, bool(items('Loop_items')?['reiteracionAuto']))` |
| `ReferenciaReiteracion` | `items('Loop_items')?['referenciaReiteracion']` |
| `FechaVerif` | `if(empty(items('Loop_items')?['fechaVerif']), null, items('Loop_items')?['fechaVerif'])` |
| `Responsable` | `items('Loop_items')?['responsable']` |
| `Plazo` | `if(empty(items('Loop_items')?['plazo']), null, items('Loop_items')?['plazo'])` |
| `AccionCorrectiva` | `items('Loop_items')?['accionCorrectiva']` |
| `EstadoFinal Value` | `if(empty(items('Loop_items')?['estadoFinal']), null, items('Loop_items')?['estadoFinal'])` |
| `Escalado` | `if(equals(items('Loop_items')?['escalado'], null), false, bool(items('Loop_items')?['escalado']))` |
| `Observaciones` | `items('Loop_items')?['observaciones']` |
| `Adicional` | `false` |
| `FotosCount` | `if(equals(items('Loop_items')?['fotosCount'], null), 0, int(items('Loop_items')?['fotosCount']))` |
| `Equipo` | `triggerBody()?['equipo']` |

> **La lookup se llena con el ID del padre, nunca con el Title.** Si el formulario no muestra
> `Recorrida Id`, la columna quedó creada en la lista equivocada: hay que borrarla del padre y
> recrearla en `<LISTA_ITEMS>` (ver el script de SharePoint).

> Se crean **las 94 filas**, también las que están en OK. Estas listas alimentan después Power BI
> y un dashboard sin los OK no puede calcular el % de avance.

---

## 8 · `Loop_adicionales` — Aplicar a cada uno

Igual que `Loop_items`, pero:

| Campo | Valor |
|---|---|
| Seleccionar una salida (`fx`) | `triggerBody()?['itemsAdicionales']` |
| Concurrencia | 20 |
| Acción interna | `Create_item_adicional`, en `<LISTA_ITEMS>` |
| `Adicional` | `true` |
| El resto de las columnas | iguales, cambiando `items('Loop_items')` por `items('Loop_adicionales')` |

> Los nombres de acción tienen que ser **únicos en todo el flujo**, no por ámbito. Dos acciones
> con el mismo nombre importan sin error y `body('X')` resuelve a cualquiera de las dos.

---

## 9 · `Send_email_V2` — en la raíz, fuera de todo loop

Clic en `⋯` → **Configurar ejecución después** → dejar marcado **solo «es correcto»** para
`CreateHeaderItem`, `Loop_attachments`, `Loop_items` y `Loop_adicionales`.

> Sin esto, si SharePoint falla igual sale el mail de éxito y nadie se entera de que la recorrida
> no se guardó.

| Campo | Valor |
|---|---|
| Para | `<NOTIFY_EMAIL>` |
| Asunto (`fx`) | `concat('Recorrida EQ Torre ', variables('varFolio'), ' - ', triggerBody()?['equipo'], if(equals(triggerBody()?['semaforo'],'ROJO'), ' [ROJO]', ''))` |

**Cuerpo** (HTML, pegar tal cual):

```html
<div style="font-family:system-ui,sans-serif;font-size:14px">
  <h2 style="margin:0 0 8px">Inspección de campo — Equipo de torre</h2>
  <p style="margin:0 0 12px;color:#57534e">
    Recorrida de pre-auditoría. El PDF completo con fotos va adjunto.
  </p>

  @{if(equals(triggerBody()?['semaforo'],'ROJO'),
    '<div style="background:#fee2e2;border-left:6px solid #b91c1c;padding:12px;border-radius:6px;margin-bottom:12px"><strong style="color:#b91c1c">SEMÁFORO ROJO</strong><br>Hay hallazgos críticos (o mayores escalados) abiertos, o ítems críticos sin revisar.</div>',
    if(equals(triggerBody()?['semaforo'],'AMARILLO'),
      '<div style="background:#fef3c7;border-left:6px solid #d97706;padding:12px;border-radius:6px;margin-bottom:12px"><strong style="color:#b45309">SEMÁFORO AMARILLO</strong><br>Hay hallazgos mayores abiertos.</div>',
      '<div style="background:#dcfce7;border-left:6px solid #15803d;padding:12px;border-radius:6px;margin-bottom:12px"><strong style="color:#15803d">SEMÁFORO VERDE</strong></div>'))}

  <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
    <tr><td><strong>Folio</strong></td><td>@{variables('varFolio')}</td></tr>
    <tr><td><strong>Equipo</strong></td><td>@{triggerBody()?['equipo']}</td></tr>
    <tr><td><strong>Operadora</strong></td><td>@{triggerBody()?['operadora']}</td></tr>
    <tr><td><strong>Pozo / locación</strong></td><td>@{triggerBody()?['pozo']}</td></tr>
    <tr><td><strong>Fecha</strong></td><td>@{convertTimeZone(coalesce(triggerBody()?['fechaRelevamiento'], utcNow()), 'UTC', 'Argentina Standard Time', 'dd/MM/yyyy HH:mm')}</td></tr>
    <tr><td><strong>Recorrieron</strong></td><td>@{triggerBody()?['equipoRecorrida']}</td></tr>
    <tr><td><strong>Avance</strong></td><td>@{triggerBody()?['pctAvance']}%</td></tr>
  </table>

  <h3 style="margin:16px 0 4px">Resultado</h3>
  <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
    <tr>
      <td style="background:#f5f5f4"><strong>OK</strong></td>
      <td style="background:#f5f5f4"><strong>NO OK</strong></td>
      <td style="background:#f5f5f4"><strong>En proc.</strong></td>
      <td style="background:#f5f5f4"><strong>N/A</strong></td>
      <td style="background:#f5f5f4"><strong>Sin revisar</strong></td>
    </tr>
    <tr>
      <td>@{triggerBody()?['itemsOK']}</td>
      <td style="color:#b91c1c;font-weight:700">@{triggerBody()?['itemsNoOK']}</td>
      <td>@{triggerBody()?['itemsEnProc']}</td>
      <td>@{triggerBody()?['itemsNA']}</td>
      <td>@{triggerBody()?['itemsSinRevisar']}</td>
    </tr>
  </table>

  <p style="margin-top:12px">
    Nuevos: <strong>@{triggerBody()?['nuevos']}</strong> ·
    Reiterativos: <strong style="color:#6d28d9">@{triggerBody()?['reiterativos']}</strong> ·
    Adicionales detectados: <strong>@{triggerBody()?['adicionales']}</strong>
  </p>
</div>
```

**Mostrar opciones avanzadas → Datos adjuntos → + Agregar nuevo elemento** (una sola vez):

| Campo | Expresión `fx` |
|---|---|
| Nombre | `triggerBody()?['attachments']?[0]?['name']` |
| Contenido | `base64ToBinary(triggerBody()?['attachments']?[0]?['contentBase64'])` |

> Por convención de la SPA `attachments[0]` es **siempre** el PDF; después van las firmas.
> Forma defensiva si alguna vez cambia el orden:
> `first(filter(triggerBody()?['attachments'], endsWith(item()?['name'], '.pdf')))?['name']`
> Ojo: `filter` de Logic Apps **no** acepta `&&` ni `||`; se usan `and()`, `or()`, `equals()`.

---

## 10 · Guardar, copiar URL, exportar

1. **Guardar**.
2. Clic en la tarjeta del disparador → **Copiar la URL**.
3. Guardarla como secreto del repo: `VITE_EQT01_URL`.
4. **Exportar → Paquete (.zip)** y commitear el zip en esta carpeta. El `.md` es para humanos;
   el `.zip` es el único respaldo real e importable.

---

## Checklist antes de guardar

- [ ] Esquema del disparador **vacío** (no «sincronizado»: vacío)
- [ ] Acción renombrada a `CreateHeaderItem`
- [ ] Todos los campos cargados por la pestaña `fx`, sin chips naranjas
- [ ] `Respuesta` **entre** `CreateHeaderItem` y `Loop_attachments`
- [ ] `Loop_attachments` con concurrencia **1**
- [ ] `Add_attachment`: en Ver código, `body` es una cadena que termina en `)` — sin `\r\n`, sin espacios
- [ ] Lookup de la hija apuntando a `body/ID` del padre, **no** al Title
- [ ] `Send_email_V2` en la raíz, no dentro de ningún loop
- [ ] «Configurar ejecución después» = solo «es correcto» en las 4 acciones previas
- [ ] URL copiada al secreto `VITE_EQT01_URL`
- [ ] Paquete `.zip` exportado y commiteado
