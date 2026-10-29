$secure = Read-Host 'Paste PostgreSQL connection URL (hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.wrangler-config'
  npm run dev -- --host 127.0.0.1 --port 3002
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:XDG_CONFIG_HOME -ErrorAction SilentlyContinue
}

