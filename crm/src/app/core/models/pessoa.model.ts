export type Papel = 'admin' | 'gerente' | 'corretor' | 'assistente';

export const PAPEIS: { valor: Papel; rotulo: string; pode: string }[] = [
  { valor: 'admin', rotulo: 'Administrador', pode: 'Tudo' },
  { valor: 'gerente', rotulo: 'Gerente', pode: 'Leads e conversas da equipe dele, mais a Agenda' },
  { valor: 'corretor', rotulo: 'Corretor', pode: 'Os leads dele, imóveis e conversas' },
  { valor: 'assistente', rotulo: 'Assistente', pode: 'Os leads dele e as conversas do WhatsApp' },
];

export const rotuloPapel = (p: string) => PAPEIS.find((x) => x.valor === p)?.rotulo ?? p;

export interface Perfil {
  id: string;
  empresa_id: string;
  nome: string;
  email: string;
  telefone: string;
  papel: Papel;
  equipe_id: string | null;
  ativo: boolean;
  dono: boolean;
  ultimo_acesso: string | null;
}

export interface Equipe {
  id: string;
  nome: string;
  gerente_id: string | null;
}

export interface Empresa {
  id: string;
  nome: string;
  slug: string;
  ativa: boolean;
  criado_em: string;
}
