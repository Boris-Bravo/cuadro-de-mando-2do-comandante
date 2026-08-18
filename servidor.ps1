# servidor.ps1 — Mini-servidor local para el Cuadro de Mando y Control.
# Sirve los archivos de la app en http://localhost:PUERTO y abre Edge en modo aplicacion.
# Necesario porque las apps instalables (PWA) y la sincronizacion con carpeta requieren
# ejecutarse desde un servidor local, no abriendo el archivo directamente.
#
# Parametros opcionales:
#   -Puerto <n>       Fuerza un puerto concreto (por defecto 8733, con autoincremento).
#   -SinNavegador     No abre Edge (util para pruebas / vista previa).

param(
  [int]$Puerto = 8733,
  [switch]$SinNavegador
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$puerto = $Puerto

# Buscar un puerto libre si el predeterminado esta ocupado.
function Test-Puerto($p) {
  try {
    $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}
while (-not (Test-Puerto $puerto)) { $puerto++ ; if ($puerto -gt 8760) { break } }

$prefijo = "http://localhost:$puerto/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefijo)
try {
  $listener.Start()
} catch {
  Write-Host "No se pudo iniciar el servidor: $_" -ForegroundColor Red
  Read-Host "Presione ENTER para cerrar"
  exit 1
}

$mime = @{
  ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8";
  ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".webmanifest"="application/manifest+json; charset=utf-8";
  ".svg"="image/svg+xml"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg";
  ".ico"="image/x-icon"; ".woff2"="font/woff2"; ".txt"="text/plain; charset=utf-8"
}

Write-Host ""
Write-Host "  CUADRO DE MANDO Y CONTROL DEL 2DO COMANDANTE" -ForegroundColor Yellow
Write-Host "  Servidor activo en: $prefijo" -ForegroundColor Green
Write-Host "  (No cierre esta ventana mientras use la aplicacion)" -ForegroundColor DarkGray
Write-Host ""

# Abrir Edge en modo aplicacion (ventana sin barras, como app de escritorio).
if (-not $SinNavegador) {
  $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  if (Test-Path $edge) {
    Start-Process $edge -ArgumentList "--app=$prefijo`index.html"
  } else {
    Start-Process "$prefijo`index.html"
  }
}

# Bucle de atencion de peticiones.
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $ruta = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($ruta)) { $ruta = "index.html" }
    $archivo = Join-Path $raiz $ruta

    if ((Test-Path $archivo) -and -not (Get-Item $archivo).PSIsContainer) {
      $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
      $tipo = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($archivo)
      $res.ContentType = $tipo
      $res.Headers.Add("Cache-Control", "no-cache")
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - No encontrado: $ruta")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.OutputStream.Close()
  } catch {
    # Continuar sirviendo aunque una peticion falle.
  }
}
