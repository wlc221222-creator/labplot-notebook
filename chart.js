/* Offline SVG and PNG rendering for the experiment notebook. */
(() => {
  'use strict';

  const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const INK = '#293d35';
  const MUTED = '#62746c';
  const AXIS = '#aebdb5';
  const GRID = '#dfe8e2';
  const OCHRE = '#92691e';
  const DEFAULT_COLOR = '#147859';
  const TYPES = { bar: '柱状图', line: '折线图', scatter: '散点图' };
  const finite = Number.isFinite;
  const compact = value => Number(value.toFixed(2));

  function escapeXML(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu, '\uFFFD')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function characterWidth(ch) {
    if (/\p{Mark}/u.test(ch)) return 0;
    if (/[^\u0000-\u024f]/u.test(ch)) return 1;
    if (/\s/.test(ch)) return 0.3;
    if (/[ilI1.,:;'|!]/.test(ch)) return 0.34;
    if (/[MW@mw]/.test(ch)) return 0.85;
    return 0.59;
  }

  function textWidth(value, fontSize) {
    let width = 0;
    for (const ch of String(value)) width += characterWidth(ch) * fontSize;
    return width;
  }

  function shorten(value, available, fontSize) {
    const str = String(value).replace(/\s+/g, ' ').trim();
    if (textWidth(str, fontSize) <= available) return str;
    let result = '', used = fontSize;
    for (const ch of str) {
      used += characterWidth(ch) * fontSize;
      if (used > available) break;
      result += ch;
    }
    return result + '…';
  }

  function wrapText(value, available, fontSize) {
    const result = [];
    for (const paragraph of String(value).split(/\r?\n/)) {
      let line = '', used = 0;
      for (const chunk of paragraph.match(/\s+|[A-Za-z0-9]+|[^\sA-Za-z0-9]/gu) || []) {
        const width = textWidth(chunk, fontSize);
        if (line && used + width > available) {
          result.push(line.trimEnd());
          line = ''; used = 0;
        }
        if (!line && /^\s+$/.test(chunk)) continue;
        if (width <= available) {
          line += chunk; used += width;
        } else {
          for (const ch of chunk) {
            const advance = characterWidth(ch) * fontSize;
            if (line && used + advance > available) {
              result.push(line); line = ''; used = 0;
            }
            line += ch; used += advance;
          }
        }
      }
      result.push(line.trimEnd());
    }
    return result;
  }

  function textAt(x, y, content, size = 11, fill = MUTED, anchor = 'start', weight = 450) {
    return `<text x="${compact(x)}" y="${compact(y)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${escapeXML(content)}</text>`;
  }

  function rule(x1, y1, x2, y2, stroke, extra = '') {
    return `<line x1="${compact(x1)}" y1="${compact(y1)}" x2="${compact(x2)}" y2="${compact(y2)}" stroke="${stroke}" ${extra}/>`;
  }

  function palette(value) {
    let hex = String(value || '');
    if (/^#[a-f0-9]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(ch => ch + ch).join('');
    return /^#[a-f0-9]{6}$/i.test(hex) ? hex.toLowerCase() : DEFAULT_COLOR;
  }

  function mix(color, other, amount) {
    return '#' + [1, 3, 5].map(i => {
      const a = parseInt(color.slice(i, i + 2), 16), b = parseInt(other.slice(i, i + 2), 16);
      return Math.round(a * (1 - amount) + b * amount).toString(16).padStart(2, '0');
    }).join('');
  }

  function numberLabel(value, precision = 6) {
    if (value === 0) return '0';
    const magnitude = Math.abs(value);
    if (magnitude < 0.001 || magnitude >= 1e6) {
      const [mantissa, exponent] = value.toExponential(precision - 1).split('e');
      return `${Number(mantissa)}e${Number(exponent)}`.replace(/-/g, '−');
    }
    return String(Number(value.toPrecision(precision))).replace(/-/g, '−');
  }

  // Work in units near the data's magnitude so spans crossing ±1e308 stay finite.
  function scaleFor(values, tickCount, includeZero) {
    let low = includeZero ? 0 : Infinity, high = includeZero ? 0 : -Infinity;
    for (const v of values) if (finite(v)) { low = Math.min(low, v); high = Math.max(high, v); }
    const magnitude = Math.max(Math.abs(low), Math.abs(high));
    const unit = magnitude === 0 ? 1 : Math.pow(10, Math.floor(Math.log10(magnitude))) || Number.MIN_VALUE;
    low /= unit; high /= unit;
    const minStep = Number.MIN_VALUE / unit;
    if (high === low) {
      const pad = low === 0 ? 1 : Math.max(Math.abs(low) * 0.08, minStep);
      if (!includeZero || low < 0) low -= pad;
      if (!includeZero || high >= 0) high += pad;
    } else if (!includeZero) {
      // Keep measured points away from the frame while preserving tight metric ranges.
      const pad = (high - low) * 0.035;
      low -= pad; high += pad;
    }
    const rough = Math.max((high - low) / tickCount, minStep, Number.EPSILON * Math.max(Math.abs(low), Math.abs(high)) * 4);
    const power = 10 ** Math.floor(Math.log10(rough));
    const multiple = rough / power;
    const nice = [1, 2, 2.5, 5, 10].find(n => n >= multiple - 1e-9) || 10;
    const step = nice * power;
    let first = Math.floor(low / step + 1e-9), last = Math.ceil(high / step - 1e-9);
    if (first === last) { first--; last++; }
    const lower = first * step, upper = last * step;
    const ticks = [];
    for (let i = 0; i <= last - first; i++) {
      const scaled = (first + i) * step, value = scaled * unit;
      if (!finite(value)) continue;
      const precision = Math.min(17, Math.max(5, Math.ceil(Math.log10(Math.abs(scaled) / step || 1)) + 2));
      ticks.push({ fraction: (scaled - lower) / (upper - lower), label: numberLabel(value, precision), zero: scaled === 0 });
    }
    return { ticks, fraction: value => Math.max(0, Math.min(1, (value / unit - lower) / (upper - lower))) };
  }

  function normalize(options) {
    const o = options || {};
    const type = Object.hasOwn(TYPES, o.type) ? o.type : 'bar';
    const mode = o.mode === 'delta' ? 'delta' : 'raw';
    let yLabel = String(o.yLabel || 'Y 指标');
    if (mode === 'delta') yLabel = yLabel.replace(/[%％]|百分比/g, '百分点');
    const source = String(o.source || '').trim();
    const points = (Array.isArray(o.points) ? o.points : []).map((p, i) => ({
      id: String(p?.id ?? i), label: String(p?.label || `记录 ${i + 1}`),
      x: p?.x, y: p?.y, index: i,
    }));
    const baselineId = o.baselineId == null ? null : String(o.baselineId);
    const baselineLabel = String(o.baselineLabel || points.find(p => p.id === baselineId)?.label || '');
    return {
      type, mode, points, baselineId, baselineLabel, yLabel, source,
      xLabel: String(o.xLabel || (type === 'scatter' ? 'X 指标' : '实验配置')),
      selectedId: o.selectedId == null ? null : String(o.selectedId),
      baselineY: finite(o.baselineY) ? o.baselineY : null,
      color: palette(o.color), title: String(o.title || '实验指标对比'),
      grid: o.grid !== false, showValues: Boolean(o.showValues),
    };
  }

  function valueLabel(o, value) {
    return (o.mode === 'delta' && value > 0 ? '+' : '') + numberLabel(value);
  }

  function baselineText(o) {
    if (o.baselineY === null && !o.baselineLabel) return '';
    const name = o.baselineLabel ? `基线 · ${o.baselineLabel}` : '基线';
    return o.baselineY === null ? `${name}（缺测）` : `${name}  ${valueLabel(o, o.baselineY)}`;
  }

  function categoryLabels(o, box, slot, font) {
    const n = o.points.length;
    let widest = 0;
    for (const p of o.points) widest = Math.max(widest, Math.min(82, textWidth(p.label, font)));
    const stride = Math.max(1, Math.ceil((widest + 12) / slot));
    const budget = Math.min(92, slot * stride - 7);
    const selected = o.points.findIndex(p => p.id === o.selectedId);
    const indices = new Set([selected, 0, n - 1]);
    for (let i = 0; i < n; i += stride) indices.add(i);
    const occupied = [], output = [];
    for (const i of indices) {
      if (i < 0) continue;
      const x = box.left + (i + 0.5) * slot;
      const label = shorten(o.points[i].label, budget, font);
      const width = textWidth(label, font);
      const center = Math.max(width / 2 + 3, Math.min(box.width - width / 2 - 3, x));
      const a = center - width / 2 - 2, b = center + width / 2 + 2;
      if (occupied.some(r => a < r[1] && b > r[0])) continue;
      occupied.push([a, b]);
      output.push(textAt(center, box.bottom + 18, label, font, i === selected ? INK : MUTED, 'middle', i === selected ? 650 : 450));
    }
    return output.join('');
  }

  function valueLabels(o, plotted, box, font, labelColor) {
    const occupied = [], output = [];
    const priority = p => p.id === o.selectedId ? 0 : p.id === o.baselineId ? 1 : 2;
    const ordered = [...plotted].sort((a, b) => priority(a) - priority(b));
    for (const p of ordered) {
      const value = valueLabel(o, p.y), width = textWidth(value, font) + 6;
      const up = { x: p.cx, y: p.cy - 8 }, down = { x: p.cx, y: p.cy + font + 8 };
      const axisSide = o.type === 'bar' && p.y < 0 ? [down, up] : [up, down];
      const candidates = o.type === 'bar' ? axisSide : [...axisSide, { x: p.cx + 11 + width / 2, y: p.cy + 4 }, { x: p.cx - 11 - width / 2, y: p.cy + 4 }];
      for (const position of candidates) {
        const x = Math.max(box.left + width / 2, Math.min(box.right - width / 2, position.x));
        const y = position.y;
        if (y - font < box.top - 10 || y > box.bottom + 3) continue;
        const rect = { l: x - width / 2, r: x + width / 2, t: y - font, b: y + 3 };
        if (occupied.some(b => rect.l < b.r && rect.r > b.l && rect.t < b.b && rect.b > b.t)) continue;
        occupied.push(rect);
        output.push(textAt(x, y, value, font, p.id === o.selectedId ? labelColor : MUTED, 'middle', p.id === o.selectedId ? 700 : 500));
        break;
      }
    }
    return `<g pointer-events="none">${output.join('')}</g>`;
  }

  function emptyPlot(o, width, height) {
    const x = width / 2, y = height / 2 - 15;
    let help = o.type === 'scatter' ? '请在同一条记录中填写 X、Y 指标。' : '请在记录中填写所选 Y 指标的数值。';
    if (o.mode === 'delta' && o.baselineY === null) help = '请设置有 Y 指标数值的基线记录。';
    return `<g aria-hidden="true" fill="none" stroke="#a9bdb2" stroke-width="1.7" stroke-linecap="round">${rule(x - 13, y + 4, x + 13, y + 4, '#a9bdb2')}${rule(x - 8, y, x - 8, y - 7, '#a9bdb2')}${rule(x, y, x, y - 14, '#87a696')}${rule(x + 8, y, x + 8, y - 10, '#a9bdb2')}</g>` +
      textAt(x, y + 29, '暂无可绘制的数据', 14, INK, 'middle', 650) + textAt(x, y + 51, help, 11, MUTED, 'middle');
  }

  function plot(o, width, height, report = false) {
    const valid = o.points.filter(p => finite(p.y) && (o.type !== 'scatter' || finite(p.x)));
    if (!valid.length) return emptyPlot(o, width, height);
    const compactLayout = width < 440;
    const font = compactLayout ? 10 : 11.5;
    const yValues = valid.map(p => p.y);
    if (o.baselineY !== null) yValues.push(o.baselineY);
    const sy = scaleFor(yValues, height < 206 ? 3 : height < 285 ? 4 : 5, o.type === 'bar');
    let tickWidth = 12;
    for (const tick of sy.ticks) tickWidth = Math.max(tickWidth, textWidth(tick.label, font));
    const box = {
      width, left: Math.min(Math.ceil(tickWidth) + 15, width * 0.55), right: width - (compactLayout ? 12 : 18),
      top: height < 180 ? 28 : 34, bottom: height - (height < 180 ? 43 : 51),
    };
    const plotWidth = box.right - box.left, plotHeight = box.bottom - box.top;
    const yAt = fraction => box.bottom - fraction * plotHeight;
    const xAt = fraction => box.left + fraction * plotWidth;
    const sx = o.type === 'scatter' ? scaleFor(valid.map(p => p.x), width < 400 ? 3 : width < 680 ? 6 : 8, false) : null;
    const slot = plotWidth / o.points.length;
    const plotted = valid.map(p => ({ ...p, cx: sx ? xAt(sx.fraction(p.x)) : box.left + (p.index + 0.5) * slot, cy: yAt(sy.fraction(p.y)) }));
    const parts = [], baseline = baselineText(o);
    const headerY = height < 180 ? 12 : 15;
    let yTitleBudget = width - 14;
    if (baseline && !report) {
      const cap = Math.min(180, width * 0.40), caption = shorten(baseline, cap - 21, font);
      const captionWidth = textWidth(caption, font), end = width - 6, start = end - captionWidth;
      if (o.baselineY !== null) parts.push(rule(start - 21, headerY - 4, start - 5, headerY - 4, OCHRE, 'stroke-dasharray="4 3" stroke-width="1.35"'));
      parts.push(textAt(end, headerY, caption, font, OCHRE, 'end', 550));
      yTitleBudget = start - 29;
    }
    parts.push(textAt(3, headerY, shorten(o.yLabel, yTitleBudget, font), font, INK, 'start', 600));
    for (const tick of sy.ticks) {
      const y = yAt(tick.fraction);
      if (o.grid && tick.fraction > 0.00001) parts.push(rule(box.left, y, box.right, y, GRID, 'stroke-width="1" stroke-dasharray="3 4"'));
      parts.push(textAt(box.left - 8, y + font * 0.34, tick.label, font, MUTED, 'end'));
    }
    if (sx) {
      for (const tick of sx.ticks) {
        const x = xAt(tick.fraction), widthOfText = textWidth(tick.label, font);
        if (o.grid && tick.fraction > 0 && tick.fraction < 1) parts.push(rule(x, box.top, x, box.bottom, GRID, 'stroke-width="0.8" stroke-dasharray="3 4"'));
        parts.push(rule(x, box.bottom, x, box.bottom + 4, AXIS), textAt(Math.min(width - widthOfText / 2 - 2, Math.max(widthOfText / 2 + 2, x)), box.bottom + 18, tick.label, font, MUTED, 'middle'));
      }
    } else {
      parts.push(categoryLabels(o, box, slot, font));
    }
    parts.push(rule(box.left, box.bottom, box.right, box.bottom, AXIS, 'stroke-width="1"'));
    parts.push(textAt((box.left + box.right) / 2, height - 7, shorten(o.xLabel, plotWidth, font), font, INK, 'middle', 550));
    const baselineLine = o.baselineY === null ? '' : rule(box.left, yAt(sy.fraction(o.baselineY)), box.right, yAt(sy.fraction(o.baselineY)), OCHRE, 'stroke-width="1.35" stroke-dasharray="6 4" pointer-events="none"');
    if (o.type !== 'bar') parts.push(baselineLine);
    if (o.type === 'line') {
      let previous = -2, path = '';
      for (const p of plotted) {
        path += `${p.index === previous + 1 ? 'L' : 'M'}${compact(p.cx)},${compact(p.cy)} `;
        previous = p.index;
      }
      parts.push(`<path d="${path.trim()}" fill="none" stroke="${o.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
    const zeroY = o.type === 'bar' ? yAt(sy.fraction(0)) : 0;
    if (o.type === 'bar' && zeroY > box.top + 1 && zeroY < box.bottom - 1) parts.push(rule(box.left, zeroY, box.right, zeroY, AXIS, 'stroke-width="1.15"'));
    const barWidth = Math.min(54, slot * 0.61);
    const hasSelection = plotted.some(p => p.id === o.selectedId);
    const mutedColor = mix(o.color, '#ffffff', 0.37);
    const pointStroke = mix(o.color, '#203d31', 0.34);
    const lightStroke = mix(o.color, '#77877d', 0.35);
    const selectedColor = mix(o.color, '#102f23', 0.36);
    const radius = o.type === 'scatter' ? 4.7 : 4.1;
    // Draw the selected dot last so tied scatter coordinates still show the selection.
    const order = hasSelection ? [...plotted.filter(p => p.id !== o.selectedId), ...plotted.filter(p => p.id === o.selectedId)] : plotted;
    for (const p of order) {
      const selected = p.id === o.selectedId, active = selected || !hasSelection;
      const fill = active ? o.color : mutedColor;
      const summary = `${p.label} · ${o.type === 'scatter' ? o.xLabel + ' ' + numberLabel(p.x) + ' · ' : ''}${o.yLabel} ${valueLabel(o, p.y)}`;
      const attrs = report ? '' : ` data-row="${escapeXML(p.id)}" role="button" tabindex="0" cursor="pointer" aria-label="${escapeXML(summary)}"`;
      parts.push(`<g${attrs}><title>${escapeXML(summary)}</title>`);
      if (o.type === 'bar') {
        const top = Math.min(p.cy, zeroY), barHeight = Math.abs(zeroY - p.cy);
        if (!report) {
          const hitWidth = Math.min(slot - Math.min(0.2, slot / 8), Math.max(18, barWidth));
          const hitTop = Math.max(box.top - 3, top - 3), hitBottom = Math.min(box.bottom + 3, Math.max(p.cy, zeroY) + 3);
          parts.push(`<rect x="${compact(p.cx - hitWidth / 2)}" y="${compact(hitTop)}" width="${compact(hitWidth)}" height="${compact(Math.max(6, hitBottom - hitTop))}" fill="transparent"/>`);
        }
        if (barHeight < 0.02) parts.push(rule(p.cx - barWidth / 2, zeroY, p.cx + barWidth / 2, zeroY, active ? pointStroke : lightStroke, 'stroke-width="2"'));
        else parts.push(`<rect x="${compact(p.cx - barWidth / 2)}" y="${compact(top)}" width="${compact(barWidth)}" height="${compact(barHeight)}" rx="${compact(Math.min(3, barWidth / 6, barHeight / 3))}" fill="${fill}" stroke="${active ? pointStroke : lightStroke}" stroke-width="0.65"/>`);
      } else {
        if (!report) parts.push(`<circle cx="${compact(p.cx)}" cy="${compact(p.cy)}" r="10" fill="transparent"/>`);
        if (selected) parts.push(`<circle cx="${compact(p.cx)}" cy="${compact(p.cy)}" r="${radius + 4}" fill="${mix(o.color, '#ffffff', 0.82)}" stroke="${mix(o.color, '#ffffff', 0.5)}" stroke-width="0.8"/>`);
        parts.push(`<circle cx="${compact(p.cx)}" cy="${compact(p.cy)}" r="${selected ? radius + 0.7 : radius}" fill="${fill}" stroke="${o.type === 'line' ? '#ffffff' : (active ? pointStroke : lightStroke)}" stroke-width="${o.type === 'line' ? 1.6 : 0.95}"/>`);
      }
      parts.push('</g>');
    }
    if (o.type === 'bar') parts.push(baselineLine);
    if (o.showValues) parts.push(valueLabels(o, plotted, box, compactLayout ? 10 : 11.5, selectedColor));
    return parts.join('');
  }

  function svg(options = {}) {
    const o = normalize(options);
    const width = finite(options.width) ? Math.max(180, Math.min(8192, options.width)) : 720;
    const height = finite(options.height) ? Math.max(140, Math.min(8192, options.height)) : 295;
    const description = [TYPES[o.type], o.xLabel, o.yLabel, baselineText(o), o.source].filter(Boolean).join(' · ');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${compact(width)}" height="${compact(height)}" viewBox="0 0 ${compact(width)} ${compact(height)}" role="group" aria-label="${escapeXML(o.title)}" font-family="${FONT}" fill="${INK}"><title>${escapeXML(o.title)}</title><desc>${escapeXML(description)}</desc><rect width="100%" height="100%" fill="#ffffff"/>${plot(o, width, height)}</svg>`;
  }

  function reportFigure(o) {
    const width = 1000, pad = 35, inside = width - 2 * pad, scale = 1.6;
    const titleLines = wrapText(o.title, inside, 25);
    const sourceLines = wrapText(o.source || '未填写来源', inside - 76, 11.5);
    const legendY = 67 + (titleLines.length - 1) * 32 + 27;
    const plotTop = legendY + 22, plotHeight = 358;
    const sourceY = plotTop + plotHeight + 35;
    const logicalHeight = Math.max(562.5, sourceY + 16 * (sourceLines.length - 1) + 25);
    const pixelHeight = Math.ceil(logicalHeight * scale);
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${pixelHeight}" viewBox="0 0 ${width} ${pixelHeight / scale}" font-family="${FONT}" fill="${INK}">`,
      `<rect width="100%" height="100%" fill="#ffffff"/>`,
      textAt(pad, 27, '格物 LabPlot', 12, DEFAULT_COLOR, 'start', 700),
      textAt(width - pad, 27, TYPES[o.type], 11.5, MUTED, 'end', 500),
    ];
    titleLines.forEach((line, i) => parts.push(textAt(pad, 67 + i * 32, line, 25, INK, 'start', 680)));
    const selected = o.points.find(p => p.id === o.selectedId);
    const series = selected ? `当前记录 · ${selected.label}` : o.yLabel;
    const legend = shorten(series, 350, 12);
    parts.push(`<circle cx="${pad + 5}" cy="${legendY - 4}" r="4.5" fill="${o.color}" stroke="${mix(o.color, INK, 0.4)}" stroke-width="1"/>`, textAt(pad + 17, legendY, legend, 12, INK));
    const baseline = baselineText(o);
    if (baseline) {
      const start = pad + textWidth(legend, 12) + 47;
      if (o.baselineY !== null) parts.push(rule(start, legendY - 4, start + 22, legendY - 4, OCHRE, 'stroke-width="1.6" stroke-dasharray="6 4"'));
      parts.push(textAt(start + 29, legendY, shorten(baseline, width - pad - start - 29, 12), 12, OCHRE));
    }
    parts.push(`<g transform="translate(${pad} ${plotTop})">${plot(o, inside, plotHeight, true)}</g>`, rule(pad, sourceY - 19, width - pad, sourceY - 19, GRID), textAt(pad, sourceY, '数据来源', 11.5, INK, 'start', 650));
    sourceLines.forEach((line, i) => parts.push(textAt(pad + 76, sourceY + i * 16, line, 11.5, MUTED)));
    parts.push('</svg>');
    return { markup: parts.join(''), width: 1600, height: pixelHeight };
  }

  async function png(options = {}) {
    const figure = reportFigure(normalize(options));
    const image = new Image();
    const objectURL = URL.createObjectURL(new Blob([figure.markup], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('图表图像加载失败，请重新导出。'));
        image.src = objectURL;
      });
      const canvas = document.createElement('canvas');
      canvas.width = figure.width; canvas.height = figure.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法创建 PNG 画布。');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 导出失败，请重试。')), 'image/png'));
    } finally {
      URL.revokeObjectURL(objectURL);
    }
  }

  const charts = Object.freeze({ svg, png });
  globalThis.LabCharts = charts;
  if (typeof module !== 'undefined' && module.exports) module.exports = charts;
})();
