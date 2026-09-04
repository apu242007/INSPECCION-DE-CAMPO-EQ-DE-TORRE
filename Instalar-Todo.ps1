<#
.SYNOPSIS
    Instala TODO el backend de la app en un solo comando: listas y columnas de SharePoint,
    la columna lookup, los 5 flujos de Power Automate, y los secrets del repo de GitHub.

.DESCRIPTION
    Correr desde la raíz del repo:

        .\Instalar-Todo.ps1

    Modos utiles:
        .\Instalar-Todo.ps1 -SoloVerificar     no toca nada, solo reporta que falta
        .\Instalar-Todo.ps1 -SaltearFlujos     solo SharePoint
        .\Instalar-Todo.ps1 -SaltearSharePoint solo los flujos

    Es IDEMPOTENTE: lo que ya existe se saltea. Se puede correr las veces que haga falta.

.NOTES
    POR QUE ESTE SCRIPT EXISTE Y NO LO CORRIO EL ASISTENTE
    Todo esto necesita un token OAuth vivo del tenant de Tacker. El asistente puede escribir
    cada llamada, cada expresion y cada validacion —y lo hizo—, pero usar tu credencial para
    actuar sobre tu tenant es una decision tuya. Por eso el trabajo esta hecho y la ejecucion
    queda de este lado.

    LO QUE NI ESTE SCRIPT PUEDE HACER
    Autorizar una conexion de Power Automate. La conexion es un objeto del entorno con su
    propio token OAuth: se crea una vez desde la UI (Power Automate -> Conexiones -> Nueva).
    El script detecta si faltan y te dice exactamente cual, pero no puede consentirlas por vos.

    ENCODING: este archivo va en UTF-8 CON BOM. PowerShell 5.1 lo lee como ANSI sin BOM y los
    acentos rompen el parser.
#>

[CmdletBinding()]
param(
    [string]$Hostname = "tackersrl505.sharepoint.com",
    [string]$SitePath = "/sites/WellService",
    [string]$Repo     = "apu242007/INSPECCION-DE-CAMPO-EQ-DE-TORRE",
    [switch]$SoloVerificar,
    [switch]$Diagnostico,
    [switch]$ListarOperaciones,
    [switch]$ListarCampos,
    [switch]$BuscarLookups,
    [switch]$Probar,
    [switch]$ProbarCompleto,
    [switch]$Limpiar,
    [string]$EquipoPrueba = "TEST-INSTALACION",
    [switch]$VerDefinicion,
    [string]$VerHistorial = "",
    [switch]$SaltearSharePoint,
    [switch]$SaltearFlujos,
    [switch]$SaltearSecrets
)

$ErrorActionPreference = "Stop"
$RaizRepo = $PSScriptRoot
$Resource = "https://$Hostname"
$ApiSP    = "$Resource$SitePath/_api"
$ClientId = "9bc3ab49-b65d-410a-85ad-de819febfddc"  # SharePoint Online Management Shell, pre-consentido
$Cache    = Join-Path $env:LOCALAPPDATA "tacker-sp-eqtorre.rt"

function Titulo($t) {
    Write-Host ""
    Write-Host ("=" * 74) -ForegroundColor Cyan
    Write-Host " $t" -ForegroundColor Cyan
    Write-Host ("=" * 74) -ForegroundColor Cyan
}
function Ok($m)    { Write-Host "  [ok]    $m" -ForegroundColor Green }
function Skip($m)  { Write-Host "  [=]     $m" -ForegroundColor DarkGray }
function Warn($m)  { Write-Host "  [!]     $m" -ForegroundColor Yellow }
function Falla($m) { Write-Host "  [x]     $m" -ForegroundColor Red }

# ============================================================ 1 - AUTENTICACION

function Save-RefreshToken([string]$Token) {
    Add-Type -AssemblyName System.Security
    $b = [Text.Encoding]::UTF8.GetBytes($Token)
    $p = [Security.Cryptography.ProtectedData]::Protect($b, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes($Cache, $p)
}

function Read-RefreshToken {
    if (-not (Test-Path $Cache)) { return $null }
    try {
        Add-Type -AssemblyName System.Security
        $p = [IO.File]::ReadAllBytes($Cache)
        $b = [Security.Cryptography.ProtectedData]::Unprotect($p, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        return [Text.Encoding]::UTF8.GetString($b)
    } catch { return $null }
}

function Canjear([string]$Refresh, [string]$Recurso) {
    Invoke-RestMethod -Method POST -UseBasicParsing `
        -Uri "https://login.microsoftonline.com/common/oauth2/token" `
        -Body "grant_type=refresh_token&client_id=$ClientId&refresh_token=$Refresh&resource=$Recurso"
}

function Autenticar {
    $rt = Read-RefreshToken
    if ($rt) {
        try {
            $r = Canjear $rt $Resource
            Save-RefreshToken $r.refresh_token
            Ok "Sesion renovada en silencio (token cacheado)"
            return $r
        } catch {
            Warn "El refresh token cacheado ya no sirve. Va device code."
        }
    }

    # Device code: requiere un humano. Es el punto del control, no se puede automatizar.
    $dc = Invoke-RestMethod -Method POST -UseBasicParsing `
        -Uri "https://login.microsoftonline.com/common/oauth2/devicecode" `
        -Body "client_id=$ClientId&resource=$Resource"

    Write-Host ""
    Write-Host "  ABRI:   https://microsoft.com/devicelogin" -ForegroundColor Cyan
    Write-Host "  CODIGO: $($dc.user_code)" -ForegroundColor Yellow
    Write-Host "  (inicia sesion con una cuenta del tenant $Hostname)" -ForegroundColor DarkGray
    Write-Host ""

    $limite = (Get-Date).AddMinutes(15)
    while ((Get-Date) -lt $limite) {
        Start-Sleep -Seconds 5
        try {
            $r = Invoke-RestMethod -Method POST -UseBasicParsing `
                -Uri "https://login.microsoftonline.com/common/oauth2/token" `
                -Body "grant_type=urn:ietf:params:oauth:grant-type:device_code&client_id=$ClientId&code=$($dc.device_code)"
            Save-RefreshToken $r.refresh_token
            Ok "Autenticado"
            return $r
        } catch {
            if ($_.ErrorDetails.Message -notmatch "authorization_pending") { throw }
        }
    }
    throw "Se agoto el tiempo esperando el device code."
}

Titulo "1 - Autenticacion"
$sesion = Autenticar
$script:TokenSP = $sesion.access_token
$script:Refresh = $sesion.refresh_token

$partes = $script:TokenSP.Split(".")[1].Replace("-", "+").Replace("_", "/")
while ($partes.Length % 4) { $partes += "=" }
$claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($partes)) | ConvertFrom-Json
Ok "Usuario: $($claims.upn)"
Ok "Tenant : $($claims.tid)"

function Invoke-SP {
    param([string]$Method = "GET", [Parameter(Mandatory)][string]$Uri, $Body, [hashtable]$Extra)
    for ($i = 1; $i -le 3; $i++) {
        $h = @{ Authorization = "Bearer $($script:TokenSP)"; Accept = "application/json;odata=nometadata" }
        if ($Extra) { foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] } }
        try {
            $req = @{ Method = $Method; Uri = $Uri; Headers = $h; UseBasicParsing = $true }
            # SIEMPRE bytes UTF-8: Invoke-RestMethod con -Body string manda ISO-8859-1 y
            # cualquier acento hace que SharePoint responda 400.
            if ($null -ne $Body) { $req["Body"] = [Text.Encoding]::UTF8.GetBytes($Body) }

            <#
              Invoke-WebRequest + ConvertFrom-Json -AsHashtable, y NO Invoke-RestMethod.
              Una lista de SharePoint devuelve 'Id' e 'ID' a la vez. ConvertFrom-Json de PS7
              es case-insensitive y aborta con "keys with different casing"... pero
              Invoke-RestMethod SE COME ese error y devuelve el JSON como String. El sintoma
              es devastador: $r.value queda en $null y la lista parece vacia, sin ningun
              error a la vista. Me costo tres vueltas de diagnostico.
            #>
            $resp = Invoke-WebRequest @req
            if (-not $resp.Content) { return $null }
            try { return $resp.Content | ConvertFrom-Json -AsHashtable } catch { return $resp.Content }
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            # SPO tiene una carrera de validacion justo despues de refrescar el token.
            if ($code -eq 401 -and $i -lt 3) {
                Start-Sleep -Milliseconds 800
                $r = Canjear $script:Refresh $Resource
                $script:TokenSP = $r.access_token; $script:Refresh = $r.refresh_token
                Save-RefreshToken $script:Refresh
                continue
            }
            if (($code -eq 429 -or $code -eq 503) -and $i -lt 3) { Start-Sleep -Seconds 3; continue }
            throw
        }
    }
}

