export type ISODate = string // 'YYYY-MM-DD'

/** Uma linha do "Meu Mês": tudo o que entra e sai da conta. */
export interface Movimento {
  id: string
  data: ISODate
  descricao: string
  /** Nome exato de uma categoria de CATEGORIAS (é o mesmo texto da lista do Excel). */
  categoria: string
  /** Sempre positivo; a categoria diz se é entrada, gasto ou investimento. */
  valor: number
  /** Id do registro de CDI ou dólar criado junto com este movimento (apagar um apaga o outro). */
  linkId?: string
}

export interface MovCDI {
  id: string
  data: ISODate
  tipo: 'Guardei' | 'Resgatei'
  valor: number
  nota: string
}

export interface CompraDolar {
  id: string
  data: ISODate
  onde: string
  /** Tudo o que saiu da conta, já com tarifa e IOF. */
  pagouBRL: number
  recebeuUSD: number
  // Campos opcionais do comprovante (ex.: Wise)
  /** Câmbio usado na conversão, "1 USD = x BRL" (sem taxas). */
  cambio?: number
  /** "Total fees and taxes": tarifa + IOF, em R$ (já incluído em pagouBRL). */
  taxas?: number
  /** VET / "Effective rate" do comprovante (R$ por US$, com tudo). */
  vet?: number
}

export interface Config {
  nome: string
  /** CDI ao ano como fração (0.1365 = 13,65%). */
  cdiAnual: number
  /** Percentual do CDI que o banco paga como fração (1 = 100%). */
  pctCdi: number
  /** Saldo real que aparece no app do banco; null = usar a estimativa. */
  saldoApp: number | null
  saldoAppData: ISODate | null
  /** Reais por 1 dólar. */
  cotacaoDolar: number
  cotacaoData: ISODate
  metaUSD: number
  simInicial: number
  simMensal: number
  simMeses: number
}

export interface AppState {
  version: 1
  config: Config
  movimentos: Movimento[]
  cdi: MovCDI[]
  dolares: CompraDolar[]
}
