/**
 * Genera los 5 paquetes .zip importables de Power Automate.
 *
 *   node power-automate/generar-paquetes.mjs
 *
 * POR QUÉ ESTO Y NO EL DISEÑADOR
 * Un flujo de 20+ acciones son horas de clics, y cada expresión es una oportunidad de que
 * quede como texto plano en vez de expresión. Acá el patrón se escribe una vez y se instancia.
 * Los cinco flujos son ~90% repetición: leer, validar, escribir, responder.
 *
 * LO QUE UN PAQUETE NO PUEDE HACER
 * Autorizar una conexión. La conexión es un objeto del entorno con su propio token OAuth; el
 * paquete solo la referencia. Al importar, Power Automate pide elegir/crear la conexión de
 * SharePoint y la de Outlook: ese paso es humano, siempre.
 *
 * El validador corre antes de empaquetar y sale con código != 0 si encuentra algo. Chequea lo
 * que el importador tarda una vuelta entera en decirte (skill, sección 20.4).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = join(AQUI, "paquetes");

// ---------------------------------------------------------------- configuración

const SITIO = "https://tackersrl505.sharepoint.com/sites/WellService";
const LISTA_PADRE = "INSPECCION DE CAMPO EQ TORRE";
const LISTA_ITEMS = "INSPECCION DE CAMPO EQ TORRE - ITEMS";
const LISTA_CATALOGO = "INSPECCION DE CAMPO EQ TORRE - CATALOGO EXTRA";
const NOTIFY_EMAIL = "jcastro@tackertools.com";

/**
 * Se reemplaza al importar: el asistente pide elegir la conexión del entorno. Si algún día se
 * aplica por la API de administración en vez de importar, acá va el nombre real de la
 * instancia (`shared-sharepointonl-<GUID>`), que sale de un export real.
 */
const CONEXION_SP = "shared_sharepointonline";
const CONEXION_OUTLOOK = "shared_office365";

const API_SP = "/providers/Microsoft.PowerApps/apis/shared_sharepointonline";
const API_OUTLOOK = "/providers/Microsoft.PowerApps/apis/shared_office365";

// ---------------------------------------------------------------- helpers