# ============================================================ 2 - SHAREPOINT

$LISTA_PADRE    = "INSPECCION DE CAMPO EQ TORRE"
$LISTA_ITEMS    = "INSPECCION DE CAMPO EQ TORRE - ITEMS"
$LISTA_CATALOGO = "INSPECCION DE CAMPO EQ TORRE - CATALOGO EXTRA"

function Get-Lista([string]$Titulo) {
    $r = Invoke-SP -Uri "$ApiSP/web/lists?`$select=Title,Id&`$filter=Hidden eq false"
    $items = if ($r.value) { $r.value } else { $r }
    return $items | Where-Object { $_.Title -eq $Titulo } | Select-Object -First 1
}

function New-Lista([string]$Titulo, [string]$Desc) {
    # El bloqueo de creacion por REST es POR TENANT, no universal: se prueba siempre.
    $body = @{ '__metadata' = @{ type = 'SP.List' }; Title = $Titulo; Description = $Desc; BaseTemplate = 100 } | ConvertTo-Json -Depth 8
    try {
        Invoke-SP -Method POST -Uri "$ApiSP/web/lists" -Body $body -Extra @{
            'Content-Type' = 'application/json;odata=verbose;charset=utf-8'
            'Accept'       = 'application/json;odata=verbose'
        } | Out-Null
        Ok "Lista creada: $Titulo"
        return $true
    } catch {
        Falla "No se pudo crear '$Titulo' por REST ($($_.Exception.Response.StatusCode.value__))"
        Warn "  Creala por UI: $Resource$SitePath/_layouts/15/viewlsts.aspx -> Nuevo -> Lista -> En blanco"
        Warn "  Nombre exacto: $Titulo"
        return $false
    }
}

function Add-Columna {
    param(
        [Parameter(Mandatory)][string]$Lista,
        [Parameter(Mandatory)][string]$Interno,
        [Parameter(Mandatory)][string]$Display,
        [Parameter(Mandatory)][string]$Tipo,
        [string[]]$Opciones,
        [switch]$Indexada
    )
    $enc  = [Uri]::EscapeDataString($Lista)
    $base = "$ApiSP/web/lists/getbytitle('$enc')"
    try { Invoke-SP -Uri "$base/fields/getbyinternalnameortitle('$Interno')" | Out-Null; return "existe" } catch { }
    if ($SoloVerificar) { return "falta" }

    $idx = if ($Indexada) { " Indexed='TRUE'" } else { "" }
    $xml = switch ($Tipo) {
        "Choice" {
            $ops = ($Opciones | ForEach-Object { "<CHOICE>$([Security.SecurityElement]::Escape($_))</CHOICE>" }) -join ""
            "<Field Type='Choice' Format='Dropdown' FillInChoice='FALSE' DisplayName='$Interno'$idx><CHOICES>$ops</CHOICES></Field>"
        }
        "Note"     { "<Field Type='Note' NumLines='6' RichText='FALSE' DisplayName='$Interno'$idx />" }
        "Number"   { "<Field Type='Number' DisplayName='$Interno'$idx />" }
        "DateTime" { "<Field Type='DateTime' Format='DateTime' DisplayName='$Interno'$idx />" }
        "Date"     { "<Field Type='DateTime' Format='DateOnly' DisplayName='$Interno'$idx />" }
        "Boolean"  { "<Field Type='Boolean' DisplayName='$Interno'$idx><Default>0</Default></Field>" }
        default    { "<Field Type='Text' MaxLength='255' DisplayName='$Interno'$idx />" }
    }
    # El endpoint REST es createfieldasxml. addfieldasxml es el nombre CSOM/PnP y por REST
    # devuelve ResourceNotFoundException, que parece un problema de permisos y no lo es.
    $body = @{ parameters = @{
        '__metadata' = @{ type = 'SP.XmlSchemaFieldCreationInformation' }
        SchemaXml    = $xml
        Options      = 28   # 4 AddToDefaultContentType + 8 InternalNameHint + 16 AddToDefaultView
    } } | ConvertTo-Json -Depth 8

    try {
        Invoke-SP -Method POST -Uri "$base/fields/createfieldasxml" -Body $body -Extra @{
            'Content-Type' = 'application/json;odata=verbose;charset=utf-8'
            'Accept'       = 'application/json;odata=verbose'
        } | Out-Null
        if ($Display -ne $Interno) {
            $patch = @{ '__metadata' = @{ type = 'SP.Field' }; Title = $Display } | ConvertTo-Json
            Invoke-SP -Method POST -Uri "$base/fields/getbyinternalnameortitle('$Interno')" -Body $patch -Extra @{
                'Content-Type'  = 'application/json;odata=verbose;charset=utf-8'
                'Accept'        = 'application/json;odata=verbose'
                'X-HTTP-Method' = 'MERGE'; 'IF-MATCH' = '*'
            } | Out-Null
        }
        return "creada"
    } catch { return "error: $($_.Exception.Message)" }
}

