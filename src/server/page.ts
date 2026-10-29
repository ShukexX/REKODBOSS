/** Shell HTML — tiada data kewangan di dalam; semua melalui API bersesi. */
export function page(): string {
  return `<!doctype html>
<html lang="ms">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="theme-color" content="#2c1562" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="robots" content="noindex,nofollow" />
<title>Rekod Boss</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<link rel="stylesheet" href="/static/styles.css" />
<link rel="stylesheet" href="/static/styles-v2.css" />
<link rel="stylesheet" href="/static/app.css" />
</head>
<body>
<div id="root"></div>
<script type="importmap">
{ "imports": { "preact": "/static/vendor/preact.mjs", "preact/hooks": "/static/vendor/hooks.mjs" } }
</script>
<script type="module" src="/static/js/app.js?v=20261029-deletefix2"></script>
<script>
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
</script>
</body>
</html>`
}
