/** Um lançamento (o "book" da construtora) que a imobiliária vende. */
export interface Empreendimento {
  id: string;
  empresa_id: string;
  nome: string;
  construtora: string;
  bairro: string;
  endereco: string;
  situacao: string;
  tipologias: string;
  lazer: string;
  localizacao: string;
  diferenciais: string;
  observacoes: string;
  criado_em: string;
  atualizado_em: string;
}

export type EmpreendimentoEditavel = Partial<Empreendimento> & { nome: string };

export const EMPREENDIMENTO_VAZIO = (): EmpreendimentoEditavel => ({
  nome: '', construtora: '', bairro: '', endereco: '', situacao: '',
  tipologias: '', lazer: '', localizacao: '', diferenciais: '', observacoes: '',
});

/** Os campos de texto longo, na ordem em que aparecem na tela e no prompt da assistente. */
export const CAMPOS_EMPREENDIMENTO: { chave: keyof Empreendimento; rotulo: string; ajuda: string; linhas: number }[] = [
  { chave: 'situacao', rotulo: 'Situação', ajuda: 'Na planta, em obras, pronto para morar, previsão de entrega.', linhas: 2 },
  { chave: 'tipologias', rotulo: 'Plantas', ajuda: 'Metragens e número de quartos de cada planta.', linhas: 3 },
  { chave: 'lazer', rotulo: 'Lazer', ajuda: 'Piscina, academia, salão, coworking…', linhas: 3 },
  { chave: 'localizacao', rotulo: 'Em volta', ajuda: 'O que tem perto: escolas, comércio, avenidas.', linhas: 3 },
  { chave: 'diferenciais', rotulo: 'Diferenciais', ajuda: 'O que esse prédio tem que os outros não têm.', linhas: 3 },
  { chave: 'observacoes', rotulo: 'Observações', ajuda: 'Só o que a assistente pode falar. Preço e tabela não entram aqui.', linhas: 3 },
];
