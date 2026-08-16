// O PostgREST corta toda resposta em 1000 linhas (max-rows) sem erro nem
// aviso: um select simples numa base de 19 mil devolve as primeiras 1000 e
// a tela acredita que aquilo e o total. Isso truncava silenciosamente a
// selecao, a exportacao e o envio em massa.
//
// As paginas sao buscadas em paralelo. Medido com 19.136 contatos: em
// sequencia levava 12,4s (20 idas e voltas de ~600ms cada), em paralelo
// 2,3s - o custo e latencia, nao volume de dados.

export const PAGE_SIZE = 1000

// Teto de requisicoes simultaneas: evita disparar centenas de chamadas de
// uma vez numa base muito grande.
const MAX_CONCURRENCY = 8

interface PageResult<TRow> {
  data: TRow[] | null
  error: { message: string } | null
}

export async function fetchAllPages<TRow>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<TRow>>,
  total: number,
  onProgress?: (carregados: number) => void,
): Promise<TRow[]> {
  if (total <= 0) return []

  const totalPaginas = Math.ceil(total / PAGE_SIZE)
  const paginas: TRow[][] = new Array(totalPaginas)
  let carregados = 0

  // Processa em blocos de MAX_CONCURRENCY paginas por vez.
  for (let bloco = 0; bloco < totalPaginas; bloco += MAX_CONCURRENCY) {
    const indices = Array.from(
      { length: Math.min(MAX_CONCURRENCY, totalPaginas - bloco) },
      (_, i) => bloco + i,
    )

    await Promise.all(
      indices.map(async (indice) => {
        const from = indice * PAGE_SIZE
        const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
        if (error) throw error
        paginas[indice] = data ?? []
        carregados += paginas[indice].length
        onProgress?.(carregados)
      }),
    )
  }

  // Concatena preservando a ordem das paginas (o paralelismo nao garante
  // ordem de chegada, mas o indice sim). push em laco em vez de spread:
  // com dezenas de milhares de itens o spread estoura o limite de
  // argumentos da chamada.
  const todos: TRow[] = []
  for (const pagina of paginas) {
    if (!pagina) continue
    for (const row of pagina) todos.push(row)
  }
  return todos
}
