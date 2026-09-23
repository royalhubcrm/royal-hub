// A chave anon é pública por natureza: quem protege os dados é o RLS do banco.
// Nunca coloque a service_role aqui — ela iria para o navegador.
export const environment = {
  supabaseUrl: 'https://vtjnlwzcnhqbfnhmmlez.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0am5sd3pjbmhxYmZuaG1tbGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNzI1OTcsImV4cCI6MjEwNTc0ODU5N30.dz_EO193e575HhD-qQLYgr_BMTbWP1KSPPhgslvUw_4',
};
