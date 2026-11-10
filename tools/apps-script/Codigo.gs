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