$COLS = @{
    $LISTA_PADRE = @(
        @{ n="Equipo"; d="Equipo"; t="Text"; ix=$true }
        @{ n="Operadora"; d="Operadora"; t="Choice"; c=@("YPF","TotalEnergies","Vista","PAE","Otra") }
        @{ n="Contrato"; d="Contrato"; t="Text" }
        @{ n="FechaRelevamiento"; d="Fecha de relevamiento"; t="DateTime"; ix=$true }
        @{ n="Pozo"; d="Pozo / locación"; t="Text" }
        @{ n="AuditoriaProgramada"; d="Auditoría programada"; t="Date" }
        @{ n="EquipoRecorrida"; d="Equipo de recorrida"; t="Text" }
        @{ n="CompanyRepresentative"; d="Company Representative"; t="Text" }
        @{ n="Notas"; d="Notas / limitaciones"; t="Note" }
        @{ n="TotalItems"; d="Total ítems"; t="Number" }
        @{ n="ItemsOK"; d="Ítems OK"; t="Number" }
        @{ n="ItemsNoOK"; d="Ítems NO OK"; t="Number" }
        @{ n="ItemsEnProc"; d="Ítems en proceso"; t="Number" }
        @{ n="ItemsNA"; d="Ítems N/A"; t="Number" }
        @{ n="ItemsSinRevisar"; d="Ítems sin revisar"; t="Number" }
        @{ n="Reiterativos"; d="Reiterativos"; t="Number" }
        @{ n="Nuevos"; d="Nuevos"; t="Number" }
        @{ n="Adicionales"; d="Adicionales"; t="Number" }
        @{ n="PctAvance"; d="% avance"; t="Number" }
        @{ n="Semaforo"; d="Semáforo"; t="Choice"; c=@("ROJO","AMARILLO","VERDE") }
        @{ n="Cerrada"; d="Cerrada"; t="Boolean" }
        @{ n="FechaCierre"; d="Fecha de cierre"; t="DateTime" }
        @{ n="FirmaSupervisor"; d="Firma supervisor"; t="Text" }
        @{ n="FirmaCR"; d="Firma CR"; t="Text" }
        @{ n="AppVersion"; d="Versión de la app"; t="Text" }
    )
    $LISTA_ITEMS = @(
        @{ n="ItemId"; d="Ítem Id"; t="Number"; ix=$true }
        @{ n="Zona"; d="Zona"; t="Text" }
        @{ n="ItemTexto"; d="Ítem a verificar"; t="Note" }
        @{ n="CriticidadRef"; d="Criticidad de referencia"; t="Text" }
        @{ n="Criticidad"; d="Criticidad"; t="Choice"; c=@("CRITICA","MAYOR","MENOR","GENERAL") }
        @{ n="Estado"; d="Estado"; t="Choice"; c=@("SIN_REVISAR","OK","NO_OK","EN_PROC","NA") }
        @{ n="Origen"; d="Origen"; t="Choice"; c=@("NUEVO","REITERATIVO") }
        @{ n="FuenteReiteracion"; d="Fuente de reiteración"; t="Choice"; c=@("RECORRIDA_INTERNA","AUDITORIA_EXTERNA","AMBAS") }
        @{ n="VecesPrevias"; d="Veces previas"; t="Number" }
        @{ n="ReiteracionAuto"; d="Reiteración automática"; t="Boolean" }
        @{ n="ReferenciaReiteracion"; d="Referencia de reiteración"; t="Note" }
        @{ n="FechaVerif"; d="Fecha de verificación"; t="DateTime" }
        @{ n="Responsable"; d="Responsable"; t="Text" }
        @{ n="Plazo"; d="Plazo"; t="Date" }
        @{ n="AccionCorrectiva"; d="Acción correctiva"; t="Note" }
        @{ n="EstadoFinal"; d="Estado final"; t="Choice"; c=@("PENDIENTE","CERRADO") }
        @{ n="Escalado"; d="Escalado a crítico"; t="Boolean" }
        @{ n="Observaciones"; d="Observaciones"; t="Note" }
        @{ n="Adicional"; d="Adicional"; t="Boolean" }
        @{ n="FotosCount"; d="Cantidad de fotos"; t="Number" }
        # Copia del equipo del padre: permite filtrar el historial sin join con el lookup.
        @{ n="Equipo"; d="Equipo"; t="Text"; ix=$true }
    )
    $LISTA_CATALOGO = @(
        @{ n="ItemId"; d="Ítem Id"; t="Number"; ix=$true }
        @{ n="Zona"; d="Zona"; t="Text" }
        @{ n="CriticidadRef"; d="Criticidad ref."; t="Choice"; c=@("CRITICA","MAYOR","MENOR","GENERAL") }
        @{ n="ItemTexto"; d="Ítem a verificar"; t="Note" }
        @{ n="HallazgoTipico"; d="Hallazgo típico"; t="Note" }
        @{ n="PromovidoDesde"; d="Promovido desde"; t="Text" }
        @{ n="Activo"; d="Activo"; t="Boolean" }
    )
}

if (-not $SaltearSharePoint) {
    Titulo "2 - SharePoint: listas y columnas"

    foreach ($nombre in @($LISTA_PADRE, $LISTA_ITEMS, $LISTA_CATALOGO)) {
        Write-Host ""
        Write-Host "  $nombre" -ForegroundColor White
        $lista = Get-Lista $nombre
        if (-not $lista) {
            if ($nombre -eq $LISTA_PADRE) { Falla "No existe la lista padre. Revisala en el sitio."; continue }
            if ($SoloVerificar) { Warn "FALTA la lista"; continue }
            if (-not (New-Lista $nombre "Recorridas de pre-auditoria de equipos de torre")) { continue }
        }
        $creadas = 0; $existentes = 0; $errores = 0
        foreach ($c in $COLS[$nombre]) {
            $r = Add-Columna -Lista $nombre -Interno $c.n -Display $c.d -Tipo $c.t -Opciones $c.c -Indexada:([bool]$c.ix)
            switch -Wildcard ($r) {
                "existe"  { $existentes++ }
                "creada"  { $creadas++ }
                "falta"   { Warn "falta: $($c.n) ($($c.t))" }
                "error*"  { $errores++; Falla "$($c.n) -> $r" }
            }
        }
        Ok "$existentes ya estaban, $creadas creadas, $errores con error"
    }

    # --- lookup -------------------------------------------------------------
    Write-Host ""
    Write-Host "  Columna lookup 'Recorrida' en la lista de items" -ForegroundColor White
    $padre = Get-Lista $LISTA_PADRE
    $hija  = Get-Lista $LISTA_ITEMS
    if ($padre -and $hija) {
        $encHija = [Uri]::EscapeDataString($LISTA_ITEMS)
        $baseHija = "$ApiSP/web/lists/getbytitle('$encHija')"
        $existe = $false
        try { Invoke-SP -Uri "$baseHija/fields/getbyinternalnameortitle('Recorrida')" | Out-Null; $existe = $true } catch { }

        if ($existe) { Skip "Ya existe" }
        elseif ($SoloVerificar) { Warn "FALTA la lookup" }
        else {
            # SP.FieldLookup por REST da 400 en casi todos los tenants, pero createfieldasxml
            # a veces pasa. Cuesta un intento; si falla, se imprimen los pasos de UI.
            $guid = $padre.Id
            $xml = "<Field Type='Lookup' DisplayName='Recorrida' Name='Recorrida' List='{$guid}' ShowField='Title' />"
            $body = @{ parameters = @{
                '__metadata' = @{ type = 'SP.XmlSchemaFieldCreationInformation' }
                SchemaXml = $xml; Options = 28
            } } | ConvertTo-Json -Depth 8
            try {
                Invoke-SP -Method POST -Uri "$baseHija/fields/createfieldasxml" -Body $body -Extra @{
                    'Content-Type' = 'application/json;odata=verbose;charset=utf-8'
                    'Accept'       = 'application/json;odata=verbose'
                } | Out-Null
                Ok "Lookup creada por REST"
            } catch {
                Falla "REST rechazo la lookup ($($_.Exception.Response.StatusCode.value__)). Hay que crearla a mano:"
                Warn "  1. Abrir la lista '$LISTA_ITEMS'"
                Warn "  2. + Agregar columna -> Busqueda"
                Warn "  3. Nombre 'Recorrida', informacion de '$LISTA_PADRE', columna 'Title'"
                Warn "  OJO: va en la lista HIJA, nunca en la padre."
            }
        }
    }
}

