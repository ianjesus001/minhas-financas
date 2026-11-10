# Minhas Finanças

PWA simples para acompanhar o mês, o CDI e as compras de dólar. Os dados ficam só no aparelho (localStorage); nos Ajustes dá para fazer backup em JSON e exportar a planilha Excel.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Planilha Excel

`public/template.xlsx` é a planilha vazia que o app preenche ao exportar (`src/excel/exportXlsx.ts` edita o XML das células direto, mantendo gráficos, fórmulas e proteção). Para regenerar depois de mudar `tools/gerar_planilha.py`:

```bash
npm run template
```

Os nomes das categorias em `src/categorias.ts` precisam ser iguais aos da aba `Listas` da planilha.

Teste do exportador: `node tools/test-export.mjs` (gera `tools/out-test.xlsx`).

## Dados de mercado

`src/mercado.ts` busca o CDI diário (SGS 12) e o dólar PTAX (SGS 1) na API do Banco Central e o dólar ao vivo na AwesomeAPI, com cache no localStorage (fora do backup). O CDI de cada depósito é aplicado dia útil a dia útil (`fatorCDI` em `src/calc.ts`).

## Importar a planilha dela

`python tools/planilha-para-backup.py "Minhas Finanças.xlsx"` gera um JSON de backup; no iPhone: Ajustes → Restaurar backup.

## Planilha do Google (Meus Reais e Dólares)

`tools/gerar_planilha_dolares.py` gera a planilha (subir no Drive para converter). `tools/apps-script/Codigo.gs` é a ponte: colar em Extensões → Apps Script, definir a `CHAVE`, implantar como App da Web (executar como eu, acesso qualquer pessoa) e colar `<URL>?k=<CHAVE>` no app em Ajustes → Planilha do Google. Teste com servidor simulado: `npm run test:sync`. Numa planilha nova, rode `atualizarVersaoCompleta` no editor do Apps Script para criar as abas 🌱 Meu CDI (lê as linhas Guardei/Resgatei do Meus Reais) e 🔮 Simulador e o bloco da caixinha no Resumo.

## Teste no motor do Safari

`npm run build`, `npm run preview` e `npm run test:ios` (Playwright WebKit, iPhone 15; capturas em `tools/shots/`).

## Deploy

Cada push na `main` publica no GitHub Pages pelo workflow `.github/workflows/deploy.yml`. O `base` do Vite é `/minhas-financas/`; se o repositório tiver outro nome, ajuste em `vite.config.ts`.
