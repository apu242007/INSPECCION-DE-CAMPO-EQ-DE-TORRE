# EQT-05 · Cerrar recorrida

**Nombre en Power Automate:** `WellService | EQ Torre | 05 Cerrar recorrida`
**Disparador:** `Cuando se recibe una solicitud HTTP`
**Secreto del repo:** `VITE_EQT05_URL`

Marca la recorrida como cerrada, actualiza los KPIs finales y el semáforo, adjunta las firmas,
**reemplaza** el PDF por el definitivo y manda el mail de cierre.

---

## Payload

```json
{
  "recorridaId": 77,
  "firmaSupervisor": "Firmado",
  "firmaCR": "Firmado",
  "firmas": [
    { "name": "firma-supervisor.png", "contentBase64": "iVBORw0KG..." },
    { "name": "firma-cr.png", "contentBase64": "iVBORw0KG..." }
  ],
  "pdf": { "name": "Recorrida-REC-TACK-6-20260903-1200.pdf", "contentBase64": "JVBERi0..." },
  "itemsOK": 78, "itemsNoOK": 9, "itemsEnProc": 3, "itemsNA": 4,
  "pctAvance": 86.7, "semaforo": "AMARILLO"
}
```

---

## Árbol

```
Cuando se recibe una solicitud HTTP
├─ Check_key
├─ Get_header
├─ Condicion_encontrado
│   ├─ Si no → Respuesta 404 + Terminar
│   └─ Si sí:
│       ├─ Update_header_cierre
│       ├─ Loop_firmas             (concurrencia 1) → Add_attachment_firma
│       ├─ Get_attachments
│       ├─ Loop_borrar_pdf         (concurrencia 1) → Condicion_es_pdf → Delete_attachment
│       ├─ Add_attachment_pdf_final
│       ├─ Respuesta_ok            200
│       └─ Send_email_cierre       (run-after = solo correcto)
```

---

## 1 · Disparador y `Check_key`

Igual que EQT-01.

## 2 · `Get_header` — SharePoint · Obtener elemento

| Campo | Valor |
|---|---|
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE` |
| Id (`fx`) | `triggerBody()?['recorridaId']` |

> `Obtener elemento` (singular, por Id) es más barato que `Obtener elementos` con filtro. Si el
> id no existe, la acción falla y hay que capturarlo con la condición del paso siguiente usando
> «Configurar ejecución después» → también «ha fallado».

## 3 · `Condicion_encontrado`

| Lado | Valor |
|---|---|
| Izquierda (`fx`) | `empty(coalesce(body('Get_header')?['ID'], ''))` |
| Operador | es igual a |
| Derecha (`fx`) | `false` |

**Si no:** `Respuesta` 404 + `Terminar`.

## 4 · `Update_header_cierre` — SharePoint · Actualizar elemento

| Campo | Valor |
|---|---|
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE` |
| Id (`fx`) | `triggerBody()?['recorridaId']` |

| Columna | Expresión `fx` |
|---|---|
| `Title` | `body('Get_header')?['Title']` |
| `Cerrada` | `true` |
| `FechaCierre` | `utcNow()` |
| `ItemsOK` | `if(equals(triggerBody()?['itemsOK'], null), body('Get_header')?['ItemsOK'], int(triggerBody()?['itemsOK']))` |
| `ItemsNoOK` | `if(equals(triggerBody()?['itemsNoOK'], null), body('Get_header')?['ItemsNoOK'], int(triggerBody()?['itemsNoOK']))` |
| `ItemsEnProc` | `if(equals(triggerBody()?['itemsEnProc'], null), body('Get_header')?['ItemsEnProc'], int(triggerBody()?['itemsEnProc']))` |
| `ItemsNA` | `if(equals(triggerBody()?['itemsNA'], null), body('Get_header')?['ItemsNA'], int(triggerBody()?['itemsNA']))` |
| `PctAvance` | `if(equals(triggerBody()?['pctAvance'], null), body('Get_header')?['PctAvance'], float(triggerBody()?['pctAvance']))` |
| `Semaforo Value` | `coalesce(triggerBody()?['semaforo'], body('Get_header')?['Semaforo']?['Value'], 'ROJO')` |
| `FirmaSupervisor` | `coalesce(triggerBody()?['firmaSupervisor'], '')` |
| `FirmaCR` | `coalesce(triggerBody()?['firmaCR'], '')` |

> **`FechaCierre` la pone el flujo con `utcNow()`, nunca el cliente.** Un sello de tiempo que
> viene del payload viene del reloj del teléfono, y esta fecha puede terminar en una discusión
> con la operadora sobre cuándo se cerró un hallazgo.

## 5 · `Loop_firmas` — Aplicar a cada uno

| Campo | Valor |
|---|---|
| Seleccionar una salida (`fx`) | `triggerBody()?['firmas']` |
| Simultaneidad | **ACTIVADO, grado = 1** |

**Dentro — `Add_attachment_firma`** (lista padre, `Id` = `triggerBody()?['recorridaId']`):

