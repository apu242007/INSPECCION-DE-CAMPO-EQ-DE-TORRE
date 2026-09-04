<#
.SYNOPSIS
    Crea (idempotente) las columnas de las 3 listas de la app INSPECCION DE CAMPO EQ TORRE.

.DESCRIPTION
    Sitio: https://tackersrl505.sharepoint.com/sites/WellService

    Listas:
      1. INSPECCION DE CAMPO EQ TORRE                     (padre, YA EXISTE - no se crea)
      2. INSPECCION DE CAMPO EQ TORRE - ITEMS             (hija)
      3. INSPECCION DE CAMPO EQ TORRE - CATALOGO EXTRA

    Lo que este script SI hace:
      - Resuelve el Title real de cada lista via _api/web/lists (el Title puede no coincidir
        con el slug de la URL: /Lists/InspeccionDeCampoEqTorre puede tener Title con espacios).
      - Intenta crear las listas 2 y 3 si no existen. Si el tenant bloquea la creacion por
        REST (HTTP 400), imprime la URL para crearlas por UI y sigue.
      - Agrega las columnas faltantes. Las que ya existen se saltean.

    Lo que este script NO puede hacer:
      - Crear la columna lookup `Recorrida` en la lista de ITEMS. SP.FieldLookup por REST
        devuelve 400 en la mayoria de los tenants. Hay que crearla a mano por UI
        (ver instrucciones al final de la ejecucion).

.NOTES
    Encoding: este archivo DEBE guardarse en UTF-8 CON BOM. PowerShell 5.1 lee .ps1 como ANSI
    sin BOM y los acentos rompen el parser ("Falta la cadena en el terminador").

    Todo POST/PATCH manda el body como BYTES UTF-8. Invoke-RestMethod con -Body string usa
    ISO-8859-1 y SharePoint responde 400: "Unable to translate bytes [F3] at index N".
#>

[CmdletBinding()]
param(
    [string]$Hostname = "tackersrl505.sharepoint.com",
    [string]$SitePath = "/sites/WellService",
    [switch]$SoloVerificar
)

$ErrorActionPreference = "Stop"

$Resource = "https://$Hostname"
$ApiSP    = "$Resource$SitePath/_api"
# Cliente first-party de SharePoint Online Management Shell: pre-consentido, no necesita
# aprobacion de administrador (a diferencia de "Microsoft Graph Command Line Tools").
$ClientId = "9bc3ab49-b65d-410a-85ad-de819febfddc"
$TokenCache = Join-Path $env:LOCALAPPDATA "tacker-eqt-sp-refresh.bin"

# ---------------------------------------------------------------- autenticacion

