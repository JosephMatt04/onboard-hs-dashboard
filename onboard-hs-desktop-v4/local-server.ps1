# Onboard Corrugated local dashboard. Requires Windows PowerShell 5.1.
$ErrorActionPreference='Stop'
$root=Join-Path $PSScriptRoot 'app'
$dataDir=Join-Path $env:LOCALAPPDATA 'Onboard-HS-Local'
$dataFile=Join-Path $dataDir 'records.json'
$port=38471
$token=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
$maxBytes=300MB
$listener=New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
function Send($context,[int]$code,[byte[]]$bytes,[string]$type) {
  $r=$context.Response
  $r.StatusCode=$code
  $r.ContentType=$type
  $r.Headers.Add('Cache-Control','no-store')
  $r.Headers.Add('X-Content-Type-Options','nosniff')
  $r.Headers.Add('X-Frame-Options','DENY')
  $r.ContentLength64=$bytes.Length
  if($context.Request.HttpMethod -ne 'HEAD'){$r.OutputStream.Write($bytes,0,$bytes.Length)}
  $r.Close()
}
function Reply($ctx,$status,$value,$type='application/json; charset=utf-8'){
  $s=if($value -is [string]){$value}else{ConvertTo-Json -InputObject $value -Depth 100 -Compress}
  Send $ctx $status ([Text.Encoding]::UTF8.GetBytes($s)) $type
}
function Valid($data){
  if($null -eq $data){return $false}
  foreach($k in @('risk','ssow','ppe','incidents','assets')){
    if($null -eq $data.$k -or $data.$k -isnot [array]){return $false}
  }
  foreach($k in @('training','ppeStock')){
    if($null -ne $data.$k -and $data.$k -isnot [array]){return $false}
  }
  return $true
}
$bridge='(function(){"use strict";if(window.onboardDesktop)return;const token="'+$token+'";function call(action,data){const x=new XMLHttpRequest();x.open("POST","/api/"+action,false);x.setRequestHeader("Content-Type","application/json");x.setRequestHeader("X-Onboard-Token",token);try{x.send(JSON.stringify(data||{}));return JSON.parse(x.responseText)}catch(e){return {ok:false,error:e.message}}}window.onboardDesktop=Object.freeze({read:()=>call("read"),write:d=>call("write",d),dataFolder:()=>Promise.resolve("Local Windows dashboard"),openAttachment:(section,id,index)=>Promise.resolve(call("open-attachment",{section,id,index})),updateStatus:()=>Promise.resolve({enabled:false}),checkUpdates:()=>Promise.resolve({enabled:false})})})();'
try {
  $listener.Start()
  Write-Host "Onboard dashboard running at http://127.0.0.1:$port/" -ForegroundColor Green
  Write-Host "Local records: $dataFile"
  Write-Host 'Keep this window open. Press Ctrl+C to stop.'
  Start-Process "http://127.0.0.1:$port/"
  while($listener.IsListening){
    $ctx=$listener.GetContext()
    try{
      $req=$ctx.Request
      if($req.Url.Host -ne '127.0.0.1' -or $req.Url.Port -ne $port){Reply $ctx 403 'Forbidden' 'text/plain';continue}
      $route=$req.Url.AbsolutePath
      if($route.StartsWith('/api/')){
        if($req.HttpMethod -ne 'POST' -or $req.Headers['X-Onboard-Token'] -cne $token -or ($req.Headers['Origin'] -and $req.Headers['Origin'] -ne "http://127.0.0.1:$port")){Reply $ctx 403 @{ok=$false;error='Forbidden'};continue}
        if($route -eq '/api/read'){
          try{
            if(!(Test-Path -LiteralPath $dataFile)){Reply $ctx 200 @{ok=$true;data=$null};continue}
            $content=[IO.File]::ReadAllText($dataFile)
            $record=ConvertFrom-Json -InputObject $content
            if(!(Valid $record)){throw 'Stored data is not a valid dashboard record set'}
            Reply $ctx 200 @{ok=$true;data=$record}
          }catch{Reply $ctx 200 @{ok=$false;error=$_.Exception.Message}}
          continue
        }
        if($route -eq '/api/write'){
          try{
            if($req.ContentLength64 -gt $maxBytes){throw 'Dashboard data exceeds 300 MB'}
            $ms=New-Object IO.MemoryStream
            $buf=New-Object byte[] 65536
            while(($n=$req.InputStream.Read($buf,0,$buf.Length)) -gt 0){
              $ms.Write($buf,0,$n)
              if($ms.Length -gt $maxBytes){throw 'Dashboard data exceeds 300 MB'}
            }
            $payload=[Text.Encoding]::UTF8.GetString($ms.ToArray())
            $record=ConvertFrom-Json -InputObject $payload
            if(!(Valid $record)){throw 'Invalid dashboard record structure'}
            New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
            $temp=$dataFile+'.tmp'
            [IO.File]::WriteAllText($temp,$payload,[Text.UTF8Encoding]::new($false))
            try{
              if(Test-Path -LiteralPath $dataFile){Copy-Item -LiteralPath $dataFile -Destination ($dataFile+'.previous.json') -Force}
              Move-Item -LiteralPath $temp -Destination $dataFile -Force
            }finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
            Reply $ctx 200 @{ok=$true}
          }catch{Reply $ctx 200 @{ok=$false;error=$_.Exception.Message}}
          continue
        }
        if($route -eq '/api/open-attachment'){
          try{
            $ms=New-Object IO.MemoryStream
            $buf=New-Object byte[] 8192
            while(($n=$req.InputStream.Read($buf,0,$buf.Length)) -gt 0){
              $ms.Write($buf,0,$n)
              if($ms.Length -gt 8192){throw 'Invalid attachment request'}
            }
            $selection=ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString($ms.ToArray()))
            $key=[string]$selection.section
            $id=[string]$selection.id
            $indexValue=$selection.index
            if($key -notmatch '^[a-zA-Z][a-zA-Z0-9_]{0,50}
      }
      if($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD'){Reply $ctx 405 'Method not allowed' 'text/plain';continue}
      if($route -eq '/local-bridge.js'){Reply $ctx 200 $bridge 'text/javascript; charset=utf-8';continue}
      $relative=if($route -eq '/'){'index.html'}else{$route.TrimStart('/')}
      $relative=[Uri]::UnescapeDataString($relative)
      if($relative -notmatch '^[a-zA-Z0-9_./-]+$' -or $relative.Contains('..')){Reply $ctx 404 'Not found' 'text/plain';continue}
      $file=[IO.Path]::GetFullPath((Join-Path $root $relative))
      if(!$file.StartsWith(([IO.Path]::GetFullPath($root)+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)){Reply $ctx 404 'Not found' 'text/plain';continue}
      if(!(Test-Path -LiteralPath $file -PathType Leaf)){Reply $ctx 404 'Not found' 'text/plain';continue}
      $type=switch([IO.Path]::GetExtension($file).ToLowerInvariant()){'.html' {'text/html; charset=utf-8'} '.js' {'text/javascript; charset=utf-8'} '.css' {'text/css; charset=utf-8'} '.png' {'image/png'} '.jpg' {'image/jpeg'} '.jpeg' {'image/jpeg'} default {'application/octet-stream'}}
      Send $ctx 200 ([IO.File]::ReadAllBytes($file)) $type
    }catch{
      try{Reply $ctx 500 @{ok=$false;error='Local dashboard error'}}catch{}
      Write-Warning $_.Exception.Message
    }
  }
}catch{
  Write-Host "Unable to start local dashboard: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Check Windows PowerShell permissions and whether port 38471 is already in use.'
  Read-Host 'Press Enter to close'
}finally{if($listener.IsListening){$listener.Stop()};$listener.Close()}
 -or !$id -or $indexValue -isnot [long] -and $indexValue -isnot [int]){throw 'Invalid attachment selection'}
            $index=[int]$indexValue
            if($index -lt 0 -or !(Test-Path -LiteralPath $dataFile)){throw 'Attachment not found'}
            $saved=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($dataFile))
            $list=$saved.$key
            if($list -isnot [array]){throw 'Attachment not found'}
            $item=$list | Where-Object { [string]$_.id -ceq $id } | Select-Object -First 1
            if($null -eq $item -or $null -eq $item.attachments -or $index -ge $item.attachments.Count){throw 'Attachment not found'}
            $attachment=$item.attachments[$index]
            $ext=[IO.Path]::GetExtension([string]$attachment.name).ToLowerInvariant()
            if($ext -notin @('.pdf','.doc','.docx','.xls','.xlsx','.xlsm','.xlsb','.csv','.ods','.jpg','.jpeg','.png','.txt')){throw 'Unsupported attachment format'}
            $encoded=[string]$attachment.data
            if($encoded -notmatch '^data:[^,]*;base64,([a-zA-Z0-9+/=]+)
      }
      if($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD'){Reply $ctx 405 'Method not allowed' 'text/plain';continue}
      if($route -eq '/local-bridge.js'){Reply $ctx 200 $bridge 'text/javascript; charset=utf-8';continue}
      $relative=if($route -eq '/'){'index.html'}else{$route.TrimStart('/')}
      $relative=[Uri]::UnescapeDataString($relative)
      if($relative -notmatch '^[a-zA-Z0-9_./-]+$' -or $relative.Contains('..')){Reply $ctx 404 'Not found' 'text/plain';continue}
      $file=[IO.Path]::GetFullPath((Join-Path $root $relative))
      if(!$file.StartsWith(([IO.Path]::GetFullPath($root)+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)){Reply $ctx 404 'Not found' 'text/plain';continue}
      if(!(Test-Path -LiteralPath $file -PathType Leaf)){Reply $ctx 404 'Not found' 'text/plain';continue}
      $type=switch([IO.Path]::GetExtension($file).ToLowerInvariant()){'.html' {'text/html; charset=utf-8'} '.js' {'text/javascript; charset=utf-8'} '.css' {'text/css; charset=utf-8'} '.png' {'image/png'} '.jpg' {'image/jpeg'} '.jpeg' {'image/jpeg'} default {'application/octet-stream'}}
      Send $ctx 200 ([IO.File]::ReadAllBytes($file)) $type
    }catch{
      try{Reply $ctx 500 @{ok=$false;error='Local dashboard error'}}catch{}
      Write-Warning $_.Exception.Message
    }
  }
}catch{
  Write-Host "Unable to start local dashboard: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Check Windows PowerShell permissions and whether port 38471 is already in use.'
  Read-Host 'Press Enter to close'
}finally{if($listener.IsListening){$listener.Stop()};$listener.Close()}
){throw 'Invalid attachment data'}
            $bytes=[Convert]::FromBase64String($Matches[1])
            if($bytes.Length -eq 0 -or $bytes.Length -gt 15MB){throw 'Attachment exceeds the file size limit'}
            $folder=Join-Path $env:TEMP 'Onboard-HS-Attachment-Views'
            New-Item -ItemType Directory -Force -Path $folder | Out-Null
            $target=Join-Path $folder ('Onboard-view-'+[guid]::NewGuid().ToString('N')+$ext)
            [IO.File]::WriteAllBytes($target,$bytes)
            Start-Process -FilePath $target
            Reply $ctx 200 @{ok=$true;note='Opened a temporary viewing copy; changes will not update the dashboard record'}
          }catch{Reply $ctx 200 @{ok=$false;error=$_.Exception.Message}}
          continue
        }
        Reply $ctx 404 @{ok=$false;error='Unknown operation'};continue
      }
      if($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD'){Reply $ctx 405 'Method not allowed' 'text/plain';continue}
      if($route -eq '/local-bridge.js'){Reply $ctx 200 $bridge 'text/javascript; charset=utf-8';continue}
      $relative=if($route -eq '/'){'index.html'}else{$route.TrimStart('/')}
      $relative=[Uri]::UnescapeDataString($relative)
      if($relative -notmatch '^[a-zA-Z0-9_./-]+$' -or $relative.Contains('..')){Reply $ctx 404 'Not found' 'text/plain';continue}
      $file=[IO.Path]::GetFullPath((Join-Path $root $relative))
      if(!$file.StartsWith(([IO.Path]::GetFullPath($root)+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)){Reply $ctx 404 'Not found' 'text/plain';continue}
      if(!(Test-Path -LiteralPath $file -PathType Leaf)){Reply $ctx 404 'Not found' 'text/plain';continue}
      $type=switch([IO.Path]::GetExtension($file).ToLowerInvariant()){'.html' {'text/html; charset=utf-8'} '.js' {'text/javascript; charset=utf-8'} '.css' {'text/css; charset=utf-8'} '.png' {'image/png'} '.jpg' {'image/jpeg'} '.jpeg' {'image/jpeg'} default {'application/octet-stream'}}
      Send $ctx 200 ([IO.File]::ReadAllBytes($file)) $type
    }catch{
      try{Reply $ctx 500 @{ok=$false;error='Local dashboard error'}}catch{}
      Write-Warning $_.Exception.Message
    }
  }
}catch{
  Write-Host "Unable to start local dashboard: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Check Windows PowerShell permissions and whether port 38471 is already in use.'
  Read-Host 'Press Enter to close'
}finally{if($listener.IsListening){$listener.Stop()};$listener.Close()}
