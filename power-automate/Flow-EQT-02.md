# EQT-02 · Adjuntar evidencias de un ítem

**Nombre en Power Automate:** `WellService | EQ Torre | 02 Adjuntar evidencias`
**Disparador:** `Cuando se recibe una solicitud HTTP`
**Secreto del repo:** `VITE_EQT02_URL`

Sube las fotos (y la nota de voz, si hay) de **un solo ítem** a la fila hija correspondiente.

> **Una llamada por ítem.** No es una decisión estética: es lo que mantiene cada POST muy por
> debajo del límite de payload y del gateway de ~110 s. Una recorrida con 30 hallazgos son 30
> llamadas cortas encoladas por la SPA, no un POST de 25 MB que muere a la mitad.

---

## Payload que manda la SPA

```json
{
  "recorridaId": 77,
  "itemId": 81,
  "fotos": [
    { "name": "item-81-1.jpg", "contentBase64": "/9j/4AAQSkZJRg..." },
    { "name": "item-81-2.jpg", "contentBase64": "/9j/4AAQSkZJRg..." }
  ],
  "notaVoz": { "name": "item-81-nota.webm", "contentBase64": "..." }
}
```

`recorridaId` es el **ID de SharePoint** del padre, el que devolvió EQT-01.

---

## Árbol

```
Cuando se recibe una solicitud HTTP
├─ Check_key                    ← 401 + Terminar
├─ Get_items_EQT                (Obtener elementos, filtrado)
├─ Condicion_encontrado
│   ├─ Si no  → Respuesta 404 + Terminar
│   └─ Si sí:
│       ├─ Init_varFotos
│       ├─ Loop_fotos           (concurrencia 1) → Add_attachment_item
│       ├─ Condicion_notaVoz    → Add_attachment_nota
│       ├─ Update_FotosCount
│       └─ Respuesta_ok         200
```

---

## 1 · Disparador

Igual que EQT-01: **Cualquier usuario**, método `POST`, **esquema vacío**.

## 2 · `Check_key`

Idéntico a EQT-01 (Condición sobre `triggerOutputs()?['headers']?['x-tacker-key']`, rama «Si no»
con `Respuesta` 401 + `Terminar` en `Failed`).

## 3 · `Get_items_EQT` — SharePoint · Obtener elementos

| Campo | Valor |
|---|---|
| Dirección del sitio | `<SITE_URL>` |
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE - ITEMS` |
| **Consulta de filtro** (`fx`) | ver abajo |
| Cantidad máxima de elementos | `1` |

```
concat('Recorrida/Id eq ', string(triggerBody()?['recorridaId']), ' and ItemId eq ', string(triggerBody()?['itemId']))
```

> `Recorrida/Id` funciona en `$filter` porque la lookup está indexada por Id. Si el filtro
> devuelve vacío, casi siempre es que `recorridaId` trae el **id local de la SPA** (un uuid) en
> vez del ID de SharePoint: revisar que EQT-01 haya devuelto `recorridaId` numérico.

## 4 · `Condicion_encontrado` — Condición

| Lado | Valor |
|---|---|
| Izquierda (`fx`) | `length(body('Get_items_EQT')?['value'])` |
| Operador | es mayor que |
| Derecha | `0` |

**Si no:** `Respuesta` 404 con `{"error":"item no encontrado"}` → `Terminar` (`Failed`).

> **Ese 404 casi nunca significa «no existe»: significa «todavía no».** EQT-01 devuelve 200
> apenas crea la cabecera, así que la primera llamada de un ítem puede llegar antes que su
> fila. Por eso EQT-01 crea los ítems ANTES de subir el PDF (ver Flow-EQT-01.md) y la SPA
> trata este 404 como transitorio: lo reintenta con espera larga en vez de darlo por perdido
> (`backoffFilaPendienteMs` en `services/sync.ts`). Si el 404 persiste después de ~65 s, ahí
> sí es un problema real: revisá que `recorridaId` sea el ID numérico de SharePoint.

> Toda rama tiene que terminar en una acción `Respuesta`. Un camino sin ella devuelve **202
> Accepted sin cuerpo**, que el cliente lee como éxito con datos vacíos. Es el modo de falla más
> caro de diagnosticar porque no parece una falla.

**Si sí:** todo lo que sigue.

## 5 · `Init_varFotos` — Inicializar variable

| Campo | Valor |
|---|---|
| Nombre | `varItemId` |
| Tipo | `Entero` |
| Valor (`fx`) | `first(body('Get_items_EQT')?['value'])?['ID']` |

## 6 · `Loop_fotos` — Aplicar a cada uno

| Campo | Valor |
|---|---|
| Seleccionar una salida (`fx`) | `triggerBody()?['fotos']` |
| Configuración ⚙️ → Simultaneidad | **ACTIVADO, grado = 1** |

Todas las fotos van a la **misma fila**: en paralelo aparece `Save Conflict`.

**Dentro — `Add_attachment_item`:**

| Campo | Valor |
|---|---|
| Dirección del sitio | `<SITE_URL>` |
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE - ITEMS` |
| Id (`fx`) | `variables('varItemId')` |
| Nombre de archivo (`fx`) | `items('Loop_fotos')?['name']` |
| Contenido del archivo (`fx`) | `base64ToBinary(items('Loop_fotos')?['contentBase64'])` |