if ($ListarCampos) {
    Titulo "Campos reales de la lista de items"
    $enc = [Uri]::EscapeDataString($LISTA_ITEMS)
    $r = Invoke-SP -Uri "$ApiSP/web/lists/getbytitle('$enc')/fields?`$select=InternalName,Title,TypeAsString,Hidden,ReadOnlyField"
    $campos = if ($r.value) { $r.value } else { $r }
    foreach ($c in $campos | Where-Object { -not $_.Hidden -and -not $_.ReadOnlyField }) {
        Write-Host ("  {0,-32} {1,-14} {2}" -f $c.InternalName, $c.TypeAsString, $c.Title) -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "  Lookups (asi las nombra el conector: item/<InternalName>Id):" -ForegroundColor White
    foreach ($c in $campos | Where-Object { $_.TypeAsString -like "Lookup*" }) {
        Write-Host ("    item/{0}Id" -f $c.InternalName) -ForegroundColor Yellow
    }
    exit 0
}

# ============================================================ 2b - CLAVE COMPARTIDA

<#
  La misma clave tiene que estar en dos lados: el parametro `claveEsperada` de los 5 flujos y
  el secret VITE_TACKER_KEY del repo. Si se desfasan, el gate devuelve 401 a todo y el sintoma
  —la app "no envia nada"— no apunta para nada a la clave. Por eso se resuelve una sola vez
  aca y se propaga a los dos lados en la misma corrida.

  NO es autenticacion: viaja en el bundle de la SPA y cualquiera la ve en DevTools. Es un
  baden contra bots de rastreo.
#>
$archivoClave = Join-Path $RaizRepo "clave.local.txt"
if (Test-Path $archivoClave) {
    $script:ClaveApp = (Get-Content -Raw -Encoding UTF8 $archivoClave).Trim()
} else {
    $script:ClaveApp = -join ((48..57) + (97..122) | Get-Random -Count 28 | ForEach-Object { [char]$_ })
    if (-not $SoloVerificar) {
        [IO.File]::WriteAllText($archivoClave, $script:ClaveApp, (New-Object Text.UTF8Encoding($false)))
    }
}

# ============================================================ 3 - POWER AUTOMATE

function Get-TokenFlow {
    $r = Canjear $script:Refresh "https://service.flow.microsoft.com/"
    $script:Refresh = $r.refresh_token
    Save-RefreshToken $script:Refresh
    return $r.access_token
}

function Invoke-Flow {
    param([string]$Method = "GET", [Parameter(Mandatory)][string]$Uri, $Body)
    $h = @{ Authorization = "Bearer $($script:TokenFlow)"; Accept = "application/json" }
    $req = @{ Method = $Method; Uri = $Uri; Headers = $h; UseBasicParsing = $true }
    if ($null -ne $Body) {
        $h["Content-Type"] = "application/json; charset=utf-8"
        $req["Headers"] = $h
        $req["Body"] = [Text.Encoding]::UTF8.GetBytes($Body)
    }
    return Invoke-RestMethod @req
}

$urlsFlujos = [ordered]@{}

if (-not $SaltearFlujos) {
    Titulo "3 - Power Automate: los 5 flujos"

    $script:TokenFlow = Get-TokenFlow
    Ok "Token de la API de Power Automate obtenido"

    $envs = Invoke-Flow -Uri "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments?api-version=2016-11-01"
    $entorno = $envs.value | Where-Object { $_.properties.isDefault } | Select-Object -First 1
    if (-not $entorno) { $entorno = $envs.value | Select-Object -First 1 }
    Ok "Entorno: $($entorno.properties.displayName)  [$($entorno.name)]"
    $baseFlow = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$($entorno.name)/flows"

    # --- conexiones ---------------------------------------------------------
    #
    # El endpoint de conexiones vive en api.powerapps.com y no en api.flow.microsoft.com, y en
    # varios tenants devuelve 403 sin rol de administrador. La via confiable es otra: leer un
    # flujo que YA funcione en el entorno y sacarle el nombre de instancia de su conexion. Es
    # exactamente de donde sale ese GUID en un export real.
    function Get-ConexionesDeFlujosExistentes {
        $mapa = @{}
        try {
            $todos = Invoke-Flow -Uri "$baseFlow`?api-version=2016-11-01"
        } catch {
            if ($Diagnostico) { Write-Host "    no se pudo listar flujos: $($_.Exception.Message)" -ForegroundColor DarkGray }
            return $mapa
        }
        if ($Diagnostico) { Write-Host "    flujos en el entorno: $(@($todos.value).Count)" -ForegroundColor DarkGray }

        foreach ($f in $todos.value) {
            try {
                $d = Invoke-Flow -Uri "$baseFlow/$($f.name)?api-version=2016-11-01&`$expand=properties.connectionReferences"
                $refs = $d.properties.connectionReferences
                if (-not $refs) { continue }
                foreach ($prop in $refs.PSObject.Properties) {
                    $apiName = $prop.Value.apiName
                    $cn = $prop.Value.connectionName
                    if (-not $apiName -or -not $cn) { continue }
                    $idFlujo = "shared_$apiName"
                    if (-not $mapa.ContainsKey($idFlujo)) {
                        $mapa[$idFlujo] = $cn
                        if ($Diagnostico) {
                            Write-Host "    $idFlujo -> $cn   (de '$($f.properties.displayName)')" -ForegroundColor DarkGray
                        }
                    }
                }
            } catch { }
            # Con las dos que interesan alcanza: no hace falta recorrer los 250.
            if ($mapa.ContainsKey("shared_sharepointonline") -and $mapa.ContainsKey("shared_office365")) { break }
        }
        return $mapa
    }

    function Buscar-Conexion([string]$apiName) {
        if ($null -eq $script:MapaConexiones) { $script:MapaConexiones = Get-ConexionesDeFlujosExistentes }
        if ($script:MapaConexiones.ContainsKey($apiName)) {
            return [pscustomobject]@{ name = $script:MapaConexiones[$apiName] }
        }
        return $null
    }

    if ($VerHistorial) {
        # Ante cualquier fallo, esto PRIMERO. Adivinar la causa cuesta una vuelta completa de
        # generar, aplicar y probar; leer el historial cuesta una llamada y dice el nombre
        # exacto de la accion y el mensaje del motor.
        $todos = Invoke-Flow -Uri "$baseFlow`?api-version=2016-11-01"
        $f = $todos.value | Where-Object { $_.properties.displayName -like "*$VerHistorial*" } | Select-Object -First 1
        if (-not $f) { Falla "No encontre un flujo que matchee '$VerHistorial'"; exit 1 }
        Write-Host ""
        Write-Host "  $($f.properties.displayName)" -ForegroundColor White

        $runs = Invoke-Flow -Uri "$baseFlow/$($f.name)/runs?api-version=2016-11-01"
        if (@($runs.value).Count -eq 0) { Warn "Sin corridas todavia"; exit 0 }

        foreach ($run in $runs.value | Select-Object -First 3) {
            Write-Host ""
            Write-Host "  corrida $($run.name)  estado=$($run.properties.status)  $($run.properties.startTime)" -ForegroundColor Gray
            $det = Invoke-Flow -Uri "$baseFlow/$($f.name)/runs/$($run.name)?api-version=2016-11-01&`$expand=properties/actions"
            foreach ($a in $det.properties.actions.PSObject.Properties) {
                $est = $a.Value.status
                $color = if ($est -eq "Failed") { "Red" } elseif ($est -eq "Skipped") { "DarkGray" } else { "DarkGreen" }
                Write-Host ("    {0,-30} {1}" -f $a.Name, $est) -ForegroundColor $color
                if ($est -eq "Failed") {
                    $msg = $a.Value.error.message
                    if ($msg) { Write-Host "        $($msg.Substring(0,[Math]::Min(500,$msg.Length)))" -ForegroundColor Red }
                    $code = $a.Value.error.code
                    if ($code) { Write-Host "        code: $code" -ForegroundColor Red }
                }
            }
        }
        exit 0
    }

    if ($VerDefinicion) {
        # Bajar la definicion VIVA es el unico rollback y la unica verdad: el mensaje de
        # "actualizado correctamente" no prueba que se aplico lo que uno cree.
        $todos = Invoke-Flow -Uri "$baseFlow`?api-version=2016-11-01"
        foreach ($f in $todos.value | Where-Object { $_.properties.displayName -like "*EQ Torre*" }) {
            $d = Invoke-Flow -Uri "$baseFlow/$($f.name)?api-version=2016-11-01&`$expand=properties.definition"
            Write-Host ""
            Write-Host "  $($f.properties.displayName)" -ForegroundColor White
            $pars = $d.properties.definition.parameters
            if ($pars) {
                foreach ($pp in $pars.PSObject.Properties) {
                    Write-Host "    parametro $($pp.Name) = $($pp.Value.defaultValue)" -ForegroundColor Gray
                }
            }
            $ck = $d.properties.definition.actions.Check_key
            if ($ck) {
                Write-Host "    Check_key: $($ck.expression | ConvertTo-Json -Compress -Depth 6)" -ForegroundColor Gray
            }
        }
        exit 0
    }

    if ($BuscarLookups) {
        # La forma confiable de saber como nombra el conector una columna lookup no es
        # deducirla: es mirar un flujo del mismo entorno que ya escriba una.
        Write-Host ""
        Write-Host "  Parametros tipo lookup en flujos existentes del entorno:" -ForegroundColor White
        $todos = Invoke-Flow -Uri "$baseFlow`?api-version=2016-11-01"
        $vistos = @{}
        foreach ($f in $todos.value) {
            try { $d = Invoke-Flow -Uri "$baseFlow/$($f.name)?api-version=2016-11-01&`$expand=properties.definition" } catch { continue }
            $json = $d.properties.definition | ConvertTo-Json -Depth 60 -Compress
            foreach ($m in [regex]::Matches($json, '"(item/[^"]*(?:Id|LookupId)[^"]*)"')) {
                $k = $m.Groups[1].Value
                if ($k -match '^item/(ID|Id)$') { continue }
                if (-not $vistos.ContainsKey($k)) {
                    $vistos[$k] = $f.properties.displayName
                    Write-Host ("    {0,-40} en '{1}'" -f $k, $f.properties.displayName) -ForegroundColor Yellow
                }
            }
        }
        if ($vistos.Count -eq 0) { Warn "Ningun flujo del entorno escribe una lookup." }
        exit 0
    }

    if ($ListarOperaciones) {
        # Los operationId del conector no se adivinan: se leen del swagger. Adivinarlos cuesta
        # una vuelta entera y el error ("could not be found in API") no dice cual es el bueno.
        Write-Host ""
        Write-Host "  Operaciones del conector de SharePoint que tocan adjuntos:" -ForegroundColor White
        $api = Invoke-Flow -Uri "https://api.flow.microsoft.com/providers/Microsoft.PowerApps/apis/shared_sharepointonline?api-version=2016-11-01&`$expand=properties/swagger"
        foreach ($ruta in $api.properties.swagger.paths.PSObject.Properties) {
            foreach ($verbo in $ruta.Value.PSObject.Properties) {
                $op = $verbo.Value
                if (-not $op.operationId) { continue }
                if ($op.operationId -match "ttach" -or $op.summary -match "djunt|ttach") {
                    $dep = if ($op.deprecated) { "  [DEPRECADA]" } else { "" }
                    Write-Host ("    {0,-34} {1} {2}{3}" -f $op.operationId, $verbo.Name.ToUpper(), $ruta.Name, $dep) -ForegroundColor Gray
                    if ($op.summary) { Write-Host "        $($op.summary)" -ForegroundColor DarkGray }
                }
            }
        }
        Write-Host ""
        Write-Host "  Parametros exactos de las operaciones de adjunto:" -ForegroundColor White
        foreach ($ruta in $api.properties.swagger.paths.PSObject.Properties) {
            foreach ($verbo in $ruta.Value.PSObject.Properties) {
                $op = $verbo.Value
                if ($op.operationId -notin @("CreateAttachment","GetItemAttachments","DeleteAttachment")) { continue }
                Write-Host "    $($op.operationId):" -ForegroundColor Gray
                foreach ($par in $op.parameters) {
                    $req = if ($par.required) { "obligatorio" } else { "opcional" }
                    $tipo = if ($par.type) { $par.type } else { "schema" }
                    Write-Host "      - $($par.name)  [$($par.'in')] $tipo $req" -ForegroundColor DarkGray
                    if ($par.schema -and $par.schema.properties) {
                        foreach ($pr in $par.schema.properties.PSObject.Properties) {
                            Write-Host "          body/$($pr.Name)  $($pr.Value.type)" -ForegroundColor DarkGray
                        }
                    }
                }
            }
        }

        Write-Host ""
        Write-Host "  Operaciones de item (Post/Patch/Get):" -ForegroundColor White
        foreach ($ruta in $api.properties.swagger.paths.PSObject.Properties) {
            foreach ($verbo in $ruta.Value.PSObject.Properties) {
                $op = $verbo.Value
                if ($op.operationId -in @("PostItem","PatchItem","GetItem","GetItems")) {
                    $dep = if ($op.deprecated) { "  [DEPRECADA]" } else { "" }
                    Write-Host ("    {0,-34} {1} {2}{3}" -f $op.operationId, $verbo.Name.ToUpper(), $ruta.Name, $dep) -ForegroundColor Gray
                }
            }
        }
        exit 0
    }

    $connSP  = Buscar-Conexion "shared_sharepointonline"
    $connOut = Buscar-Conexion "shared_office365"

    $faltan = @()
    if ($connSP)  { Ok "Conexion SharePoint: $($connSP.name)" }  else { $faltan += "SharePoint (shared_sharepointonline)" }
    if ($connOut) { Ok "Conexion Outlook   : $($connOut.name)" } else { $faltan += "Outlook 365 (shared_office365)" }

    if ($faltan.Count -gt 0) {
        Write-Host ""
        Falla "No se encontro una conexion usable para:"
        foreach ($f in $faltan) { Warn "  - $f" }
        Warn ""
        Warn "  El nombre de instancia se saca de un flujo que YA use ese conector en este"
        Warn "  entorno. Si no hay ninguno, hay que crear la conexion una vez a mano:"
        Warn "    https://make.powerautomate.com -> Conexiones -> + Nueva conexion"
        Warn "  Una conexion es un objeto con su propio token OAuth: el consentimiento es humano"
        Warn "  y ningun script puede darlo por vos."
        Warn ""
        Warn "  Alternativa sin depender de esto: importar los .zip de power-automate/paquetes/,"
        Warn "  donde el asistente de importacion te deja elegir la conexion en pantalla."
        Warn "  Despues volve a correr este script."
        if (-not $SoloVerificar) { exit 1 }
    }

    # --- crear / actualizar los flujos --------------------------------------
    $paquetes = Join-Path $RaizRepo "power-automate\paquetes"
    if (-not (Test-Path $paquetes)) {
        Warn "No estan generados los paquetes. Generando..."
        Push-Location $RaizRepo
        node "power-automate\generar-paquetes.mjs" | Out-Host
        Pop-Location
    }

    $existentes = @{}
    try {
        $lista = Invoke-Flow -Uri "$baseFlow`?api-version=2016-11-01"
        foreach ($f in $lista.value) {
            $dn = $f.properties.displayName
            if ($existentes.ContainsKey($dn)) {
                # Con dos flujos homonimos la actualizacion puede caer en el otro: reporta
                # "actualizado correctamente" y el que se ejecuta queda intacto.
                Falla "Hay MAS DE UN flujo llamado '$dn'. Renombra o borra el duplicado antes de seguir."
                exit 1
            }
            $existentes[$dn] = $f.name
        }
    } catch { }

    # OJO con los nombres: PowerShell NO distingue mayusculas en variables, asi que un
    # foreach ($clave in ...) pisa $script:Clave sin avisar. Ya paso una vez: los 5 flujos
    # quedaron con claveEsperada = "EQT-01" y todo devolvia 401. Nombres largos y distintos.
    foreach ($idFlujo in @("EQT-01","EQT-02","EQT-03","EQT-04","EQT-05")) {
        Write-Host ""
        $carpeta = Get-ChildItem -Path (Join-Path $paquetes $idFlujo) -Recurse -Filter "definition.json" -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $carpeta) { Falla "$idFlujo sin definition.json (corre el generador)"; continue }

        $def = Get-Content -Raw -Encoding UTF8 $carpeta.FullName | ConvertFrom-Json
        $nombre = $def.properties.displayName
        Write-Host "  $idFlujo  $nombre" -ForegroundColor White

        # Los nombres de instancia reales de las conexiones del entorno.
        $refs = @{}
        if ($def.properties.connectionReferences.PSObject.Properties.Name -contains "shared_sharepointonline") {
            $refs["shared_sharepointonline"] = @{
                connectionName = $connSP.name; source = "Embedded"
                id = "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"
                tier = "NotSpecified"; apiName = "sharepointonline"
            }
        }
        if ($def.properties.connectionReferences.PSObject.Properties.Name -contains "shared_office365") {
            $refs["shared_office365"] = @{
                connectionName = $connOut.name; source = "Embedded"
                id = "/providers/Microsoft.PowerApps/apis/shared_office365"
                tier = "NotSpecified"; apiName = "office365"
            }
        }

        # La clave va DENTRO de la definicion que se aplica: asi el flujo queda listo para
        # responder, sin un paso manual que se olvida y se paga con 401 en todo.
        if ($def.properties.definition.parameters.claveEsperada) {
            $def.properties.definition.parameters.claveEsperada.defaultValue = $script:ClaveApp
        }

        $payload = @{ properties = @{
            displayName = $nombre
            definition = $def.properties.definition
            connectionReferences = $refs
            state = "Started"
        } } | ConvertTo-Json -Depth 60

        if ($SoloVerificar) {
            if ($existentes.ContainsKey($nombre)) { Skip "ya existe (id $($existentes[$nombre]))" } else { Warn "FALTA crear" }
            continue
        }

        try {
            if ($existentes.ContainsKey($nombre)) {
                $id = $existentes[$nombre]
                Invoke-Flow -Method PATCH -Uri "$baseFlow/$id`?api-version=2016-11-01" -Body $payload | Out-Null
                Ok "Actualizado (id $id)"
            } else {
                $creado = Invoke-Flow -Method POST -Uri "$baseFlow`?api-version=2016-11-01" -Body $payload
                $id = $creado.name
                $existentes[$nombre] = $id
                Ok "Creado (id $id)"
            }

            # La URL del disparador se pide despues de guardar.
            $cb = Invoke-Flow -Method POST -Uri "$baseFlow/$id/triggers/manual/listCallbackUrl?api-version=2016-11-01"
            $urlsFlujos[$idFlujo] = $cb.response.value
            Ok "URL del disparador obtenida"
        } catch {
            Falla "$idFlujo -> $($_.Exception.Message)"
            if ($_.ErrorDetails.Message) {
                $m = $_.ErrorDetails.Message
                Write-Host "          $($m.Substring(0,[Math]::Min(400,$m.Length)))" -ForegroundColor DarkRed
            }
        }
    }
}

