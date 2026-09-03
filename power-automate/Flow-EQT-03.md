# EQT-03 · Historial por equipo

**Nombre en Power Automate:** `WellService | EQ Torre | 03 Historial por equipo`
**Disparador:** `Cuando se recibe una solicitud HTTP`
**Secreto del repo:** `VITE_EQT03_URL`

Devuelve las recorridas previas del equipo con los ítems que quedaron no conformes, más el
catálogo extra. **Es lo que alimenta la propuesta automática de reiteración.**

La SPA lo cachea en IndexedDB y lo une con las recorridas locales todavía no sincronizadas: sin
esa unión, dos recorridas seguidas offline no se ven entre sí. Si este flujo no responde, la app
sigue funcionando con el cache — la reiteración **nunca** bloquea la recorrida.

---

## Payload

```json
{ "equipo": "TACK-6 / TKR-06" }
```

## Respuesta

```json
{
  "recorridas": [
    { "folio": "REC-TACK-6-TKR-06-20260715-0900", "fecha": "2026-07-15T12:00:00Z",
      "pozo": "LACH-210", "itemsNoConformes": [81, 42, 63] }
  ],
  "catalogoExtra": [
    { "itemId": 1000, "zona": "Otros", "criticidadRef": "MAYOR",
      "itemTexto": "...", "hallazgoTipico": "..." }
  ]
}
```

---

## Árbol

```
Cuando se recibe una solicitud HTTP
├─ Check_key
├─ Get_headers_equipo        (padres del equipo)
├─ Get_items_noconformes     (hijas NO_OK / EN_PROC del equipo)
├─ Get_catalogo_extra
└─ Respuesta_historial       200
```

---

## 1 · Disparador y `Check_key`

Igual que EQT-01: **Cualquier usuario**, `POST`, **esquema vacío**, y el gate de 401.

## 2 · `Get_headers_equipo` — SharePoint · Obtener elementos

| Campo | Valor |
|---|---|
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE` |
| Consulta de filtro (`fx`) | `concat('Equipo eq ''', replace(triggerBody()?['equipo'], '''', ''''''), '''')` |
| Ordenar por | `FechaRelevamiento desc` |
| Cantidad máxima | `50` |

> El `replace` duplica las comillas simples: un nombre de equipo con `'` rompe el OData y el
> filtro devuelve vacío **sin error**, que es peor que fallar.

## 3 · `Get_items_noconformes` — SharePoint · Obtener elementos

| Campo | Valor |
|---|---|
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE - ITEMS` |
| Consulta de filtro (`fx`) | ver abajo |
| Cantidad máxima | `5000` |

```
concat('Equipo eq ''', replace(triggerBody()?['equipo'], '''', ''''''), ''' and (Estado eq ''NO_OK'' or Estado eq ''EN_PROC'')')
```

> Por eso la lista hija guarda una copia de `Equipo`: permite filtrar el historial sin hacer join
> contra el padre. Con 94 filas por recorrida y varias recorridas por equipo, el join por lookup
> es lento y encima paginado.

## 4 · `Get_catalogo_extra` — SharePoint · Obtener elementos

| Campo | Valor |
|---|---|
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE - CATALOGO EXTRA` |
| Consulta de filtro | `Activo eq 1` |
| Cantidad máxima | `500` |

## 5 · `Respuesta_historial`

| Campo | Valor |
|---|---|
| Código de estado | `200` |
| Encabezados | `Content-Type` : `application/json` |
| Cuerpo | la expresión de abajo, **pegada como una sola línea** en la pestaña `fx` |

```
{
  "recorridas": @{json(concat('[', join(select(body('Get_headers_equipo')?['value'], concat(
      '{"folio":', string(json(concat('"', coalesce(item()?['Title'], ''), '"'))),
      ',"fecha":"', coalesce(item()?['FechaRelevamiento'], ''), '"',
      ',"pozo":', string(json(concat('"', coalesce(item()?['Pozo'], ''), '"'))),
      ',"id":', string(item()?['ID']), '}'
    )), ','), ']'))},
  "itemsNoConformes": @{json(concat('[', join(select(body('Get_items_noconformes')?['value'], concat(
      '{"recorridaId":', string(coalesce(item()?['Recorrida']?['Id'], 0)),
      ',"itemId":', string(coalesce(item()?['ItemId'], 0)), '}'
    )), ','), ']'))},
  "catalogoExtra": @{json(concat('[', join(select(body('Get_catalogo_extra')?['value'], concat(
      '{"itemId":', string(coalesce(item()?['ItemId'], 0)),
      ',"zona":', string(json(concat('"', coalesce(item()?['Zona'], ''), '"'))),
      ',"criticidadRef":"', coalesce(item()?['CriticidadRef']?['Value'], 'GENERAL'), '"',
      ',"itemTexto":', string(json(concat('"', coalesce(item()?['ItemTexto'], ''), '"'))),
      ',"hallazgoTipico":', string(json(concat('"', coalesce(item()?['HallazgoTipico'], ''), '"'))), '}'
    )), ','), ']'))}
}
```

### La trampa de `?['Value']` sobre una cadena

`CriticidadRef` está declarada como **Text**, así que `item()?['CriticidadRef']` devuelve una
cadena pelada. `Criticidad`, en cambio, es **Choice** y devuelve `{"Value":"MAYOR"}`.

El conector de SharePoint puede devolver la misma columna como objeto **o** como cadena, según
cómo se haya escrito la fila. Y `?['Value']` sobre una cadena tumba el `select` **entero**:

```
The template language expression 'item()?['CriticidadRef']?['Value']' cannot be evaluated
because property 'Value' cannot be selected. Property selection is not supported on values
of type 'String'.
```

Cuando eso pasa dentro de un `select`, cae la acción completa, el flujo termina sin llegar a
ninguna `Respuesta` y el navegador ve **502 NoResponse**. Y engaña: **anda con cero filas y falla
apenas hay una**.

Forma defensiva, si alguna columna se comporta de las dos maneras:

```
if(startsWith(string(item()?['X']), '{'), json(string(item()?['X']))?['Value'], string(item()?['X']))
```

`string()` serializa el objeto a JSON, así que un `{` inicial es la única señal confiable.
Y con valor por defecto, **no usar `coalesce`**: solo salta `null`, y SharePoint devuelve `''`
en las columnas vacías. Va `if(empty(X), 'DEFECTO', X)`.

> **Un reporte probado contra un equipo sin historial no está probado.** Hay que correrlo
> también contra un equipo con recorridas cargadas: los errores de sintaxis dentro de una rama
> de `if` no se evalúan mientras el conjunto venga vacío.

### Por qué la SPA recibe `itemsNoConformes` aparte

Devolver los ítems agrupados dentro de cada recorrida obligaría a un loop anidado en el flujo.
Se manda plano con `recorridaId` y la SPA arma el agrupamiento: es una línea de JavaScript y
evita una construcción frágil en Logic Apps.

---

## Guardar, copiar URL, exportar

Secreto: `VITE_EQT03_URL`. Exportar `.zip` y commitear.

## Checklist

- [ ] Esquema del disparador vacío
- [ ] Comillas simples escapadas en los dos filtros por equipo
- [ ] `Cantidad máxima` en 5000 para los ítems (con 94 por recorrida, 500 se queda corto rápido)
- [ ] Probado contra un equipo **con** historial, no solo contra uno vacío
- [ ] La respuesta parsea como JSON válido (pegarla en un validador tras la primera corrida)
- [ ] URL guardada en `VITE_EQT03_URL`
- [ ] Paquete `.zip` commiteado