function Save-RefreshToken([string]$Token) {
    Add-Type -AssemblyName System.Security
    $bytes = [Text.Encoding]::UTF8.GetBytes($Token)
    $prot  = [Security.Cryptography.ProtectedData]::Protect(
        $bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes($TokenCache, $prot)
}

function Read-RefreshToken {
    if (-not (Test-Path $TokenCache)) { return $null }
    try {
        Add-Type -AssemblyName System.Security
        $prot  = [IO.File]::ReadAllBytes($TokenCache)
        $bytes = [Security.Cryptography.ProtectedData]::Unprotect(
            $prot, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        return [Text.Encoding]::UTF8.GetString($bytes)
    } catch { return $null }
}

function Get-Token {
    # 1) Intento silencioso con el refresh token cacheado (TTL ~90 dias).
    $rt = Read-RefreshToken
    if ($rt) {
        try {
            $r = Invoke-RestMethod -Method POST -UseBasicParsing `
                -Uri "https://login.microsoftonline.com/common/oauth2/token" `
                -Body "grant_type=refresh_token&client_id=$ClientId&refresh_token=$rt&resource=$Resource"
            Save-RefreshToken $r.refresh_token
            Write-Host "Token renovado en silencio." -ForegroundColor DarkGray
            return $r.access_token
        } catch {
            Write-Host "El refresh token cacheado no sirvio. Va device code." -ForegroundColor Yellow
        }
    }

    # 2) Device code. Requiere un humano: NO se puede automatizar, es el punto del control.
    $dc = Invoke-RestMethod -Method POST -UseBasicParsing `
        -Uri "https://login.microsoftonline.com/common/oauth2/devicecode" `
        -Body "client_id=$ClientId&resource=$Resource"

    Write-Host ""
    Write-Host "  ABRI ESTA URL:  https://microsoft.com/devicelogin" -ForegroundColor Cyan
    Write-Host "  CODIGO:         $($dc.user_code)"                  -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Tenes 15 minutos. Iniciá sesión con una cuenta del tenant $Hostname." -ForegroundColor DarkGray
    Write-Host ""

    $limite = (Get-Date).AddMinutes(15)
    while ((Get-Date) -lt $limite) {
        Start-Sleep -Seconds 5
        try {
            $r = Invoke-RestMethod -Method POST -UseBasicParsing `
                -Uri "https://login.microsoftonline.com/common/oauth2/token" `
                -Body "grant_type=urn:ietf:params:oauth:grant-type:device_code&client_id=$ClientId&code=$($dc.device_code)"
            Save-RefreshToken $r.refresh_token
            Write-Host "Autenticado." -ForegroundColor Green
            return $r.access_token
        } catch {
            if ($_.ErrorDetails.Message -notmatch "authorization_pending") { throw }
        }
    }
    throw "Se agoto el tiempo esperando el device code."
}

$script:Token = Get-Token

function Invoke-SP {
    param(
        [string]$Method = "GET",
        [Parameter(Mandatory)][string]$Uri,
        $Body,
        [hashtable]$Extra
    )
    for ($intento = 1; $intento -le 3; $intento++) {
        $h = @{
            Authorization = "Bearer $script:Token"
            Accept        = "application/json;odata=nometadata"
        }
        if ($Extra) { foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] } }

        try {
            # OJO: no usar $args como nombre, es variable automatica de PowerShell.
            $req = @{ Method = $Method; Uri = $Uri; Headers = $h; UseBasicParsing = $true }
            if ($null -ne $Body) {
                # SIEMPRE bytes UTF-8. Ver la nota de encoding arriba.
                $req["Body"] = [Text.Encoding]::UTF8.GetBytes($Body)
            }
            return Invoke-RestMethod @req
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            # SPO tiene una carrera de validacion de token justo despues de refrescarlo.
            if ($code -eq 401 -and $intento -lt 3) {
                Start-Sleep -Milliseconds 800
                $script:Token = Get-Token
                continue
            }
            if (($code -eq 429 -or $code -eq 503) -and $intento -lt 3) {
                Start-Sleep -Seconds 3
                continue
            }
            throw
        }
    }
}

# ---------------------------------------------------------------- helpers de listas

function Get-ListaPorTitulo([string]$Patron) {
    $r = Invoke-SP -Uri "$ApiSP/web/lists?`$select=Title,Id&`$filter=Hidden eq false"
    $items = if ($r.value) { $r.value } else { $r }
    return $items | Where-Object { $_.Title -like $Patron }
}

function New-Lista([string]$Titulo, [string]$Descripcion) {
    # Probar SIEMPRE el POST: el bloqueo de creacion por REST es POR TENANT, no universal.
    # Cuesta diez segundos y en varios tenants funciona a la primera.
    $body = @{
        '__metadata'  = @{ type = 'SP.List' }
        Title         = $Titulo
        Description   = $Descripcion
        BaseTemplate  = 100
    } | ConvertTo-Json -Depth 8

    try {
        Invoke-SP -Method POST -Uri "$ApiSP/web/lists" -Body $body -Extra @{
            'Content-Type' = 'application/json;odata=verbose;charset=utf-8'
            'Accept'       = 'application/json;odata=verbose'
        } | Out-Null
        Write-Host "  + Lista creada: $Titulo" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "  ! No se pudo crear '$Titulo' por REST ($($_.Exception.Response.StatusCode.value__))." -ForegroundColor Yellow
        Write-Host "    Creala por UI y volve a correr el script:" -ForegroundColor Yellow
        Write-Host "    $Resource$SitePath/_layouts/15/viewlsts.aspx  ->  + Nuevo -> Lista -> En blanco" -ForegroundColor Cyan
        Write-Host "    Nombre exacto: $Titulo" -ForegroundColor Cyan
        return $false
    }
}

