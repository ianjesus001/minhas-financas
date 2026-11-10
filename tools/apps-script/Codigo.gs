/**
 * Ponte entre o app Minhas Finanças e a planilha "Meus Reais e Dólares".
 *
 * Instalação (uma vez, pelo dono da planilha):
 *  1. Na planilha: Extensões → Apps Script. Apague o que estiver lá e cole este arquivo inteiro.
 *  2. Troque o valor de CHAVE abaixo por uma senha longa só sua (letras e números).
 *  3. Implantar → Nova implantação → tipo "App da Web".
 *     Executar como: Eu · Quem pode acessar: Qualquer pessoa. Autorize quando pedir.
 *  4. Copie o URL do app da Web (termina em /exec) e monte o link de conexão:
 *       <URL>?k=<CHAVE>
 *     Esse link vai no app: Ajustes → Planilha do Google. Não compartilhe com mais ninguém.
 *
 * O app lê e escreve só as colunas de entrada (amarelas) das abas Meus Reais (B:E) e
 * Meus Dólares (B:G), linhas 6 a 405. Antes de cada gravação, os dados anteriores são
 * copiados para a aba oculta "Backup do app".
 */

const CHAVE = 'TROQUE-ESTA-CHAVE';

const ABA_REAIS = '📒 Meus Reais';
const ABA_DOLARES = '💵 Meus Dólares';
const ABA_BACKUP = 'Backup do app';
const PRIMEIRA = 6;
const ULTIMA = 405;
const LINHAS = ULTIMA - PRIMEIRA + 1;

function doGet(e) {
  return responder(function () {
    checar(e.parameter.k);
    if (e.parameter.acao === 'ler') return ler();
    return { ok: true, planilha: SpreadsheetApp.getActive().getName() };
  });
}

function doPost(e) {
  return responder(function () {
    const body = JSON.parse(e.postData.contents);
    checar(body.k);
    if (body.acao === 'salvar') return salvar(body);
    throw new Error('Ação desconhecida.');
  });
}

