const { test } = require('node:test');
const assert = require('node:assert/strict');
const charts = require('./chart.js');

const records = (...values) => values.map((y, i) => ({ id: `r${i}`, label: `B${i}`, x: i, y }));
const draw = options => charts.svg({ width: 640, height: 290, ...options });

function row(markup, id) {
  return markup.match(new RegExp(`<g\\b[^>]*\\bdata-row="${id}"[^>]*>[\\s\\S]*?</g>`))?.[0];
}

function coordinate(element, axis) {
  const attribute = element.match(new RegExp(`\\b${axis}="([^"]+)"`));
  assert.ok(attribute, `${axis} missing from ${element}`);
  return Number(attribute[1]);
}

function glyph(markup, id, tag) {
  const tags = row(markup, id)?.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) || [];
  const drawn = tags.filter(t => !/fill="(?:transparent|none)"/.test(t));
  assert.ok(drawn.length, `Record ${id} must have a visible ${tag}`);
  return drawn.at(-1);
}

test('bars for positive and negative observations share the zero origin', () => {
  const s = draw({ type: 'bar', points: records(6, -3, 0), baselineY: 0 });
  const positive = glyph(s, 'r0', 'rect');
  const negative = glyph(s, 'r1', 'rect');
  assert.ok(Math.abs(coordinate(positive, 'y') + coordinate(positive, 'height') - coordinate(negative, 'y')) < 0.03);
  assert.ok(Math.abs(coordinate(positive, 'height') / coordinate(negative, 'height') - 2) < 0.02);
  assert.ok(row(s, 'r2'), 'A measured zero must remain selectable');
});

test('line continuity stops at missing records and categorical plots accept missing numeric x', () => {
  const points = records(2, 4, null, 3, 5).map(p => ({ ...p, x: null }));
  const s = draw({ type: 'line', points });
  for (const id of ['r0', 'r1', 'r3', 'r4']) assert.ok(row(s, id));
  assert.equal(row(s, 'r2'), undefined);
  const paths = [...s.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)].map(m => m[1]);
  assert.equal(paths.reduce((n, d) => n + (d.match(/L/gi) || []).length, 0), 2, 'Only the two observed neighboring pairs may be joined');
});

test('scatter distances follow numeric x values and only complete pairs are drawn', () => {
  const points = records(1, 1, 1, null, 9).map((p, i) => ({ ...p, x: [0, 1, 10, 15, null][i] }));
  const s = draw({ type: 'scatter', points });
  const x = [0, 1, 2].map(i => coordinate(glyph(s, `r${i}`, 'circle'), 'cx'));
  assert.ok(Math.abs((x[1] - x[0]) / (x[2] - x[0]) - 0.1) < 0.001);
  assert.equal(row(s, 'r3'), undefined);
  assert.equal(row(s, 'r4'), undefined);
});

test('a delta keeps its transformed value, describes percentage points, and names the baseline', () => {
  const s = draw({ type: 'bar', mode: 'delta', points: records(0, 8.1), baselineId: 'r0', baselineY: 0, baselineLabel: '对照组', selectedId: 'r1', yLabel: 'Top-1（%）', showValues: true });
  assert.match(s, /百分点/);
  assert.match(s, /对照组/);
  assert.match(s, /8\.1/);
  assert.match(s, /stroke-dasharray=/);
});

test('untrusted report fields, record IDs and palette values cannot create active SVG content', () => {
  const unsafe = '<script onload="alert(1)">&</script>';
  const s = draw({ type: 'bar', title: unsafe, source: unsafe, xLabel: unsafe, yLabel: unsafe, color: 'url(https://example.invalid/p)', points: [{ id: '\" onclick=\"no', label: unsafe, x: 1, y: 2 }] });
  assert.ok(!s.includes('<script') && !s.includes(' onclick="') && !s.includes('url('));
  assert.match(s, /&lt;script/);
  assert.match(s, /data-row="&quot; onclick=&quot;no"/);
});

test('empty plots say which values are needed and finite extreme or constant series generate usable coordinates', () => {
  const empty = draw({ type: 'scatter', points: [{ id: 'z', label: 'Z', x: null, y: 2 }] });
  assert.match(empty, /暂无/);
  assert.match(empty, /X.*Y/);
  for (const ys of [[0], [-4, -4], [-1e308, 0, 1e308], [Number.MIN_VALUE], [Number.MAX_VALUE]]) {
    for (const type of ['bar', 'line', 'scatter']) {
      const s = draw({ type, width: 290, height: 190, points: records(...ys), grid: true, showValues: true });
      assert.doesNotMatch(s, /NaN|Infinity|undefined/);
      for (const [i] of ys.entries()) assert.ok(row(s, `r${i}`));
    }
  }
});

test('distinct ticks retain distinct labels near the limits of floating-point precision', () => {
  for (const values of [[0.3, 0.30000000000000004], [1e308, 1.0000000000000002e308]]) {
    const s = draw({ type: 'line', points: records(...values) });
    const labels = [...s.matchAll(/<text[^>]*text-anchor="end"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
    assert.ok(labels.length >= 2, 'The numeric axis should establish a range');
    assert.equal(new Set(labels).size, labels.length, `Repeated tick values: ${labels.join(', ')}`);
  }
});

test('missing delta measurements identify the selected baseline value needed for comparison', () => {
  const s = draw({ type: 'line', mode: 'delta', points: records(null, null), baselineId: 'r0', baselineLabel: 'B0', baselineY: null });
  assert.match(s, /<text[^>]*>[^<]*基线[^<]*<\/text>/);
});
