# Puente de impresión Dimerc CCP  (Windows PowerShell 5+, sin instalar nada)
# Deja la app web hablar con las impresoras del PC (Honeywell PM45, Zebra, etc.) en http://localhost:9100
# - Lista las impresoras instaladas en Windows y envía ZPL "crudo" (RAW) a la elegida.
# - Impresoras de red por IP: escribe las IP (una por línea) en impresoras_ip.txt junto a este archivo (puerto 9100).
$ErrorActionPreference = 'Continue'
$puerto = 9100
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class RawPrn {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static string Send(string printer, byte[] data) {
    IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "No se pudo abrir la impresora (error " + Marshal.GetLastWin32Error() + ")";
    DOCINFOA di = new DOCINFOA(); di.pDocName = "Etiqueta Dimerc"; di.pDataType = "RAW"; string err = null;
    if (StartDocPrinter(h, 1, di)) {
      if (StartPagePrinter(h)) {
        IntPtr p = Marshal.AllocCoTaskMem(data.Length); Marshal.Copy(data, 0, p, data.Length); int w;
        if (!WritePrinter(h, p, data.Length, out w)) err = "Falló la escritura (error " + Marshal.GetLastWin32Error() + ")";
        Marshal.FreeCoTaskMem(p); EndPagePrinter(h);
      } else err = "StartPage falló";
      EndDocPrinter(h);
    } else err = "StartDoc falló (error " + Marshal.GetLastWin32Error() + ")";
    ClosePrinter(h); return err;
  }
}
"@

function Json($o) { return ($o | ConvertTo-Json -Depth 6 -Compress) }
function Listar {
  $l = @()
  try { Get-Printer | ForEach-Object { $l += @{ deviceType='printer'; uid=$_.Name; name=$_.Name; connection='driver'; version=3; manufacturer='Windows' } } } catch {}
  $f = Join-Path $carpeta 'impresoras_ip.txt'
  if (Test-Path $f) { Get-Content $f | ForEach-Object { $ip = $_.Trim(); if ($ip -match '^[0-9A-Za-z\.\-]+$') { $l += @{ deviceType='printer'; uid="ip:$ip"; name="Red $ip"; ip=$ip; connection='network'; version=3; manufacturer='Red' } } } }
  return @{ printer = @($l) }
}
function Enviar($dev, $texto) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($texto)
  if ($dev.ip) {
    try { $c = New-Object System.Net.Sockets.TcpClient; $c.SendTimeout = 5000; $ar = $c.BeginConnect($dev.ip, 9100, $null, $null)
      if (-not $ar.AsyncWaitHandle.WaitOne(4000)) { $c.Close(); return "No responde $($dev.ip):9100" }
      $c.EndConnect($ar); $s = $c.GetStream(); $s.Write($bytes, 0, $bytes.Length); $s.Flush(); $c.Close(); return $null
    } catch { return "Red: $($_.Exception.Message)" }
  }
  return [RawPrn]::Send([string]$dev.name, $bytes)
}

$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$puerto/"); $l.Prefixes.Add("http://127.0.0.1:$puerto/")
try { $l.Start() } catch { Write-Host "No se pudo abrir el puerto $puerto (¿ya hay otro puente o Browser Print abierto?): $($_.Exception.Message)"; Start-Sleep 8; exit 1 }
Write-Host "Puente de impresión Dimerc activo en http://localhost:$puerto  (cierra esta ventana para detenerlo)"
while ($l.IsListening) {
  $ctx = $l.GetContext(); $rq = $ctx.Request; $rs = $ctx.Response
  $rs.Headers.Add('Access-Control-Allow-Origin', '*'); $rs.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $rs.Headers.Add('Access-Control-Allow-Headers', '*'); $rs.Headers.Add('Access-Control-Allow-Private-Network', 'true')
  $out = ''; $rs.StatusCode = 200
  try {
    if ($rq.HttpMethod -eq 'OPTIONS') { $rs.StatusCode = 204 }
    elseif ($rq.Url.AbsolutePath -eq '/available') { $out = Json (Listar) }
    elseif ($rq.Url.AbsolutePath -eq '/write' -and $rq.HttpMethod -eq 'POST') {
      $sr = New-Object System.IO.StreamReader($rq.InputStream, [System.Text.Encoding]::UTF8); $cuerpo = $sr.ReadToEnd(); $sr.Close()
      $j = $cuerpo | ConvertFrom-Json; $e = Enviar $j.device ([string]$j.data)
      if ($e) { $rs.StatusCode = 500; $out = Json @{ ok=$false; error=$e }; Write-Host "ERROR: $e" } else { $out = Json @{ ok=$true }; Write-Host ("Impreso en " + $(if ($j.device.ip) { $j.device.ip } else { $j.device.name }) + " · " + (Get-Date -Format 'HH:mm:ss')) }
    } else { $out = Json @{ ok=$true; puente='Dimerc CCP' } }
  } catch { $rs.StatusCode = 500; $out = Json @{ ok=$false; error=$_.Exception.Message } }
  $b = [System.Text.Encoding]::UTF8.GetBytes($out); $rs.ContentType = 'application/json; charset=utf-8'; $rs.ContentLength64 = $b.Length
  try { $rs.OutputStream.Write($b, 0, $b.Length) } catch {}; $rs.Close()
}