**Verificar en Ver código** que quede exactamente:

```json
"body": "@base64ToBinary(items('Loop_fotos')?['contentBase64'])"
```

Sin `\r\n` al final, sin espacio, y **sin** el objeto `{contentBytes, name}` que a veces mete el
selector de archivos. Ver la tabla de diagnóstico en `Flow-EQT-01.md` §6.

## 7 · `Condicion_notaVoz` — Condición

| Lado | Valor |
|---|---|
| Izquierda (`fx`) | `empty(triggerBody()?['notaVoz'])` |
| Operador | es igual a |
| Derecha (`fx`) | `false` |

**Si sí — `Add_attachment_nota`:** mismos campos que arriba, con

- Nombre de archivo: `triggerBody()?['notaVoz']?['name']`
- Contenido: `base64ToBinary(triggerBody()?['notaVoz']?['contentBase64'])`

## 8 · `Update_FotosCount` — SharePoint · Actualizar elemento

| Campo | Valor |
|---|---|
| Dirección del sitio | `<SITE_URL>` |
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE - ITEMS` |
| Id (`fx`) | `variables('varItemId')` |
| `Title` (`fx`) | `first(body('Get_items_EQT')?['value'])?['Title']` |
| `FotosCount` (`fx`) | `length(coalesce(triggerBody()?['fotos'], json('[]')))` |

> **`Actualizar elemento` exige TODAS las columnas obligatorias**, incluida `Title`, aunque no se
> quiera cambiar. Si falta, la importación falla con
> *`OpenApiOperationParameterValidationFailed: 'PatchItem' is missing required property 'item/Title'`*.
> Se reenvía el valor actual de la fila: mandar `''` la borraría.
>
> El importador reporta **un error por intento**. Si la lista tiene cuatro obligatorias son
> cuatro vueltas: conviene mandarlas todas juntas de una.

## 9 · `Respuesta_ok`

| Campo | Valor |
|---|---|
| Código de estado | `200` |
| Encabezados | `Content-Type` : `application/json` |
| Cuerpo | `{ "ok": true, "itemId": @{triggerBody()?['itemId']}, "fotos": @{length(coalesce(triggerBody()?['fotos'], json('[]')))} }` |

---

## Guardar, copiar URL, exportar

Secreto del repo: `VITE_EQT02_URL`. Exportar el paquete `.zip` y commitearlo.

---

## Checklist

- [ ] Esquema del disparador vacío
- [ ] Filtro con `Recorrida/Id eq X and ItemId eq Y` armado con `concat` + `string()`
- [ ] **Las dos ramas** de `Condicion_encontrado` terminan en una acción `Respuesta`
- [ ] `Loop_fotos` con concurrencia **1**
- [ ] `body` del adjunto verificado en Ver código: termina en `)`, sin `\r\n`
- [ ] `Update_FotosCount` reenvía `Title` con el valor actual
- [ ] URL guardada en `VITE_EQT02_URL`
- [ ] Paquete `.zip` commiteado
