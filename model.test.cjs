const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('./model.js');

test('默认 BERT 消融数据对应 NAACL 表 5 的四种配置与五项开发集指标', () => {
  const [p] = M.samples();
  assert.equal(p.title, 'BERT 预训练任务消融');
  assert.deepEqual(p.columns.map(c => [c.name, c.unit]), [
    ['MNLI-m', '%'], ['QNLI', '%'], ['MRPC', '%'], ['SST-2', '%'], ['SQuAD F1', '分']
  ]);
  assert.deepEqual(p.rows.map(r => [r.id, r.label, ...r.values]), [
    ['bert-base', 'BERT Base', '84.4', '88.4', '86.7', '92.7', '88.5'],
    ['no-nsp', 'No NSP', '83.9', '84.9', '86.5', '92.6', '87.9'],
    ['ltr', 'LTR + No NSP', '82.1', '84.3', '77.5', '92.1', '77.8'],
    ['bilstm', '+ BiLSTM', '82.1', '84.1', '75.7', '91.6', '84.9']
  ]);
  assert.deepEqual([p.chart.type, p.chart.mode, p.chart.x, p.chart.y], ['bar', 'delta', 0, 1]);
  assert.deepEqual([p.selected, p.baseline], ['no-nsp', 'bert-base']);
  p.rows[0].values[0] = '0';
  assert.equal(M.samples()[0].rows[0].values[0], '84.4');
});

test('移除 NSP 时 MNLI-m 和 QNLI 的原始差值为 −0.5 和 −3.5 个百分点', () => {
  const [p] = M.samples();
  assert.deepEqual(M.compare(p, p.selected, p.baseline), { dx: -0.5, dy: -3.5 });
  assert.deepEqual(M.compare(p, p.baseline, p.selected), { dx: 0.5, dy: 3.5 });
  assert.equal(M.deltaUnit('%'), '个百分点');
  assert.equal(M.deltaUnit('分'), '分');
  assert.equal(M.deltaUnit('ms'), 'ms');
});

test('EfficientNet 对照使用 ICML 表 2 的八条记录，切换坐标会重算读数', () => {
  const [, p] = M.samples();
  assert.deepEqual(p.columns.map(c => [c.name, c.unit]), [
    ['参数量', 'M'], ['FLOPs', 'B'], ['Top-1', '%'], ['Top-5', '%']
  ]);
  assert.equal(p.rows.length, 8);
  assert.deepEqual(p.rows[0].values, ['5.3', '0.39', '76.3', '93.2']);
  assert.deepEqual(p.rows[7].values, ['66', '37', '84.4', '97.1']);
  assert.deepEqual([p.chart.type, p.chart.mode, p.chart.x, p.chart.y], ['scatter', 'raw', 0, 2]);
  assert.equal(M.fmt(M.compare(p, p.selected, p.baseline).dx), '60.7');
  assert.equal(M.fmt(M.compare(p, p.selected, p.baseline).dy), '8.1');
  p.chart.x = 1;
  p.chart.y = 3;
  assert.deepEqual(M.points(p).at(-1), { id: p.selected, label: 'B7', x: 37, y: 97.1 });
  assert.equal(M.fmt(M.compare(p, p.selected, p.baseline).dy), '3.9');
});

test('只接受有限的十进制数，零和科学计数法可绘图，缺失只影响对应坐标的差值', () => {
  assert.equal(M.number('0'), 0);
  assert.equal(M.number(' -.25e-2 '), -0.0025);
  assert.equal(M.number('.5'), 0.5);
  for (const raw of ['', ' ', 'NaN', 'Infinity', '0x10', '1x', '1e309', null, false, []]) {
    assert.equal(M.number(raw), null);
  }
  assert.equal(M.fmt(null), '—');
  assert.equal(Number(M.fmt(1.23e-12)), 1.23e-12);
  const p = M.blank('示例');
  assert.deepEqual(p.columns.map(c => c.name), ['指标 X', '指标 Y']);
  p.rows = [M.row('零', ['0', '0']), M.row('缺测', ['1', '']), M.row('有误', ['?', '4'])];
  assert.equal(new Set(p.rows.map(r => r.id)).size, 3);
  assert.deepEqual(M.points(p), [{ id: p.rows[0].id, label: '零', x: 0, y: 0 }]);
  assert.deepEqual(M.compare(p, p.rows[1].id, p.rows[0].id), { dx: 1, dy: null });
  assert.deepEqual(M.compare(p, p.rows[2].id, p.rows[0].id), { dx: null, dy: 4 });
  assert.deepEqual(M.compare(p, '', p.rows[0].id), { dx: null, dy: null });
});

test('数值显示剔除相减产生的浮点尾数，保留输入中的精确整数和有效小数', () => {
  assert.equal(M.fmt(92.6 - 92.7), '-0.1');
  assert.equal(M.fmt(9876543210123), '9876543210123');
  assert.equal(M.fmt(1.234567890123456), '1.234567890123456');
});