function responder(fn) {
  let out;
  try {
    out = fn();
  } catch (err) {
    out = { ok: false, erro: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checar(k) {
  if (CHAVE === 'TROQUE-ESTA-CHAVE') throw new Error('Configure a CHAVE no Apps Script.');
  if (k !== CHAVE) throw new Error('Chave inválida.');
}

function aba(nome) {
  const s = SpreadsheetApp.getActive().getSheetByName(nome);
  if (!s) throw new Error('Aba não encontrada: ' + nome);
  return s;
}

function fuso() {
  return SpreadsheetApp.getActive().getSpreadsheetTimeZone();
}

/** Data da célula → 'AAAA-MM-DD' (aceita data de verdade ou texto dd/mm/aaaa). */
function paraIso(v) {
  if (v instanceof Date) return Utilities.formatDate(v, fuso(), 'yyyy-MM-dd');
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function paraData(iso) {
  return Utilities.parseDate(iso, fuso(), 'yyyy-MM-dd');
}

function numero(v) {
  if (typeof v === 'number') return v;
  const t = String(v).replace(/R\$|US\$|\s/g, '');
  if (!t) return null;
  const n = Number(t.indexOf(',') >= 0 ? t.replace(/\./g, '').replace(',', '.') : t);
  return isFinite(n) ? n : null;
}

function ler() {
  const reais = aba(ABA_REAIS).getRange(PRIMEIRA, 2, LINHAS, 4).getValues()
    .map(function (l) {
      return { data: paraIso(l[0]), descricao: String(l[1]).trim(), categoria: String(l[2]).trim(), valor: numero(l[3]) };
    })
    .filter(function (m) { return m.data && m.valor !== null && m.categoria; });
  const dolares = aba(ABA_DOLARES).getRange(PRIMEIRA, 2, LINHAS, 6).getValues()
    .map(function (l) {
      return {
        data: paraIso(l[0]), onde: String(l[1]).trim(), pagouBRL: numero(l[2]), recebeuUSD: numero(l[3]),
        cambio: numero(l[4]), taxas: numero(l[5]),
      };
    })
    .filter(function (d) { return d.data && d.pagouBRL !== null && d.recebeuUSD !== null; });
  return { ok: true, reais: reais, dolares: dolares };
}

function salvar(body) {
  const reais = body.reais || [];
  const dolares = body.dolares || [];
  if (reais.length > LINHAS || dolares.length > LINHAS) throw new Error('Mais de ' + LINHAS + ' linhas: a planilha não cabe.');
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    backup();
    escrever(ABA_REAIS, 4, reais.map(function (m) {
      return [paraData(m.data), m.descricao || '', m.categoria, Number(m.valor)];
    }));
    escrever(ABA_DOLARES, 6, dolares.map(function (d) {
      return [paraData(d.data), d.onde || '', Number(d.pagouBRL), Number(d.recebeuUSD),
        d.cambio ? Number(d.cambio) : '', d.taxas ? Number(d.taxas) : ''];
    }));
    SpreadsheetApp.flush();
    return { ok: true, reais: reais.length, dolares: dolares.length };
  } finally {
    lock.releaseLock();
  }
}

/** Apaga só os valores (mantém cores, fórmulas e listas) e escreve as linhas novas. */
function escrever(nome, colunas, linhas) {
  const s = aba(nome);
  s.getRange(PRIMEIRA, 2, LINHAS, colunas).clearContent();
  if (linhas.length) s.getRange(PRIMEIRA, 2, linhas.length, colunas).setValues(linhas);
}

// ---------------------------------------------------------------- ordem por data

/**
 * Gatilho simples: quando uma linha fica completa (data + categoria + valor em Meus Reais;
 * data + R$ + US$ em Meus Dólares), a tabela se ordena por data. Linhas incompletas não
 * disparam, para a linha não "pular" enquanto ela ainda está digitando.
 */
function onEdit(e) {
  const s = e.range.getSheet();
  const cfg = s.getName() === ABA_REAIS ? { colunas: 4, obrigatorias: [0, 2, 3] }
    : s.getName() === ABA_DOLARES ? { colunas: 6, obrigatorias: [0, 2, 3] } : null;
  if (!cfg) return;
  const r0 = e.range.getRow();
  const r1 = r0 + e.range.getNumRows() - 1;
  const c0 = e.range.getColumn();
  const c1 = c0 + e.range.getNumColumns() - 1;
  if (r1 < PRIMEIRA || r0 > ULTIMA || c1 < 2 || c0 > 1 + cfg.colunas) return;
  const linha = s.getRange(Math.max(r0, PRIMEIRA), 2, 1, cfg.colunas).getValues()[0];
  if (!cfg.obrigatorias.every(function (i) { return linha[i] !== ''; })) return;
  ordenar(s, cfg.colunas);
}

/**
 * Ordena por data. As listas/validações (data, categoria, valor) recusam mover uma linha vazia,
 * então saem durante o sort e voltam depois (todas as linhas têm a mesma regra por coluna).
 */
function ordenar(s, colunas) {
  const rng = s.getRange(PRIMEIRA, 2, LINHAS, colunas);
  const regras = [];
  for (let c = 1; c <= colunas; c++) regras.push(rng.getCell(1, c).getDataValidation());
  rng.clearDataValidations();
  try {
    rng.sort({ column: 2, ascending: true });
  } finally {
    regras.forEach(function (regra, i) {
      if (regra) s.getRange(PRIMEIRA, 2 + i, LINHAS, 1).setDataValidation(regra);
    });
  }
}

/** Ordena as duas tabelas agora (rodar no editor se precisar). */
function ordenarTudo() {
  ordenar(aba(ABA_REAIS), 4);
  ordenar(aba(ABA_DOLARES), 6);
  Logger.log('Tabelas ordenadas.');
}

// ---------------------------------------------------------------- ajuste de nov/2026

/**
 * Rodar uma vez no editor: investimento deixa de contar como gasto no "Sobrou" e no
 * acumulado, e as duas tabelas ficam ordenadas por data.
 */
/**
 * Fórmulas escritas por script seguem o idioma da planilha: em português/espanhol o separador
 * é ";" em vez de ",". Testa numa célula da aba Listas qual funciona.
 */
function separador() {
  const c = aba('Listas').getRange('Z1');
  c.setFormula('=IF(1,1,0)');
  SpreadsheetApp.flush();
  const ok = c.getValue() === 1;
  c.clearContent();
  return ok ? ',' : ';';
}

function ajustarPlanilha() {
  const sep = separador();
  const f = function (formula) { return sep === ',' ? formula : formula.replace(/,/g, ';'); };
  const mr = aba(ABA_REAIS);
  const g = [];
  for (let r = PRIMEIRA; r <= ULTIMA; r++) {
    g.push([f('=IF(D' + r + '="","",SUMIFS($E$6:E' + r + ',$F$6:F' + r + ',"Entrada")-SUMIFS($E$6:E' + r + ',$F$6:F' + r + ',"Gasto"))')]);
  }
  mr.getRange(PRIMEIRA, 7, LINHAS, 1).setFormulas(g);
  mr.getRange('G5').setValue('Acumulado\n(entrou − gastei)');
  const mes = ',$B:$B,">="&Listas!$E$1,$B:$B,"<="&Listas!$E$2)';
  mr.getRange('I9:K12').setValues([
    ['🟰 Sobrou (entrou − gastei)', '=J7-J8', 'investimento não é gasto'],
    ['💵 Guardei / comprei dólar', f('=SUMIFS($E:$E,$F:$F,"Investimento"' + mes), 'sai do que sobrou'],
    ['📊 Da minha renda, guardei', f('=IF(J7>0,J10/J7,0)'), 'meta comum: 10% a 20%'],
    ['💰 Acumulado em reais (tudo que entrou − tudo que gastei)',
      f('=SUMIFS($E$6:$E$405,$F$6:$F$405,"Entrada")-SUMIFS($E$6:$E$405,$F$6:$F$405,"Gasto")'), ''],
  ]);
  mr.getRange('J9:J10').setNumberFormat('"R$" #,##0.00;[Red]-"R$" #,##0.00');
  // verde/vermelho passa do J10 para o J9 (Sobrou)
  const j9 = mr.getRange('J9');
  const regras = mr.getConditionalFormatRules().filter(function (rg) {
    return !rg.getRanges().some(function (x) { return x.getA1Notation() === 'J10' || x.getA1Notation() === 'J9'; });
  });
  regras.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f('=AND(ISNUMBER(J9),J9>0)'))
    .setFontColor('#1B8A5A').setBold(true).setRanges([j9]).build());
  regras.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f('=AND(ISNUMBER(J9),J9<0)'))
    .setFontColor('#C0392B').setBold(true).setRanges([j9]).build());
  mr.setConditionalFormatRules(regras);

  const resumo = aba('🏠 Resumo');
  resumo.getRange('C14').setFormula('=C13-E13');
  resumo.getRange('B4').setValue('💰 Acumulado em reais');
  resumo.getRange('B6').setValue('entrou − gastei');

  const guia = aba('👋 Comece aqui');
  const achado = guia.getRange('B:B').createTextFinder('Saldo em reais').matchEntireCell(true).findNext();
  if (achado) {
    achado.setValue('Acumulado em reais');
    achado.offset(0, 1).setValue('Tudo o que entrou menos tudo o que você gastou. Investir (dólar, caixinha) não é gasto: o dinheiro continua seu, só mudou de lugar.');
  }

  ordenar(mr, 4);
  ordenar(aba(ABA_DOLARES), 6);
  Logger.log('Planilha ajustada.');
}

