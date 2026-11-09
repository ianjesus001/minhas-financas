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

## Deploy

Cada push na `main` publica no GitHub Pages pelo workflow `.github/workflows/deploy.yml`. O `base` do Vite é `/minhas-financas/`; se o repositório tiver outro nome, ajuste em `vite.config.ts`.
