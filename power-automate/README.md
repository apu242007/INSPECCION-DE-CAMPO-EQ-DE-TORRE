# Flujos de Power Automate

Los cinco flujos están **generados como código**, no armados a clics.

```bash
node power-automate/generar-paquetes.mjs
```

Salida: `power-automate/paquetes/EQT-0X.zip`, listos para importar.

## Por qué generados

Un flujo de 20+ acciones son horas en el diseñador, y cada expresión es una oportunidad de que
quede como texto plano en vez de expresión. Los cinco son ~90% repetición —leer, validar,
escribir, responder—, así que el patrón se escribe una vez y se instancia.

Además, el generador **valida antes de empaquetar** y sale con código ≠ 0. Chequea lo que el
importador tarda una vuelta entera en decirte, y lo que una corrida tarda en revelar:

| Regla | Qué evita |
|---|---|
| Nombres de acción únicos en todo el flujo, no por ámbito | Dos acciones homónimas importan sin error y `body('X')` resuelve a cualquiera |
| `InitializeVariable` solo en la raíz | No se puede dentro de Foreach, If ni Switch |
| `variables('x')` con su `InitializeVariable` | Falla recién al ejecutar |
| Todo camino llega a una `Respuesta` | Un camino sin ella devuelve **202 sin cuerpo**: éxito aparente con datos vacíos |
| `PatchItem`/`PostItem` con `item/Title` | `'PatchItem' is missing required property 'item/Title'`, un error por intento |
| `runAfter` apunta a una acción del mismo ámbito | Import roto |
| Paréntesis balanceados dentro de `@{...}` | El cortocircuito de `if()` lo esconde hasta que hay datos |
| `?['Value']` con guarda de tipo | Selección sobre cadena tumba el `select` entero → 502 |
| Sin `undefined` en el JSON | Bug del generador, no del flujo |
| Nombre de adjunto sin `/` en el formato de fecha | El conector lo reporta como "null or empty", que despista |

Las reglas están **probadas en rojo**: se inyectó cada defecto a propósito y se verificó que el
generador sale con código ≠ 0. Un chequeo verde que nunca se vio fallar no prueba nada.

## Importar

1. `make.powerautomate.com` → **Mis flujos** → **Importar** → **Importar paquete**
2. Elegir el `.zip`
3. En **Recursos relacionados**, elegir la conexión de SharePoint (y la de Outlook en EQT-01 y
   EQT-05). Si no existen, crearlas ahí mismo.
4. Importar → abrir el flujo → **Guardar** → copiar la URL del disparador.

> **Un paquete no puede autorizar una conexión.** La conexión es un objeto del entorno con su
> propio token OAuth; el paquete solo la referencia por nombre. Ese paso es humano, siempre.

Después de importar, cambiar el parámetro **`claveEsperada`** (viene en `CAMBIAR`) por el mismo
valor del secreto `VITE_TACKER_KEY`, o el gate de 401 rechaza todo.

## Cuidado al reimportar

Al importar con **Actualizar**, el selector lista los flujos **por nombre**. Con dos flujos
homónimos no hay forma de distinguirlos y la importación puede caer en el otro: reporta
"actualizado correctamente" y el que se ejecuta queda intacto.

Antes de actualizar, confirmar que hay uno solo con ese nombre —desde la UI, o por la API de
administración:

```
GET https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/<env>/flows?api-version=2016-11-01
```

Y **verificar después de aplicar**: bajar la definición viva y buscar una marca del cambio. No
confiar en el mensaje de éxito.

## Los `.md`

Cada `Flow-EQT-0X.md` documenta el flujo campo por campo de la UI, con las expresiones `fx`
exactas y su porqué. Sirven para revisarlo, para armarlo a mano si hace falta, y para entender
qué hace cada expresión. El `.mjs` es la fuente de verdad de lo que se importa; los `.md` son
para humanos.