/**
 * Rodar uma vez no editor. No Google Sheets só a PRIMEIRA regra de formatação condicional
 * que bate é aplicada, então as listras (cinza) "comiam" o verde/vermelho em linhas
 * alternadas. Aqui: a coluna Acumulado fica neutra (vermelha só se negativa) e as regras de
 * cor do texto passam para antes das listras.
 */
function ajustarCores() {
  const sep = separador();
  const f = function (formula) { return sep === ',' ? formula : formula.replace(/,/g, ';'); };
  const formulaDe = function (rg) {
    const c = rg.getBooleanCondition();
    return c ? String(c.getCriteriaValues()[0] || '') : '';
  };
  [ABA_REAIS, ABA_DOLARES].forEach(function (nome) {
    const s = aba(nome);
    let regras = s.getConditionalFormatRules();
    if (nome === ABA_REAIS) {
      // coluna G (Acumulado): preto se positivo, vermelho se negativo, cinza se zero
      regras = regras.filter(function (rg) {
        return !(formulaDe(rg).indexOf('ISNUMBER') >= 0 && rg.getRanges().some(function (x) { return x.getA1Notation().indexOf('G6') === 0; }));
      });
      const g = s.getRange(PRIMEIRA, 7, LINHAS, 1);
      regras.unshift(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f('=AND(ISNUMBER(G6),G6<0)'))
        .setFontColor('#C0392B').setBold(true).setRanges([g]).build());
      regras.unshift(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f('=AND(ISNUMBER(G6),G6=0)'))
        .setFontColor('#9AA0AC').setRanges([g]).build());
    }
    const cores = regras.filter(function (rg) { return formulaDe(rg).indexOf('ISNUMBER') >= 0; });
    const resto = regras.filter(function (rg) { return formulaDe(rg).indexOf('ISNUMBER') < 0; });
    s.setConditionalFormatRules(cores.concat(resto));
  });
  Logger.log('Cores ajustadas.');
}

// ---------------------------------------------------------------- versão completa (nov/2026)

const CAT_GUARDEI = '🌱 Guardei (caixinha / CDI)';
const CAT_RESGATE = '↩️ Resgatei da caixinha';
const ABA_CDI = '🌱 Meu CDI';
const ABA_SIM = '🔮 Simulador';
const COR = { TEAL: '#2A9D8F', NAVY: '#264653', PURPLE: '#7B5EA7', GOLD: '#E9A23B', BLUE: '#457B9D',
  SOFT_TEAL: '#E3F4F1', SOFT_GOLD: '#FCF1DE', SOFT_PURPLE: '#EFEAF6', INPUT: '#FFF4C2', GRAY: '#7A7F8C',
  LINE: '#D9DCE3', INK: '#2D3142' };
const FMT_BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

/**
 * Rodar uma vez no editor. Deixa a planilha com tudo da versão Excel:
 *  - categoria "Resgatei da caixinha" (tipo Resgate: diminui o guardado, não conta como entrada);
 *  - aba 🌱 Meu CDI, que lê os depósitos e resgates do 📒 Meus Reais (nada é anotado duas vezes);
 *  - aba 🔮 Simulador;
 *  - bloco da caixinha no 🏠 Resumo e as abas novas no 👋 Comece aqui.
 */