# ============================================================ 4 - SECRETS

if (-not $SaltearSecrets -and -not $SoloVerificar -and $urlsFlujos.Count -gt 0) {
    Titulo "4 - Secrets del repositorio"

    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        Warn "gh no esta instalado. Carga los secrets a mano en:"
        Warn "  https://github.com/$Repo/settings/secrets/actions"
        foreach ($k in $urlsFlujos.Keys) { Write-Host "  VITE_$($k.Replace('-',''))_URL" }
    } else {
        foreach ($k in $urlsFlujos.Keys) {
            $nombreSecret = "VITE_" + $k.Replace("-", "") + "_URL"
            try {
                $urlsFlujos[$k] | & gh secret set $nombreSecret --repo $Repo 2>&1 | Out-Null
                Ok "$nombreSecret cargado"
            } catch { Falla "$nombreSecret -> $($_.Exception.Message)" }
        }

        # La MISMA clave que quedo en los flujos, para que no puedan desfasarse.
        $script:ClaveApp | & gh secret set VITE_TACKER_KEY --repo $Repo 2>&1 | Out-Null
        Ok "VITE_TACKER_KEY sincronizado con la 'claveEsperada' de los flujos"
    }
}

# ============================================================ 5 - SMOKE TEST

if ($Probar) {
    Titulo "5 - Prueba de humo"

    $archivoUrls = Join-Path $RaizRepo "urls-flujos.local.txt"
    if (-not (Test-Path $archivoUrls)) {
        Falla "No hay urls-flujos.local.txt. Corre el script sin -Probar primero."
    } else {
        $urls = @{}
        foreach ($l in Get-Content -Encoding UTF8 $archivoUrls) {
            if ($l -match "^([^=]+)=(.+)$") { $urls[$Matches[1]] = $Matches[2] }
        }
        $claveProbar = (Get-Content -Raw -Encoding UTF8 (Join-Path $RaizRepo "clave.local.txt")).Trim()

        # 1) Clave correcta -> 200 con JSON parseable.
        Write-Host ""
        Write-Host "  EQT-03 con la clave correcta" -ForegroundColor White
        try {
            $cuerpo = @{ equipo = "TACK-6 / TKR-06" } | ConvertTo-Json
            $r = Invoke-RestMethod -Method POST -UseBasicParsing -Uri $urls["EQT-03"] `
                -Headers @{ "Content-Type" = "application/json"; "x-tacker-key" = $claveProbar } `
                -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo))
            Ok "HTTP 200"
            Ok "recorridas: $(@($r.recorridas).Count)  itemsNoConformes: $(@($r.itemsNoConformes).Count)  catalogoExtra: $(@($r.catalogoExtra).Count)"
            if ($null -eq $r.recorridas) { Falla "La respuesta no trae 'recorridas': revisa el Select del flujo" }
        } catch {
            Falla "$($_.Exception.Message)"
            if ($_.ErrorDetails.Message) { Write-Host "        $($_.ErrorDetails.Message.Substring(0,[Math]::Min(300,$_.ErrorDetails.Message.Length)))" -ForegroundColor DarkRed }
        }

        # 2) Clave mal -> 401. Si esto devuelve 200, el gate no esta cerrando.
        Write-Host ""
        Write-Host "  EQT-03 con una clave incorrecta (tiene que dar 401)" -ForegroundColor White
        try {
            $cuerpo = @{ equipo = "TACK-6 / TKR-06" } | ConvertTo-Json
            Invoke-RestMethod -Method POST -UseBasicParsing -Uri $urls["EQT-03"] `
                -Headers @{ "Content-Type" = "application/json"; "x-tacker-key" = "clave-que-no-es" } `
                -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) | Out-Null
            Falla "Devolvio 200 con una clave incorrecta: el gate NO esta cerrando"
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            if ($code -eq 401) { Ok "HTTP 401 - el gate cierra" } else { Warn "Devolvio $code (se esperaba 401)" }
        }
    }
}