test('CSV 往返保留单位、带引号与换行的标签、原始小数精度以及缺测', () => {
  const p = M.blank('往返');
  p.columns = [{ name: '速度,均值', unit: 'm/s' }, { name: '损失 [验证]', unit: '' }];
  p.rows = [
    M.row('第一组,"A"\n复测', ['1.20', '']), M.row('第二组', ['-2', '2e-3']),
    M.row('未测', ['\t', ' '])
  ];
  const data = M.csv(p);
  assert.equal(data[0], '\uFEFF');
  const copy = M.fromCSV(data, '导入');
  assert.deepEqual(copy.columns, p.columns);
  assert.equal(copy.title, '导入');
  assert.deepEqual(copy.rows.map(({ label, values }) => [label, values]),
                   p.rows.map(({ label, values }) => [label, values]));
  assert.equal(M.validBook({ version: 1, experiments: [copy] }), true);
});

test('外部 CSV 可用中英文括号标注单位，支持表头后没有数据和整条缺测记录', () => {
  const data = '配置,耗时 (ms),准确率（%）\r\n,,\r\n空行也可,,\r\n';
  const p = M.fromCSV(data, '导入');
  assert.deepEqual(p.columns, [{ name: '耗时', unit: 'ms' }, { name: '准确率', unit: '%' }]);
  assert.deepEqual(p.rows.map(r => [r.label, ...r.values]), [['', '', ''], ['空行也可', '', '']]);
  assert.deepEqual(M.fromCSV('配置,x,y\n', '空实验').rows, []);
});

test('实验设置和 CSV 使用同一套指标与单位表示，指标或单位里的括号可以往返', () => {
  assert.equal(M.columnHeader({ name: '耗时', unit: 'ms' }), '耗时 [ms]');
  assert.deepEqual(M.parseColumn('速度 (m/(s·kg))'), { name: '速度', unit: 'm/(s·kg)' });
  for (const column of [
    { name: 'F1 [macro]', unit: '' },
    { name: '耗时（GPU）', unit: 'ms / (样本)' },
    { name: 'A\\B', unit: 'm[2]' }
  ]) {
    assert.deepEqual(M.parseColumn(M.columnHeader(column)), column);
  }
});

test('CSV 将可执行的表格文本标为文本，保留合法负数和原始标签', () => {
  const p = M.blank('导出');
  p.columns[0] = { name: '=A1', unit: '' };
  p.rows = ['=A1', '+ BiLSTM', " '=A1", "'=A1", '\t@foo', '  -text'].map(s => M.row(s, ['-3.2', '4']));
  const data = M.csv(p);
  assert.ok(data.includes("'=A1,-3.2,4"));
  assert.ok(data.includes(",'=A1,"));
  assert.ok(data.includes("'+ BiLSTM,-3.2,4"));
  const copy = M.fromCSV(data, '安全往返');
  assert.deepEqual(copy.columns, p.columns);
  assert.deepEqual(copy.rows.map(r => r.label), p.rows.map(r => r.label));
});

test('CSV 在表头、行宽、引号或非空数值有误时拒绝整个导入，错误可定位', () => {
  for (const data of ['名字,x\na,2', '名,,y\na,2,3', ',x,y\na,2,3']) {
    assert.throws(() => M.fromCSV(data, '无效'), /表头/);
  }
  for (const data of ['名,x,y\na,1', '名,x,y\na,hello,3', '名,x,y\n"a,2,3', '名,x,y\na"b,2,3',
                      '名,x,y\n"a"b,2,3', '名,x,y\na,2,3\nb,0,Infinity']) {
    assert.throws(() => M.fromCSV(data, '无效'), /第\s*\d+\s*行/);
  }
});

test('保存结构允许空实验册、零和缺测，拒绝损坏的坐标、行、引用及来源', () => {
  const book = experiments => ({ version: 1, experiments });
  assert.equal(M.validBook(book(M.samples())), true);
  assert.equal(M.validBook(book([])), true);
  assert.equal(M.validBook(null), false);
  assert.equal(M.validBook({ version: 99, experiments: [] }), false);
  const p = M.blank('自定义');
  assert.equal(M.validBook(book([p])), true);
  p.rows.push(M.row('', ['', '0']));
  assert.equal(M.validBook(book([p])), true);
  for (const change of [
    x => x.rows[0].values.pop(),
    x => { x.rows[0].values[0] = 7; },
    x => { delete x.rows[0].values[0]; },
    x => { delete x.columns[0]; },
    x => { x.selected = '已删除'; },
    x => { x.baseline = '已删除'; },
    x => { x.chart.x = 9; },
    x => { x.chart.mode = 'unknown'; },
    x => { x.source = { label: '坏链接', url: 'about:blank' }; },
    x => { x.rows.push(x.rows[0]); }
  ]) {
    const broken = structuredClone(p);
    change(broken);
    assert.equal(M.validBook(book([broken])), false);
  }
  assert.equal(M.validBook(book([p, p])), false);
});

test('微小的十进制差值和全角百分号在显示和复制时一致', () => {
  const p=M.blank('消融');p.rows=[M.row('基线',['1e-8','94.30']),M.row('对照',['1.01e-8','94.31'])];
  assert.deepEqual(M.compare(p,p.rows[1].id,p.rows[0].id),{dx:1e-10,dy:0.01});
  assert.equal(M.deltaUnit('％'),'个百分点');
});
