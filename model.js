/* Shared by the offline page and the Node test suite. */
(() => {
  'use strict';

  let sequence = 0;

  function uid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    sequence += 1;
    return 'lab-' + Date.now().toString(36) + '-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function experiment(id, title, columns, chart = {}) {
    return {
      id, title, description: '', columns, rows: [], baseline: '', selected: '',
      chart: {
        x: 0, y: 1, type: 'scatter', mode: 'raw',
        color: '#6387f1', grid: true, showValues: true, title: '', ...chart
      },
      source: null, modified: false
    };
  }

  function blank(title = '未命名实验') {
    return experiment(uid(), title, [{ name: '指标 X', unit: '' }, { name: '指标 Y', unit: '' }]);
  }

  function row(label = '', values = []) {
    return { id: uid(), label: String(label), values: values.map(value => String(value ?? '')) };
  }

  function samples() {
    const bert = experiment('bert', 'BERT 预训练任务消融', [
      { name: 'MNLI-m', unit: '%' }, { name: 'QNLI', unit: '%' },
      { name: 'MRPC', unit: '%' }, { name: 'SST-2', unit: '%' }, { name: 'SQuAD F1', unit: '分' }
    ], { type: 'bar', mode: 'delta' });
    bert.description = '比较四种配置在五项开发集任务上的表现。No NSP 移除下一句预测，LTR 改为从左到右建模，最后一组在微调时加入双向 LSTM。';
    bert.rows = [
      ['bert-base', 'BERT Base', '84.4', '88.4', '86.7', '92.7', '88.5'],
      ['no-nsp', 'No NSP', '83.9', '84.9', '86.5', '92.6', '87.9'],
      ['ltr', 'LTR + No NSP', '82.1', '84.3', '77.5', '92.1', '77.8'],
      ['bilstm', '+ BiLSTM', '82.1', '84.1', '75.7', '91.6', '84.9']
    ].map(([id, label, ...values]) => ({ id, label, values }));
    bert.baseline = 'bert-base';
    bert.selected = 'no-nsp';
    bert.source = { label: 'Devlin et al. · NAACL 2019 · 表 5', url: 'https://aclanthology.org/N19-1423.pdf#page=8' };

    const efficient = experiment('efficientnet', 'EfficientNet 模型缩放', [
      { name: '参数量', unit: 'M' }, { name: 'FLOPs', unit: 'B' },
      { name: 'Top-1', unit: '%' }, { name: 'Top-5', unit: '%' }
    ], { x: 0, y: 2 });
    efficient.description = '比较 EfficientNet B0–B7 在 ImageNet 上的准确率、参数量和计算量。M 表示百万参数，B 表示十亿次浮点运算。';
    efficient.rows = [
      ['5.3', '0.39', '76.3', '93.2'], ['7.8', '0.70', '78.8', '94.4'],
      ['9.2', '1.0', '79.8', '94.9'], ['12', '1.8', '81.1', '95.5'],
      ['19', '4.2', '82.6', '96.3'], ['30', '9.9', '83.3', '96.7'],
      ['43', '19', '84.0', '96.9'], ['66', '37', '84.4', '97.1']
    ].map((values, index) => ({ id: 'b' + index, label: 'B' + index, values }));
    efficient.baseline = 'b0';
    efficient.selected = 'b7';
    efficient.source = { label: 'Tan & Le · ICML 2019 · 表 2', url: 'https://proceedings.mlr.press/v97/tan19a/tan19a.pdf#page=6' };
    return [bert, efficient];
  }

  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

  function number(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!decimal.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }

  function fmt(raw) {
    const value = number(raw);
    if (value === null) return '—';
    if (typeof raw === 'string' || Number.isInteger(value)) return String(value);
    // Only snap to a shorter decimal when it is within rounding noise of the original.
    const rounded = Number(value.toPrecision(12));
    const tolerance = Math.abs(value) * (512 * Number.EPSILON);
    return String(Math.abs(rounded - value) <= tolerance ? rounded : value);
  }

  function deltaUnit(unit) {
    return ['%', '％', '百分比'].includes(unit) ? '个百分点' : unit;
  }

  function difference(left, right) {
    const a = number(left), b = number(right);
    if (a === null || b === null) return null;
    if (a === b) return 0;
    // Align the two decimal measurements before subtracting close scores.
    function decimalParts(value) {
      const [mantissa, exponent = '0'] = String(value).split('e');
      const [integer, fraction = ''] = mantissa.split('.');
      return { digits: BigInt(integer + fraction), power: Number(exponent) - fraction.length };
    }
    const l = decimalParts(a), r = decimalParts(b), power = Math.min(l.power, r.power);
    const digits = l.digits * 10n ** BigInt(l.power - power) - r.digits * 10n ** BigInt(r.power - power);
    return number(String(digits) + 'e' + String(power));
  }

  function compare(exp, selectedId, baselineId) {
    const selected = exp.rows.find(item => item.id === selectedId);
    const baseline = exp.rows.find(item => item.id === baselineId);
    const forAxis = axis => difference(selected?.values[axis], baseline?.values[axis]);
    return { dx: forAxis(exp.chart.x), dy: forAxis(exp.chart.y) };
  }

  function points(exp) {
    const result = [];
    for (const { id, label, values } of exp.rows) {
      const x = number(values[exp.chart.x]);
      const y = number(values[exp.chart.y]);
      if (x !== null && y !== null) result.push({ id, label, x, y });
    }
    return result;
  }

  const headerPunctuation = /[\\[\]()（）]/g;
  const escapedHeaderPunctuation = /\\([\\[\]()（）])/g;

  function columnHeader(column) {
    const escape = value => value.replace(headerPunctuation, '\\$&');
    const name = escape(column.name);
    return column.unit ? name + ' [' + escape(column.unit) + ']' : name;
  }

  function parseColumn(input) {
    const text = input.trim();
    const unescape = value => value.trim().replace(escapedHeaderPunctuation, '$1');
    const closing = text.slice(-1);
    const opening = { ']': '[', ')': '(', '）': '（' }[closing];
    if (opening) {
      const starts = [];
      for (let i = 0; i < text.length; i += 1) {
        if (text[i] === '\\') {
          i += 1;
        } else if (text[i] === opening) {
          starts.push(i);
        } else if (text[i] === closing && starts.length) {
          const start = starts.pop();
          if (i === text.length - 1) {
            return { name: unescape(text.slice(0, start)), unit: unescape(text.slice(start + 1, i)) };
          }
        }
      }
    }
    return { name: unescape(text), unit: '' };
  }

  // Quoting alone does not stop spreadsheet software from interpreting textual cells as formulas.
  const formulaPrefix = /^(?:[\t\r\n]|\s*[=+@\-＝＋＠－])/u;

  function protectText(value) {
    return value.startsWith("'") || formulaPrefix.test(value) ? "'" + value : value;
  }

  function unprotectText(value) {
    if (value.startsWith("'")) {
      const rest = value.slice(1);
      if (rest.startsWith("'") || formulaPrefix.test(rest)) return rest;
    }
    return value;
  }

  function quoteCSV(value) {
    return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  }

  function csv(exp) {
    const headers = ['配置名称', ...exp.columns.map(column => protectText(columnHeader(column)))];
    const records = [headers];
    for (const { label, values } of exp.rows) {
      const cells = values.map(value => value.trim() && number(value) === null ? protectText(value) : value);
      records.push([protectText(label), ...cells]);
    }
    return '\uFEFF' + records.map(fields => fields.map(quoteCSV).join(',')).join('\r\n') + '\r\n';
  }

  function readCSV(input) {
    const text = input.replace(/^\uFEFF/, '');
    const records = [];
    let fields = [], field = '', quoted = false, closedQuote = false;
    let line = 1, startLine = 1;

    function finishRecord() {
      if (fields.length || field.trim() || closedQuote) {
        fields.push(field);
        records.push({ fields, line: startLine });
      }
      fields = [];
      field = '';
      closedQuote = false;
    }

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
          closedQuote = true;
        } else {
          field += char;
          if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line += 1;
        }
      } else if (char === ',') {
        fields.push(field);
        field = '';
        closedQuote = false;
      } else if (char === '\n' || char === '\r') {
        finishRecord();
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        line += 1;
        startLine = line;
      } else if (closedQuote) {
        throw new Error('第 ' + line + ' 行的结束引号后应接逗号或换行。');
      } else if (char === '"') {
        if (field.length) throw new Error('第 ' + line + ' 行的文本引号应位于字段开头。');
        quoted = true;
      } else {
        field += char;
      }
    }
    if (quoted) throw new Error('第 ' + startLine + ' 行起的字段缺少结束引号。');
    finishRecord();
    return records;
  }

  function fromCSV(text, title = '导入的实验') {
    if (typeof text !== 'string') throw new Error('请选择 UTF-8 编码的 CSV 文本文件。');
    const [header, ...records] = readCSV(text);
    if (!header || header.fields.length < 3 || !header.fields[0].trim()) {
      throw new Error('表头首列需填写配置名称，其后至少需要两列数值指标。');
    }
    const columns = header.fields.slice(1).map((value, index) => {
      const column = parseColumn(unprotectText(value));
      if (!column.name) throw new Error('表头第 ' + (index + 2) + ' 列缺少指标名称。');
      return column;
    });
    const rows = records.map(({ fields, line }) => {
      if (fields.length !== header.fields.length) {
        throw new Error('第 ' + line + ' 行有 ' + fields.length + ' 列，表头要求 ' + header.fields.length + ' 列。');
      }
      const values = fields.slice(1);
      values.forEach((value, index) => {
        if (value.trim() && number(value) === null) {
          throw new Error('第 ' + line + ' 行「' + columns[index].name + '」请填写有限的十进制数或留空。');
        }
      });
      return row(unprotectText(fields[0]), values);
    });
    const imported = experiment(uid(), title, columns);
    imported.rows = rows;
    imported.baseline = rows[0]?.id ?? '';
    imported.selected = (rows[1] ?? rows[0])?.id ?? '';
    imported.modified = true;
    return imported;
  }

  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isString = value => typeof value === 'string';
  const isId = value => isString(value) && value.trim().length > 0;

  function validSource(source) {
    if (source === null) return true;
    if (!isObject(source) || !isString(source.label) || !isString(source.url)) return false;
    try {
      const url = new URL(source.url);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function validExperiment(exp) {
    if (!isObject(exp) || !isId(exp.id) || !isString(exp.title) || !isString(exp.description) ||
        typeof exp.modified !== 'boolean' || !validSource(exp.source)) return false;
    if (!Array.isArray(exp.columns) || exp.columns.length < 2) return false;
    for (const column of exp.columns) {
      if (!isObject(column) || !isString(column.name) || !isString(column.unit)) return false;
    }
    const chart = exp.chart;
    const validAxis = index => Number.isInteger(index) && index >= 0 && index < exp.columns.length;
    if (!isObject(chart) || !validAxis(chart.x) || !validAxis(chart.y) ||
        !['bar', 'scatter', 'line'].includes(chart.type) || !['raw', 'delta'].includes(chart.mode) ||
        !isString(chart.color) || !/^#[\da-f]{6}$/i.test(chart.color) || !isString(chart.title) ||
        typeof chart.grid !== 'boolean' || typeof chart.showValues !== 'boolean') return false;
    if (!Array.isArray(exp.rows)) return false;
    const ids = new Set();
    for (const item of exp.rows) {
      if (!isObject(item) || !isId(item.id) || ids.has(item.id) || !isString(item.label) ||
          !Array.isArray(item.values) || item.values.length !== exp.columns.length) return false;
      for (const value of item.values) {
        if (!isString(value)) return false;
      }
      ids.add(item.id);
    }
    return [exp.baseline, exp.selected].every(id => id === '' || ids.has(id));
  }

  function validBook(book) {
    if (!isObject(book) || book.version !== 1 || !Array.isArray(book.experiments)) return false;
    const ids = new Set();
    for (const exp of book.experiments) {
      if (!validExperiment(exp) || ids.has(exp.id)) return false;
      ids.add(exp.id);
    }
    return true;
  }

  const api = { uid, samples, blank, row, number, fmt, deltaUnit, difference, compare, points, parseColumn, columnHeader, csv, fromCSV, validBook };
  globalThis.LabModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