if ($Limpiar) {
    Titulo "Limpieza de filas de prueba"
    $encP = [Uri]::EscapeDataString($LISTA_PADRE)
    $encI = [Uri]::EscapeDataString($LISTA_ITEMS)

    foreach ($par in @(@{ n = $LISTA_ITEMS; e = $encI }, @{ n = $LISTA_PADRE; e = $encP })) {
        Write-Host ""
        Write-Host "  $($par.n)" -ForegroundColor White
        # Mirar el crudo antes de asumir la forma: ya perdi tres vueltas adivinandola.
        $r = Invoke-SP -Uri "$ApiSP/web/lists/getbytitle('$($par.e)')/items?`$filter=Equipo eq '$EquipoPrueba'"
        $filas = @($r.value)
        if ($filas.Count -eq 0) { Skip "sin filas de prueba"; continue }

        # Primero mostrar QUE devuelve, en vez de asumir el nombre del campo clave.
        Write-Host "    $($filas.Count) fila(s) de prueba" -ForegroundColor DarkGray

        $borradas = 0
        foreach ($f in $filas) {
            $id = $f["Id"]
            if (-not $id) { continue }
            try {
                Invoke-SP -Method POST -Uri "$ApiSP/web/lists/getbytitle('$($par.e)')/items($id)" -Extra @{
                    'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*'
                } | Out-Null
                $borradas++
            } catch { Falla "id $id -> $($_.Exception.Message)" }
        }
        Ok "$borradas de $($filas.Count) borradas"
    }
    exit 0
}

