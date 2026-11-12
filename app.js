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
    layers:'<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>'
  };
  const icon = name => `<svg aria-hidden="true" class="ico" viewBox="0 0 24 24">${drawings[name] || ""}</svg>`;
  document.querySelectorAll("[data-icon]").forEach(node => {
    const temp = document.createElement("template"); temp.innerHTML = icon(node.dataset.icon);
    if (node.className) temp.content.firstElementChild.classList.add(...node.classList);
    node.replaceWith(temp.content);
  });

  const BOOK = "gewulab.notebook.v1", ACTIVE = "gewulab.active.v1";
  let book = {version:1, experiments:M.samples()}, activeId = "", dirty = false, warning = "";
  let pendingRecovery = false;
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
    activeId = sessionStorage.getItem(ACTIVE) || localStorage.getItem(ACTIVE) || "";
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
  function mutate(action) {
    if (!dirty) {
      try {
        const latest = localStorage.getItem(BOOK);
        if (latest !== null) book = unpack(latest);
      } catch { throw Error("无法读取最新实验册，请刷新后重试。"); }
    }
    action(book); normalizeActive(); persist();
    if (!dirty && !pendingRecovery) warning = "";
    rememberActive(); render();
  }
  function changeExperiment(id, update) {
    mutate(state => {
      const experiment = state.experiments.find(p => p.id === id);
      if (!experiment) throw Error("这份实验已被移除，请重新选择。");
      update(experiment);
    });
  }
  function editCurrent(update) {
    try { changeExperiment(activeId, update); } catch (error) { notify(error.message); render(); }
  }
  function markChanged(p) { if (p.source) p.modified = true; }
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
    normalizeActive(); updateLibrary();
    el("save-status").innerHTML=`<span class="status-dot${dirty ? " warn" : ""}"></span>${dirty ? "仅暂存在页面" : "已保存到本机"}`;
    el("warning").hidden=!warning; el("warning").textContent=warning;
    const p=current(); el("workspace").hidden=!p; el("empty-library").hidden=!!p;
    if (!p) return;
    el("title").textContent=p.title; el("description").textContent=p.description; el("description").hidden=!p.description;
    const source=p.source;
    const safeSource=source && /^https:\/\//i.test(source.url);
    el("meta").innerHTML=`<span class="meta-badge">${icon(source?"paper":"notebook")}${source ? (p.modified ? "已编辑的论文数据" : "论文数据") : "自建实验"}</span>${safeSource ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)} ${icon("external")}</a>` : ""}`;
    el("plot-title").textContent=p.chart.title || "结果图表";
    document.querySelectorAll("[data-type]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.type===p.chart.type)));
    el("mode").value=p.chart.mode; el("x-wrap").hidden=p.chart.type!=="scatter";
    el("y-caption").textContent=p.chart.type==="scatter" ? "Y 轴" : "指标";
    const cols=p.columns.map((c,i)=>[i,fieldName(c)]);
    setOptions(el("x-axis"),cols,p.chart.x); setOptions(el("y-axis"),cols,p.chart.y);
    const rows=p.rows.map(r=>[r.id,r.label]);
    setOptions(el("baseline"),rows,p.baseline); setOptions(el("selected"),rows,p.selected);
    renderComparison(p); renderTable(p); renderPlot();
  }
  function renderComparison(p) {
    const a=p.rows.find(r=>r.id===p.selected), b=p.rows.find(r=>r.id===p.baseline);
    el("copy-result").disabled=!a || !b || M.compare(p,a.id,b.id).dy===null;
    if (!a || !b) {el("comparison-readout").innerHTML='<p class="table-help">添加记录后即可选择两组配置进行比较。</p>';return;}
    const i=p.chart.y,c=p.columns[i],d=M.compare(p,a.id,b.id).dy;
    const changes=p.columns.map((column,index)=>{
      const av=M.number(a.values[index]),bv=M.number(b.values[index]),diff=difference(av,bv);
      return `<li><button data-metric="${index}" aria-pressed="${index===i}" title="${escape(column.name)}：基线 ${escape(valueOf(b.values[index],column.unit))}，对照 ${escape(valueOf(a.values[index],column.unit))}"><span class="score-name">${escape(column.name)}</span><span class="score-current">${escape(valueOf(a.values[index],column.unit))}</span><span class="score-val">${escape(signed(diff))}</span></button></li>`;
    }).join("");
    el("comparison-readout").innerHTML=`<div class="readout"><div class="cap">${escape(c.name)} · 对照减基线</div><div class="big-delta"><b>${escape(signed(d))}</b><small>${d===null?"":escape(M.deltaUnit(c.unit))}</small></div><div class="raw-pair">${escape(b.label)} ${escape(valueOf(b.values[i],c.unit))} → ${escape(a.label)} ${escape(valueOf(a.values[i],c.unit))}</div></div><div class="score-head"><span>指标</span><span>对照值</span><span>差值</span></div><ul class="score-list">${changes}</ul>`;
  }
  function renderTable(p) {
    el("table-count").textContent=p.rows.length+" 条";
    el("thead").innerHTML='<tr><th scope="col">配置名称</th>'+p.columns.map(c=>`<th scope="col">${escape(fieldName(c))}</th>`).join("")+'<th scope="col">操作</th></tr>';
    el("tbody").innerHTML=p.rows.length ? p.rows.map(r=>`<tr class="${r.id===p.selected?"is-selected":""}" data-table-row="${escape(r.id)}">
      <td><button class="row-select" data-select="${escape(r.id)}" aria-pressed="${r.id===p.selected}" aria-label="选择 ${escape(r.label)}"><span class="dot"></span>${escape(r.label)}${p.baseline===r.id?'<span class="baseline-tag">基线</span>':""}</button></td>
      ${r.values.map(v=>`<td>${v===""?'<span class="missing">—</span>':escape(v)}</td>`).join("")}
      <td><button class="row-action" data-edit="${escape(r.id)}" aria-label="编辑 ${escape(r.label)}" title="编辑记录">${icon("edit")}</button><button class="row-action" data-delete="${escape(r.id)}" aria-label="删除 ${escape(r.label)}" title="删除记录">${icon("trash")}</button></td></tr>`).join("")
      : `<tr><td class="empty-cell" colspan="${p.columns.length+2}">还没有数据。点击“添加记录”录入第一组配置。</td></tr>`;
    el("table-help").textContent="点击配置名或图中的标记可切换对照，使用行末的铅笔编辑数值。";
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
    el("table-help").textContent="色阶按每项指标分别计算，数值为对照减基线。点击色块可查看这组对照。";
    if(!p.rows.length){host.innerHTML='<p class="table-help">添加记录后显示各项指标与基线的差值。</p>';return;}
    const base=p.rows.find(r=>r.id===p.baseline);
    const diffs=p.rows.map(r=>p.columns.map((_,i)=>difference(M.number(r.values[i]),M.number(base?.values[i]))));
    const maxima=p.columns.map((_,i)=>diffs.reduce((max,row)=>Math.max(max,Math.abs(row[i]??0)),0));
    const labels=p.columns.map(c=>`<th scope="col">${escape(c.name)}<small>${escape(M.deltaUnit(c.unit))}</small></th>`).join("");
    const rows=p.rows.map((r,ri)=>{
      const squares=p.columns.map((c,i)=>{
        const d=diffs[ri][i], ratio=maxima[i] && d!==null ? Math.abs(d)/maxima[i] : 0;
        const end=d<0?[131,110,206]:[49,169,159];
        const w=d===null||d===0?0:(0.22+0.66*ratio);
        const neutral=[30,38,59];
        const fill=d===null?"#181f31":`rgb(${end.map((v,k)=>Math.round(neutral[k]*(1-w)+v*w)).join(",")})`;
        const chosen=p.selected===r.id && p.chart.y===i;
        const label=r.label+" · "+c.name+" · "+(d===null?"缺测":signed(d)+" "+M.deltaUnit(c.unit));
        return `<td><button class="heat-cell" data-heat-row="${escape(r.id)}" data-col="${i}" aria-label="${escape(label)}" title="${escape(label)}" aria-pressed="${chosen}" style="background:${fill}">${escape(signed(d))}</button></td>`;
      }).join("");
      return `<tr><th scope="row">${escape(r.label)}${r.id===p.baseline?' <span class="baseline-tag">基线</span>':""}</th>${squares}</tr>`;
    }).join("");
    host.innerHTML=`<table class="heatmap"><thead><tr><th scope="col">配置名称</th>${labels}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  document.querySelectorAll("[data-view]").forEach(button=>button.onclick=()=>{
    const p=current(); if(!p)return;viewChoice={id:p.id,view:button.dataset.view};renderTable(p);
  });
  el("heat-table").onclick=e=>{
    const cell=e.target.closest("[data-heat-row]");if(!cell)return;
    editCurrent(p=>{const index=Number(cell.dataset.col);p.selected=cell.dataset.heatRow;
      if(p.chart.x===index)p.chart.x=p.chart.y;p.chart.y=index;});
  };
  el("copy-result").onclick=async()=>{
    const p=current(),a=p.rows.find(r=>r.id===p.selected),b=p.rows.find(r=>r.id===p.baseline);
    if(!a||!b)return;const i=p.chart.y,c=p.columns[i],d=M.compare(p,a.id,b.id).dy;if(d===null)return;
    const deltaText=d===0?"与基线持平":(d>0?"高于基线 ":"低于基线 ")+M.fmt(Math.abs(d))+" "+M.deltaUnit(c.unit);
    const source=p.source ? "（"+(p.modified?"本地修改的记录，原始出处为 ":"数据来源为 ")+p.source.label+"）":"";
    const text=`在 ${c.name} 上，${b.label} 为 ${valueOf(b.values[i],c.unit)}，${a.label} 为 ${valueOf(a.values[i],c.unit)}，${deltaText}。${source}`;
    try {await navigator.clipboard.writeText(text);notify("已复制对照描述");}
    catch {showDialog("对照描述",area("选中后即可复制","result",text,'readonly rows="4"'),()=>{},"完成");form.elements.result.select();}
  };
  function chartOptions(p,width,height) {
    const {chart}=p, base=p.rows.find(r=>r.id===p.baseline), yCol=p.columns[chart.y];
    const baseY=M.number(base?.values[chart.y]), delta=chart.mode==="delta";
    const points=p.rows.map(r=>{
      const y=M.number(r.values[chart.y]);
      return {id:r.id,label:r.label,x:M.number(r.values[chart.x]),y:delta?difference(y,baseY):y};
    });
    const unit=delta ? M.deltaUnit(yCol.unit) : yCol.unit;
    return {width,height,type:chart.type,points,mode:chart.mode,xLabel:chart.type==="scatter"?fieldName(p.columns[chart.x]):"实验配置",
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
    editCurrent(exp=>{if(exp.rows.some(r=>r.id===id)) exp.selected=id;});
  }
  el("library").addEventListener("click",e=>{
    const b=e.target.closest("[data-book]"); if(!b) return;
    activeId=b.dataset.book; rememberActive();closeMenu();render();
  });
  el("menu").onclick=()=>{document.body.classList.add("side-open");el("scrim").hidden=false;el("menu").setAttribute("aria-expanded","true");};
  el("scrim").onclick=closeMenu;
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu();});
  document.querySelectorAll("[data-type]").forEach(b=>b.onclick=()=>editCurrent(p=>{p.chart.type=b.dataset.type;}));
  el("mode").onchange=e=>editCurrent(p=>{p.chart.mode=e.target.value;});
  function chooseAxis(axis,index) {
    editCurrent(p=>{const other=axis==="x"?"y":"x";if(p.chart[other]===index)p.chart[other]=p.chart[axis];p.chart[axis]=index;});
  }
  el("x-axis").onchange=e=>chooseAxis("x",Number(e.target.value));
  el("y-axis").onchange=e=>chooseAxis("y",Number(e.target.value));
  el("comparison-readout").onclick=e=>{const b=e.target.closest("[data-metric]");if(b)chooseAxis("y",Number(b.dataset.metric));};
  el("baseline").onchange=e=>editCurrent(p=>{p.baseline=e.target.value;});
  el("selected").onchange=e=>selectRow(e.target.value);
  el("plot").onclick=e=>{const mark=e.target.closest("[data-row]");if(mark)selectRow(mark.dataset.row);};
  el("plot").onkeydown=e=>{const mark=e.target.closest("[data-row]");if(mark && (e.key==="Enter"||e.key===" ")){e.preventDefault();const id=mark.dataset.row;selectRow(id);el("plot").querySelector('[data-row="'+CSS.escape(id)+'"]')?.focus();}};
  el("tbody").onclick=e=>{
    const b=e.target.closest("button"); if(!b)return;
    if(b.dataset.select) selectRow(b.dataset.select);
    if(b.dataset.edit) rowDialog(b.dataset.edit);
    if(b.dataset.delete) deleteRow(b.dataset.delete);
  };

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
      const columns=String(data.get("columns")).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(M.parseColumn);
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
      });
      else {const exp=M.blank(title);exp.description=description;exp.columns=columns;mutate(state=>{state.experiments.push(exp);activeId=exp.id;});}
    },id?"保存设置":"创建实验");
    if(id){
      const del=document.createElement("button");del.type="button";del.className="button danger";del.textContent="删除实验";
      del.onclick=()=>showDialog("删除这份实验？",`<p>将移除“${escape(p.title)}”及其所有记录。可先导出 CSV 留存。</p>`,()=>{
        mutate(state=>{state.experiments=state.experiments.filter(item=>item.id!==id);});
      },"删除实验");
      form.querySelector(".dialog-foot").prepend(del);
    }
  }
  el("new-book").onclick=el("first-book").onclick=()=>newOrEdit(null);
  el("edit-book").onclick=()=>{if(current())newOrEdit(current());};
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
      });
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
      });
    },"删除记录");
  }
  el("import-book").onclick=()=>{
    const body=textField("实验名称（可选）","title","",'maxlength="100" placeholder="默认使用文件名"')+
      '<label class="field">CSV 文件<input type="file" name="file" accept=".csv,text/csv"></label>'+
      area("或直接粘贴 CSV","text","",'rows="4" placeholder="配置名称,训练时间 [h],准确率 [%]"')+
      '<p class="form-help">首列是配置名称，后面至少两列数值指标。空白表示缺测，导入后会新建一份实验。</p>';
    showDialog("从 CSV 新建实验",body,async data=>{
      const file=data.get("file"),typed=String(data.get("text")).trim();
      if(file?.name && typed)throw Error("请选择文件或粘贴文本其中一种。");
      if(!file?.name && !typed)throw Error("请选择 CSV 文件或粘贴数据。");
      const raw=file?.name?await file.text():typed;
      const name=String(data.get("title")).trim()||file?.name?.replace(/\.csv$/i,"")||"导入的实验";
      const exp=M.fromCSV(raw,name);mutate(state=>{state.experiments.push(exp);activeId=exp.id;});notify("已导入 "+exp.rows.length+" 条记录");
    },"导入实验");
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
