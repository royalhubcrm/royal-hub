// Contas de acesso: criar, trocar senha, excluir — e criar imobiliária nova (dono).
// Precisa da chave secreta do Supabase, por isso roda aqui e não no navegador.
import { ErroTela, admin, json, quemChamou, responder } from '../_shared/comum.ts';

const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'empresa';

const PAPEIS = ['admin', 'gerente', 'corretor', 'assistente'];

Deno.serve(responder(async (req) => {
  const db = admin();
  const eu = await quemChamou(req, db);
  const b = await req.json().catch(() => ({}));

  const validarNova = (email: string, senha: string, nome: string) => {
    if (!nome?.trim()) throw new ErroTela('Digite o nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? '')) throw new ErroTela('E-mail inválido.');
    if ((senha ?? '').length < 8) throw new ErroTela('A senha precisa de pelo menos 8 caracteres.');
  };

  const criarLogin = async (email: string, senha: string, nome: string) => {
    const { data, error } = await db.auth.admin.createUser({
      email: email.trim().toLowerCase(), password: senha, email_confirm: true, user_metadata: { nome },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) throw new ErroTela('Esse e-mail já tem conta no sistema.');
      throw new ErroTela(error.message);
    }
    return data.user.id;
  };

  /** A pessoa-alvo precisa ser da mesma empresa de quem pede. */
  const daMinhaEmpresa = async (id: string) => {
    const { data } = await db.from('perfis').select('id, empresa_id').eq('id', id).maybeSingle();
    if (!data || data.empresa_id !== eu.empresa_id) throw new ErroTela('Pessoa não encontrada.', 404);
  };

  switch (b.acao) {
    case 'criar': {
      if (eu.papel !== 'admin') throw new ErroTela('Só o administrador cadastra pessoas.', 403);
      validarNova(b.email, b.senha, b.nome);
      const papel = PAPEIS.includes(b.papel) ? b.papel : 'corretor';
      const id = await criarLogin(b.email, b.senha, b.nome);
      const { error } = await db.from('perfis').insert({
        id, empresa_id: eu.empresa_id, nome: b.nome.trim(), email: b.email.trim().toLowerCase(), papel,
      });
      if (error) { await db.auth.admin.deleteUser(id); throw error; }
      return json({ ok: true, id });
    }

    case 'senha': {
      if (eu.papel !== 'admin' && b.id !== eu.id) throw new ErroTela('Só o administrador troca a senha de outra pessoa.', 403);
      if ((b.senha ?? '').length < 8) throw new ErroTela('A senha precisa de pelo menos 8 caracteres.');
      await daMinhaEmpresa(b.id);
      const { error } = await db.auth.admin.updateUserById(b.id, { password: b.senha });
      if (error) throw new ErroTela(error.message);
      return json({ ok: true });
    }

    case 'remover': {
      if (eu.papel !== 'admin') throw new ErroTela('Só o administrador exclui contas.', 403);
      if (b.id === eu.id) throw new ErroTela('Você não pode excluir a própria conta.');
      await daMinhaEmpresa(b.id);
      const { error } = await db.auth.admin.deleteUser(b.id); // o perfil vai junto (on delete cascade)
      if (error) throw new ErroTela(error.message);
      return json({ ok: true });
    }

    case 'nova_empresa': {
      if (!eu.dono) throw new ErroTela('Só o dono da plataforma cria imobiliárias.', 403);
      if (!b.empresa?.trim()) throw new ErroTela('Digite o nome da imobiliária.');
      validarNova(b.email, b.senha, b.nome);
      // endereço público único: prime, prime-2, prime-3…
      const base = slug(b.empresa);
      let s = base;
      for (let i = 2; ; i++) {
        const { data } = await db.from('empresas').select('id').eq('slug', s).maybeSingle();
        if (!data) break;
        s = `${base}-${i}`;
      }
      const { data: emp, error: e1 } = await db.from('empresas').insert({ nome: b.empresa.trim(), slug: s }).select('id').single();
      if (e1) throw e1;
      try {
        const id = await criarLogin(b.email, b.senha, b.nome);
        const { error } = await db.from('perfis').insert({
          id, empresa_id: emp.id, nome: b.nome.trim(), email: b.email.trim().toLowerCase(), papel: 'admin',
        });
        if (error) { await db.auth.admin.deleteUser(id); throw error; }
      } catch (e) {
        await db.from('empresas').delete().eq('id', emp.id);
        throw e;
      }
      return json({ ok: true, slug: s });
    }

    default:
      throw new ErroTela('Ação desconhecida.');
  }
}));