const enc = (s) => encodeURIComponent(s).replace(/'/g, "%27%27");

/** Acción SharePoint genérica. */
function accionSP(operationId, parameters, runAfter = {}) {
  return {
    runAfter,
    type: "OpenApiConnection",
    inputs: {
      host: { connectionName: "shared_sharepointonline", operationId, apiId: API_SP },
      parameters,
      authentication: "@parameters('$authentication')",
    },
  };
}

/**
 * Adjuntar un archivo a una fila.
 *
 * Los operationId y los nombres de parámetro salen del swagger del conector
 * (`Instalar-Todo.ps1 -ListarOperaciones`), no de la intuición: la operación NO se llama
 * "AttachFile" y el nombre del archivo NO va en "fileName", va en `displayName` (query).
 * Adivinarlos cuesta una vuelta entera, y el error —"could not be found in API"— no dice
 * cuál es el bueno.
 */
function adjuntar(tabla, itemId, nombreArchivo, contenidoBase64, runAfter = {}) {
  return accionSP(
    "CreateAttachment",
    {
      dataset: SITIO,
      table: tabla,
      itemId,
      displayName: nombreArchivo,
      // El body termina EXACTAMENTE en el paréntesis. Un salto de línea al final convierte
      // el valor en plantilla de cadena y el binario se coerce a texto: queda un archivo
      // del tamaño correcto que no abre.
      body: contenidoBase64,
    },
    runAfter,
  );
}

function respuesta(statusCode, body, runAfter = {}) {
  return {
    runAfter,
    type: "Response",
    kind: "Http",
    inputs: {
      statusCode,
      headers: { "Content-Type": "application/json" },
      body,
    },
  };
}

/**
 * `Inicializar variable` SOLO se puede en la raíz: ni dentro de un Foreach, ni de una
 * Condición, ni de un Conmutador. Adentro se usa `Establecer la variable`. Esto condiciona el
 * diseño de todo el flujo: hay que juntar el set completo de variables arriba.
 */
function initVar(nombre, tipo, valor, runAfter = {}) {
  return {
    runAfter,
    type: "InitializeVariable",
    inputs: { variables: [{ name: nombre, type: tipo, value: valor }] },
  };
}

function setVar(nombre, valor, runAfter = {}) {
  return { runAfter, type: "SetVariable", inputs: { name: nombre, value: valor } };
}

function terminar(runAfter = {}) {
  return { runAfter, type: "Terminate", inputs: { runStatus: "Failed" } };
}

/**
 * Guarda anti-bot. Es un badén, no autenticación: la clave viaja en el bundle de la SPA.
 * Toda regla con consecuencia real se valida además del lado del flujo.
 */
function checkKey(siguienteRunAfter = {}) {
  return {
    Check_key: {
      runAfter: siguienteRunAfter,
      type: "If",
      expression: {
        equals: [
          "@triggerOutputs()?['headers']?['x-tacker-key']",
          "@parameters('claveEsperada')",
        ],
      },
      actions: {},
      else: {
        actions: {
          Respuesta_401: respuesta(401, { error: "unauthorized" }),
          Terminar_401: terminar({ Respuesta_401: ["Succeeded"] }),
        },
      },
    },
  };
}

const disparador = {
  manual: {
    type: "Request",
    kind: "Http",
    inputs: {
      method: "POST",
      // Esquema VACÍO a propósito: con esquema cargado, cualquier campo nuevo de la SPA se
      // rechaza en tiempo de diseño ("ya no está presente en el esquema de la operación").
      schema: {},
    },
  },
};

// ---------------------------------------------------------------- EQT-01

function eqt01() {
  const items = (loop, adicional) => ({
    [`Crear_${loop}`]: accionSP("PostItem", {
      dataset: SITIO,
      table: LISTA_ITEMS,
      "item/Title": `@concat('#', string(items('${loop}')?['itemId']))`,
      // El conector nombra la lookup como item/<InternalName>/Id, CON BARRA. No es
      // "RecorridaId" ni "Recorrida_x003a__x0020_Id": esas dos las probé y las rechaza.
      // La forma de saberlo no es deducirla, es mirar un flujo del entorno que ya escriba una
      // lookup (`Instalar-Todo.ps1 -BuscarLookups`).
      "item/Recorrida/Id": "@outputs('CreateHeaderItem')?['body/ID']",
      "item/ItemId": `@int(items('${loop}')?['itemId'])`,
      "item/Zona": `@items('${loop}')?['zona']`,
      "item/ItemTexto": `@items('${loop}')?['itemTexto']`,
      "item/CriticidadRef": `@items('${loop}')?['criticidadRef']`,
      "item/Criticidad/Value": `@coalesce(items('${loop}')?['criticidad'], 'GENERAL')`,
      "item/Estado/Value": `@coalesce(items('${loop}')?['estado'], 'SIN_REVISAR')`,
      "item/Origen/Value": `@if(empty(items('${loop}')?['origen']), null, items('${loop}')?['origen'])`,
      "item/FuenteReiteracion/Value": `@if(empty(items('${loop}')?['fuenteReiteracion']), null, items('${loop}')?['fuenteReiteracion'])`,
      "item/VecesPrevias": `@if(equals(items('${loop}')?['vecesPrevias'], null), null, int(items('${loop}')?['vecesPrevias']))`,
      "item/ReiteracionAuto": `@if(equals(items('${loop}')?['reiteracionAuto'], null), false, bool(items('${loop}')?['reiteracionAuto']))`,
      "item/ReferenciaReiteracion": `@items('${loop}')?['referenciaReiteracion']`,
      "item/FechaVerif": `@if(empty(items('${loop}')?['fechaVerif']), null, items('${loop}')?['fechaVerif'])`,
      "item/Responsable": `@items('${loop}')?['responsable']`,
      "item/Plazo": `@if(empty(items('${loop}')?['plazo']), null, items('${loop}')?['plazo'])`,
      "item/AccionCorrectiva": `@items('${loop}')?['accionCorrectiva']`,
      "item/EstadoFinal/Value": `@if(empty(items('${loop}')?['estadoFinal']), null, items('${loop}')?['estadoFinal'])`,
      "item/Escalado": `@if(equals(items('${loop}')?['escalado'], null), false, bool(items('${loop}')?['escalado']))`,
      "item/Observaciones": `@items('${loop}')?['observaciones']`,
      "item/Adicional": adicional,
      "item/FotosCount": `@if(equals(items('${loop}')?['fotosCount'], null), 0, int(items('${loop}')?['fotosCount']))`,
      "item/Equipo": "@triggerBody()?['equipo']",
    }),
  });

  return {
    nombre: "WellService | EQ Torre | 01 Crear recorrida",
    conectores: ["sp", "outlook"],
    parametros: { claveEsperada: { defaultValue: "CAMBIAR", type: "String" } },
    acciones: {
      ...checkKey(),

      Init_varFolio: {
        runAfter: { Check_key: ["Succeeded"] },
        type: "InitializeVariable",
        inputs: {
          variables: [
            {
              name: "varFolio",
              type: "string",
              value:
                "@if(empty(triggerBody()?['folio']), concat('REC-', formatDateTime(utcNow(),'yyyyMMdd-HHmmss')), triggerBody()?['folio'])",
            },
          ],
        },
      },

      CreateHeaderItem: accionSP(
        "PostItem",
        {
          dataset: SITIO,
          table: LISTA_PADRE,
          "item/Title": "@variables('varFolio')",
          "item/Equipo": "@triggerBody()?['equipo']",
          "item/Operadora/Value":
            "@if(empty(triggerBody()?['operadora']), null, triggerBody()?['operadora'])",
          "item/Contrato": "@triggerBody()?['contrato']",
          "item/FechaRelevamiento": "@coalesce(triggerBody()?['fechaRelevamiento'], utcNow())",
          "item/Pozo": "@triggerBody()?['pozo']",
          "item/AuditoriaProgramada":
            "@if(empty(triggerBody()?['auditoriaProgramada']), null, triggerBody()?['auditoriaProgramada'])",
          "item/EquipoRecorrida": "@triggerBody()?['equipoRecorrida']",
          "item/CompanyRepresentative": "@triggerBody()?['companyRepresentative']",
          "item/Notas": "@triggerBody()?['notas']",
          "item/TotalItems":
            "@if(equals(triggerBody()?['totalItems'], null), null, int(triggerBody()?['totalItems']))",
          "item/ItemsOK":
            "@if(equals(triggerBody()?['itemsOK'], null), null, int(triggerBody()?['itemsOK']))",
          "item/ItemsNoOK":
            "@if(equals(triggerBody()?['itemsNoOK'], null), null, int(triggerBody()?['itemsNoOK']))",
          "item/ItemsEnProc":
            "@if(equals(triggerBody()?['itemsEnProc'], null), null, int(triggerBody()?['itemsEnProc']))",
          "item/ItemsNA":
            "@if(equals(triggerBody()?['itemsNA'], null), null, int(triggerBody()?['itemsNA']))",
          "item/ItemsSinRevisar":
            "@if(equals(triggerBody()?['itemsSinRevisar'], null), null, int(triggerBody()?['itemsSinRevisar']))",
          "item/Reiterativos":
            "@if(equals(triggerBody()?['reiterativos'], null), null, int(triggerBody()?['reiterativos']))",
          "item/Nuevos":
            "@if(equals(triggerBody()?['nuevos'], null), null, int(triggerBody()?['nuevos']))",
          "item/Adicionales":
            "@if(equals(triggerBody()?['adicionales'], null), null, int(triggerBody()?['adicionales']))",
          "item/PctAvance":
            "@if(equals(triggerBody()?['pctAvance'], null), null, float(triggerBody()?['pctAvance']))",
          "item/Semaforo/Value": "@coalesce(triggerBody()?['semaforo'], 'ROJO')",
          "item/Cerrada": false,
          "item/AppVersion": "@triggerBody()?['appVersion']",
        },
        { Init_varFolio: ["Succeeded"] },
      ),

      /*
       * La Respuesta va ACÁ, antes de los loops. Al final, el navegador espera y a los ~110 s
       * el gateway corta con 502 aunque el flujo después termine bien: el usuario ve un error,
       * reintenta, y quedan dos filas.
       */
      Respuesta: respuesta(
        200,
        {
          recorridaId: "@outputs('CreateHeaderItem')?['body/ID']",
          folio: "@variables('varFolio')",
        },
        { CreateHeaderItem: ["Succeeded"] },
      ),

      /*
       * ORDEN DE LOS BUCLES: LAS FILAS HIJAS PRIMERO, EL PDF DESPUÉS.
       *
       * La `Respuesta` va antes de todos los bucles para devolver 200 en ~3 s y no morir en el
       * gateway de ~110 s. La contra es que ese 200 llega cuando existe la cabecera y NADA más:
       * la SPA lo toma como señal para empezar a mandar las fotos por EQT-02, y EQT-02 busca la
       * fila hija del ítem. Si todavía no está, contesta 404.
       *
       * Con `Loop_attachments` primero, esa ventana la marcaba la subida del PDF —varios MB, en
       * serie, concurrencia 1— y no la creación de las filas, que va a 20 en paralelo. Medido en
       * producción el 4/9/2026: cabecera 15:03:45, EQT-02 con 404 a las 15:03:48, la misma
       * llamada OK a las 15:04:35. Cincuenta segundos de ventana, casi todos esperando al PDF.
       *
       * Poniendo los ítems primero la ventana pasa a ser la que de verdad hace falta. El PDF no
       * lo espera nadie: no hay ninguna llamada posterior que dependa del adjunto.
       */
      Loop_items: {
        runAfter: { Respuesta: ["Succeeded"] },
        type: "Foreach",
        foreach: "@triggerBody()?['items']",
        // Filas distintas: el paralelo es seguro.
        runtimeConfiguration: { concurrency: { repetitions: 20 } },
        actions: items("Loop_items", false),
      },

      Loop_adicionales: {
        runAfter: { Loop_items: ["Succeeded"] },
        type: "Foreach",
        foreach: "@triggerBody()?['itemsAdicionales']",
        runtimeConfiguration: { concurrency: { repetitions: 20 } },
        actions: items("Loop_adicionales", true),
      },

      Loop_attachments: {
        runAfter: { Loop_adicionales: ["Succeeded"] },
        type: "Foreach",
        foreach: "@triggerBody()?['attachments']",
        // Concurrencia 1 obligatoria: todas las iteraciones escriben sobre la MISMA fila y
        // SharePoint usa concurrencia optimista por ETag -> Save Conflict intermitente.
        runtimeConfiguration: { concurrency: { repetitions: 1 } },
        actions: {
          Add_attachment: adjuntar(
            LISTA_PADRE,
            "@outputs('CreateHeaderItem')?['body/ID']",
            "@items('Loop_attachments')?['name']",
            "@base64ToBinary(items('Loop_attachments')?['contentBase64'])",
          ),
        },
      },

      Send_email_V2: {
        // Solo si TODO salió bien: si SharePoint falla, un mail de éxito es peor que nada.
        runAfter: { Loop_attachments: ["Succeeded"] },
        type: "OpenApiConnection",
        inputs: {
          host: {
            connectionName: "shared_office365",
            operationId: "SendEmailV2",
            apiId: API_OUTLOOK,
          },
          parameters: {
            "emailMessage/To": NOTIFY_EMAIL,
            "emailMessage/Subject":
              "@concat('Recorrida EQ Torre ', variables('varFolio'), ' - ', triggerBody()?['equipo'], if(equals(triggerBody()?['semaforo'],'ROJO'), ' [ROJO]', ''))",
            "emailMessage/Body": cuerpoMail(),
            "emailMessage/Importance": "Normal",
            "emailMessage/Attachments": [
              {
                // Por convención de la SPA attachments[0] es SIEMPRE el PDF.
                Name: "@triggerBody()?['attachments']?[0]?['name']",
                ContentBytes:
                  "@base64ToBinary(triggerBody()?['attachments']?[0]?['contentBase64'])",
              },
            ],
          },
          authentication: "@parameters('$authentication')",
        },
      },
    },
  };
}

function cuerpoMail() {
  return `<div style="font-family:system-ui,sans-serif;font-size:14px">
  <h2 style="margin:0 0 8px">Inspección de campo — Equipo de torre</h2>
  <p style="margin:0 0 12px;color:#3b4145">Recorrida de pre-auditoría. El PDF con las fotos va adjunto.</p>
  @{if(equals(triggerBody()?['semaforo'],'ROJO'),
    '<div style="background:#fdeaed;border-left:6px solid #c8102e;padding:12px;border-radius:6px;margin-bottom:12px"><strong style="color:#a50d24">SEMÁFORO ROJO</strong><br>Hay hallazgos críticos abiertos, o ítems críticos todavía sin revisar.</div>',
    if(equals(triggerBody()?['semaforo'],'AMARILLO'),
      '<div style="background:#fdf0e6;border-left:6px solid #d2560a;padding:12px;border-radius:6px;margin-bottom:12px"><strong style="color:#9a4508">SEMÁFORO AMARILLO</strong><br>Hay hallazgos mayores abiertos.</div>',
      '<div style="background:#e6f4ec;border-left:6px solid #14804a;padding:12px;border-radius:6px;margin-bottom:12px"><strong style="color:#0f6b3e">SEMÁFORO VERDE</strong></div>'))}
  <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
    <tr><td><strong>Folio</strong></td><td>@{variables('varFolio')}</td></tr>
    <tr><td><strong>Equipo</strong></td><td>@{triggerBody()?['equipo']}</td></tr>
    <tr><td><strong>Operadora</strong></td><td>@{triggerBody()?['operadora']}</td></tr>
    <tr><td><strong>Pozo</strong></td><td>@{triggerBody()?['pozo']}</td></tr>
    <tr><td><strong>Fecha</strong></td><td>@{convertTimeZone(coalesce(triggerBody()?['fechaRelevamiento'], utcNow()), 'UTC', 'Argentina Standard Time', 'dd/MM/yyyy HH:mm')}</td></tr>
    <tr><td><strong>Recorrieron</strong></td><td>@{triggerBody()?['equipoRecorrida']}</td></tr>
    <tr><td><strong>Avance</strong></td><td>@{triggerBody()?['pctAvance']}%</td></tr>
  </table>
  <table cellpadding="6" style="border-collapse:collapse;font-size:14px;margin-top:12px">
    <tr>
      <td style="background:#f3f5f5"><strong>OK</strong></td><td style="background:#f3f5f5"><strong>NO OK</strong></td>
      <td style="background:#f3f5f5"><strong>En proc.</strong></td><td style="background:#f3f5f5"><strong>N/A</strong></td>
      <td style="background:#f3f5f5"><strong>Sin revisar</strong></td>
    </tr>
    <tr>
      <td>@{triggerBody()?['itemsOK']}</td>
      <td style="color:#a50d24;font-weight:700">@{triggerBody()?['itemsNoOK']}</td>
      <td>@{triggerBody()?['itemsEnProc']}</td>
      <td>@{triggerBody()?['itemsNA']}</td>
      <td>@{triggerBody()?['itemsSinRevisar']}</td>
    </tr>
  </table>
  <p style="margin-top:12px">Nuevos: <strong>@{triggerBody()?['nuevos']}</strong> ·
    Reiterativos: <strong style="color:#5a3384">@{triggerBody()?['reiterativos']}</strong> ·
    Adicionales: <strong>@{triggerBody()?['adicionales']}</strong></p>
</div>`;
}

// ---------------------------------------------------------------- EQT-02

function eqt02() {
  const filtro =
    "@concat('Recorrida/Id eq ', string(triggerBody()?['recorridaId']), ' and ItemId eq ', string(triggerBody()?['itemId']))";

  return {
    nombre: "WellService | EQ Torre | 02 Adjuntar evidencias",
    conectores: ["sp"],
    parametros: { claveEsperada: { defaultValue: "CAMBIAR", type: "String" } },
    acciones: {
      ...checkKey(),

      Init_varItemId: initVar("varItemId", "integer", 0, { Check_key: ["Succeeded"] }),

      Get_items_EQT: accionSP(
        "GetItems",
        { dataset: SITIO, table: LISTA_ITEMS, $filter: filtro, $top: 1 },
        { Init_varItemId: ["Succeeded"] },
      ),

      Condicion_encontrado: {
        runAfter: { Get_items_EQT: ["Succeeded"] },
        type: "If",
        expression: { greater: ["@length(body('Get_items_EQT')?['value'])", 0] },
        actions: {
          Set_varItemId: setVar("varItemId", "@first(body('Get_items_EQT')?['value'])?['ID']"),
          Loop_fotos: {
            runAfter: { Set_varItemId: ["Succeeded"] },
            type: "Foreach",
            foreach: "@triggerBody()?['fotos']",
            // Todas las fotos van a la MISMA fila.
            runtimeConfiguration: { concurrency: { repetitions: 1 } },
            actions: {
              Add_attachment_item: adjuntar(
                LISTA_ITEMS,
                "@variables('varItemId')",
                "@items('Loop_fotos')?['name']",
                "@base64ToBinary(items('Loop_fotos')?['contentBase64'])",
              ),
            },
          },
          Condicion_notaVoz: {
            runAfter: { Loop_fotos: ["Succeeded"] },
            type: "If",
            expression: { equals: ["@empty(triggerBody()?['notaVoz'])", false] },
            actions: {
              Add_attachment_nota: adjuntar(
                LISTA_ITEMS,
                "@variables('varItemId')",
                "@triggerBody()?['notaVoz']?['name']",
                "@base64ToBinary(triggerBody()?['notaVoz']?['contentBase64'])",
              ),
            },
            else: { actions: {} },
          },
          Update_FotosCount: accionSP(
            "PatchItem",
            {
              dataset: SITIO,
              table: LISTA_ITEMS,
              id: "@variables('varItemId')",
              // PatchItem exige TODAS las obligatorias, incluida Title. Se reenvía el valor
              // actual: mandar '' la borraría.
              "item/Title": "@first(body('Get_items_EQT')?['value'])?['Title']",
              "item/FotosCount": "@length(coalesce(triggerBody()?['fotos'], json('[]')))",
            },
            { Condicion_notaVoz: ["Succeeded"] },
          ),
          Respuesta_ok: respuesta(
            200,
            {
              ok: true,
              itemId: "@triggerBody()?['itemId']",
              fotos: "@length(coalesce(triggerBody()?['fotos'], json('[]')))",
            },
            { Update_FotosCount: ["Succeeded"] },
          ),
        },
        else: {
          actions: {
            // Toda rama termina en Respuesta: un camino sin ella devuelve 202 sin cuerpo, que
            // el cliente lee como éxito con datos vacíos.
            Respuesta_404: respuesta(404, { error: "item no encontrado" }),
            Terminar_404: terminar({ Respuesta_404: ["Succeeded"] }),
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------- EQT-03

function eqt03() {
  const porEquipo = (extra = "") =>
    `@concat('Equipo eq ''', replace(triggerBody()?['equipo'], '''', ''''''), '''${extra}')`;

  return {
    nombre: "WellService | EQ Torre | 03 Historial por equipo",
    conectores: ["sp"],
    parametros: { claveEsperada: { defaultValue: "CAMBIAR", type: "String" } },
    acciones: {
      ...checkKey(),

      Get_headers_equipo: accionSP(
        "GetItems",
        {
          dataset: SITIO,
          table: LISTA_PADRE,
          $filter: porEquipo(),
          $orderby: "FechaRelevamiento desc",
          $top: 50,
        },
        { Check_key: ["Succeeded"] },
      ),

      Get_items_noconformes: accionSP(
        "GetItems",
        {
          dataset: SITIO,
          table: LISTA_ITEMS,
          $filter: porEquipo(" and (Estado eq ''NO_OK'' or Estado eq ''EN_PROC'')"),
          // Con 94 filas por recorrida, 500 se queda corto enseguida.
          $top: 5000,
        },
        { Get_headers_equipo: ["Succeeded"] },
      ),

      Get_catalogo_extra: accionSP(
        "GetItems",
        { dataset: SITIO, table: LISTA_CATALOGO, $filter: "Activo eq 1", $top: 500 },
        { Get_items_noconformes: ["Succeeded"] },
      ),

      /*
       * `select` NO es una funcion del lenguaje de expresiones: es una ACCION de operaciones
       * de datos. Usarla inline falla en ejecucion con "The template function 'select' is not
       * defined or not valid" y el flujo muere sin llegar a la Respuesta -> el cliente ve un
       * 502 NoResponse que no dice nada.
       *
       * Como accion ademas es mas limpio: maneja los tipos solo y desaparece toda la gimnasia
       * de armar JSON a mano con concat y comillas escapadas.
       */
      Select_recorridas: {
        runAfter: { Get_catalogo_extra: ["Succeeded"] },
        type: "Select",
        inputs: {
          from: "@body('Get_headers_equipo')?['value']",
          select: {
            folio: "@item()?['Title']",
            fecha: "@item()?['FechaRelevamiento']",
            pozo: "@item()?['Pozo']",
            id: "@item()?['ID']",
          },
        },
      },

      Select_noconformes: {
        runAfter: { Select_recorridas: ["Succeeded"] },
        type: "Select",
        inputs: {
          from: "@body('Get_items_noconformes')?['value']",
          select: {
            recorridaId: "@item()?['Recorrida']?['Id']",
            itemId: "@item()?['ItemId']",
          },
        },
      },

      Select_catalogo: {
        runAfter: { Select_noconformes: ["Succeeded"] },
        type: "Select",
        inputs: {
          from: "@body('Get_catalogo_extra')?['value']",
          select: {
            itemId: "@item()?['ItemId']",
            zona: "@item()?['Zona']",
            // CriticidadRef es Choice en esta lista: el conector la devuelve como objeto.
            // Igual se guarda la guarda de tipo, porque la misma columna puede volver como
            // cadena segun como se haya escrito la fila.
            criticidadRef:
              "@if(startsWith(string(item()?['CriticidadRef']), '{'), json(string(item()?['CriticidadRef']))?['Value'], string(item()?['CriticidadRef']))",
            itemTexto: "@item()?['ItemTexto']",
            hallazgoTipico: "@item()?['HallazgoTipico']",
          },
        },
      },

      Respuesta_historial: respuesta(
        200,
        {
          recorridas: "@body('Select_recorridas')",
          itemsNoConformes: "@body('Select_noconformes')",
          catalogoExtra: "@body('Select_catalogo')",
        },
        { Select_catalogo: ["Succeeded"] },
      ),
    },
  };
}

// ---------------------------------------------------------------- EQT-04

function eqt04() {
  const actual = (col) => `first(body('Get_item_a_actualizar')?['value'])?['${col}']`;

  return {
    nombre: "WellService | EQ Torre | 04 Actualizar ítem",
    conectores: ["sp"],
    parametros: { claveEsperada: { defaultValue: "CAMBIAR", type: "String" } },
    acciones: {
      ...checkKey(),

      Init_varItemId_04: initVar("varItemId", "integer", 0, { Check_key: ["Succeeded"] }),

      Get_item_a_actualizar: accionSP(
        "GetItems",
        {
          dataset: SITIO,
          table: LISTA_ITEMS,
          $filter:
            "@concat('Recorrida/Id eq ', string(triggerBody()?['recorridaId']), ' and ItemId eq ', string(triggerBody()?['itemId']))",
          $top: 1,
        },
        { Init_varItemId_04: ["Succeeded"] },
      ),

      Condicion_encontrado_04: {
        runAfter: { Get_item_a_actualizar: ["Succeeded"] },
        type: "If",
        expression: { greater: ["@length(body('Get_item_a_actualizar')?['value'])", 0] },
        actions: {
          Set_varItemId_04: setVar("varItemId", `@${actual("ID")}`),
          Update_item_EQT: accionSP(
            "PatchItem",
            {
              dataset: SITIO,
              table: LISTA_ITEMS,
              id: "@variables('varItemId')",
              "item/Title": `@${actual("Title")}`,
              // if(empty()) y no coalesce: SharePoint devuelve '' (no null) en texto vacío, y
              // coalesce solo salta null -> una cadena vacía pisaría el valor bueno.
              "item/Criticidad/Value": `@if(empty(triggerBody()?['criticidad']), ${actual("Criticidad")}?['Value'], triggerBody()?['criticidad'])`,
              "item/Responsable": `@if(equals(triggerBody()?['responsable'], null), ${actual("Responsable")}, triggerBody()?['responsable'])`,
              "item/Plazo": `@if(empty(triggerBody()?['plazo']), ${actual("Plazo")}, triggerBody()?['plazo'])`,
              "item/AccionCorrectiva": `@if(equals(triggerBody()?['accionCorrectiva'], null), ${actual("AccionCorrectiva")}, triggerBody()?['accionCorrectiva'])`,
              "item/EstadoFinal/Value": `@if(empty(triggerBody()?['estadoFinal']), ${actual("EstadoFinal")}?['Value'], triggerBody()?['estadoFinal'])`,
              "item/Observaciones": `@if(equals(triggerBody()?['observaciones'], null), ${actual("Observaciones")}, triggerBody()?['observaciones'])`,
              "item/FotosCount": `@add(coalesce(${actual("FotosCount")}, 0), length(coalesce(triggerBody()?['fotos'], json('[]'))))`,
            },
            { Set_varItemId_04: ["Succeeded"] },
          ),
          Loop_fotos_extra: {
            runAfter: { Update_item_EQT: ["Succeeded"] },
            type: "Foreach",
            foreach: "@triggerBody()?['fotos']",
            runtimeConfiguration: { concurrency: { repetitions: 1 } },
            actions: {
              Add_attachment_extra: adjuntar(
                LISTA_ITEMS,
                "@variables('varItemId')",
                "@items('Loop_fotos_extra')?['name']",
                "@base64ToBinary(items('Loop_fotos_extra')?['contentBase64'])",
              ),
            },
          },
          Respuesta_ok_04: respuesta(
            200,
            { ok: true, itemId: "@triggerBody()?['itemId']", spId: "@variables('varItemId')" },
            { Loop_fotos_extra: ["Succeeded"] },
          ),
        },
        else: {
          actions: {
            Respuesta_404_04: respuesta(404, { error: "item no encontrado" }),
            Terminar_404_04: terminar({ Respuesta_404_04: ["Succeeded"] }),
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------- EQT-05

function eqt05() {
  const cab = (c) => `body('Get_header')?['${c}']`;

  return {
    nombre: "WellService | EQ Torre | 05 Cerrar recorrida",
    conectores: ["sp", "outlook"],
    parametros: { claveEsperada: { defaultValue: "CAMBIAR", type: "String" } },
    acciones: {
      ...checkKey(),

      Get_header: accionSP(
        "GetItem",
        { dataset: SITIO, table: LISTA_PADRE, id: "@triggerBody()?['recorridaId']" },
        { Check_key: ["Succeeded"] },
      ),

      Update_header_cierre: accionSP(
        "PatchItem",
        {
          dataset: SITIO,
          table: LISTA_PADRE,
          id: "@triggerBody()?['recorridaId']",
          "item/Title": `@${cab("Title")}`,
          "item/Cerrada": true,
          // La fecha la pone el flujo, NUNCA el payload: un sello del cliente viene del reloj
          // del teléfono, y esta fecha puede terminar discutida con la operadora.
          "item/FechaCierre": "@utcNow()",
          "item/ItemsOK": `@if(equals(triggerBody()?['itemsOK'], null), ${cab("ItemsOK")}, int(triggerBody()?['itemsOK']))`,
          "item/ItemsNoOK": `@if(equals(triggerBody()?['itemsNoOK'], null), ${cab("ItemsNoOK")}, int(triggerBody()?['itemsNoOK']))`,
          "item/ItemsEnProc": `@if(equals(triggerBody()?['itemsEnProc'], null), ${cab("ItemsEnProc")}, int(triggerBody()?['itemsEnProc']))`,
          "item/ItemsNA": `@if(equals(triggerBody()?['itemsNA'], null), ${cab("ItemsNA")}, int(triggerBody()?['itemsNA']))`,
          "item/PctAvance": `@if(equals(triggerBody()?['pctAvance'], null), ${cab("PctAvance")}, float(triggerBody()?['pctAvance']))`,
          "item/Semaforo/Value": `@coalesce(triggerBody()?['semaforo'], ${cab("Semaforo")}?['Value'], 'ROJO')`,
          "item/FirmaSupervisor": "@coalesce(triggerBody()?['firmaSupervisor'], '')",
          "item/FirmaCR": "@coalesce(triggerBody()?['firmaCR'], '')",
        },
        { Get_header: ["Succeeded"] },
      ),

      Loop_firmas: {
        runAfter: { Update_header_cierre: ["Succeeded"] },
        type: "Foreach",
        foreach: "@triggerBody()?['firmas']",
        runtimeConfiguration: { concurrency: { repetitions: 1 } },
        actions: {
          Add_attachment_firma: adjuntar(
            LISTA_PADRE,
            "@triggerBody()?['recorridaId']",
            "@items('Loop_firmas')?['name']",
            "@base64ToBinary(items('Loop_firmas')?['contentBase64'])",
          ),
        },
      },

      // SharePoint no sobreescribe un adjunto con el mismo nombre: hay que borrarlo primero.
      Get_attachments: accionSP(
        "GetItemAttachments",
        { dataset: SITIO, table: LISTA_PADRE, itemId: "@triggerBody()?['recorridaId']" },
        { Loop_firmas: ["Succeeded"] },
      ),

      Loop_borrar_pdf: {
        runAfter: { Get_attachments: ["Succeeded"] },
        type: "Foreach",
        foreach: "@body('Get_attachments')?['value']",
        runtimeConfiguration: { concurrency: { repetitions: 1 } },
        actions: {
          Condicion_es_pdf: {
            type: "If",
            expression: {
              equals: [
                "@endsWith(toLower(items('Loop_borrar_pdf')?['DisplayName']), '.pdf')",
                true,
              ],
            },
            actions: {
              Delete_attachment: accionSP("DeleteAttachment", {
                dataset: SITIO,
                table: LISTA_PADRE,
                itemId: "@triggerBody()?['recorridaId']",
                attachmentId: "@items('Loop_borrar_pdf')?['Id']",
              }),
            },
            else: { actions: {} },
          },
        },
      },

      Add_attachment_pdf_final: adjuntar(
        LISTA_PADRE,
        "@triggerBody()?['recorridaId']",
        "@triggerBody()?['pdf']?['name']",
        "@base64ToBinary(triggerBody()?['pdf']?['contentBase64'])",
        // También "Skipped": si la fila no tenía PDF previo, el loop no hizo nada y sin esto
        // el flujo se corta antes de adjuntar el definitivo.
        { Loop_borrar_pdf: ["Succeeded", "Skipped"] },
      ),

      Respuesta_ok_05: respuesta(
        200,
        { ok: true, recorridaId: "@triggerBody()?['recorridaId']", cerradaEn: "@utcNow()" },
        { Add_attachment_pdf_final: ["Succeeded"] },
      ),

      Send_email_cierre: {
        runAfter: { Respuesta_ok_05: ["Succeeded"] },
        type: "OpenApiConnection",
        inputs: {
          host: {
            connectionName: "shared_office365",
            operationId: "SendEmailV2",
            apiId: API_OUTLOOK,
          },
          parameters: {
            "emailMessage/To": NOTIFY_EMAIL,
            "emailMessage/Subject": `@concat('CERRADA - Recorrida EQ Torre ', ${cab("Title")}, ' - ', ${cab("Equipo")})`,
            "emailMessage/Body": `<div style="font-family:system-ui,sans-serif;font-size:14px">
  <h2 style="margin:0 0 8px">Recorrida cerrada</h2>
  <table cellpadding="6" style="border-collapse:collapse">
    <tr><td><strong>Folio</strong></td><td>@{${cab("Title")}}</td></tr>
    <tr><td><strong>Equipo</strong></td><td>@{${cab("Equipo")}}</td></tr>
    <tr><td><strong>Pozo</strong></td><td>@{${cab("Pozo")}}</td></tr>
    <tr><td><strong>Cerrada</strong></td><td>@{convertTimeZone(utcNow(),'UTC','Argentina Standard Time','dd/MM/yyyy HH:mm')}</td></tr>
    <tr><td><strong>Semáforo</strong></td><td>@{triggerBody()?['semaforo']}</td></tr>
    <tr><td><strong>Avance</strong></td><td>@{triggerBody()?['pctAvance']}%</td></tr>
    <tr><td><strong>NO OK</strong></td><td style="color:#a50d24;font-weight:700">@{triggerBody()?['itemsNoOK']}</td></tr>
  </table>
  <p style="margin-top:12px;color:#3b4145">El PDF final firmado va adjunto.</p>
</div>`,
            "emailMessage/Importance": "Normal",
            "emailMessage/Attachments": [
              {
                Name: "@triggerBody()?['pdf']?['name']",
                ContentBytes: "@base64ToBinary(triggerBody()?['pdf']?['contentBase64'])",
              },
            ],
          },
          authentication: "@parameters('$authentication')",
        },
      },
    },
  };
}

// ---------------------------------------------------------------- validador

/**
 * Chequea en segundos lo que el importador tarda una vuelta entera en decirte, y una corrida
 * entera en revelar. Sale con código != 0 si encuentra algo.
 */
/**
 * Operaciones REALES del conector de SharePoint, leídas del swagger con
 * `Instalar-Todo.ps1 -ListarOperaciones`. Los nombres intuitivos no existen: no hay
 * "AttachFile" ni "GetAttachments", y el nombre del archivo va en `displayName`, no en
 * `fileName`. Cada nombre inventado cuesta una vuelta completa de aplicar y leer el error.
 */
const OPERACIONES_SP = {
  GetItems: ["dataset", "table", "$filter", "$orderby", "$top"],
  GetItem: ["dataset", "table", "id"],
  PostItem: ["dataset", "table"],
  PatchItem: ["dataset", "table", "id"],
  CreateAttachment: ["dataset", "table", "itemId", "displayName", "body"],
  GetItemAttachments: ["dataset", "table", "itemId"],
  DeleteAttachment: ["dataset", "table", "itemId", "attachmentId"],
};

function validar(flujo) {
  const errores = [];
  const nombres = new Map();
  const variables = new Set();
  const usosVariable = [];

  function recorrer(acciones, ambito) {
    for (const [nombre, a] of Object.entries(acciones)) {
      // Únicos en TODO el flujo, no por ámbito: dos acciones con el mismo nombre importan
      // igual y body('X') resuelve a cualquiera de las dos.
      if (nombres.has(nombre)) {
        errores.push(`nombre de acción duplicado: ${nombre} (${nombres.get(nombre)} y ${ambito})`);
      }
      nombres.set(nombre, ambito);

      if (a.type === "InitializeVariable") {
        // No se puede inicializar dentro de un Foreach/If/Switch: solo en la raíz.
        if (ambito !== "raiz") {
          errores.push(`InitializeVariable anidado en ${ambito}: ${nombre}`);
        }
        for (const v of a.inputs?.variables ?? []) variables.add(v.name);
      }

      const json = JSON.stringify(a);
      if (json.includes("undefined")) errores.push(`la acción ${nombre} contiene "undefined"`);

      for (const m of json.matchAll(/variables\('([^']+)'\)/g)) usosVariable.push([m[1], nombre]);

      // ?['Value'] / ?['Url'] sin guarda de tipo: el conector devuelve la misma columna como
      // objeto o como cadena, y la selección sobre cadena tumba la acción entera.
      for (const m of json.matchAll(/\?\[.(?:Value|Url).\]/g)) {
        const i = m.index ?? 0;
        const ctx = json.slice(Math.max(0, i - 260), i);
        if (!/startsWith\(string\(/.test(ctx) && !/item\/[A-Za-z]+\/Value/.test(json.slice(Math.max(0, i - 40), i + 20))) {
          if (!/if\(empty|coalesce|first\(body/.test(ctx)) {
            errores.push(`${nombre}: ${m[0]} sin guarda de tipo ni fallback`);
          }
        }
      }

      // Paréntesis desbalanceados dentro de @{...}: es justo lo que el cortocircuito de if()
      // esconde hasta que el conjunto trae datos.
      for (const m of json.matchAll(/@\{([^}]*)\}/g)) {
        const t = m[1];
        const abre = (t.match(/\(/g) ?? []).length;
        const cierra = (t.match(/\)/g) ?? []).length;
        if (abre !== cierra) errores.push(`${nombre}: paréntesis desbalanceados en @{...}`);
      }

      // `select`, `filter` y `join` inline: select NO existe como funcion (es una accion) y
      // usarlo mata el run sin llegar a la Respuesta -> 502 NoResponse en el cliente.
      for (const m of json.matchAll(/@?select\(/g)) {
        void m;
        errores.push(`${nombre}: usa select(...) como funcion, y select es una ACCION de datos`);
      }

      // Un nombre de adjunto armado con un formato de fecha que lleva '/' invalida el archivo
      // y el conector lo reporta como "null or empty", que despista.
      if (/Name.*formatDateTime\([^)]*\/[^)]*\)/.test(json)) {
        errores.push(`${nombre}: nombre de adjunto con '/' en el formato de fecha`);
      }

      if (a.type === "Foreach") recorrer(a.actions ?? {}, nombre);
      if (a.type === "If") {
        recorrer(a.actions ?? {}, nombre);
        recorrer(a.else?.actions ?? {}, `${nombre}/else`);
      }
    }
  }

  recorrer(flujo.acciones, "raiz");

  for (const [v, donde] of usosVariable) {
    if (!variables.has(v)) errores.push(`${donde}: usa variables('${v}') sin InitializeVariable`);
  }

  /*
   * Todo camino de ejecución tiene que llegar a una Respuesta: uno que no llega devuelve 202
   * sin cuerpo, que el cliente lee como éxito con datos vacíos.
   *
   * Una rama NO necesita su propia Respuesta si el ámbito que la contiene ya tiene una después
   * (el caso de una condición interna como Condicion_notaVoz, que no corta el flujo). Solo se
   * exige cuando ningún ancestro la provee.
   */
  function ramasSinRespuesta(acciones, ruta, ancestroResponde) {
    const esteAmbitoResponde =
      ancestroResponde ||
      Object.values(acciones).some((a) => a.type === "Response");

    for (const [nombre, a] of Object.entries(acciones)) {
      if (a.type !== "If") continue;
      for (const [rama, acc] of [
        ["si", a.actions ?? {}],
        ["no", a.else?.actions ?? {}],
      ]) {
        if (Object.keys(acc).length === 0) continue;
        const responde =
          esteAmbitoResponde || JSON.stringify(acc).includes('"type":"Response"');
        if (!responde) {
          errores.push(`${ruta}${nombre} rama "${rama}": ningún camino llega a una Respuesta`);
        }
        ramasSinRespuesta(acc, `${ruta}${nombre}/`, responde);
      }
    }
  }
  // La raíz del flujo siempre responde en algún lado; se arranca en false y se detecta solo.
  ramasSinRespuesta(flujo.acciones, "", false);

  // runAfter tiene que apuntar a una acción del MISMO ámbito.
  function runAfterValido(acciones, ambito) {
    const enAmbito = new Set(Object.keys(acciones));
    for (const [nombre, a] of Object.entries(acciones)) {
      for (const destino of Object.keys(a.runAfter ?? {})) {
        if (!enAmbito.has(destino)) {
          errores.push(`${nombre}: runAfter apunta a "${destino}", que no existe en ${ambito}`);
        }
      }
      if (a.type === "Foreach") runAfterValido(a.actions ?? {}, nombre);
      if (a.type === "If") {
        runAfterValido(a.actions ?? {}, nombre);
        runAfterValido(a.else?.actions ?? {}, `${nombre}/else`);
      }
    }
  }
  runAfterValido(flujo.acciones, "raiz");

  // Los operationId y sus parámetros, contra el contrato real del conector.
  for (const [nombre, a] of entradasProfundas(flujo.acciones)) {
    if (a.inputs?.host?.apiId !== API_SP) continue;
    const op = a.inputs.host.operationId;
    const permitidos = OPERACIONES_SP[op];
    if (!permitidos) {
      errores.push(
        `${nombre}: operationId "${op}" no existe en el conector de SharePoint (validos: ${Object.keys(OPERACIONES_SP).join(", ")})`,
      );
      continue;
    }
    for (const par of Object.keys(a.inputs.parameters ?? {})) {
      // item/... son columnas de la lista: las valida SharePoint, no el swagger.
      if (par.startsWith("item/")) continue;
      if (!permitidos.includes(par)) {
        errores.push(`${nombre}: ${op} no acepta el parametro "${par}" (acepta: ${permitidos.join(", ")})`);
      }
    }
  }

  // PatchItem y PostItem exigen todas las obligatorias de la lista, Title incluida.
  for (const [nombre, a] of entradasProfundas(flujo.acciones)) {
    const op = a.inputs?.host?.operationId;
    if (op === "PatchItem" || op === "PostItem") {
      if (!("item/Title" in (a.inputs?.parameters ?? {}))) {
        errores.push(`${nombre}: ${op} sin 'item/Title' (obligatoria de fábrica en SharePoint)`);
      }
    }
  }

  return errores;
}

function* entradasProfundas(acciones) {
  for (const [nombre, a] of Object.entries(acciones)) {
    yield [nombre, a];
    if (a.actions) yield* entradasProfundas(a.actions);
    if (a.else?.actions) yield* entradasProfundas(a.else.actions);
  }
}

// ---------------------------------------------------------------- empaquetado

function definicion(flujo, guid) {
  const conexiones = {};
  if (flujo.conectores.includes("sp")) {
    conexiones.shared_sharepointonline = {
      connectionName: CONEXION_SP,
      source: "Embedded",
      id: API_SP,
      tier: "NotSpecified",
      apiName: "sharepointonline",
      isProcessSimpleApiReferenceConversionAlreadyDone: false,
    };
  }
  if (flujo.conectores.includes("outlook")) {
    conexiones.shared_office365 = {
      connectionName: CONEXION_OUTLOOK,
      source: "Embedded",
      id: API_OUTLOOK,
      tier: "NotSpecified",
      apiName: "office365",
      isProcessSimpleApiReferenceConversionAlreadyDone: false,
    };
  }

  return {
    name: guid,
    id: `/providers/Microsoft.Flow/flows/${guid}`,
    type: "Microsoft.Flow/flows",
    properties: {
      apiId: "/providers/Microsoft.PowerApps/apis/shared_logicflows",
      displayName: flujo.nombre,
      definition: {
        $schema:
          "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        parameters: {
          $connections: { defaultValue: {}, type: "Object" },
          $authentication: { defaultValue: {}, type: "SecureObject" },
          ...flujo.parametros,
        },
        triggers: disparador,
        actions: flujo.acciones,
        outputs: {},
      },
      connectionReferences: conexiones,
      flowFailureAlertSubscribed: false,
      isManaged: false,
    },
  };
}

/** GUID estable por nombre: regenerar el paquete no cambia el id. */
function guidDe(clave) {
  let h = 0x811c9dc5;
  const hex = [];
  for (let i = 0; i < 32; i += 1) {
    for (const c of `${clave}:${i}`) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex.push((h % 16).toString(16));
  }
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

function escribirPaquete(clave, flujo) {
  const guid = guidDe(clave);
  const raiz = join(SALIDA, clave);
  const base = join(raiz, "Microsoft.Flow", "flows", guid);
  mkdirSync(base, { recursive: true });

  const j = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2), "utf8");

  j(join(base, "definition.json"), definicion(flujo, guid));

  const apis = {};
  const conns = {};
  if (flujo.conectores.includes("sp")) {
    apis[API_SP] = API_SP;
    conns[CONEXION_SP] = CONEXION_SP;
  }
  if (flujo.conectores.includes("outlook")) {
    apis[API_OUTLOOK] = API_OUTLOOK;
    conns[CONEXION_OUTLOOK] = CONEXION_OUTLOOK;
  }
  j(join(base, "apisMap.json"), apis);
  j(join(base, "connectionsMap.json"), conns);

  // OJO: el índice de assets va DENTRO de Microsoft.Flow/flows/, no en la raíz.
  j(join(raiz, "Microsoft.Flow", "flows", "manifest.json"), {
    [guid]: { format: "json", path: `${guid}/definition.json` },
  });

  j(join(raiz, "manifest.json"), {
    schema: "1.0",
    details: {
      displayName: flujo.nombre,
      description: `Generado por power-automate/generar-paquetes.mjs`,
      createdTime: new Date().toISOString(),
      packageTelemetryId: guid,
    },
    resources: {
      [guid]: {
        id: guid,
        name: flujo.nombre,
        type: "Microsoft.Flow/flows",
        suggestedCreationType: "New",
        creationType: "New, Existing, Update",
        details: { displayName: flujo.nombre },
        configurableBy: "User",
        hierarchy: "Root",
        dependsOn: [],
      },
    },
  });

  return { guid, raiz };
}

function zipear(carpeta, destino) {
  // Con .NET y no con Compress-Archive: los corchetes de nombres tipo [Content_Types].xml se
  // interpretan como comodines y el archivo queda afuera.
  const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = '${carpeta.replace(/'/g, "''")}'
$zip = '${destino.replace(/'/g, "''")}'
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
$a = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
foreach ($f in (Get-ChildItem -LiteralPath $src -Recurse -File)) {
    $rel = $f.FullName.Substring($src.Length + 1).Replace([char]92, [char]47)
    $e = $a.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $o = $e.Open(); $b = [System.IO.File]::ReadAllBytes($f.FullName)
    $o.Write($b, 0, $b.Length); $o.Dispose()
}
$a.Dispose()
`;
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    stdio: "pipe",
  });
}

// ---------------------------------------------------------------- main

const FLUJOS = {
  "EQT-01": eqt01(),
  "EQT-02": eqt02(),
  "EQT-03": eqt03(),
  "EQT-04": eqt04(),
  "EQT-05": eqt05(),
};

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

let fallo = false;
for (const [clave, flujo] of Object.entries(FLUJOS)) {
  const errores = validar(flujo);
  if (errores.length > 0) {
    fallo = true;
    console.error(`\n${clave} — ${errores.length} problema(s):`);
    for (const e of errores) console.error(`  x ${e}`);
    continue;
  }
  const { guid, raiz } = escribirPaquete(clave, flujo);
  const zip = join(SALIDA, `${clave}.zip`);
  zipear(raiz, zip);
  const n = [...entradasProfundas(flujo.acciones)].length;
  console.log(`${clave}  ${String(n).padStart(2)} acciones  ${guid}  -> ${clave}.zip`);
}

if (fallo) {
  console.error("\nNo se empaquetó todo: corregí lo de arriba y volvé a correr.");
  process.exit(1);
}
console.log(`\nPaquetes en power-automate/paquetes/. Importar desde make.powerautomate.com:
  Mis flujos -> Importar -> Importar paquete -> elegir el .zip
  En "Recursos relacionados" hay que elegir la conexión de SharePoint (y la de Outlook en
  EQT-01 y EQT-05). Ese paso es humano: un paquete referencia una conexión, no la autoriza.`);