function Add-Columna {
    param(
        [Parameter(Mandatory)][string]$ListaTitulo,
        [Parameter(Mandatory)][string]$InternalName,  # ASCII, sin acentos, sin espacios
        [Parameter(Mandatory)][string]$DisplayName,   # lo que ve el usuario; puede tener acentos
        [Parameter(Mandatory)][string]$Tipo,          # Text|Note|Number|DateTime|Choice|Boolean
        [string[]]$Choices,
        [switch]$Indexed
    )

    $enc = [Uri]::EscapeDataString($ListaTitulo)
    $base = "$ApiSP/web/lists/getbytitle('$enc')"

    try {
        Invoke-SP -Uri "$base/fields/getbyinternalnameortitle('$InternalName')" | Out-Null
        Write-Host "    = $InternalName" -ForegroundColor DarkGray
        return
    } catch { }  # no existe: se crea

    if ($SoloVerificar) {
        Write-Host "    FALTA $InternalName ($Tipo)" -ForegroundColor Yellow
        return
    }

    # createfieldasxml permite fijar InternalName y DisplayName por separado y setear Indexed
    # en la misma llamada. OJO: el endpoint REST es 'createfieldasxml'; 'addfieldasxml' es el
    # nombre CSOM/PnP y por REST da ResourceNotFoundException (un 404 disfrazado).
    $idx = if ($Indexed) { " Indexed='TRUE'" } else { "" }
    $xml = switch ($Tipo) {
        "Choice" {
            $ops = ($Choices | ForEach-Object { "<CHOICE>$([Security.SecurityElement]::Escape($_))</CHOICE>" }) -join ""
            "<Field Type='Choice' Format='Dropdown' FillInChoice='FALSE' DisplayName='$InternalName'$idx><CHOICES>$ops</CHOICES></Field>"
        }
        "Note"     { "<Field Type='Note' NumLines='6' RichText='FALSE' DisplayName='$InternalName'$idx />" }
        "Number"   { "<Field Type='Number' DisplayName='$InternalName'$idx />" }
        "DateTime" { "<Field Type='DateTime' Format='DateTime' DisplayName='$InternalName'$idx />" }
        "Date"     { "<Field Type='DateTime' Format='DateOnly' DisplayName='$InternalName'$idx />" }
        "Boolean"  { "<Field Type='Boolean' DisplayName='$InternalName'$idx><Default>0</Default></Field>" }
        default    { "<Field Type='Text' MaxLength='255' DisplayName='$InternalName'$idx />" }
    }

    $body = @{
        parameters = @{
            '__metadata' = @{ type = 'SP.XmlSchemaFieldCreationInformation' }
            SchemaXml    = $xml
            # 4 AddToDefaultContentType + 8 AddFieldInternalNameHint + 16 AddFieldToDefaultView
            Options      = 28
        }
    } | ConvertTo-Json -Depth 8

    try {
        Invoke-SP -Method POST -Uri "$base/fields/createfieldasxml" -Body $body -Extra @{
            'Content-Type' = 'application/json;odata=verbose;charset=utf-8'
            'Accept'       = 'application/json;odata=verbose'
        } | Out-Null

        # El DisplayName va aparte: en el XML se usa como InternalName (por el hint de Options).
        if ($DisplayName -ne $InternalName) {
            $patch = @{ '__metadata' = @{ type = 'SP.Field' }; Title = $DisplayName } | ConvertTo-Json
            Invoke-SP -Method POST -Uri "$base/fields/getbyinternalnameortitle('$InternalName')" -Body $patch -Extra @{
                'Content-Type'  = 'application/json;odata=verbose;charset=utf-8'
                'Accept'        = 'application/json;odata=verbose'
                'X-HTTP-Method' = 'MERGE'
                'IF-MATCH'      = '*'
            } | Out-Null
        }
        Write-Host "    + $InternalName ($Tipo)" -ForegroundColor Green
    } catch {
        Write-Host "    X $InternalName -> $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ---------------------------------------------------------------- definicion de columnas

$LISTA_PADRE     = "INSPECCION DE CAMPO EQ TORRE"
$LISTA_ITEMS     = "INSPECCION DE CAMPO EQ TORRE - ITEMS"
$LISTA_CATALOGO  = "INSPECCION DE CAMPO EQ TORRE - CATALOGO EXTRA"

# Title es obligatoria de fabrica y ya existe: nunca se recrea. Lleva el folio.
$COLS_PADRE = @(
    @{ n="Equipo";                d="Equipo";                    t="Text";     ix=$true }
    @{ n="Operadora";             d="Operadora";                 t="Choice";   c=@("YPF","TotalEnergies","Vista","PAE","Otra") }
    @{ n="Contrato";              d="Contrato";                  t="Text" }
    @{ n="FechaRelevamiento";     d="Fecha de relevamiento";     t="DateTime"; ix=$true }
    @{ n="Pozo";                  d="Pozo / locación";           t="Text" }
    @{ n="AuditoriaProgramada";   d="Auditoría programada";      t="Date" }
    @{ n="EquipoRecorrida";       d="Equipo de recorrida";       t="Text" }
    @{ n="CompanyRepresentative"; d="Company Representative";    t="Text" }
    @{ n="Notas";                 d="Notas / limitaciones";      t="Note" }
    @{ n="TotalItems";            d="Total ítems";               t="Number" }
    @{ n="ItemsOK";               d="Ítems OK";                  t="Number" }
    @{ n="ItemsNoOK";             d="Ítems NO OK";               t="Number" }
    @{ n="ItemsEnProc";           d="Ítems en proceso";          t="Number" }
    @{ n="ItemsNA";               d="Ítems N/A";                 t="Number" }
    @{ n="ItemsSinRevisar";       d="Ítems sin revisar";         t="Number" }
    @{ n="Reiterativos";          d="Reiterativos";              t="Number" }
    @{ n="Nuevos";                d="Nuevos";                    t="Number" }
    @{ n="Adicionales";           d="Adicionales";               t="Number" }
    @{ n="PctAvance";             d="% avance";                  t="Number" }
    @{ n="Semaforo";              d="Semáforo";                  t="Choice";   c=@("ROJO","AMARILLO","VERDE") }
    @{ n="Cerrada";               d="Cerrada";                   t="Boolean" }
    @{ n="FechaCierre";           d="Fecha de cierre";           t="DateTime" }
    @{ n="FirmaSupervisor";       d="Firma supervisor";          t="Text" }
    @{ n="FirmaCR";               d="Firma CR";                  t="Text" }
    @{ n="AppVersion";            d="Versión de la app";         t="Text" }
)

$COLS_ITEMS = @(
    @{ n="ItemId";                  d="Ítem Id";                  t="Number"; ix=$true }
    @{ n="Zona";                    d="Zona";                     t="Text" }
    @{ n="ItemTexto";               d="Ítem a verificar";         t="Note" }
    @{ n="CriticidadRef";           d="Criticidad de referencia"; t="Text" }
    @{ n="Criticidad";              d="Criticidad";               t="Choice"; c=@("CRITICA","MAYOR","MENOR","GENERAL") }
    @{ n="Estado";                  d="Estado";                   t="Choice"; c=@("SIN_REVISAR","OK","NO_OK","EN_PROC","NA") }
    @{ n="Origen";                  d="Origen";                   t="Choice"; c=@("NUEVO","REITERATIVO") }
    @{ n="FuenteReiteracion";       d="Fuente de reiteración";    t="Choice"; c=@("RECORRIDA_INTERNA","AUDITORIA_EXTERNA","AMBAS") }
    @{ n="VecesPrevias";            d="Veces previas";            t="Number" }
    @{ n="ReiteracionAuto";         d="Reiteración automática";   t="Boolean" }
    @{ n="ReferenciaReiteracion";   d="Referencia de reiteración";t="Note" }
    @{ n="FechaVerif";              d="Fecha de verificación";    t="DateTime" }
    @{ n="Responsable";             d="Responsable";              t="Text" }
    @{ n="Plazo";                   d="Plazo";                    t="Date" }
    @{ n="AccionCorrectiva";        d="Acción correctiva";        t="Note" }
    @{ n="EstadoFinal";             d="Estado final";             t="Choice"; c=@("PENDIENTE","CERRADO") }
    @{ n="Escalado";                d="Escalado a crítico";       t="Boolean" }
    @{ n="Observaciones";           d="Observaciones";            t="Note" }
    @{ n="Adicional";               d="Adicional";                t="Boolean" }
    @{ n="FotosCount";              d="Cantidad de fotos";        t="Number" }
    # Copia del equipo del padre: permite filtrar el historial sin hacer join con el lookup.
    @{ n="Equipo";                  d="Equipo";                   t="Text"; ix=$true }
)

$COLS_CATALOGO = @(
    @{ n="ItemId";         d="Ítem Id";           t="Number"; ix=$true }
    @{ n="Zona";           d="Zona";              t="Text" }
    @{ n="CriticidadRef";  d="Criticidad ref.";   t="Choice"; c=@("CRITICA","MAYOR","MENOR","GENERAL") }
    @{ n="ItemTexto";      d="Ítem a verificar";  t="Note" }
    @{ n="HallazgoTipico"; d="Hallazgo típico";   t="Note" }
    @{ n="PromovidoDesde"; d="Promovido desde";   t="Text" }
    @{ n="Activo";         d="Activo";            t="Boolean" }
)

# ---------------------------------------------------------------- ejecucion

function Invoke-Lista([string]$Titulo, $Columnas, [bool]$CrearSiFalta, [string]$Descripcion) {
    Write-Host ""
    Write-Host "== $Titulo" -ForegroundColor White

    $lista = Get-ListaPorTitulo $Titulo
    if (-not $lista) {
        if (-not $CrearSiFalta) {
            Write-Host "  X No existe y NO se crea desde aca. Revisala en el sitio." -ForegroundColor Red
            return
        }
        if (-not (New-Lista $Titulo $Descripcion)) { return }
        $lista = Get-ListaPorTitulo $Titulo
        if (-not $lista) { return }
    }

    $tituloReal = @($lista)[0].Title
    if ($tituloReal -ne $Titulo) {
        Write-Host "  i El Title real es '$tituloReal' (usalo en Power Automate)." -ForegroundColor Yellow
    }

    foreach ($c in $Columnas) {
        Add-Columna -ListaTitulo $tituloReal -InternalName $c.n -DisplayName $c.d `
                    -Tipo $c.t -Choices $c.c -Indexed:([bool]$c.ix)
    }
}

Write-Host "Sitio: $Resource$SitePath" -ForegroundColor White
if ($SoloVerificar) { Write-Host "MODO VERIFICACION: no se crea nada." -ForegroundColor Yellow }

Invoke-Lista $LISTA_PADRE    $COLS_PADRE    $false "Recorridas de pre-auditoría de equipos de torre"
Invoke-Lista $LISTA_ITEMS    $COLS_ITEMS    $true  "Ítems de cada recorrida de equipo de torre"
Invoke-Lista $LISTA_CATALOGO $COLS_CATALOGO $true  "Ítems promovidos al catálogo general"

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " PASO MANUAL OBLIGATORIO: la columna lookup" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host @"
 SP.FieldLookup por REST devuelve 400 en la mayoria de los tenants. Hay que crearla a mano.

 1. Abrir la lista:  $LISTA_ITEMS
 2. + Agregar columna -> Búsqueda (Lookup)
 3. Nombre:                 Recorrida
    Seleccionar informacion de:  $LISTA_PADRE
    En esta columna:         Title
 4. Guardar.

 OJO: la lookup va en la lista HIJA (ITEMS), NUNCA en la padre. Si queda en la padre, el
 formulario de "Crear elemento" de Power Automate muestra un campo 'Recorrida Id' en el lugar
 equivocado y la hija no tiene forma de referenciar al padre.
"@ -ForegroundColor White
Write-Host ""
Write-Host "Listo." -ForegroundColor Green
