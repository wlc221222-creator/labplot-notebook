(() => {
  "use strict";
  const M = globalThis.LabModel;
  const C = globalThis.LabCharts;
  const el = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const drawings = {
    plus:'<path d="M12 5v14M5 12h14"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V4H4v12h4"/>',
    heat:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    chart:'<path d="M3 4v16h18M6 15l4-5 4 2 6-7"/>',
    line:'<path d="m3 16 5-7 5 4 7-8"/>',
    bars:'<path d="M4 20v-7h4v7zm6 0V7h4v13zm6 0V3h4v17z"/>',
    scatter:'<circle cx="5" cy="16" r="1.6"/><circle cx="11" cy="10" r="1.6"/><circle cx="16" cy="13" r="1.6"/><circle cx="20" cy="5" r="1.6"/>',
    notebook:'<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M9 3v18M3 7h4M3 12h4M3 17h4"/>',
    paper:'<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h6"/>',
    compare:'<path d="M3 7h14m-3-3 3 3-3 3M21 17H7m3-3-3 3 3 3"/>',
    table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 9v11"/>',
    sliders:'<path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
    download:'<path d="M12 3v11m-4-4 4 4 4-4M4 15v5h16v-5"/>',
    upload:'<path d="M12 15V4m-4 4 4-4 4 4M4 15v5h16v-5"/>',
    external:'<path d="M13 5h6v6m0-6-9 9M10 6H5v13h13v-6"/>',
    edit:'<path d="m4 16 10-10 4 4L8 20l-5 1zM13 7l4 4M16 4l2-2 4 4-2 2"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/>',
    drive:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 14h18m-5 3h2"/>',
    menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    pin:'<path d="m16 3 5 5-3 1-4 4 1 4-2 2-4-4-6 6 6-6-4-4 2-2 4 1 4-4z"/>'
  };
  const icon = name => `<svg aria-hidden="true" class="ico" viewBox="0 0 24 24">${drawings[name] || ""}</svg>`;
  document.querySelectorAll("[data-icon]").forEach(node => {
    const temp = document.createElement("template"); temp.innerHTML = icon(node.dataset.icon);
    if (node.className) temp.content.firstElementChild.classList.add(...node.classList);
    node.replaceWith(temp.content);
  });

  const embedded = document.getElementById("embedded-book");
  const suffix = embedded ? "." + embedded.dataset.key : "";
  const BOOK = "gewulab.notebook.v1" + suffix, ACTIVE = "gewulab.active.v1" + suffix;
  let book = {version:1, experiments:M.samples()}, activeId = "", dirty = false, warning = "";
  let pendingRecovery = false, undoState = null, heatLock = null;
  if (embedded) {
    try { book = unpack(embedded.textContent); activeId = book.activeId || ""; }
    catch { warning = "内嵌实验册无效，已载入论文样例。"; }
  }
  function unpack(raw) {
    const value = JSON.parse(raw);
    if (!M.validBook(value)) throw Error("实验册格式不兼容");
    return value;
  }
  function persist() {
    try {
      localStorage.setItem(BOOK, JSON.stringify(book)); dirty = false;
    } catch {
      dirty = true; warning = "浏览器未能保存当前改动。请先导出 CSV 备份数据，再检查存储空间或浏览器权限。";
    }
  }
  try {
    const raw = localStorage.getItem(BOOK);
    if (raw === null) persist();
    else {
      try { book = unpack(raw); }
      catch {
        const backup = BOOK + ".backup." + Date.now();
        localStorage.setItem(backup, raw);
        pendingRecovery = true;
        warning = "原实验册格式异常，已在当前浏览器保留原始备份。此页已载入论文样例。";
        persist();
      }
    }
    activeId = sessionStorage.getItem(ACTIVE) || localStorage.getItem(ACTIVE) || activeId;
  } catch {
    dirty = true; warning = "当前页面无法访问浏览器存储。编辑后可导出 CSV 保存数据。";
  }
  const current = () => book.experiments.find(p => p.id === activeId);
  function normalizeActive() {
    if (!current()) activeId = book.experiments[0]?.id || "";
  }
  function rememberActive() {
    try { sessionStorage.setItem(ACTIVE,activeId); localStorage.setItem(ACTIVE,activeId); } catch {}
  }
  const dataFingerprint = state => JSON.stringify(state.experiments.map(p => ({id:p.id,title:p.title,description:p.description,columns:p.columns,rows:p.rows,source:p.source,modified:p.modified})));
  function mutate(action, undoable = false) {
    if (!dirty) {
      try {
        const latest = localStorage.getItem(BOOK);
        if (latest !== null) book = unpack(latest);
      } catch { throw Error("无法读取最新实验册，请刷新后重试。"); }
    }
    const before = undoable ? {book:structuredClone(book),activeId} : null;
    action(book); normalizeActive(); persist();
    if (before && dataFingerprint(before.book)!==dataFingerprint(book)) undoState={...before,after:dataFingerprint(book)};
    if (!dirty && !pendingRecovery) warning = "";
    rememberActive(); render();
  }
  function changeExperiment(id, update, undoable = false) {
    mutate(state => {
      const experiment = state.experiments.find(p => p.id === id);
      if (!experiment) throw Error("这份实验已被移除，请重新选择。");
      update(experiment);
    }, undoable);
  }
  function editCurrent(update) {
    try { changeExperiment(activeId, update); } catch (error) { notify(error.message); render(); }
  }
  function markChanged(p) { if (p.source) p.modified = true; }
  function undo() {
    if(!undoState)return;
    try {
      const latest=dirty?book:unpack(localStorage.getItem(BOOK)||JSON.stringify(book));
      if(dataFingerprint(latest)!==undoState.after)throw Error("数据已在其他窗口更改，无法撤销。请先备份当前实验册。");
      book=undoState.book;activeId=undoState.activeId;undoState=null;heatLock=null;
      normalizeActive();persist();rememberActive();render();notify("已撤销上一步数据修改");
    } catch(error){notify(error.message);}
  }
  el("undo").onclick=undo;
  function readableUnit(unit) { return unit === "%" ? "%" : (unit ? " " + unit : ""); }
  function valueOf(raw,unit) { const n = M.number(raw); return n === null ? "—" : M.fmt(n) + readableUnit(unit); }
  function signed(value) { return value === null || !Number.isFinite(value) ? "—" : (value > 0 ? "+" : "") + M.fmt(value); }
  const difference = M.difference;
  const fieldName = column => column.name + (column.unit ? " (" + column.unit + ")" : "");
  const option = (value,label) => `<option value="${escape(value)}">${escape(label)}</option>`;
  function setOptions(select, pairs, value) {
    select.innerHTML = pairs.map(([key,label]) => option(key,label)).join("");
    select.value = String(value ?? ""); select.disabled = pairs.length === 0;
  }
  function notify(message) {
    el("toast").textContent=message; el("toast").hidden=false;
    clearTimeout(notify.timer); notify.timer=setTimeout(()=>{el("toast").hidden=true;},3200);
  }
  function closeMenu() {
    document.body.classList.remove("side-open"); el("scrim").hidden=true; el("menu").setAttribute("aria-expanded","false");
  }
  function updateLibrary() {
    el("book-count").textContent=String(book.experiments.length).padStart(2,"0");
    el("library").innerHTML=book.experiments.map(p=>`<button class="library-item" data-book="${escape(p.id)}" aria-current="${p.id===activeId}">
      <span class="book-symbol">${icon(p.source ? "paper" : "notebook")}</span><span class="book-label"><b>${escape(p.title)}</b><small>${p.rows.length} 条记录 · ${p.columns.length} 项指标</small></span></button>`).join("");
  }
  function render() {
    el("heat-preview").hidden=true;
    el("undo").disabled=!undoState;
    normalizeActive(); updateLibrary();
    el("save-status").innerHTML=`<span class="status-dot${dirty ? " warn" : ""}"></span>${dirty ? "仅暂存在页面" : "已保存到本机"}`;
    el("warning").hidden=!warning; el("warning").textContent=warning;
    const p=current(); el("workspace").hidden=!p; el("empty-library").hidden=!!p;
    if (!p) return;
    el("title").textContent=p.title; el("description").textContent=p.description; el("description").hidden=!p.description;
    const source=p.source;
    const safeSource=source && /^https:\/\//i.test(source.url);
    const original=M.samples().find(sample=>sample.id===p.id && sample.source?.url===source?.url);
    el("meta").innerHTML=`<span class="meta-badge">${icon(source?"paper":"notebook")}${source ? (p.modified ? "已编辑的论文数据" : "论文数据") : "自建实验"}</span>${p.modified&&original?'<button id="reset-sample" class="copy-label">↶ 还原原值</button>':''}${safeSource ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)} ${icon("external")}</a>` : ""}`;
    const reset=el("reset-sample");if(reset)reset.onclick=()=>resetSample(p.id);
    el("plot-title").textContent=p.chart.title || "结果图表";
    document.querySelectorAll("[data-type]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.type===p.chart.type)));
    el("mode").value=p.chart.mode; el("x-wrap").hidden=p.chart.type!=="scatter";
    el("y-caption").textContent=p.chart.type==="scatter" ? "Y 轴" : "指标";
    const cols=p.columns.map((c,i)=>[i,fieldName(c)]);
    setOptions(el("x-axis"),cols,p.chart.x); setOptions(el("y-axis"),cols,p.chart.y);
    const rows=p.rows.map(r=>[r.id,r.label]);
    setOptions(el("baseline"),rows,p.baseline); setOptions(el("selected"),rows,p.selected);
    el("swap-pair").disabled=!p.baseline||!p.selected||p.baseline===p.selected;
    renderComparison(p); renderTable(p); renderPlot();
  }
  function renderComparison(p) {
    const a=p.rows.find(r=>r.id===p.selected), b=p.rows.find(r=>r.id===p.baseline);
    el("copy-result").disabled=!a || !b || M.compare(p,a.id,b.id).dy===null;
    if (!a || !b) {el("comparison-readout").innerHTML='<p class="table-help">'+(p.rows.length?'选择两组配置，或点击热图锁定对照。':'添加记录后即可选择两组配置进行比较。')+'</p>';return;}
    const i=p.chart.y,c=p.columns[i],d=M.compare(p,a.id,b.id).dy;
    const changes=p.columns.map((column,index)=>{
      const av=M.number(a.values[index]),bv=M.number(b.values[index]),diff=difference(av,bv);
      return `<li><button data-metric="${index}" aria-pressed="${index===i}" title="${escape(column.name)}：基线 ${escape(valueOf(b.values[index],column.unit))}，对照 ${escape(valueOf(a.values[index],column.unit))}"><span class="score-name">${escape(column.name)}</span><span class="score-current">${escape(valueOf(a.values[index],column.unit))}</span><span class="score-val">${escape(signed(diff))}</span></button></li>`;
    }).join("");
    el("comparison-readout").innerHTML=`<div class="readout"><div class="cap">${escape(c.name)} · 对照减基线</div><div class="big-delta"><b>${escape(signed(d))}</b><small>${d===null?"":escape(M.deltaUnit(c.unit))}</small></div><div class="raw-pair">${escape(b.label)} ${escape(valueOf(b.values[i],c.unit))} → ${escape(a.label)} ${escape(valueOf(a.values[i],c.unit))}</div></div><div class="score-head"><span>指标</span><span>对照值</span><span>差值</span></div><ul class="score-list">${changes}</ul>`;
  }
  const pin = (p,r) => `<button class="pin ${p.baseline===r.id?'is-baseline':''}" data-baseline="${escape(r.id)}" aria-label="${p.baseline===r.id?'当前基线':'设为基线'} ${escape(r.label)}" title="${p.baseline===r.id?'当前基线':'设为基线'}" aria-pressed="${p.baseline===r.id}">${icon('pin')}</button>`;
  const direction = (c,i) => `<button class="direction" data-direction="${i}" title="${c.direction==='down'?'越小越好；点击切换':'越大越好；点击切换'}" aria-label="${escape(c.name)}：${c.direction==='down'?'越小越好':'越大越好'}，点击切换">${c.direction==='down'?'↓':'↑'}</button>`;
  const columnHeading = (c,i) => `<button class="column-name" data-edit-column="${i}" title="修改指标名称与单位">${escape(fieldName(c))}</button>${direction(c,i)}`;
  function renderTable(p) {
    el("table-count").textContent=p.rows.length+" 条";
    el("thead").innerHTML='<tr><th scope="col">配置名称</th>'+p.columns.map((c,i)=>`<th scope="col">${columnHeading(c,i)}</th>`).join("")+'<th scope="col">操作</th></tr>';
    el("tbody").innerHTML=p.rows.length ? p.rows.map(r=>`<tr class="${r.id===p.selected?"is-selected":""}" data-table-row="${escape(r.id)}">
      <td>${pin(p,r)}<button class="row-select" data-select="${escape(r.id)}" data-edit-label="${escape(r.id)}" aria-pressed="${r.id===p.selected}" aria-label="选择 ${escape(r.label)}"><span class="dot"></span>${escape(r.label)}${p.baseline===r.id?'<span class="baseline-tag">基线</span>':""}</button></td>
      ${r.values.map((v,i)=>`<td class="editable-cell" data-edit-row="${escape(r.id)}" data-edit-value="${i}" tabindex="0" aria-label="${escape(r.label)}，${escape(fieldName(p.columns[i]))}，${escape(v||'缺测')}；双击或 F2 编辑" title="双击或 F2 编辑，Enter 保存">${v===""?'<span class="missing">—</span>':escape(v)}</td>`).join("")}
      <td><button class="row-action" data-edit="${escape(r.id)}" aria-label="编辑 ${escape(r.label)}" title="编辑记录">${icon("edit")}</button><button class="row-action" data-delete="${escape(r.id)}" aria-label="删除 ${escape(r.label)}" title="删除记录">${icon("trash")}</button></td></tr>`).join("")
      : `<tr><td class="empty-cell" colspan="${p.columns.length+2}">还没有数据。点击“添加记录”录入第一组配置。</td></tr>`;
    el("table-help").textContent="⌖ 一键设基线 · 双击数值或按 F2 编辑，Enter 保存 · 双击配置名改名 · 点击列名设置指标。";
    el("csv").disabled=false;
    renderMatrix(p);
  }
  let viewChoice;
  function dataView(p) { return viewChoice?.id===p.id ? viewChoice.view : (p.id==="bert"?"heat":"table"); }
  function renderMatrix(p) {
    const view=dataView(p), heat=view==="heat", host=el("heat-table");
    el("raw-table").hidden=heat; host.hidden=!heat; el("matrix-key").hidden=!heat;
    document.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.view===view)));
    if(!heat)return;
    const delta=p.chart.mode==="delta";
    el("table-help").textContent=(delta?"数值为对照减基线。":"数值为原始测量值。")+"颜色按 ↑ / ↓ 方向表示相对基线的优劣，各列独立归一化。悬停预览，点击锁定，再次点击或 Esc 取消。";
    if(!p.rows.length){host.innerHTML='<p class="table-help">添加记录后显示各项指标与基线的差值。</p>';return;}
    const base=p.rows.find(r=>r.id===p.baseline);
    const diffs=p.rows.map(r=>p.columns.map((_,i)=>difference(M.number(r.values[i]),M.number(base?.values[i]))));
    const maxima=p.columns.map((_,i)=>diffs.reduce((max,row)=>Math.max(max,Math.abs(row[i]??0)),0));
    const labels=p.columns.map((c,i)=>`<th scope="col">${columnHeading({...c,unit:delta?M.deltaUnit(c.unit):c.unit},i)}</th>`).join("");
    const rows=p.rows.map((r,ri)=>{
      const squares=p.columns.map((c,i)=>{
        const d=diffs[ri][i], ratio=maxima[i] && d!==null ? Math.abs(d)/maxima[i] : 0;
        const end=M.benefit(d,c)<0?[131,110,206]:[49,169,159];
        const w=d===null||d===0?0:(0.22+0.66*ratio);
        const neutral=[30,38,59];
        const fill=d===null?"#181f31":`rgb(${end.map((v,k)=>Math.round(neutral[k]*(1-w)+v*w)).join(",")})`;
        const chosen=heatLock?.experiment===p.id && heatLock.row===r.id && heatLock.col===i;
        const raw=valueOf(r.values[i],c.unit),baseRaw=valueOf(base?.values[i],c.unit);
        const label=r.label+" · "+c.name+" · 原值 "+raw+" · 基线 "+baseRaw+" · 差值 "+signed(d)+" "+M.deltaUnit(c.unit)+(c.direction==='down'?" · 越小越好":" · 越大越好");
        const value=delta?signed(d):(M.number(r.values[i])===null?"—":M.fmt(r.values[i]));
        return `<td><button class="heat-cell" data-heat-row="${escape(r.id)}" data-col="${i}" aria-label="${escape(label)}" data-preview="${escape(label)}" aria-pressed="${chosen}" style="background:${fill}">${escape(value)}</button></td>`;
      }).join("");
      return `<tr class="${r.id===p.selected?'is-selected':''}"><th scope="row">${pin(p,r)}${escape(r.label)}${r.id===p.baseline?' <span class="baseline-tag">基线</span>':""}</th>${squares}</tr>`;
    }).join("");
    host.innerHTML=`<table class="heatmap"><thead><tr><th scope="col">配置名称</th>${labels}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  document.querySelectorAll("[data-view]").forEach(button=>button.onclick=()=>{
    const p=current(); if(!p)return;viewChoice={id:p.id,view:button.dataset.view};renderTable(p);
  });
  el("heat-table").onclick=e=>{
    if(handleHeading(e))return;
    const cell=e.target.closest("[data-heat-row]");if(!cell)return;
    const id=current().id,row=cell.dataset.heatRow,index=Number(cell.dataset.col);
    const cancel=heatLock?.experiment===id&&heatLock.row===row&&heatLock.col===index;
    heatLock=cancel?null:{experiment:id,row,col:index};
    editCurrent(p=>{p.selected=cancel?'':row;
      if(p.chart.x===index)p.chart.x=p.chart.y;p.chart.y=index;});
    focusHeat(row,index);
  };
  function focusHeat(row,col) {el("heat-table").querySelector(`[data-heat-row="${CSS.escape(row)}"][data-col="${col}"]`)?.focus({preventScroll:true});}
  function previewHeat(cell) {
    if(!cell)return;const tip=el("heat-preview"),box=cell.getBoundingClientRect();
    tip.textContent=cell.dataset.preview;tip.hidden=false;
    tip.style.left=Math.max(8,Math.min(box.left,window.innerWidth-tip.offsetWidth-8))+"px";
    tip.style.top=(box.bottom+tip.offsetHeight+12>window.innerHeight?Math.max(8,box.top-tip.offsetHeight-8):box.bottom+8)+"px";
  }
  el("heat-table").onpointerover=e=>previewHeat(e.target.closest("[data-heat-row]"));
  el("heat-table").onpointerout=e=>{if(e.target.closest("[data-heat-row]"))el("heat-preview").hidden=true;};
  el("heat-table").onfocusin=e=>previewHeat(e.target.closest("[data-heat-row]"));
  el("heat-table").onfocusout=()=>{el("heat-preview").hidden=true;};
  el("heat-table").onkeydown=e=>{
    const cell=e.target.closest("[data-heat-row]");if(!cell)return;
    const p=current(),row=p.rows.findIndex(r=>r.id===cell.dataset.heatRow),col=Number(cell.dataset.col);
    const steps={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};
    if(steps[e.key]){e.preventDefault();const [dr,dc]=steps[e.key];focusHeat(p.rows[Math.max(0,Math.min(p.rows.length-1,row+dr))].id,Math.max(0,Math.min(p.columns.length-1,col+dc)));}
  };
  async function copyResult(format='text') {
    const p=current();if(!p)return;const text=M.conclusion(p,format);if(!text){notify("请先选择有数值的对照和基线");return;}
    el("copy-menu").open=false;
    try {await navigator.clipboard.writeText(text);notify("已复制对照描述");}
    catch {showDialog("对照描述",area("选中后即可复制","result",text,'readonly rows="4"'),()=>{},"完成");form.elements.result.select();}
  }
  el("copy-result").onclick=()=>copyResult();
  document.querySelectorAll('[data-copy-format]').forEach(b=>b.onclick=()=>copyResult(b.dataset.copyFormat));
  function chartOptions(p,width,height) {
    const {chart}=p, base=p.rows.find(r=>r.id===p.baseline), yCol=p.columns[chart.y];
    const baseY=M.number(base?.values[chart.y]), delta=chart.mode==="delta";
    const points=p.rows.map(r=>{
      const y=M.number(r.values[chart.y]);
      return {id:r.id,label:r.label,x:M.number(r.values[chart.x]),y:delta?difference(y,baseY):y};
    });
    const unit=delta ? M.deltaUnit(yCol.unit) : yCol.unit;
    return {width,height,type:delta&&chart.type==='line'?'bar':chart.type,points,mode:chart.mode,xLabel:chart.type==="scatter"?fieldName(p.columns[chart.x]):"实验配置",
      yLabel:(delta?"Δ ":"")+yCol.name+(unit?" ("+unit+")":""),title:chart.title||p.title,
      source:p.source ? (p.modified?"本地编辑副本，原始来源":"数据来源")+" · "+p.source.label : "数据来源 · 自建实验记录",
      color:chart.color,grid:chart.grid,showValues:chart.showValues,baselineId:p.baseline,baselineLabel:base?.label||"",
      baselineY:baseY===null?null:(delta?0:baseY),selectedId:p.selected};
  }
  function renderPlot() {
    const p=current(),host=el("plot"); if(!p || !host.clientWidth) return;
    const space=getComputedStyle(host);
    const width=Math.max(220,Math.floor(host.clientWidth-parseFloat(space.paddingLeft)-parseFloat(space.paddingRight)));
    const o=chartOptions(p,width,width<420?225:242);
    host.innerHTML=C.svg(o);
    host.setAttribute("aria-label",o.title+"，"+o.yLabel+"，点击数据标记选择对照记录");
    el("png").disabled=!o.points.some(q=>q.y!==null && (o.type!=="scatter" || q.x!==null));
  }
  function selectRow(id) {
    const p=current(); if(!p || p.selected===id) return;
    heatLock=null;
    editCurrent(exp=>{if(exp.rows.some(r=>r.id===id)) exp.selected=id;});
  }
  el("library").addEventListener("click",e=>{
    const b=e.target.closest("[data-book]"); if(!b) return;
    heatLock=null;activeId=b.dataset.book; rememberActive();closeMenu();render();
  });
  el("menu").onclick=()=>{document.body.classList.add("side-open");el("scrim").hidden=false;el("menu").setAttribute("aria-expanded","true");};
  el("scrim").onclick=closeMenu;
  function clearLock() {
    if(!heatLock)return;const {row,col}=heatLock;heatLock=null;
    editCurrent(p=>{p.selected='';});focusHeat(row,col);el("heat-preview").hidden=true;
  }
  function setMode(mode) {editCurrent(p=>{p.chart.mode=mode;if(mode==='delta'&&p.chart.type==='line')p.chart.type='bar';});}
  document.addEventListener("keydown",e=>{
    const editing=e.target.closest('input,textarea,select,[contenteditable="true"]');
    if(e.key==='Escape'&&!editing){closeMenu();el("copy-menu").open=false;document.querySelector('.file-menu').open=false;if(!dialog.open)clearLock();}
    if(editing||dialog.open||e.altKey)return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();undo();return;}
    if(e.ctrlKey||e.metaKey)return;
    if(e.key.toLowerCase()==='m'&&current()){e.preventDefault();setMode(current().chart.mode==='raw'?'delta':'raw');}
    if(e.key.toLowerCase()==='c'){e.preventDefault();copyResult();}
  });
  document.querySelectorAll("[data-type]").forEach(b=>b.onclick=()=>editCurrent(p=>{p.chart.type=b.dataset.type;if(b.dataset.type==='line')p.chart.mode='raw';}));
  el("mode").onchange=e=>setMode(e.target.value);
  function chooseAxis(axis,index) {
    editCurrent(p=>{const other=axis==="x"?"y":"x";if(p.chart[other]===index)p.chart[other]=p.chart[axis];p.chart[axis]=index;});
  }
  el("x-axis").onchange=e=>chooseAxis("x",Number(e.target.value));
  el("y-axis").onchange=e=>chooseAxis("y",Number(e.target.value));
  el("comparison-readout").onclick=e=>{const b=e.target.closest("[data-metric]");if(b)chooseAxis("y",Number(b.dataset.metric));};
  el("baseline").onchange=e=>editCurrent(p=>{p.baseline=e.target.value;});
  el("swap-pair").onclick=()=>{heatLock=null;editCurrent(p=>{[p.baseline,p.selected]=[p.selected,p.baseline];});};
  el("selected").onchange=e=>selectRow(e.target.value);
  el("plot").onclick=e=>{const mark=e.target.closest("[data-row]");if(mark)selectRow(mark.dataset.row);};
  el("plot").onkeydown=e=>{const mark=e.target.closest("[data-row]");if(mark && (e.key==="Enter"||e.key===" ")){e.preventDefault();const id=mark.dataset.row;selectRow(id);el("plot").querySelector('[data-row="'+CSS.escape(id)+'"]')?.focus();}};
  el("tbody").onclick=e=>{
    if(handleHeading(e))return;
    const b=e.target.closest("button"); if(!b)return;
    if(b.dataset.select) selectRow(b.dataset.select);
    if(b.dataset.edit) rowDialog(b.dataset.edit);
    if(b.dataset.delete) deleteRow(b.dataset.delete);
  };
  function handleHeading(e) {
    const pinButton=e.target.closest('[data-baseline]');
    if(pinButton){editCurrent(p=>{p.baseline=pinButton.dataset.baseline;});return true;}
    const dir=e.target.closest('[data-direction]');
    if(dir){const id=current().id;changeExperiment(id,p=>{const c=p.columns[Number(dir.dataset.direction)];c.direction=c.direction==='down'?'up':'down';markChanged(p);},true);return true;}
    const header=e.target.closest('[data-edit-column]');
    if(header){columnDialog(Number(header.dataset.editColumn));return true;}
    return false;
  }
  el("thead").onclick=handleHeading;
  function beginCellEdit(target,label=false) {
    if(target.querySelector('input'))return;
    const p=current(),id=p.id,rowId=label?target.dataset.editLabel:target.dataset.editRow,index=Number(target.dataset.editValue);
    const row=p.rows.find(r=>r.id===rowId),old=label?row.label:row.values[index],columns=JSON.stringify(p.columns);
    const input=document.createElement('input');input.className='cell-editor';input.value=old;
    input.setAttribute('aria-label',label?'编辑配置名称':'编辑 '+fieldName(p.columns[index]));
    input.inputMode=label?'text':'decimal';target.replaceChildren(input);input.focus();input.select();
    const cancel=()=>{renderTable(current());};
    input.onclick=e=>e.stopPropagation();input.ondblclick=e=>e.stopPropagation();
    input.onblur=cancel;
    input.onkeydown=e=>{
      e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();cancel();return;}
      if(e.key!=='Enter')return;e.preventDefault();
      const value=input.value.trim();
      if(label?!value:(value!==''&&M.number(value)===null)){input.setAttribute('aria-invalid','true');notify(label?'配置名称不能为空':'请输入有限数值，缺测可留空');return;}
      try {
        input.onblur=null;
        changeExperiment(id,exp=>{
          const live=exp.rows.find(r=>r.id===rowId);
          if(!live||JSON.stringify(exp.columns)!==columns||(label?live.label:live.values[index])!==old)throw Error('记录已在其他窗口变化，请重新编辑。');
          if(value!==old){if(label)live.label=value;else live.values[index]=value;markChanged(exp);}
        },true);
        const cell=label?el('tbody').querySelector(`[data-edit-label="${CSS.escape(rowId)}"]`):el('tbody').querySelector(`[data-edit-row="${CSS.escape(rowId)}"][data-edit-value="${index}"]`);
        cell?.focus({preventScroll:true});
      } catch(error){notify(error.message);render();}
    };
  }
  el('tbody').ondblclick=e=>{const target=e.target.closest('[data-edit-value],[data-edit-label]');if(target)beginCellEdit(target,target.hasAttribute('data-edit-label'));};
  el('tbody').onkeydown=e=>{if(e.key==='F2'){const cell=e.target.closest('[data-edit-value],[data-edit-label]');if(cell){e.preventDefault();beginCellEdit(cell,cell.hasAttribute('data-edit-label'));}}};

  const dialog=el("dialog"), form=el("dialog-form"); let submitDialog=null, busy=false;
  function showDialog(title,body,onSubmit,submitLabel="保存") {
    closeMenu();el("dialog-title").textContent=title;el("dialog-body").innerHTML=body;
    el("dialog-error").hidden=true;el("dialog-submit").textContent=submitLabel;el("dialog-submit").disabled=false;
    const previous=form.querySelector(".danger");if(previous)previous.remove();
    submitDialog=onSubmit;busy=false;
    if(!dialog.open)dialog.showModal();
    const input=form.querySelector("#dialog-body input:not([type=checkbox]), #dialog-body textarea");
    if(input)input.focus();
  }
  form.addEventListener("click",e=>{if(e.target.closest("[data-close]")&&!busy)dialog.close();});
  form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;busy=true;el("dialog-submit").disabled=true;el("dialog-error").hidden=true;
    try {await submitDialog(new FormData(form));dialog.close();}
    catch(error){el("dialog-error").textContent=error.message||"保存失败，请重试。";el("dialog-error").hidden=false;}
    finally{busy=false;el("dialog-submit").disabled=false;}
  };
  const textField=(label,name,value="",attrs="")=>`<label class="field">${escape(label)}<input name="${escape(name)}" value="${escape(value)}" ${attrs}></label>`;
  const area=(label,name,value,attrs="")=>`<label class="field">${escape(label)}<textarea name="${escape(name)}" ${attrs}>${escape(value)}</textarea></label>`;
  function newOrEdit(existing) {
    const p=existing||M.blank(""), id=existing?.id;
    const body=textField("实验名称","title",p.title,'required maxlength="100" placeholder="例如：模型组件消融"')+
      area("实验说明","description",p.description||"",'maxlength="500" rows="2"')+
      area("指标与单位","columns",p.columns.map(M.columnHeader).join("\n"),'required rows="4"')+
      '<p class="form-help">每行一个数值指标，例如“准确率 [%]”或“推理时间 [ms]”。已有列按顺序对应，可在末尾追加指标。</p>';
    showDialog(id?"实验设置":"新建实验",body,data=>{
      const title=String(data.get("title")).trim();if(!title)throw Error("请填写实验名称。");
      const columns=String(data.get("columns")).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(M.parseColumn).map((c,i)=>({...c,...(p.columns[i]?.direction?{direction:p.columns[i].direction}:{})}));
      if(columns.length<2) throw Error("请至少保留两个数值指标。");
      if(columns.some(c=>!c.name.trim()))throw Error("每项指标都需要名称。");
      if(new Set(columns.map(M.columnHeader)).size!==columns.length)throw Error("指标名称和单位重复，请分别命名。");
      const description=String(data.get("description")).trim();
      if(id)changeExperiment(id,exp=>{
        if(columns.length<exp.columns.length)throw Error("已有指标按列保存。请保留原有列，可在末尾新增。");
        const changed=exp.title!==title || exp.description!==description || JSON.stringify(exp.columns)!==JSON.stringify(columns);
        exp.title=title;exp.description=description;exp.columns=columns;
        for(const r of exp.rows) while(r.values.length<columns.length)r.values.push("");
        if(changed)markChanged(exp);
      },true);
      else {const exp=M.blank(title);exp.description=description;exp.columns=columns;mutate(state=>{state.experiments.push(exp);activeId=exp.id;},true);}
    },id?"保存设置":"创建实验");
    if(id){
      const del=document.createElement("button");del.type="button";del.className="button danger";del.textContent="删除实验";
      del.onclick=()=>showDialog("删除这份实验？",`<p>将移除“${escape(p.title)}”及其所有记录。可先导出 CSV 留存。</p>`,()=>{
        mutate(state=>{state.experiments=state.experiments.filter(item=>item.id!==id);},true);
      },"删除实验");
      form.querySelector(".dialog-foot").prepend(del);
    }
  }
  el("new-book").onclick=el("first-book").onclick=()=>{
    const exp=M.blank("未命名实验"),first=M.row('配置 1',['','']);
    exp.rows=[first];exp.baseline=first.id;exp.selected=first.id;viewChoice={id:exp.id,view:'table'};heatLock=null;
    mutate(state=>{state.experiments.push(exp);activeId=exp.id;},true);closeMenu();
    beginCellEdit(el('tbody').querySelector('[data-edit-label]'),true);
  };
  el("edit-book").onclick=()=>{if(current())newOrEdit(current());};
  function columnDialog(index=null) {
    const p=current();if(!p)return;const old=index===null?null:structuredClone(p.columns[index]);
    showDialog(old?'编辑指标':'添加指标',textField('指标名称','name',old?.name||'','required maxlength="100"')+textField('单位','unit',old?.unit||'','maxlength="40"')+
      `<label class="field">指标方向<select name="direction"><option value="up" ${old?.direction!=='down'?'selected':''}>↑ 越大越好</option><option value="down" ${old?.direction==='down'?'selected':''}>↓ 越小越好</option></select></label>`,data=>{
      const column={name:String(data.get('name')).trim(),unit:String(data.get('unit')).trim(),direction:String(data.get('direction'))};
      if(!column.name)throw Error('请填写指标名称。');
      changeExperiment(p.id,exp=>{
        if(exp.columns.some((c,i)=>i!==index&&M.columnHeader(c)===M.columnHeader(column)))throw Error('指标名称与单位重复。');
        if(old){if(JSON.stringify(exp.columns[index])!==JSON.stringify(old))throw Error('指标已在其他窗口更新。');exp.columns[index]=column;}
        else {exp.columns.push(column);exp.rows.forEach(r=>r.values.push(''));}
        markChanged(exp);
      },true);
    });
  }
  el('add-column').onclick=()=>columnDialog();
  function resetSample(id) {
    const sample=M.samples().find(p=>p.id===id);if(!sample)return;
    showDialog('还原论文原值？','<p>将还原此样例的记录、指标与图表默认设置。其他实验不受影响，可用撤销恢复本次还原前的数据。</p>',()=>{
      heatLock=null;mutate(state=>{const i=state.experiments.findIndex(p=>p.id===id);if(i<0)throw Error('实验已被删除。');state.experiments[i]=sample;},true);
    },'还原原值');
  }
  function rowDialog(rowId) {
    const p=current(), old=p.rows.find(r=>r.id===rowId), id=p.id;
    const body=textField("配置名称","label",old?.label||"",'required maxlength="120" placeholder="例如：移除注意力模块"')+
      '<div class="fields">'+p.columns.map((c,i)=>textField(fieldName(c),"v"+i,old?.values[i]||"", 'inputmode="decimal" placeholder="未测可留空"')).join("")+'</div>';
    showDialog(old?"编辑记录":"添加记录",body,data=>{
      const label=String(data.get("label")).trim();if(!label)throw Error("请填写配置名称。");
      const values=p.columns.map((c,i)=>{
        const raw=String(data.get("v"+i)||"").trim();
        if(raw!=="" && M.number(raw)===null)throw Error(c.name+" 需要有限数值，缺测可留空。");
        return raw;
      });
      changeExperiment(id,exp=>{
        if(JSON.stringify(exp.columns)!==JSON.stringify(p.columns))throw Error("指标已在其他窗口修改，请重新打开此表单。");
        if(old){
          const live=exp.rows.find(r=>r.id===old.id);
          if(!live)throw Error("这条记录已被删除。");
          if(live.label!==old.label || JSON.stringify(live.values)!==JSON.stringify(old.values))throw Error("这条记录已在其他窗口更新，请重新打开。");
          if(live.label!==label || JSON.stringify(live.values)!==JSON.stringify(values))markChanged(exp);
          live.label=label;live.values=values;exp.selected=live.id;
        }else{
          const item=M.row(label,values);exp.rows.push(item);if(!exp.baseline)exp.baseline=item.id;exp.selected=item.id;markChanged(exp);
        }
      },true);
    },old?"保存记录":"添加记录");
  }
  el("add-row").onclick=()=>rowDialog(null);
  function deleteRow(id) {
    const p=current(), item=p.rows.find(r=>r.id===id);if(!item)return;
    showDialog("删除这条记录？",`<p>将从“${escape(p.title)}”移除“${escape(item.label)}”。</p>`,()=>{
      changeExperiment(p.id,exp=>{
        exp.rows=exp.rows.filter(r=>r.id!==id);
        if(exp.baseline===id)exp.baseline=exp.rows[0]?.id||"";
        if(exp.selected===id)exp.selected=exp.rows.find(r=>r.id!==exp.baseline)?.id||exp.baseline;
        markChanged(exp);
      },true);
    },"删除记录");
  }
  el("import-book").onclick=()=>{
    const body=textField("实验名称（可选）","title","",'maxlength="100" placeholder="默认使用文件名"')+
      '<label class="field">CSV 或 JSON 文件<input type="file" name="file" accept=".csv,.json,text/csv,application/json"></label>'+
      area("或粘贴 CSV / JSON","text","",'rows="4" placeholder="配置名称,训练时间 [h],准确率 [%]"')+
      '<p class="form-help" id="import-kind">CSV 新建实验；JSON 恢复完整实验册并替换全部实验。程序会自动识别。</p>'+
      '<label class="check"><input type="checkbox" name="replace">若为 JSON，我确认用备份替换当前全部实验</label>';
    showDialog("导入 / 恢复",body,async data=>{
      const file=data.get("file"),typed=String(data.get("text")).trim();
      if(file?.name && typed)throw Error("请选择文件或粘贴文本其中一种。");
      if(!file?.name && !typed)throw Error("请选择文件或粘贴数据。");
      const raw=file?.name?await file.text():typed;
      const json=/\.json$/i.test(file?.name||'')||(!/\.csv$/i.test(file?.name||'')&&/^[\s\uFEFF]*[\[{]/.test(raw));
      if(json){
        let restored;try{restored=unpack(raw.replace(/^\uFEFF/,''));}catch{throw Error('不是有效的 LabPlot JSON 实验册，当前实验未改变。');}
        el('import-kind').textContent='已识别为 JSON 实验册：'+restored.experiments.length+' 份实验，将替换当前全部实验。';
        if(!data.has('replace'))throw Error('JSON 将替换当前全部实验。请勾选覆盖确认后再次点击导入。');
        const before={book:structuredClone(book),activeId};
        try{localStorage.setItem(BOOK,JSON.stringify(restored));}catch{throw Error('浏览器无法保存恢复的数据，当前实验未改变。');}
        book=restored;dirty=false;pendingRecovery=false;warning='';heatLock=null;activeId=book.experiments[0]?.id||'';
        undoState={...before,after:dataFingerprint(book)};rememberActive();render();notify('已恢复 '+book.experiments.length+' 份实验');return;
      }
      const name=String(data.get("title")).trim()||file?.name?.replace(/\.csv$/i,"")||"导入的实验";
      const exp=M.fromCSV(raw,name);heatLock=null;mutate(state=>{state.experiments.push(exp);activeId=exp.id;},true);notify("已导入 "+exp.rows.length+" 条记录");
    },"导入 / 恢复");
  };
  el("style-chart").onclick=()=>{
    const p=current(),c=p.chart;
    const body=textField("图表标题","title",c.title,'maxlength="100" placeholder="默认使用实验名称导出"')+
      textField("图表配色","color",c.color,'type="color"')+
      `<label class="check"><input type="checkbox" name="grid" ${c.grid?"checked":""}>显示网格线</label><label class="check"><input type="checkbox" name="values" ${c.showValues?"checked":""}>显示数据标签</label>`;
    showDialog("图表样式",body,data=>changeExperiment(p.id,exp=>{
      Object.assign(exp.chart,{title:String(data.get("title")).trim(),color:String(data.get("color")),grid:data.has("grid"),showValues:data.has("values")});
    }));
  };
  function saveFile(blob,name) {
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name.replace(/[\\/:*?"<>|\r\n]/g,"_");
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  el("backup-book").onclick=()=>{
    saveFile(new Blob([JSON.stringify(book,null,2)],{type:"application/json;charset=utf-8"}),"LabPlot-实验册备份.json");
    notify("已导出完整实验册");
  };
  el('export-html').onclick=async()=>{
    const button=el('export-html');button.disabled=true;
    try {
      const root=document.documentElement.cloneNode(true);
      root.querySelector('#embedded-book')?.remove();
      const seed=document.createElement('script');seed.id='embedded-book';seed.type='application/json';seed.dataset.key=M.uid();
      seed.textContent=JSON.stringify({...book,activeId}).replace(/</g,'\\u003c');root.querySelector('head').prepend(seed);
      for(const link of root.querySelectorAll('link[rel="stylesheet"]')){
        const response=await fetch(new URL(link.getAttribute('href'),location.href));if(!response.ok)throw Error('无法读取样式文件');
        const style=document.createElement('style');style.textContent=await response.text();link.replaceWith(style);
      }
      for(const script of root.querySelectorAll('script[src]')){
        const response=await fetch(new URL(script.getAttribute('src'),location.href));if(!response.ok)throw Error('无法读取脚本文件');
        script.textContent=(await response.text()).replace(/<\/script/gi,'<\\/script');script.removeAttribute('src');script.removeAttribute('defer');root.querySelector('body').append(script);
      }
      root.querySelector('body').classList.remove('side-open');root.querySelector('#scrim').hidden=true;
      root.querySelector('dialog').removeAttribute('open');root.querySelector('#dialog-body').replaceChildren();
      root.querySelector('#heat-preview').hidden=true;root.querySelector('#toast').hidden=true;
      root.querySelectorAll('details').forEach(node=>node.removeAttribute('open'));
      root.querySelector('#export-html').disabled=false;
      saveFile(new Blob(['<!doctype html>\n'+root.outerHTML],{type:'text/html;charset=utf-8'}),'LabPlot.html');
      document.querySelector('.file-menu').open=false;notify('已导出含当前实验册的离线 HTML');
    }catch(error){notify('HTML 导出失败：'+(location.protocol==='file:'?'请使用离线版 LabPlot.html，或通过本地服务器打开源码入口。':error.message));}
    finally{button.disabled=false;}
  };
  el("csv").onclick=()=>{const p=current();if(p)saveFile(new Blob([M.csv(p)],{type:"text/csv;charset=utf-8"}),p.title+".csv");};
  el("png").onclick=async()=>{
    const p=current();if(!p)return;
    try {const blob=await C.png(chartOptions(p,1600,900));saveFile(blob,p.title+"-"+p.columns[p.chart.y].name+".png");}
    catch(error){notify("PNG 导出失败："+(error.message||"请重试"));}
  };
  window.addEventListener("storage",event=>{
    if(event.key!==BOOK || dirty) return;
    try {
      if(event.newValue!==null)book=unpack(event.newValue);
      else {warning="浏览器中的实验册已被清除。可将页面中的数据导出备份。";dirty=true;}
      normalizeActive();render();
    }catch{warning="其他窗口的实验册格式异常，请先导出当前记录。";dirty=true;render();}
  });
  normalizeActive();render();new ResizeObserver(renderPlot).observe(el("plot"));
})();