function atualizarVersaoCompleta() {
  backup();
  const sep = separador();
  // em português/espanhol: argumentos com ";" e decimais com "," (0.225 → 0,225)
  const f = function (formula) {
    return sep === ',' ? formula : formula.replace(/,/g, ';').replace(/(\d)\.(\d)/g, '$1,$2');
  };
  adicionarCategoriaResgate(f);
  criarAbaCDI(f);
  criarAbaSimulador(f);
  blocoResumo(f);
  guiaAbasNovas();
  Logger.log('Versão completa pronta.');
}

function estilo(r, o) {
  r.setFontFamily('Arial').setFontSize(o.size || 10).setFontColor(o.color || COR.INK).setVerticalAlignment('middle');
  if (o.bold) r.setFontWeight('bold');
  if (o.italic) r.setFontStyle('italic');
  if (o.bg) r.setBackground(o.bg);
  if (o.fmt) r.setNumberFormat(o.fmt);
  if (o.h) r.setHorizontalAlignment(o.h);
  if (o.wrap) r.setWrap(true);
  if (o.border) r.setBorder(true, true, true, true, true, true, COR.LINE, SpreadsheetApp.BorderStyle.SOLID);
  return r;
}

function secao(s, a1, texto, cor) {
  const r = s.getRange(a1).merge().setValue(texto);
  estilo(r, { bold: true, color: '#FFFFFF', bg: cor, size: 11 });
  s.setRowHeight(r.getRow(), 24);
  return r;
}

function abaNova(nome, depoisDe, cor) {
  const ss = SpreadsheetApp.getActive();
  const velha = ss.getSheetByName(nome);
  if (velha) ss.deleteSheet(velha);
  const s = ss.insertSheet(nome, aba(depoisDe).getIndex());
  s.setTabColor(cor);
  s.setHiddenGridlines(true);
  estilo(s.getRange('A1:Z300'), {});
  return s;
}

function adicionarCategoriaResgate(f) {
  const L = aba('Listas');
  const MR = aba(ABA_REAIS);
  let nomes = L.getRange('A2:A30').getValues().map(function (r) { return r[0]; });
  if (nomes.indexOf(CAT_RESGATE) < 0) {
    L.getRange(2 + nomes.indexOf(''), 1, 1, 2).setValues([[CAT_RESGATE, 'Resgate']]);
    nomes = L.getRange('A2:A30').getValues().map(function (r) { return r[0]; });
  }
  const k = nomes.indexOf(CAT_RESGATE);
  MR.getRange(PRIMEIRA, 4, LINHAS, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(L.getRange('A2:A30'), true).setAllowInvalid(false)
    .setHelpText('Escolha uma categoria da lista ▾').build());
  const tipos = [];
  for (let r = PRIMEIRA; r <= ULTIMA; r++) {
    tipos.push([f('=IF(D' + r + '="","",IFERROR(INDEX(Listas!$B$2:$B$30,MATCH(D' + r + ',Listas!$A$2:$A$30,0)),"?"))')]);
  }
  MR.getRange(PRIMEIRA, 6, LINHAS, 1).setFormulas(tipos);
  // guardado do mês = investido − resgatado
  const mes = ',$B:$B,">="&Listas!$E$1,$B:$B,"<="&Listas!$E$2)';
  MR.getRange('J10').setFormula(f('=SUMIFS($E:$E,$F:$F,"Investimento"' + mes + '-SUMIFS($E:$E,$F:$F,"Resgate"' + mes));
  MR.getRange('K10').setValue('dólar + caixinha − resgates');
  // linha da categoria nova na tabela por categoria
  const linha = 15 + k;
  MR.getRange('I31:L31').copyFormatToRange(MR, 9, 12, linha, linha);
  MR.getRange(linha, 9, 1, 4).setFormulas([[
    '=Listas!A' + (k + 2), '=Listas!B' + (k + 2),
    f('=SUMIFS($E:$E,$D:$D,I' + linha + mes),
    f('=IF(AND(J' + linha + '="Gasto",$J$8>0),K' + linha + '/$J$8,"")'),
  ]]);
  // resgates já anotados como "Outras entradas" passam para a categoria nova
  const v = MR.getRange(PRIMEIRA, 2, LINHAS, 4).getValues();
  v.forEach(function (l, i) {
    const desc = String(l[1]);
    if (l[2] === '↩️ Outras entradas' && /resgat|regast|retirad/i.test(desc) && /cdi|caixinha|inter/i.test(desc)) {
      MR.getRange(PRIMEIRA + i, 4).setValue(CAT_RESGATE);
    }
  });
}

