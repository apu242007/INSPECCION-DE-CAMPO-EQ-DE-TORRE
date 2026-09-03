# EQT-04 · Actualizar ítem (modo oficina)

**Nombre en Power Automate:** `WellService | EQ Torre | 04 Actualizar ítem`
**Disparador:** `Cuando se recibe una solicitud HTTP`
**Secreto del repo:** `VITE_EQT04_URL`

Actualiza responsable, plazo, acción correctiva, criticidad, estado final y observaciones de una
fila hija ya creada, y permite sumar fotos. Es el flujo del trabajo de escritorio: en campo no se
tipea nada de esto.

---

## Payload

```json
{
  "recorridaId": 77,
  "itemId": 81,
  "criticidad": "MAYOR",
  "responsable": "M. Pérez",
  "plazo": "2026-09-18",
  "accionCorrectiva": "Alinear peines y verificar torque.",
  "estadoFinal": "PENDIENTE",
  "observaciones": "",
  "fotos": [{ "name": "item-81-3.jpg", "contentBase64": "..." }]
}
```

Todos los campos salvo `recorridaId` e `itemId` son opcionales: solo se actualiza lo que viene.

---

## Árbol

```
Cuando se recibe una solicitud HTTP
├─ Check_key
├─ Get_item_a_actualizar
├─ Condicion_encontrado
│   ├─ Si no → Respuesta 404 + Terminar
│   └─ Si sí:
│       ├─ Init_varItemId
│       ├─ Update_item_EQT
│       ├─ Loop_fotos_extra    (concurrencia 1) → Add_attachment_extra
│       └─ Respuesta_ok        200
```

---

## 1 · Disparador y `Check_key`

Igual que EQT-01.

## 2 · `Get_item_a_actualizar` — SharePoint · Obtener elementos

Mismo filtro que EQT-02:

| Campo | Valor |
|---|---|
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE - ITEMS` |
| Consulta de filtro (`fx`) | `concat('Recorrida/Id eq ', string(triggerBody()?['recorridaId']), ' and ItemId eq ', string(triggerBody()?['itemId']))` |
| Cantidad máxima | `1` |

## 3 · `Condicion_encontrado`

| Lado | Valor |
|---|---|
| Izquierda (`fx`) | `length(body('Get_item_a_actualizar')?['value'])` |
| Operador | es mayor que |
| Derecha | `0` |

**Si no:** `Respuesta` 404 + `Terminar` (`Failed`). Toda rama termina en `Respuesta`.

## 4 · `Init_varItemId`

| Campo | Valor |
|---|---|
| Nombre | `varItemId` · Tipo `Entero` |
| Valor (`fx`) | `first(body('Get_item_a_actualizar')?['value'])?['ID']` |

## 5 · `Update_item_EQT` — SharePoint · Actualizar elemento

| Campo | Valor |
|---|---|
| Nombre de la lista | `INSPECCION DE CAMPO EQ TORRE - ITEMS` |
| Id (`fx`) | `variables('varItemId')` |

**Patrón para todo campo opcional: si no vino, se reenvía el valor actual.** Mandar vacío
borraría el dato que ya estaba cargado.

| Columna | Expresión `fx` |
|---|---|
| `Title` | `first(body('Get_item_a_actualizar')?['value'])?['Title']` |
| `Criticidad Value` | `if(empty(triggerBody()?['criticidad']), first(body('Get_item_a_actualizar')?['value'])?['Criticidad']?['Value'], triggerBody()?['criticidad'])` |
| `Responsable` | `if(equals(triggerBody()?['responsable'], null), first(body('Get_item_a_actualizar')?['value'])?['Responsable'], triggerBody()?['responsable'])` |
| `Plazo` | `if(empty(triggerBody()?['plazo']), first(body('Get_item_a_actualizar')?['value'])?['Plazo'], triggerBody()?['plazo'])` |
| `AccionCorrectiva` | `if(equals(triggerBody()?['accionCorrectiva'], null), first(body('Get_item_a_actualizar')?['value'])?['AccionCorrectiva'], triggerBody()?['accionCorrectiva'])` |
| `EstadoFinal Value` | `if(empty(triggerBody()?['estadoFinal']), first(body('Get_item_a_actualizar')?['value'])?['EstadoFinal']?['Value'], triggerBody()?['estadoFinal'])` |
| `Observaciones` | `if(equals(triggerBody()?['observaciones'], null), first(body('Get_item_a_actualizar')?['value'])?['Observaciones'], triggerBody()?['observaciones'])` |
| `FotosCount` | `add(coalesce(first(body('Get_item_a_actualizar')?['value'])?['FotosCount'], 0), length(coalesce(triggerBody()?['fotos'], json('[]'))))` |

> **`Actualizar elemento` exige todas las columnas obligatorias**, incluida `Title`. Si falta,
> el paquete ni siquiera importa:
> *`'PatchItem' is missing required property 'item/Title'`*.

> `if(empty(...))` y no `coalesce(...)`: SharePoint devuelve `''` (no `null`) en columnas de texto
> vacías, y `coalesce` solo salta `null`. Con `coalesce` una cadena vacía pisaría el valor bueno.

## 6 · `Loop_fotos_extra` — Aplicar a cada uno

| Campo | Valor |
|---|---|
| Seleccionar una salida (`fx`) | `triggerBody()?['fotos']` |
| Simultaneidad | **ACTIVADO, grado = 1** |

**Dentro — `Add_attachment_extra`:** igual que en EQT-02, con
`items('Loop_fotos_extra')?['name']` y
`base64ToBinary(items('Loop_fotos_extra')?['contentBase64'])`.

Verificar en **Ver código** que el `body` sea la cadena que termina en `)`.

> Si `fotos` no viene, el loop itera cero veces y no hace nada. No hace falta condicionarlo.

## 7 · `Respuesta_ok`

Código `200`, `Content-Type: application/json`, cuerpo:

```
{ "ok": true, "itemId": @{triggerBody()?['itemId']}, "spId": @{variables('varItemId')} }
```

---

## Guardar, copiar URL, exportar

Secreto: `VITE_EQT04_URL`. Exportar `.zip` y commitear.

## Checklist

- [ ] Esquema del disparador vacío
- [ ] `Title` reenviado con el valor actual en `Update_item_EQT`
- [ ] Cada campo opcional usa `if(empty(...))` con el valor actual como fallback, no `coalesce`
- [ ] Las dos ramas de `Condicion_encontrado` terminan en `Respuesta`
- [ ] `Loop_fotos_extra` con concurrencia 1
- [ ] `FotosCount` **suma** a lo que había, no lo reemplaza
- [ ] URL guardada en `VITE_EQT04_URL`
- [ ] Paquete `.zip` commiteado
