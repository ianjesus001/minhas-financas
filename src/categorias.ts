export type TipoCategoria = 'Gasto' | 'Entrada' | 'Investimento'

export interface Categoria {
  /** Texto exato usado na lista do Excel (aba Listas). Não mude sem regenerar a planilha. */
  nome: string
  emoji: string
  curto: string
  tipo: TipoCategoria
  cor: string
}

export const CATEGORIAS: Categoria[] = [
  { nome: '🏠 Moradia (aluguel, condomínio)', emoji: '🏠', curto: 'Moradia', tipo: 'Gasto', cor: '#E76F51' },
  { nome: '🛒 Mercado', emoji: '🛒', curto: 'Mercado', tipo: 'Gasto', cor: '#F4A261' },
  { nome: '🚌 Transporte', emoji: '🚌', curto: 'Transporte', tipo: 'Gasto', cor: '#E9C46A' },
  { nome: '💡 Contas (luz, água, internet)', emoji: '💡', curto: 'Contas', tipo: 'Gasto', cor: '#8AB17D' },
  { nome: '💊 Saúde', emoji: '💊', curto: 'Saúde', tipo: 'Gasto', cor: '#2A9D8F' },
  { nome: '🍔 Comer fora / delivery', emoji: '🍔', curto: 'Comer fora', tipo: 'Gasto', cor: '#E07A5F' },
  { nome: '🎉 Lazer', emoji: '🎉', curto: 'Lazer', tipo: 'Gasto', cor: '#B56576' },
  { nome: '🛍️ Compras (roupa, casa)', emoji: '🛍️', curto: 'Compras', tipo: 'Gasto', cor: '#7B5EA7' },
  { nome: '📚 Educação', emoji: '📚', curto: 'Educação', tipo: 'Gasto', cor: '#457B9D' },
  { nome: '📱 Assinaturas (streaming, celular)', emoji: '📱', curto: 'Assinaturas', tipo: 'Gasto', cor: '#6D597A' },
  { nome: '🎁 Presentes', emoji: '🎁', curto: 'Presentes', tipo: 'Gasto', cor: '#D62828' },
  { nome: '❓ Outros gastos', emoji: '❓', curto: 'Outros', tipo: 'Gasto', cor: '#8D99AE' },
  { nome: '💼 Salário', emoji: '💼', curto: 'Salário', tipo: 'Entrada', cor: '#1B8A5A' },
  { nome: '✨ Renda extra', emoji: '✨', curto: 'Renda extra', tipo: 'Entrada', cor: '#1B8A5A' },
  { nome: '↩️ Outras entradas', emoji: '↩️', curto: 'Outras entradas', tipo: 'Entrada', cor: '#1B8A5A' },
  { nome: '🌱 Guardei no CDI', emoji: '🌱', curto: 'Guardei no CDI', tipo: 'Investimento', cor: '#2A9D8F' },
  { nome: '💵 Comprei dólar', emoji: '💵', curto: 'Comprei dólar', tipo: 'Investimento', cor: '#457B9D' },
]

export const CAT_CDI = '🌱 Guardei no CDI'
export const CAT_DOLAR = '💵 Comprei dólar'
export const CAT_RESGATE = '↩️ Outras entradas'

export const categoria = (nome: string) => CATEGORIAS.find((c) => c.nome === nome)
