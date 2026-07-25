# Lance SIKLOPOSY dans le navigateur (aucune installation requise).
# Clic droit sur ce fichier > "Exécuter avec PowerShell", ou dans un terminal :
#   powershell -ExecutionPolicy Bypass -File demarrer.ps1

param([int]$Port = 5599)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() }
catch { Write-Host "Impossible d'ouvrir le port $Port. Relancez avec : -Port 5600" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  SIKLOPOSY est lance." -ForegroundColor Green
Write-Host "  Ouvrez : http://localhost:$Port/" -ForegroundColor Cyan
Write-Host "  (Ctrl+C pour arreter)"
Write-Host ""
Start-Process "http://localhost:$Port/"

$types = @{ ".html"="text/html; charset=utf-8"; ".js"="application/javascript; charset=utf-8";
            ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
            ".svg"="image/svg+xml"; ".png"="image/png"; ".jpg"="image/jpeg"; ".ico"="image/x-icon" }

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
    $file = Join-Path $root $rel

    if ((Test-Path $file -PathType Leaf) -and $file.StartsWith($root)) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes("404 - $rel")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch { }
}