- Nombre: `items('Loop_firmas')?['name']`
- Contenido: `base64ToBinary(items('Loop_firmas')?['contentBase64'])`

## 6 · Reemplazar el PDF

SharePoint **no** sobreescribe un adjunto con el mismo nombre: tira error de duplicado. Hay que
borrarlo y volver a agregarlo.

### `Get_attachments` — SharePoint · Obtener datos adjuntos

Lista padre, `Id` = `triggerBody()?['recorridaId']`.

### `Loop_borrar_pdf` — Aplicar a cada uno

| Campo | Valor |
|---|---|
| Seleccionar una salida (`fx`) | `body('Get_attachments')` |
| Simultaneidad | **ACTIVADO, grado = 1** |

**Dentro — `Condicion_es_pdf`:**

| Lado | Valor |
|---|---|
| Izquierda (`fx`) | `endsWith(toLower(items('Loop_borrar_pdf')?['DisplayName']), '.pdf')` |
| Operador | es igual a |
| Derecha (`fx`) | `true` |

**Si sí — `Delete_attachment`:** lista padre, `Id` = `triggerBody()?['recorridaId']`,
Nombre del archivo (`fx`) = `items('Loop_borrar_pdf')?['DisplayName']`.

### `Add_attachment_pdf_final`

| Campo | Valor |
|---|---|
| Id (`fx`) | `triggerBody()?['recorridaId']` |
| Nombre (`fx`) | `triggerBody()?['pdf']?['name']` |
| Contenido (`fx`) | `base64ToBinary(triggerBody()?['pdf']?['contentBase64'])` |

Verificar en **Ver código** que el `body` termine en `)`, sin `\r\n`.

> ⋯ → **Configurar ejecución después** de esta acción: marcar también **«se ha omitido»**. Si la
> fila no tenía PDF previo, `Loop_borrar_pdf` no hace nada y sin esto el flujo se corta antes de
> adjuntar el definitivo.

## 7 · `Respuesta_ok`

Código `200`, `Content-Type: application/json`:

```
{ "ok": true, "recorridaId": @{triggerBody()?['recorridaId']}, "cerradaEn": "@{utcNow()}" }
```

## 8 · `Send_email_cierre` — Outlook, en la raíz

`⋯` → **Configurar ejecución después** → solo **«es correcto»** para `Update_header_cierre`,
`Loop_firmas` y `Add_attachment_pdf_final`.

| Campo | Valor |
|---|---|
| Para | `<NOTIFY_EMAIL>` |
| Asunto (`fx`) | `concat('CERRADA - Recorrida EQ Torre ', body('Get_header')?['Title'], ' - ', body('Get_header')?['Equipo'])` |

Cuerpo:

```html
<div style="font-family:system-ui,sans-serif;font-size:14px">
  <h2 style="margin:0 0 8px">Recorrida cerrada</h2>
  <table cellpadding="6" style="border-collapse:collapse">
    <tr><td><strong>Folio</strong></td><td>@{body('Get_header')?['Title']}</td></tr>
    <tr><td><strong>Equipo</strong></td><td>@{body('Get_header')?['Equipo']}</td></tr>
    <tr><td><strong>Pozo</strong></td><td>@{body('Get_header')?['Pozo']}</td></tr>
    <tr><td><strong>Cerrada</strong></td><td>@{convertTimeZone(utcNow(),'UTC','Argentina Standard Time','dd/MM/yyyy HH:mm')}</td></tr>
    <tr><td><strong>Semáforo</strong></td><td>@{triggerBody()?['semaforo']}</td></tr>
    <tr><td><strong>Avance</strong></td><td>@{triggerBody()?['pctAvance']}%</td></tr>
    <tr><td><strong>NO OK</strong></td><td style="color:#b91c1c;font-weight:700">@{triggerBody()?['itemsNoOK']}</td></tr>
  </table>
  <p style="margin-top:12px;color:#57534e">El PDF final firmado va adjunto.</p>
</div>
```

**Datos adjuntos → + Agregar nuevo elemento:**

| Campo | Expresión `fx` |
|---|---|
| Nombre | `triggerBody()?['pdf']?['name']` |
| Contenido | `base64ToBinary(triggerBody()?['pdf']?['contentBase64'])` |

---

## Guardar, copiar URL, exportar

Secreto: `VITE_EQT05_URL`. Exportar `.zip` y commitear.

## Checklist

- [ ] Esquema del disparador vacío
- [ ] `FechaCierre` = `utcNow()` del flujo, **no** del payload
- [ ] `Title` reenviado en `Update_header_cierre`
- [ ] `Loop_firmas` y `Loop_borrar_pdf` con concurrencia 1
- [ ] `Add_attachment_pdf_final` con «ejecutar después» = correcto **y omitido**
- [ ] Las dos ramas de `Condicion_encontrado` terminan en `Respuesta`
- [ ] `Send_email_cierre` en la raíz, run-after solo «es correcto»
- [ ] URL guardada en `VITE_EQT05_URL`
- [ ] Paquete `.zip` commiteado