function criarAbaCDI(f) {
  const s = abaNova(ABA_CDI, ABA_DOLARES, COR.TEAL);
  [2, 12, 12, 15, 30, 13, 16, 15, 3, 46, 17].forEach(function (w, i) { s.setColumnWidth(i + 1, w * 7); });
  s.getRange('B1:K1').merge().setValue('🌱 Meu CDI — meu dinheiro rendendo');
  estilo(s.getRange('B1'), { size: 20, bold: true, color: COR.TEAL });
  s.setRowHeight(1, 40);
  s.getRange('B2:K2').merge().setValue('Os depósitos e resgates vêm sozinhos do 📒 Meus Reais (categorias 🌱 Guardei e ↩️ Resgatei da caixinha). Aqui você só confere quanto rendeu.');
  estilo(s.getRange('B2'), { italic: true, color: COR.GRAY, wrap: true });
  s.setRowHeight(2, 30);

  secao(s, 'B4:H4', '🤖 Meus depósitos e resgates (vêm do Meus Reais)', COR.TEAL);
  s.getRange('B5:H5').setValues([['Data', 'O que fiz', 'Valor (R$)', 'Descrição', 'Dias úteis rendendo', 'Vale hoje (estimativa)', 'Já rendeu']]);
  estilo(s.getRange('B5:H5'), { bold: true, color: '#FFFFFF', bg: COR.TEAL, h: 'center', wrap: true, border: true });
  s.setRowHeight(5, 34);
  const MR = "'" + ABA_REAIS + "'!";
  const cond = '((' + MR + '$D$6:$D$405="' + CAT_GUARDEI + '")+(' + MR + '$D$6:$D$405="' + CAT_RESGATE + '"))>0';
  s.getRange('B6').setFormula(f('=IFERROR(FILTER(' + MR + '$B$6:$B$405,' + cond + '),"")'));
  s.getRange('C6').setFormula(f('=IFERROR(ARRAYFORMULA(IF(FILTER(' + MR + '$D$6:$D$405,' + cond + ')="' + CAT_GUARDEI + '","Guardei","Resgatei")),"")'));
  s.getRange('D6').setFormula(f('=IFERROR(FILTER(' + MR + '$E$6:$E$405,' + cond + '),"")'));
  s.getRange('E6').setFormula(f('=IFERROR(FILTER(' + MR + '$C$6:$C$405,' + cond + '),"")'));
  const N = 200, linhas = [];
  for (let r = 6; r < 6 + N; r++) {
    const sinal = 'IF(C' + r + '="Resgatei",-1,1)';
    linhas.push([
      f('=IF(B' + r + '="","",MAX(0,NETWORKDAYS(B' + r + ',TODAY())-1))'),
      f('=IF(F' + r + '="","",' + sinal + '*D' + r + '*(1+$K$10)^F' + r + ')'),
      f('=IF(F' + r + '="","",G' + r + '-' + sinal + '*D' + r + ')'),
    ]);
  }
  s.getRange(6, 6, N, 3).setFormulas(linhas);
  const ir = [];
  for (let r = 6; r < 6 + N; r++) {
    const d = '(TODAY()-B' + r + ')';
    ir.push([f('=IF(H' + r + '="","",H' + r + '*IF(' + d + '<=180,0.225,IF(' + d + '<=360,0.2,IF(' + d + '<=720,0.175,0.15))))')]);
  }
  s.getRange(6, 13, N, 1).setFormulas(ir);
  s.hideColumns(13);
  estilo(s.getRange(6, 2, N, 7), { border: true });
  s.getRange(6, 2, N, 1).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('center');
  s.getRange(6, 3, N, 1).setHorizontalAlignment('center');
  s.getRange(6, 4, N, 1).setNumberFormat(FMT_BRL);
  s.getRange(6, 6, N, 1).setHorizontalAlignment('center').setFontColor(COR.GRAY);
  s.getRange(6, 7, N, 2).setNumberFormat(FMT_BRL);
  s.setFrozenRows(5);

  secao(s, 'J4:K4', '⚙️ Quanto meu dinheiro rende', COR.NAVY);
  s.getRange('J5:K10').setValues([
    ['✍️ CDI ao ano (atualize de vez em quando)', 0.1365],
    ['✍️ Quanto do CDI o banco paga (Nubank = 100%)', 1],
    ['➡️ Então meu dinheiro rende por ano', '=K5*K6'],
    ['➡️ Isso dá mais ou menos por mês', '=(1+K7)^(1/12)-1'],
    ['➡️ A cada R$ 1.000 guardados, ganho por mês', '=1000*K8'],
    ['rendimento por dia útil (usado nas contas)', '=(1+K7)^(1/252)-1'],
  ]);
  estilo(s.getRange('J5:K10'), {});
  estilo(s.getRange('J5:J9'), { bold: true });
  s.getRange('K5').setNumberFormat('0.00%').setBackground(COR.INPUT);
  s.getRange('K6').setNumberFormat('0%').setBackground(COR.INPUT);
  s.getRange('K7:K8').setNumberFormat('0.00%').setFontColor(COR.TEAL).setFontWeight('bold');
  s.getRange('K9').setNumberFormat(FMT_BRL).setFontColor(COR.TEAL).setFontWeight('bold');
  s.getRange('K10').setNumberFormat('0.0000%');
  estilo(s.getRange('J10:K10'), { size: 8, color: COR.GRAY, italic: true });
  s.getRange('K10').setNumberFormat('0.0000%');
  s.getRange('K5').setNote('O CDI anda quase igual à taxa Selic. Para atualizar, pesquise "CDI hoje" no Google. O app mostra o valor exato com o CDI oficial de cada dia.');

  secao(s, 'J12:K12', '📊 Meu CDI hoje', COR.TEAL);
  s.getRange('J13:J19').setValues([
    ['💪 Quanto coloquei do meu bolso (guardei − resgatei)'], ['Quanto deve ter hoje (estimativa)'],
    ['✍️ Saldo que aparece no app do banco (opcional, é o valor real)'], ['✅ Tenho no CDI'],
    ['🎉 Quanto o CDI já me deu (rendimento)'], ['🧾 Imposto (IR) se eu resgatar tudo hoje (aprox.)'],
    ['💵 O que cairia na minha conta se resgatar tudo']]);
  s.getRange('K13').setFormula(f('=SUMIFS(D6:D205,C6:C205,"Guardei")-SUMIFS(D6:D205,C6:C205,"Resgatei")'));
  s.getRange('K14').setFormula('=SUM(G6:G205)');
  s.getRange('K16').setFormula(f('=IF(K15="",K14,K15)'));
  s.getRange('K17').setFormula('=K16-K13');
  s.getRange('K18').setFormula(f('=MAX(0,SUM(M6:M205))'));
  s.getRange('K19').setFormula('=K16-K18');
  estilo(s.getRange('J13:K19'), { fmt: FMT_BRL, wrap: true });
  s.getRange('J13:K19').setBorder(null, null, true, null, null, true, COR.LINE, SpreadsheetApp.BorderStyle.SOLID);
  ['J15', 'J16', 'J17', 'J19', 'K16', 'K17', 'K19'].forEach(function (a) { s.getRange(a).setFontWeight('bold'); });
  s.getRange('K15').setBackground(COR.INPUT);
  s.getRange('K16').setFontColor(COR.TEAL).setFontSize(12);
  s.getRange('K15').setNote('Se preencher, a planilha usa este valor (o real do app). Se deixar vazio, usa a estimativa.');
  s.setRowHeights(13, 7, 24);

  secao(s, 'J21:K21', '🧾 Como funciona o imposto no CDI', COR.GOLD);
  s.getRange('J22:K25').setValues([['Dinheiro guardado há até 6 meses (180 dias)', 0.225], ['De 6 meses a 1 ano (181 a 360 dias)', 0.2],
    ['De 1 a 2 anos (361 a 720 dias)', 0.175], ['Mais de 2 anos (acima de 720 dias)', 0.15]]);
  estilo(s.getRange('J22:K25'), { border: true });
  s.getRange('K22:K25').setNumberFormat('0.0%').setHorizontalAlignment('center').setFontWeight('bold');
  s.getRange('J26:K29').merge().setValue('👉 O imposto é cobrado SÓ sobre o que rendeu, nunca sobre o que você colocou. O banco já desconta sozinho na hora do resgate. ' +
    'Quanto mais tempo o dinheiro fica, menos imposto. Se tirar antes de 30 dias, também tem IOF (só sobre o rendimento).');
  estilo(s.getRange('J26'), { size: 9, bg: COR.SOFT_GOLD, wrap: true });
  s.getRange('J26').setVerticalAlignment('top');
}

