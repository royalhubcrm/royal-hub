// A chave anon é pública por natureza: quem protege os dados é o RLS do banco.
// Nunca coloque a service_role aqui — ela iria para o navegador.
export const environment = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA-CHAVE-ANON',
};
