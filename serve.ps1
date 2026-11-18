# Local dev server: serves the app + a MOCK backend (no install needed - Windows PowerShell only).
#   powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
# Mock backend endpoints (replace with your real backend in js/config.js):
#   GET /api/sessions                                  -> list of sessions
#   GET /api/sessions/current                          -> { session_id, subject_id } of the open session
#   GET /api/sessions/{sessionId}/measurements[?subject=ID] -> that session's results (samples/*.json)
param([int]$Port = 8080)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="application/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8";
           ".json"="application/json; charset=utf-8"; ".webp"="image/webp"; ".png"="image/png"; ".jpg"="image/jpeg"; ".svg"="image/svg+xml"; ".pdf"="application/pdf"; ".md"="text/plain; charset=utf-8" }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Body Composition Report app: http://localhost:$Port/  (Ctrl+C to stop)"

function Send($ctx, [int]$code, [byte[]]$bytes, [string]$type) {
  $ctx.Response.StatusCode = $code
  $ctx.Response.ContentType = $type
  $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
  $ctx.Response.Headers.Add("Cache-Control", "no-store")
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.OutputStream.Close()
}
function SendText($ctx, [int]$code, [string]$text, [string]$type) { Send $ctx $code ([Text.Encoding]::UTF8.GetBytes($text)) $type }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path.StartsWith("/api/sessions")) {
        $sessions = Get-ChildItem (Join-Path $root "samples") -Filter *.json | ForEach-Object {
          $j = [IO.File]::ReadAllText($_.FullName) | ConvertFrom-Json
          [pscustomobject]@{ session_id = $j.session_id; subject_id = $j.subject.id; subject_name = $j.subject.name; test_date = $j.test_date; file = $_.FullName }
        } | Sort-Object test_date, session_id -Descending
        if ($path -eq "/api/sessions") {
          $list = @($sessions | Select-Object session_id, subject_id, subject_name, test_date)
          SendText $ctx 200 (ConvertTo-Json -InputObject $list -Compress) $mime[".json"]; continue
        }
        if ($path -eq "/api/sessions/current") {      # mock: the most recent session is the "open" one
          $c = $sessions | Select-Object -First 1
          SendText $ctx 200 (ConvertTo-Json -Compress @{ session_id = $c.session_id; subject_id = $c.subject_id }) $mime[".json"]; continue
        }
        if ($path -match '^/api/sessions/([A-Za-z0-9_\-]+)/measurements$') {
          $sid = $Matches[1]; $sub = $ctx.Request.QueryString["subject"]
          $s = $sessions | Where-Object { $_.session_id -eq $sid } | Select-Object -First 1
          if (-not $s) { SendText $ctx 404 '{"error":"session not found"}' $mime[".json"]; continue }
          if ($sub -and $sub -ne $s.subject_id) { SendText $ctx 404 '{"error":"subject does not belong to this session"}' $mime[".json"]; continue }
          Send $ctx 200 ([IO.File]::ReadAllBytes($s.file)) $mime[".json"]; continue
        }
        SendText $ctx 404 '{"error":"unknown endpoint"}' $mime[".json"]; continue
      }
      if ($path -eq "/") { $path = "/index.html" }
      $full = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
      if (-not $full.StartsWith($root) -or -not (Test-Path $full -PathType Leaf)) { SendText $ctx 404 "Not found" "text/plain"; continue }
      $ext = [IO.Path]::GetExtension($full).ToLower()
      $type = $mime[$ext]; if (-not $type) { $type = "application/octet-stream" }
      Send $ctx 200 ([IO.File]::ReadAllBytes($full)) $type
    } catch { try { SendText $ctx 500 $_.Exception.Message "text/plain" } catch {} }
  }
} finally { $listener.Stop() }