function criarAbaSimulador(f) {
  const s = abaNova(ABA_SIM, ABA_CDI, COR.PURPLE);
  [2, 44, 18, 4, 10, 16, 16, 18, 18].forEach(function (w, i) { s.setColumnWidth(i + 1, w * 7); });
  s.getRange('B1:I1').merge().setValue('🔮 Simulador — quanto vou ter se eu guardar todo mês?');
  estilo(s.getRange('B1'), { size: 20, bold: true, color: COR.PURPLE });
  s.setRowHeight(1, 40);
  s.getRange('B2:I2').merge().setValue('Brinque com os números amarelinhos e veja o poder dos juros compostos (o rendimento rendendo em cima do rendimento).');
  estilo(s.getRange('B2'), { italic: true, color: COR.GRAY, wrap: true });

  secao(s, 'B4:C4', '✍️ Me conta seu plano', COR.PURPLE);
  s.getRange('B5:C10').setValues([
    ['Quanto já tenho guardado hoje', "='" + ABA_CDI + "'!K16"],
    ['Quanto vou guardar todo mês', 300],
    ['Por quantos meses (até 120 = 10 anos)', 24],
    ['Rendimento por ano (vem da aba 🌱 Meu CDI)', "='" + ABA_CDI + "'!K7"],
    ['Rendimento por mês', '=(1+C8)^(1/12)-1'],
    ['Poupança por mês (0,5% + TR, aprox.)', 0.0055],
  ]);
  estilo(s.getRange('B5:C10'), { border: true });
  estilo(s.getRange('B5:B7'), { bold: true });
  estilo(s.getRange('C5:C7'), { bold: true, bg: COR.INPUT, h: 'right' });
  s.getRange('C5:C6').setNumberFormat(FMT_BRL);
  s.getRange('C7').setNumberFormat('0 "meses"');
  s.getRange('C7').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(1, 120).setAllowInvalid(false)
    .setHelpText('Escolha entre 1 e 120 meses').build());
  s.getRange('C8:C10').setNumberFormat('0.00%').setFontColor(COR.GRAY);
  s.getRange('B8:B10').setFontColor(COR.GRAY);
  s.getRange('C5').setNote('Já vem com o que você tem no CDI. Pode trocar por outro valor.');

  const MESES = 'MIN($C$7,120)';
  secao(s, 'B12:C12', '🎯 Resultado', COR.PURPLE);
  s.getRange('B13:B17').setValues([[''], ['💪 Saiu do seu bolso'], ['🎁 O CDI te deu de presente'], ['🧾 Imposto de renda (aprox.)'], ['💵 Fica pra você (já sem imposto)']]);
  s.getRange('B13').setFormula('="Daqui a "&C7&" meses você terá"');
  s.getRange('C13').setFormula(f('=INDEX(H17:H137,' + MESES + '+1)'));
  s.getRange('C14').setFormula(f('=C5+C6*' + MESES));
  s.getRange('C15').setFormula('=C13-C14');
  s.getRange('C16').setFormula(f('=C15*IF(C7*30<=180,0.225,IF(C7*30<=360,0.2,IF(C7*30<=720,0.175,0.15)))'));
  s.getRange('C17').setFormula('=C13-C16');
  estilo(s.getRange('B13:C17'), { fmt: FMT_BRL });
  s.getRange('B13:C17').setBorder(null, null, true, null, null, true, COR.LINE, SpreadsheetApp.BorderStyle.SOLID);
  s.getRange('B13').setFontWeight('bold'); s.getRange('B17').setFontWeight('bold');
  s.getRange('C13').setFontWeight('bold').setFontSize(14).setFontColor(COR.PURPLE);
  s.getRange('C15').setFontWeight('bold').setFontColor('#1B8A5A');
  s.getRange('C17').setFontWeight('bold').setFontSize(12).setFontColor(COR.PURPLE);
  s.setRowHeights(13, 5, 24);

  secao(s, 'B19:C19', '🤔 E se o dinheiro ficasse em outro lugar?', COR.GOLD);
  s.getRange('B20:C23').setValues([['🛏️ Debaixo do colchão (sem render)', '=C14'], ['🐷 Na poupança', ''],
    ['🌱 No CDI (já sem imposto)', '=C17'], ['Quanto o CDI ganha da poupança', '=C22-C21']]);
  s.getRange('C21').setFormula(f('=INDEX(I17:I137,' + MESES + '+1)'));
  estilo(s.getRange('B20:C23'), { fmt: FMT_BRL, border: true });
  s.getRange('B23:C23').setFontWeight('bold');

  secao(s, 'E15:I15', '📅 Mês a mês', COR.NAVY);
  s.getRange('E16:I16').setValues([['Mês', 'Guardei no mês', 'Rendeu no mês', 'Total no CDI', 'Total na poupança']]);
  estilo(s.getRange('E16:I16'), { bold: true, color: '#FFFFFF', bg: COR.NAVY, h: 'center', wrap: true, border: true });
  s.getRange('E17:I17').setValues([['Hoje', '=C5', 0, '=C5', '=C5']]);
  const t = [];
  for (let i = 1; i <= 120; i++) {
    const r = 17 + i;
    t.push([
      f('=IF(' + i + '>$C$7,"",' + i + ')'),
      f('=IF(E' + r + '="","",$C$6)'),
      f('=IF(E' + r + '="","",H' + (r - 1) + '*$C$9)'),
      f('=IF(E' + r + '="","",H' + (r - 1) + '+G' + r + '+F' + r + ')'),
      f('=IF(E' + r + '="","",I' + (r - 1) + '*(1+$C$10)+F' + r + ')'),
    ]);
  }
  s.getRange(18, 5, 120, 5).setFormulas(t);
  estilo(s.getRange('E17:I137'), { border: true });
  s.getRange('F17:I137').setNumberFormat(FMT_BRL);
  s.getRange('E17:E137').setHorizontalAlignment('center');
  s.getRange('G17:G137').setFontColor('#1B8A5A');
  s.getRange('H17:H137').setFontWeight('bold');
  s.getRange('I17:I137').setFontColor(COR.GRAY);
  s.setFrozenRows(0);

  const grafico = s.newChart().asColumnChart()
    .addRange(s.getRange('B20:C22'))
    .setOption('title', 'Mesmo dinheiro, lugares diferentes')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [COR.PURPLE])
    .setOption('vAxis', { format: '"R$" #,##0', minValue: 0 })
    .setPosition(25, 2, 0, 0)
    .build();
  s.insertChart(grafico);
}

