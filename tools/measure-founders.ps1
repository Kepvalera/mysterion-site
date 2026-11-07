param([ValidateSet('baseline','after','assets')][string]$Mode='after')
$ErrorActionPreference='Stop'
$siteUri=([uri](Join-Path $pwd 'index.html')).AbsoluteUri
$dir=Join-Path $pwd 'output/founders-performance';[IO.Directory]::CreateDirectory($dir)|Out-Null
$profile=Join-Path $env:TEMP ('myst-perf-'+[guid]::NewGuid())
$p=Start-Process 'C:/Program Files/Google/Chrome/Application/chrome.exe' -ArgumentList @('--headless','--no-first-run','--allow-file-access-from-files','--remote-debugging-port=0',"--user-data-dir=$profile",'about:blank') -WindowStyle Hidden -PassThru
try {
for($i=0;$i -lt 100 -and !(Test-Path "$profile/DevToolsActivePort");$i++){Start-Sleep -Milliseconds 100}
$port=(Get-Content "$profile/DevToolsActivePort")[0];$page=Invoke-RestMethod -Method Put "http://localhost:$port/json/new?about:blank"
$socket=[Net.WebSockets.ClientWebSocket]::new();$socket.ConnectAsync([uri]$page.webSocketDebuggerUrl,[Threading.CancellationToken]::None).GetAwaiter().GetResult()|Out-Null
$script:id=0;$script:errors=0
function Cdp($method,$params=@{}) {
$script:id++;$id=$script:id;$b=[Text.Encoding]::UTF8.GetBytes((@{id=$id;method=$method;params=$params}|ConvertTo-Json -Depth 15 -Compress));$socket.SendAsync([ArraySegment[byte]]::new($b),[Net.WebSockets.WebSocketMessageType]::Text,$true,[Threading.CancellationToken]::None).GetAwaiter().GetResult()|Out-Null
do{$m=[IO.MemoryStream]::new();$buf=New-Object byte[] 65536;do{$r=$socket.ReceiveAsync([ArraySegment[byte]]::new($buf),[Threading.CancellationToken]::None).GetAwaiter().GetResult();$m.Write($buf,0,$r.Count)}while(!$r.EndOfMessage);$v=[Text.Encoding]::UTF8.GetString($m.ToArray())|ConvertFrom-Json;if($v.method -eq 'Runtime.exceptionThrown'){$script:errors++}}while($v.id -ne $id);if($v.error){throw ($v.error|ConvertTo-Json)};return $v.result
}
function Js($s){$r=Cdp 'Runtime.evaluate' @{expression=$s;returnByValue=$true;awaitPromise=$true};if($r.exceptionDetails){throw ($r.exceptionDetails|ConvertTo-Json -Depth 8)};return $r.result.value}
Cdp 'Page.enable'|Out-Null;Cdp 'Runtime.enable'|Out-Null;Cdp 'Performance.enable'|Out-Null
Cdp 'Page.addScriptToEvaluateOnNewDocument' @{source='window.__tasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.__tasks.push({start:e.startTime,duration:e.duration})}).observe({type:"longtask",buffered:true});'}|Out-Null
$results=@()
if($Mode -eq 'assets') {
 Cdp 'Page.navigate' @{url=$siteUri}|Out-Null
 Start-Sleep -Seconds 2
 foreach($size in @(480,960)){
 $data=Js "(async()=>{const i=new Image();i.src='assets/clouds/pearl-cloud-source.png';await i.decode();const c=document.createElement('canvas');c.width=$size;c.height=Math.round($size*i.height/i.width);c.getContext('2d').drawImage(i,0,0,c.width,c.height);return c.toDataURL('image/webp',.86).split(',')[1]})()"
 [IO.File]::WriteAllBytes((Join-Path $pwd "assets/clouds/pearl-cloud-$size.webp"),[Convert]::FromBase64String($data))
 }
 Cdp 'Page.close'|Out-Null
 return
}
foreach($w in @(390,1440)) {
Cdp 'Emulation.setDeviceMetricsOverride' @{width=$w;height=1200;deviceScaleFactor=1;mobile=($w -lt 500)}|Out-Null
Cdp 'Page.navigate' @{url=$siteUri}|Out-Null
Js 'new Promise(resolve=>{let n=0;const t=setInterval(()=>{if(document.querySelectorAll(".founders-star").length||n++>180){clearInterval(t);resolve(true)}},100)})'|Out-Null
Js 'document.fonts.ready.then(()=>{setLanguage("ru");document.querySelector("#founders").scrollIntoView({block:"start",behavior:"instant"});return Promise.all([...document.querySelectorAll("#founders img")].filter(i=>getComputedStyle(i.closest("picture")||i).display!=="none").map(i=>i.decode().catch(()=>{})));}).then(()=>true)'|Out-Null
Start-Sleep -Seconds 3
$startup=Js '({longTasks:__tasks.filter(e=>e.start<5000),heap:performance.memory?performance.memory.usedJSHeapSize:null})'
foreach($phase in @('idle','scroll')) {
$before=Cdp 'Performance.getMetrics'
$js=@'
(async()=>{const scrollTest=PHASE;const start=performance.now(),base=scrollY,deltas=[];let last=0;const taskStart=__tasks.length;await new Promise(resolve=>{function tick(now){if(last)deltas.push(now-last);last=now;if(scrollTest)window.scrollTo({top:base+Math.sin((now-start)/900)*110,behavior:'instant'});if(now-start<4000)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick)});const sorted=[...deltas].sort((a,b)=>a-b),sum=deltas.reduce((a,b)=>a+b,0);return {fps:1000*deltas.length/sum,frames:deltas.length,meanMs:sum/deltas.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...deltas),framesOver33:deltas.filter(d=>d>33.5).length,framesOver50:deltas.filter(d=>d>50).length,longTasks:__tasks.slice(taskStart),heap:performance.memory?performance.memory.usedJSHeapSize:null};})()
'@
$timing=Js ($js.Replace('PHASE',$(if($phase -eq 'scroll'){'true'}else{'false'})))
$after=Cdp 'Performance.getMetrics'
$timing | Add-Member -NotePropertyName cdpJSHeapBytes -NotePropertyValue (($after.metrics|Where-Object name -eq 'JSHeapUsedSize').value)
$delta=@{};foreach($name in @('TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration')){$a=($after.metrics|Where-Object name -eq $name).value;$b=($before.metrics|Where-Object name -eq $name).value;$delta[$name]=$a-$b}
$results+=@{width=$w;phase=$phase;timing=$timing;mainThreadSeconds=$delta;startup=$startup}
}
if($Mode -eq 'after'){
Js 'document.querySelector("#founders").scrollIntoView({block:"start",behavior:"instant"});true'|Out-Null
$previous=0
foreach($sec in @(0,3,6,10)){
if($sec -gt 0){Start-Sleep -Seconds ($sec-$previous)};$previous=$sec
$state=Js '(()=>{const f=document.querySelector("#founders"),r=f.querySelector(".founders-cutout").getBoundingClientRect();return {clouds:[...f.querySelectorAll(".founders-cloud")].map(i=>({loaded:i.querySelector("img").complete&&i.querySelector("img").naturalWidth>0,source:i.querySelector("img").currentSrc,transform:getComputedStyle(i).transform,filter:getComputedStyle(i).filter,opacity:getComputedStyle(i).opacity})),person:[r.x,r.y,r.width,r.height],overflow:document.documentElement.scrollWidth>innerWidth+1}})()'
Write-Output ($state|ConvertTo-Json -Depth 6 -Compress)
$shot=Cdp 'Page.captureScreenshot' @{format='png';captureBeyondViewport=$false};[IO.File]::WriteAllBytes((Join-Path $dir "clouds-$w-$($sec)s.png"),[Convert]::FromBase64String($shot.data))
}
foreach($lang in @('ru','en','de')){Js "setLanguage('$lang');({lang:document.documentElement.lang,color:getComputedStyle(document.querySelector('#founders-heading')).color,overflow:document.documentElement.scrollWidth>innerWidth+1})"|ConvertTo-Json -Compress}
Js 'scrollTo({top:0,behavior:"instant"});true'|Out-Null;Start-Sleep -Milliseconds 250
Js '({offscreen:getComputedStyle(document.querySelector(".founders-cloud")).animationPlayState})'|ConvertTo-Json
Js 'document.querySelector("#founders").scrollIntoView({behavior:"instant"});true'|Out-Null;Start-Sleep -Milliseconds 250
Js '({resumed:getComputedStyle(document.querySelector(".founders-cloud")).animationPlayState})'|ConvertTo-Json
Cdp 'Emulation.setEmulatedMedia' @{features=@(@{name='prefers-reduced-motion';value='reduce'})}|Out-Null
Js '({reduced:document.querySelector("#founders").getAnimations({subtree:true}).length})'|ConvertTo-Json
Cdp 'Emulation.setEmulatedMedia' @{features=@()}|Out-Null
}
}
$report=@{mode=$Mode;browser='Headless Chrome; desktop host; device metrics emulation, not physical iPhone';errors=$script:errors;results=$results};$json=$report|ConvertTo-Json -Depth 15;[IO.File]::WriteAllText((Join-Path $dir "$Mode.json"),$json);Write-Output $json
Cdp 'Page.close'|Out-Null
} finally {if($socket){$socket.Dispose()};if(!$p.HasExited){$p.Kill()}}
