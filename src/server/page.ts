/** Shell HTML — tiada data kewangan di dalam; semua melalui API bersesi. */
export function page(): string {
  return `<!doctype html>
<html lang="ms">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="theme-color" content="#2c1562" />
<meta name="robots" content="noindex,nofollow" />
<title>Rekod Boss</title>
<link rel="stylesheet" href="/static/styles.css" />
<link rel="stylesheet" href="/static/styles-v2.css" />
<link rel="stylesheet" href="/static/app.css" />
</head>
<body>
<div id="root"><div style="min-height:100vh;display:grid;place-items:center"><span class="rb-spin"></span></div></div>
<script type="importmap">
{ "imports": { "preact": "/static/vendor/preact.mjs", "preact/hooks": "/static/vendor/hooks.mjs" } }
</script>
<script type="module" src="/static/js/app.js"></script>
</body>
</html>`
}