function blocoResumo(f) {
  const R = aba('🏠 Resumo');
  const MRq = "'" + ABA_REAIS + "'";
  const cur = function (tipo) {
    return 'SUMIFS(' + MRq + '!$E:$E,' + MRq + '!$F:$F,"' + tipo + '",' + MRq + '!$B:$B,">="&Listas!$E$3,' + MRq + '!$B:$B,"<="&Listas!$E$4)';
  };
  R.getRange('G13').setFormula(f('=' + cur('Investimento') + '-' + cur('Resgate')));
  R.getRange('B16:G20').breakApart().clear();
  secao(R, 'B16:G16', '🌱 Minha caixinha (CDI) e total guardado', COR.TEAL);
  const CDI = "'" + ABA_CDI + "'!";
  const DOL = "'" + ABA_DOLARES + "'!";
  R.getRange('B17:G18').setValues([
    ['🌱 Tenho no CDI', '=' + CDI + 'K16', '🎉 O CDI já me deu', '=' + CDI + 'K17', '💪 Coloquei do bolso', '=' + CDI + 'K13'],
    ['💵 Dólares (em R$, hoje)', '=' + DOL + 'P12', '💎 Total guardado (CDI + dólares)', '=C17+C18', '🧾 Se resgatar o CDI hoje', '=' + CDI + 'K19'],
  ]);
  estilo(R.getRange('B17:G18'), { bg: COR.SOFT_TEAL, border: true, wrap: true });
  ['B17', 'B18', 'D17', 'D18', 'F17', 'F18'].forEach(function (a) { R.getRange(a).setFontWeight('bold'); });
  ['C17', 'C18', 'E17', 'E18', 'G17', 'G18'].forEach(function (a) {
    R.getRange(a).setNumberFormat(FMT_BRL).setFontWeight('bold').setFontSize(12).setHorizontalAlignment('right');
  });
  R.getRange('E18').setFontColor(COR.PURPLE).setFontSize(13);
  R.getRange('C17').setFontColor(COR.TEAL);
  R.setRowHeights(17, 2, 30);
}

