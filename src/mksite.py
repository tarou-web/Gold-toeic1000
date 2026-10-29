import json
t=open('src/template.html',encoding='utf-8').read()
d=open('src/data.json',encoding='utf-8').read()
i=t.index('<div class="wrap">')
headpart,bodypart=t[:i],t[i:]
headpart=headpart.replace('<meta name="claude:viewport-fit-sides" content="cover">\n','')
reset="""<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
html,body{overflow-x:clip;overscroll-behavior-x:none}
body{margin:0;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}
*{touch-action:manipulation}
img{max-width:100%}[hidden]{display:none!important}
</style>
"""
html=f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="フレーズ1000">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131f24" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon-parrot.png">
<link rel="icon" href="icon-192-parrot.png">
{reset}{headpart}</head>
<body>
{bodypart.replace('__DATA__',d)}
<script>
if('serviceWorker' in navigator){{
  const had=!!navigator.serviceWorker.controller; let reloaded=false;
  // when a newer version takes over, reload once so the update shows immediately
  navigator.serviceWorker.addEventListener('controllerchange',()=>{{if(had&&!reloaded){{reloaded=true;location.reload()}}}});
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js',{{updateViaCache:'none'}}).then(r=>r.update()).catch(()=>{{}}));
}}
</script>
</body>
</html>
"""
open('index.html','w',encoding='utf-8').write(html)
json.dump({"name":"TOEICフレーズ1000","short_name":"フレーズ1000","start_url":"./","scope":"./","display":"standalone",
 "background_color":"#ffffff","theme_color":"#4cc21c","lang":"ja","orientation":"portrait",
 "icons":[{"src":"icon-192-parrot.png","sizes":"192x192","type":"image/png"},{"src":"icon-512-parrot.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]},
 open('manifest.webmanifest','w',encoding='utf-8'),ensure_ascii=False,indent=2)