# ============================================================ 6 - PRUEBA END-TO-END

<#
  Un flujo probado contra CERO filas no esta probado: los errores de expresion viven en las
  ramas que solo se evaluan cuando hay datos, y el camino de escritura ni se toca. Esta prueba
  crea una recorrida de verdad, la verifica en SharePoint y despues la borra.
#>
if ($ProbarCompleto) {
    Titulo "6 - Prueba end-to-end (crea y borra datos reales)"

    $urls = @{}
    foreach ($l in Get-Content -Encoding UTF8 (Join-Path $RaizRepo "urls-flujos.local.txt")) {
        if ($l -match "^([^=]+)=(.+)$") { $urls[$Matches[1]] = $Matches[2] }
    }
    $claveProbar = (Get-Content -Raw -Encoding UTF8 (Join-Path $RaizRepo "clave.local.txt")).Trim()
    $hdr = @{ "Content-Type" = "application/json"; "x-tacker-key" = $claveProbar }
    $folio = "TEST-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    $pdfFalso = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("%PDF-1.4 prueba de instalacion"))
    $jpgFalso = [Convert]::ToBase64String([byte[]](0xFF,0xD8,0xFF,0xDB,0x00,0x43,0x00,0xFF,0xD9))

    function Post-Flujo($url, $obj) {
        $b = $obj | ConvertTo-Json -Depth 20
        Invoke-RestMethod -Method POST -UseBasicParsing -Uri $url -Headers $hdr -Body ([Text.Encoding]::UTF8.GetBytes($b))
    }

    # Sumar hashtables con "+" explota si una clave se repite: hay que clonar y sobrescribir.
    function Nuevo-Item([hashtable]$Extra) {
        $h = @{
            zona = "Chasis"; itemTexto = "Item de prueba de instalacion"; criticidadRef = "MAYOR"
            criticidad = "MAYOR"; adicional = $false; fotosCount = 0; equipo = "TEST-INSTALACION"
        }
        foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] }
        return $h
    }

    Write-Host ""
    Write-Host "  1) EQT-01: crear la recorrida con 2 items + 1 adicional + PDF" -ForegroundColor White
    $spId = $null
    try {
        $r = Post-Flujo $urls["EQT-01"] @{
            folio = $folio; equipo = "TEST-INSTALACION"; empresa = "TACKER SRL"
            operadora = "YPF"; fechaRelevamiento = (Get-Date).ToUniversalTime().ToString("o")
            pozo = "POZO-PRUEBA"; equipoRecorrida = "Instalador automatico"
            totalItems = 2; itemsOK = 1; itemsNoOK = 1; itemsEnProc = 0; itemsNA = 0
            itemsSinRevisar = 0; reiterativos = 0; nuevos = 1; adicionales = 1
            pctAvance = 50; semaforo = "AMARILLO"; appVersion = "prueba"
            items = @(
                (Nuevo-Item @{ itemId = 1; estado = "OK" })
                (Nuevo-Item @{ itemId = 2; estado = "NO_OK"; origen = "NUEVO"; fotosCount = 1 })
            )
            itemsAdicionales = @( (Nuevo-Item @{ itemId = 9001; estado = "NO_OK"; origen = "NUEVO"; adicional = $true }) )
            attachments = @( @{ name = "Recorrida-$folio.pdf"; contentBase64 = $pdfFalso } )
        }
        $spId = $r.recorridaId
        Ok "HTTP 200  recorridaId=$spId  folio=$($r.folio)"
    } catch {
        Falla "$($_.Exception.Message)"
        Warn "  Ver el detalle con: -SaltearSharePoint -VerHistorial '01 Crear'"
    }

    if ($spId) {
        Start-Sleep -Seconds 8   # los loops corren DESPUES de la Respuesta

        Write-Host ""
        Write-Host "  2) Verificar en SharePoint" -ForegroundColor White
        $encP = [Uri]::EscapeDataString($LISTA_PADRE)
        $encI = [Uri]::EscapeDataString($LISTA_ITEMS)
        try {
            $padre = Invoke-SP -Uri "$ApiSP/web/lists/getbytitle('$encP')/items($spId)?`$select=Title,Equipo,Semaforo,ItemsNoOK,PctAvance,Operadora"
            if ($padre.Title -eq $folio) { Ok "fila padre OK: $($padre.Title)" }
            else { Falla "Title de la fila padre: '$($padre.Title)', se esperaba '$folio'" }
            Ok "  Equipo=$($padre.Equipo)  Operadora=$($padre.Operadora)  Semaforo=$($padre.Semaforo)  NoOK=$($padre.ItemsNoOK)  Avance=$($padre.PctAvance)"

            $adj = Invoke-SP -Uri "$ApiSP/web/lists/getbytitle('$encP')/items($spId)/AttachmentFiles"
            $arch = if ($adj.value) { $adj.value } else { $adj }
            if (@($arch).Count -gt 0) { foreach ($a in $arch) { Ok "adjunto: $($a.FileName)" } }
            else { Falla "La fila padre no tiene adjuntos: revisar Loop_attachments" }

            $q = "`$expand=Recorrida&`$select=ItemId,Estado,Adicional,Recorrida/Id&`$filter=Recorrida/Id eq $spId"
            $hijas = Invoke-SP -Uri "$ApiSP/web/lists/getbytitle('$encI')/items?$q"
            $filas = @($hijas.value)
            if ($filas.Count -eq 3) { Ok "filas hijas: 3 (lookup apuntando al padre)" }
            else { Falla "filas hijas: $($filas.Count), se esperaban 3" }
            foreach ($f in $filas) { Write-Host "        item $($f.ItemId)  estado=$($f.Estado)  adicional=$($f.Adicional)" -ForegroundColor DarkGray }
        } catch { Falla "verificacion: $($_.Exception.Message)" }

        Write-Host ""
        Write-Host "  3) EQT-02: subir una foto al item 2" -ForegroundColor White
        try {
            $r2 = Post-Flujo $urls["EQT-02"] @{
                recorridaId = $spId; itemId = 2
                fotos = @( @{ name = "item-2-1.jpg"; contentBase64 = $jpgFalso } )
            }
            Ok "HTTP 200  fotos=$($r2.fotos)"
            Start-Sleep -Seconds 5
            $q2 = "`$select=Id,FotosCount,ItemId&`$filter=Equipo eq 'TEST-INSTALACION' and ItemId eq 2&`$orderby=Id desc&`$top=1"
            $f2 = @((Invoke-SP -Uri "$ApiSP/web/lists/getbytitle('$encI')/items?$q2").value)[0]
            $adj2 = Invoke-SP -Uri "$ApiSP/web/lists/getbytitle('$encI')/items($($f2.Id))/AttachmentFiles"
            $arch2 = if ($adj2.value) { $adj2.value } else { $adj2 }
            if (@($arch2).Count -gt 0) { Ok "foto adjunta: $($arch2[0].FileName)  FotosCount=$($f2.FotosCount)" }
            else { Falla "El item no tiene la foto adjunta" }
        } catch {
            Falla "$($_.Exception.Message)"
            Warn "  Ver el detalle con: -SaltearSharePoint -VerHistorial '02 Adjuntar'"
        }

        Write-Host ""
        Write-Host "  4) EQT-03: la recorrida tiene que aparecer en el historial" -ForegroundColor White
        try {
            $r3 = Post-Flujo $urls["EQT-03"] @{ equipo = "TEST-INSTALACION" }
            $enc = @($r3.recorridas) | Where-Object { $_.folio -eq $folio }
            if ($enc) { Ok "aparece en el historial (id $($enc.id))" } else { Falla "NO aparece en el historial" }
            $nc = @($r3.itemsNoConformes).Count
            if ($nc -ge 2) { Ok "itemsNoConformes: $nc" } else { Falla "itemsNoConformes: $nc, se esperaban 2" }
        } catch { Falla "$($_.Exception.Message)" }

        Write-Host ""
        Write-Host "  5) Limpieza" -ForegroundColor White
        try {
            # Se barren TODAS las filas de prueba, no solo las de esta corrida: si una vuelta
            # anterior fallo a mitad, quedan huerfanas ensuciando el historial del equipo.
            $filas = @((Invoke-SP -Uri "$ApiSP/web/lists/getbytitle('$encI')/items?`$select=Id&`$filter=Equipo eq 'TEST-INSTALACION'&`$top=500").value)
            foreach ($f in $filas) {
                Invoke-SP -Method POST -Uri "$ApiSP/web/lists/getbytitle('$encI')/items($($f.Id))" -Extra @{
                    'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*'
                } | Out-Null
            }
            Ok "$($filas.Count) filas hijas borradas"
            $padres = @((Invoke-SP -Uri "$ApiSP/web/lists/getbytitle('$encP')/items?`$select=Id&`$filter=Equipo eq 'TEST-INSTALACION'&`$top=500").value)
            foreach ($pp in $padres) {
                Invoke-SP -Method POST -Uri "$ApiSP/web/lists/getbytitle('$encP')/items($($pp.Id))" -Extra @{
                    'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*'
                } | Out-Null
            }
            Ok "$($padres.Count) fila(s) padre borrada(s)"
        } catch { Warn "no se pudo limpiar del todo: $($_.Exception.Message)" }
    }
}