function guiaAbasNovas() {
  const G = aba('👋 Comece aqui');
  const achado = G.getRange('B:B').createTextFinder(ABA_DOLARES).matchEntireCell(true).findNext();
  if (!achado || G.getRange(achado.getRow() + 1, 2).getValue() === ABA_CDI) return;
  const r = achado.getRow();
  G.insertRowsAfter(r, 2);
  G.getRange(r, 2, 1, 2).copyFormatToRange(G, 2, 3, r + 1, r + 2);
  G.getRange(r + 1, 2, 2, 2).setValues([
    [ABA_CDI, 'Quanto você tem na caixinha e quanto já rendeu. Os depósitos e resgates vêm sozinhos do 📒 Meus Reais.'],
    [ABA_SIM, "Para sonhar: 'se eu guardar R$ X por mês, quanto terei daqui a 2 anos?'"],
  ]);
  G.getRange(r + 1, 2).setBackground(COR.TEAL); G.getRange(r + 1, 3).setBackground(COR.SOFT_TEAL);
  G.getRange(r + 2, 2).setBackground(COR.PURPLE); G.getRange(r + 2, 3).setBackground(COR.SOFT_PURPLE);
  G.setRowHeights(r + 1, 2, 32);
}

/** Guarda uma cópia dos dados atuais antes de sobrescrever. */
function backup() {
  const ss = SpreadsheetApp.getActive();
  let b = ss.getSheetByName(ABA_BACKUP);
  if (!b) {
    b = ss.insertSheet(ABA_BACKUP);
    b.hideSheet();
  }
  b.clearContents();
  b.getRange(1, 1).setValue('Cópia feita antes de salvar pelo app em ' + Utilities.formatDate(new Date(), fuso(), 'dd/MM/yyyy HH:mm'));
  b.getRange(2, 1, 1, 4).setValues([['Data', 'Descrição', 'Categoria', 'Valor (R$)']]);
  b.getRange(3, 1, LINHAS, 4).setValues(aba(ABA_REAIS).getRange(PRIMEIRA, 2, LINHAS, 4).getValues());
  b.getRange(2, 6, 1, 6).setValues([['Data', 'Onde', 'Saiu R$', 'Recebi US$', 'Câmbio', 'Taxas R$']]);
  b.getRange(3, 6, LINHAS, 6).setValues(aba(ABA_DOLARES).getRange(PRIMEIRA, 2, LINHAS, 6).getValues());
}
