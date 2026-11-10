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

// ---------------------------------------------------------------- caixinha (nov/2026)

const CAT_GUARDEI = '🌱 Guardei (caixinha / CDI)';
const CAT_RESGATE = '↩️ Resgatei da caixinha';

/**
 * Rodar uma vez no editor. Cria a categoria "Resgatei da caixinha" (tipo Resgate: diminui o
 * guardado e não conta como entrada), passa os resgates já anotados para ela e adiciona o
 * bloco "Minha caixinha" no Resumo.
 */
function adicionarCaixinha() {
  backup();
  const sep = separador();
  const f = function (formula) { return sep === ',' ? formula : formula.replace(/,/g, ';'); };
  const L = aba('Listas');
  const MR = aba(ABA_REAIS);
  const R = aba('🏠 Resumo');
  const MRq = "'" + ABA_REAIS + "'";

  // 1. categoria nova na lista (a lista passa a ir até a linha 30)
  let nomes = L.getRange('A2:A30').getValues().map(function (r) { return r[0]; });
  if (nomes.indexOf(CAT_RESGATE) < 0) {
    L.getRange(2 + nomes.indexOf(''), 1, 1, 2).setValues([[CAT_RESGATE, 'Resgate']]);
    nomes = L.getRange('A2:A30').getValues().map(function (r) { return r[0]; });
  }
  const k = nomes.indexOf(CAT_RESGATE);

  // 2. lista de categorias e coluna Tipo enxergam a lista maior
  MR.getRange(PRIMEIRA, 4, LINHAS, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(L.getRange('A2:A30'), true).setAllowInvalid(false)
    .setHelpText('Escolha uma categoria da lista ▾').build());
  const tipos = [];
  for (let r = PRIMEIRA; r <= ULTIMA; r++) {
    tipos.push([f('=IF(D' + r + '="","",IFERROR(INDEX(Listas!$B$2:$B$30,MATCH(D' + r + ',Listas!$A$2:$A$30,0)),"?"))')]);
  }
  MR.getRange(PRIMEIRA, 6, LINHAS, 1).setFormulas(tipos);

  // 3. resumo do mês: guardado = investido − resgatado
  const mes = ',$B:$B,">="&Listas!$E$1,$B:$B,"<="&Listas!$E$2)';
  MR.getRange('J10').setFormula(f('=SUMIFS($E:$E,$F:$F,"Investimento"' + mes + '-SUMIFS($E:$E,$F:$F,"Resgate"' + mes));
  MR.getRange('K10').setValue('dólar + caixinha − resgates');

  // 4. linha da categoria nova na tabela por categoria
  const linha = 15 + k;
  MR.getRange('I31:L31').copyFormatToRange(MR, 9, 12, linha, linha);
  MR.getRange(linha, 9, 1, 4).setFormulas([[
    '=Listas!A' + (k + 2), '=Listas!B' + (k + 2),
    f('=SUMIFS($E:$E,$D:$D,I' + linha + mes),
    f('=IF(AND(J' + linha + '="Gasto",$J$8>0),K' + linha + '/$J$8,"")'),
  ]]);

  // 5. Resumo "Este mês": guardado líquido
  const cur = function (tipo) {
    return 'SUMIFS(' + MRq + '!$E:$E,' + MRq + '!$F:$F,"' + tipo + '",' + MRq + '!$B:$B,">="&Listas!$E$3,' + MRq + '!$B:$B,"<="&Listas!$E$4)';
  };
  R.getRange('G13').setFormula(f('=' + cur('Investimento') + '-' + cur('Resgate')));

  // 6. bloco "Minha caixinha"
  const TEAL = '#2A9D8F', SOFT = '#E3F4F1', AMARELO = '#FFF4C2', CINZA = '#7A7F8C';
  const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const e = MRq + '!$E$6:$E$405', d = MRq + '!$D$6:$D$405', b = MRq + '!$B$6:$B$405';
  R.getRange('B16:G16').merge().setValue('🌱 Minha caixinha (CDI)').setBackground(TEAL)
    .setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11).setFontFamily('Arial');
  R.setRowHeight(16, 26);
  const bloco = R.getRange('B17:G19');
  bloco.setBackground(SOFT).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#D9DCE3', SpreadsheetApp.BorderStyle.SOLID);
  R.getRange('B17:B19').setFontWeight('bold');
  R.getRange('D17:D19').setFontWeight('bold');
  R.getRange('F17').setFontWeight('bold');
  R.getRange('B17:G19').setValues([
    ['💪 Coloquei do meu bolso', '', '✍️ CDI ao ano (atualize de vez em quando)', 0.1365, '✍️ % do CDI que o banco paga', 1],
    ['🌱 Deve ter hoje (estimativa)', '', '🎉 Rendeu (estimativa)', '', '', ''],
    ['✍️ Saldo no app do banco (opcional)', '', '🎉 Rendeu de verdade', '', '', ''],
  ]);
  R.getRange('B17:G19').setWrap(true);
  R.setRowHeights(17, 3, 34);
  R.getRange('C17').setFormula(f('=SUMIFS(' + e + ',' + d + ',"' + CAT_GUARDEI + '")-SUMIFS(' + e + ',' + d + ',"' + CAT_RESGATE + '")'));
  R.getRange('C18').setFormula(f('=SUMPRODUCT(((' + d + '="' + CAT_GUARDEI + '")-(' + d + '="' + CAT_RESGATE + '"))*' + e +
    '*(1+E17*G17)^((TODAY()-' + b + ')/365))'));
  R.getRange('E18').setFormula('=C18-C17');
  R.getRange('E19').setFormula(f('=IF(C19="","",C19-C17)'));
  R.getRange('C17:C19').setNumberFormat(BRL).setFontWeight('bold').setHorizontalAlignment('right');
  R.getRange('E18:E19').setNumberFormat(BRL).setFontWeight('bold').setHorizontalAlignment('right');
  R.getRange('E17').setNumberFormat('0.00%').setBackground(AMARELO).setHorizontalAlignment('right');
  R.getRange('G17').setNumberFormat('0%').setBackground(AMARELO).setHorizontalAlignment('right');
  R.getRange('C19').setBackground(AMARELO);
  R.getRange('C18').setFontColor(TEAL).setFontSize(12);
  R.getRange('B20:G20').merge().setValue('O app calcula o valor exato com o CDI oficial de cada dia. Aqui é uma estimativa com a taxa acima; ' +
    'para o valor real, escreva o saldo do app do banco.').setFontColor(CINZA).setFontStyle('italic').setFontSize(9)
    .setFontFamily('Arial').setWrap(true);
  R.setRowHeight(20, 30);

  // 7. resgates já anotados vão para a categoria nova
  const v = MR.getRange(PRIMEIRA, 2, LINHAS, 4).getValues();
  const log = [];
  v.forEach(function (l, i) {
    const desc = String(l[1]);
    if (l[2] === '↩️ Outras entradas' && /resgat|regast|retirad/i.test(desc) && /cdi|caixinha|inter/i.test(desc)) {
      MR.getRange(PRIMEIRA + i, 4).setValue(CAT_RESGATE);
      log.push(desc + ' ' + l[3]);
    }
  });
  Logger.log('Caixinha pronta. Resgates recategorizados: ' + log.join(', '));
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
