export function setupPage(token: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>餐饮运营管理系统 · 本地部署助手</title>
  <style>
    :root { color-scheme: light; --primary:#1768e5; --primary2:#0f4fb4; --text:#172033; --muted:#637087; --line:#dce3ee; --bg:#f4f7fb; --card:#fff; --ok:#16805b; --warn:#a45b08; --bad:#c93636; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--text); background:radial-gradient(circle at 10% 0,#e9f2ff 0,transparent 36%),var(--bg); font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; }
    button,input { font:inherit; }
    .shell { width:min(1080px,calc(100% - 32px)); margin:32px auto 72px; }
    .hero { color:#fff; padding:30px 34px; border-radius:18px; background:linear-gradient(135deg,#102b57,#1768e5); box-shadow:0 18px 55px rgba(29,73,143,.18); }
    .hero h1 { margin:0 0 5px; font-size:28px; letter-spacing:.5px; }
    .hero p { margin:0; color:#dceaff; }
    .local { display:inline-flex; margin-top:16px; padding:5px 10px; border:1px solid rgba(255,255,255,.35); border-radius:999px; font-size:12px; }
    .notice { margin:18px 0; padding:13px 16px; border:1px solid #bcd3f6; border-radius:10px; background:#eef5ff; color:#244a7f; }
    .card { margin-top:18px; padding:24px; border:1px solid var(--line); border-radius:14px; background:var(--card); box-shadow:0 6px 22px rgba(44,58,82,.05); }
    .card h2 { margin:0 0 18px; font-size:19px; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 20px; }
    .span2 { grid-column:1/-1; }
    label { display:block; color:#38445a; font-weight:600; }
    label small { display:block; margin-top:2px; color:var(--muted); font-weight:400; }
    input { width:100%; height:42px; margin-top:7px; padding:0 12px; color:var(--text); border:1px solid #cbd5e3; border-radius:8px; background:#fff; outline:none; transition:.15s; }
    input:focus { border-color:var(--primary); box-shadow:0 0 0 3px rgba(23,104,229,.11); }
    input[type=checkbox] { width:17px; height:17px; margin:0 7px 0 0; padding:0; box-shadow:none; vertical-align:-3px; }
    details { border:1px dashed #c8d3e2; border-radius:9px; padding:11px 13px; }
    summary { cursor:pointer; font-weight:600; }
    .actions { display:flex; gap:12px; align-items:center; margin-top:22px; }
    button { min-height:42px; padding:0 20px; border:0; border-radius:8px; cursor:pointer; font-weight:650; }
    button.primary { color:#fff; background:var(--primary); }
    button.primary:hover { background:var(--primary2); }
    button.secondary { color:#154b96; background:#eaf2ff; }
    button:disabled { cursor:not-allowed; opacity:.55; }
    .error { margin-top:14px; color:var(--bad); white-space:pre-wrap; }
    .muted { color:var(--muted); }
    .preflight { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
    .check { padding:11px; border:1px solid var(--line); border-radius:9px; background:#fafcff; }
    .check b { display:block; }
    .check.ok b { color:var(--ok); } .check.bad b { color:var(--bad); } .check.warn b { color:var(--warn); }
    .steps { margin:0; padding:0; list-style:none; }
    .step { display:grid; grid-template-columns:24px 1fr auto; gap:10px; align-items:start; padding:11px 0; border-bottom:1px solid #edf0f5; }
    .step:last-child { border-bottom:0; }
    .dot { width:18px; height:18px; margin-top:2px; border-radius:50%; border:2px solid #a9b5c6; }
    .running .dot { border-color:var(--primary); border-top-color:transparent; animation:spin .8s linear infinite; }
    .success .dot { border:0; background:var(--ok); }
    .success .dot:after { content:"✓"; display:block; color:#fff; font-size:12px; text-align:center; line-height:18px; }
    .failed .dot { border:0; background:var(--bad); }
    .failed .dot:after { content:"!"; display:block; color:#fff; text-align:center; line-height:18px; font-weight:700; }
    .step time { color:var(--muted); font-size:12px; }
    .result { padding:18px; border:1px solid #b9e0d0; border-radius:10px; background:#effaf5; }
    .result h3 { margin:0 0 8px; color:var(--ok); }
    .hidden { display:none!important; }
    code { padding:2px 5px; border-radius:4px; background:#edf1f7; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media(max-width:760px) { .grid,.preflight { grid-template-columns:1fr; } .shell { width:min(100% - 20px,1080px); margin-top:10px; } .hero,.card { padding:20px; } }
  </style>
</head>
<body>
<main class="shell">
  <section class="hero">
    <h1>本地部署助手</h1>
    <p>初始化数据库、超级管理员和 macOS 登录启动服务</p>
    <span class="local">仅允许本机访问 · 127.0.0.1</span>
  </section>
  <div class="notice">请保持本页面和启动 setup 的终端窗口开启。密码不会显示在日志中，建库管理员凭据不会保存。</div>
  <section class="card">
    <h2>环境检查</h2>
    <div id="preflight" class="preflight"><span class="muted">正在检查…</span></div>
  </section>

  <div id="installedPanel" class="hidden">
    <section class="card">
      <h2>当前设备已经安装</h2>
      <div id="installedSummary" class="result"></div>
      <div class="actions"><button id="repairButton" class="primary" type="button">检查升级并修复部署</button><a id="openApp" href="http://127.0.0.1:3000/lead_pc/login" target="_blank">打开系统</a></div>
    </section>
  </div>

  <form id="setupForm" class="hidden">
    <section class="card">
      <h2>1. 应用设置</h2>
      <div class="grid">
        <label>系统名称<input name="platformName" value="餐饮运营管理" maxlength="50" required /></label>
        <label>本机端口<small>系统只监听 127.0.0.1</small><input name="appPort" type="number" value="3000" min="1024" max="65535" required /></label>
      </div>
    </section>

    <section class="card">
      <h2>2. MySQL 数据库</h2>
      <div class="grid">
        <label>数据库地址<input name="dbHost" value="127.0.0.1" required /></label>
        <label>端口<input name="dbPort" type="number" value="3306" min="1" max="65535" required /></label>
        <label>数据库名称<small>仅允许初始化空数据库</small><input name="dbName" value="canyin_system" pattern="[A-Za-z0-9_]+" required /></label>
        <label>应用数据库账号<input name="dbUser" autocomplete="username" required /></label>
        <label class="span2">应用数据库密码<input name="dbPassword" type="password" autocomplete="current-password" /></label>
        <details class="span2"><summary>建库管理员账号（选填）</summary><div class="grid" style="margin-top:13px"><label>管理员账号<input name="dbAdminUser" autocomplete="off" /></label><label>管理员密码<input name="dbAdminPassword" type="password" autocomplete="new-password" /></label></div><p class="muted">应用账号没有 CREATE DATABASE 权限时填写。该凭据不会保存。</p></details>
      </div>
    </section>

    <section class="card">
      <h2>3. 首个超级管理员</h2>
      <div class="grid">
        <label>登录账号<input name="adminUsername" value="admin" autocomplete="off" readonly required /></label>
        <label>管理员姓名<input name="adminRealName" value="系统管理员" required /></label>
        <label>联系电话<input name="adminPhone" autocomplete="tel" /></label>
        <span></span>
        <label>登录密码<small>默认密码：1qaz2wsx；建议部署完成后立即修改</small><input name="adminPassword" type="password" value="1qaz2wsx" autocomplete="new-password" required /></label>
        <label>确认密码<input name="adminPasswordConfirm" type="password" value="1qaz2wsx" autocomplete="new-password" required /></label>
      </div>
    </section>

    <section class="card">
      <h2>4. 确认安装</h2>
      <label style="font-weight:400"><input id="confirm" type="checkbox" required />我确认目标数据库为新建空库，并允许 setup 创建配置文件、数据库结构和登录启动服务。</label>
      <div class="actions"><button id="installButton" class="primary" type="submit">开始部署并验证</button><span class="muted">通常需要 1–5 分钟</span></div>
      <div id="formError" class="error"></div>
    </section>
  </form>

  <section id="progressPanel" class="card hidden">
    <h2 id="progressTitle">正在部署</h2>
    <ol id="steps" class="steps"></ol>
    <div id="jobError" class="error"></div>
    <div id="jobResult" class="result hidden"></div>
  </section>
</main>
<script>
const TOKEN=${JSON.stringify(token)};
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
let statusData=null;
async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json","X-Setup-Token":TOKEN,...(options.headers||{})}});
  const data=await response.json().catch(()=>({message:"服务返回了无法解析的结果"}));
  if(!response.ok) throw new Error(data.message||"请求失败");
  return data;
}
function renderPreflight(items){
  $("preflight").innerHTML=items.map(item=>'<div class="check '+esc(item.status)+'"><b>'+(item.status==="ok"?"✓":item.status==="warn"?"!":"×")+' '+esc(item.label)+'</b><span>'+esc(item.detail)+'</span></div>').join("");
}
async function loadStatus(){
  try{
    statusData=await api("/api/status"); renderPreflight(statusData.preflight);
    if(statusData.installed){
      $("installedPanel").classList.remove("hidden");
      $("setupForm").classList.add("hidden");
      const s=statusData.state; $("installedSummary").innerHTML='<h3>安装状态：'+(s.status==="installed"?"正常":"需要检查")+'</h3><div>应用版本：'+esc(s.appVersion)+' · 数据库版本：'+esc(s.databaseSchemaVersion)+' · 配置版本：'+esc(s.configSchemaVersion)+'</div><div>访问地址：<code>'+esc(s.appUrl)+'</code></div><div>安装时间：'+esc(new Date(s.installedAt).toLocaleString())+'</div>';
      $("openApp").href=s.appUrl+"/lead_pc/login";
    }else{
      $("setupForm").classList.remove("hidden");
    }
  }catch(error){ $("preflight").innerHTML='<div class="error">'+esc(error.message)+'</div>'; }
}
function formPayload(){
  const form=new FormData($("setupForm"));
  const password=String(form.get("adminPassword")||"");
  if(password!==String(form.get("adminPasswordConfirm")||"")) throw new Error("两次输入的管理员密码不一致");
  return {
    platformName:String(form.get("platformName")||""), appPort:Number(form.get("appPort")),
    database:{host:String(form.get("dbHost")||""),port:Number(form.get("dbPort")),name:String(form.get("dbName")||""),user:String(form.get("dbUser")||""),password:String(form.get("dbPassword")||""),adminUser:String(form.get("dbAdminUser")||"")||undefined,adminPassword:String(form.get("dbAdminPassword")||"")||undefined},
    administrator:{username:String(form.get("adminUsername")||""),realName:String(form.get("adminRealName")||""),phone:String(form.get("adminPhone")||"")||undefined,password}
  };
}
function renderJob(job){
  $("progressPanel").classList.remove("hidden");
  $("steps").innerHTML=job.steps.map(step=>'<li class="step '+esc(step.status)+'"><span class="dot"></span><div><b>'+esc(step.label)+'</b>'+(step.detail?'<div class="muted">'+esc(step.detail)+'</div>':"")+'</div><time>'+esc(new Date(step.at).toLocaleTimeString())+'</time></li>').join("");
  $("jobError").textContent=job.error||"";
  if(job.status==="success"){
    $("jobResult").classList.remove("hidden");
    $("jobResult").innerHTML='<h3>部署和验证全部完成</h3><div>访问地址：<a href="'+esc(job.result.appUrl)+'/lead_pc/login" target="_blank">'+esc(job.result.appUrl)+'/lead_pc/login</a></div><div>主站与调度器将在每次登录 macOS 后自动启动。</div><div class="muted">R2 和数据库自动备份可在登录系统后按需配置。</div>';
    $("progressTitle").textContent="部署完成";
  }else if(job.status==="failed"){
    $("progressTitle").textContent="部署需要处理";
    $("jobResult").classList.remove("hidden");
    $("jobResult").innerHTML='<h3 style="color:#c93636">安装未完成</h3><div>已完成的步骤可以安全保留。请根据错误修正配置后重新打开本页面继续，setup会识别同一数据库的未完成安装。</div><div class="actions"><button class="secondary" type="button" onclick="location.reload()">重新填写并继续</button></div>';
  }
}
async function watchJob(jobId){
  while(true){
    const job=await api("/api/jobs/"+jobId); renderJob(job);
    if(job.status!=="running") break;
    await new Promise(resolve=>setTimeout(resolve,900));
  }
}
$("setupForm").addEventListener("submit",async event=>{
  event.preventDefault(); $("formError").textContent="";
  const button=$("installButton"); button.disabled=true;
  try{ const result=await api("/api/install",{method:"POST",body:JSON.stringify(formPayload())}); $("setupForm").classList.add("hidden"); await watchJob(result.jobId); }
  catch(error){ $("formError").textContent=error.message; button.disabled=false; }
});
$("repairButton").addEventListener("click",async()=>{
  $("repairButton").disabled=true; $("installedPanel").classList.add("hidden");
  try{ const result=await api("/api/repair",{method:"POST",body:"{}"}); await watchJob(result.jobId); }
  catch(error){ $("installedPanel").classList.remove("hidden"); $("repairButton").disabled=false; alert(error.message); }
});
loadStatus();
</script>
</body></html>`;
}