# ============================================================ RESUMEN

Titulo "Resumen"

if ($urlsFlujos.Count -gt 0) {
    $salida = Join-Path $RaizRepo "urls-flujos.local.txt"
    $texto = ($urlsFlujos.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`r`n"
    [IO.File]::WriteAllText($salida, $texto, (New-Object Text.UTF8Encoding($false)))
    Ok "URLs guardadas en urls-flujos.local.txt (esta en .gitignore: NO se commitea)"
}

Write-Host ""
Write-Host "  Para desplegar con los secrets nuevos:" -ForegroundColor White
Write-Host "   gh workflow run deploy-pages.yml --ref main --repo $Repo" -ForegroundColor Gray
Write-Host ""
Write-Host "  Para verificar que los flujos responden:" -ForegroundColor White
Write-Host "   .\Instalar-Todo.ps1 -Probar -SaltearSharePoint -SaltearFlujos -SaltearSecrets" -ForegroundColor Gray
Write-Host ""
Write-Host "  Lo unico que no se puede automatizar:" -ForegroundColor White
Write-Host "   Probar la app en un celular real, con el equipo en modo avion." -ForegroundColor Gray
Write-Host "   Wake Lock, camara y bloqueo de pantalla no se reproducen en un emulador." -ForegroundColor Gray
Write-Host ""
