import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { Equipe, PAPEIS, Papel, Perfil } from '../../core/models/pessoa.model';
import { EquipeService } from '../../core/services/equipe.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { QuandoPipe } from '../../shared/pipes/formatos.pipe';
import { Gaveta } from '../../shared/ui/gaveta';
import { emailValido, focarPrimeiroErro } from '../../shared/util/validacao';

@Component({
  selector: 'app-equipe',
  imports: [FormsModule, QuandoPipe, Gaveta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equipe.page.html',
  styleUrl: './equipe.page.scss',
})
export default class EquipePage {
  private readonly srv = inject(EquipeService);
  private readonly avisos = inject(AvisosService);
  protected readonly auth = inject(AuthService);

  protected readonly papeis = PAPEIS;
  protected readonly pessoas = signal<Perfil[]>([]);
  protected readonly equipes = signal<Equipe[]>([]);
  protected readonly ocupado = signal(false);

  protected nova = { nome: '', email: '', senha: '', papel: 'corretor' as Papel };
  protected readonly tentouCriar = signal(false);
  protected readonly tocados = signal<Set<string>>(new Set());
  protected nomeEquipe = '';

  protected readonly trocandoSenha = signal<Perfil | null>(null);
  protected senhaNova = '';

  protected readonly gerentes = computed(() => this.pessoas().filter((p) => p.ativo && (p.papel === 'gerente' || p.papel === 'admin')));

  constructor() { void this.carregar(); }

  private async carregar() {
    try {
      const [p, e] = await Promise.all([this.srv.pessoas(), this.srv.equipes()]);
      this.pessoas.set(p);
      this.equipes.set(e);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected membros(e: Equipe) { return this.pessoas().filter((p) => p.equipe_id === e.id).map((p) => p.nome).join(', '); }

  // ---------------------------------------------------------------- pessoas
  protected get erroEmail() { return this.nova.email.trim() && emailValido(this.nova.email) ? '' : 'E-mail inválido.'; }
  protected tocar(campo: string) { this.tocados.update((s) => new Set(s).add(campo)); }
  protected mostraErro(campo: string) { return this.tentouCriar() || this.tocados().has(campo); }
  protected get erroSenha() { return this.nova.senha.length >= 8 ? '' : 'Pelo menos 8 caracteres.'; }

  protected sugerirSenha() {
    const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
    this.nova.senha = Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => letras[n % letras.length]).join('');
  }

  protected async criar() {
    this.tentouCriar.set(true);
    if (!this.nova.nome.trim() || this.erroEmail || this.erroSenha) { focarPrimeiroErro(); return this.avisos.erro('Confira os campos marcados.'); }
    this.ocupado.set(true);
    try {
      await this.srv.criarPessoa({ ...this.nova, nome: this.nova.nome.trim(), email: this.nova.email.trim() });
      this.avisos.ok(`${this.nova.nome} pode entrar. Passe o e-mail e a senha provisória para a pessoa.`);
      this.nova = { nome: '', email: '', senha: '', papel: 'corretor' };
      this.tentouCriar.set(false);
      this.tocados.set(new Set());
      await this.carregar();
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async salvar(p: Perfil, campos: Partial<Perfil>, aviso: string) {
    try {
      await this.srv.salvarPessoa(p.id, campos);
      this.pessoas.update((l) => l.map((x) => (x.id === p.id ? { ...x, ...campos } : x)));
      this.avisos.ok(aviso);
    } catch (e) {
      this.avisos.erro(e);
      await this.carregar(); // devolve o seletor ao valor certo
    }
  }

  protected rotuloPapel(v: string) { return this.papeis.find((p) => p.valor === v)?.rotulo ?? v; }

  protected async trocarSenha() {
    const p = this.trocandoSenha();
    if (!p) return;
    if (this.senhaNova.length < 8) return this.avisos.erro('A senha precisa de pelo menos 8 caracteres.');
    try {
      await this.srv.novaSenha(p.id, this.senhaNova);
      this.avisos.ok(`Senha de ${p.nome} trocada.`);
      this.trocandoSenha.set(null);
      this.senhaNova = '';
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected async remover(p: Perfil) {
    const ok = await this.avisos.confirmar(`Excluir a conta de ${p.nome}?`, {
      texto: 'Os leads dessa pessoa ficam sem responsável. Se ela só saiu por um tempo, prefira "Desativar".',
      confirmar: 'Excluir conta',
    });
    if (!ok) return;
    try {
      await this.srv.removerPessoa(p.id);
      this.avisos.ok('Conta excluída.');
      await this.carregar();
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  // ---------------------------------------------------------------- equipes
  protected async criarEquipe() {
    if (!this.nomeEquipe.trim()) return this.avisos.erro('Dê um nome para a equipe.');
    try {
      await this.srv.salvarEquipe({ nome: this.nomeEquipe.trim() });
      this.nomeEquipe = '';
      this.avisos.ok('Equipe criada. Agora escolha o gerente e coloque as pessoas nela.');
      await this.carregar();
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected async definirGerente(e: Equipe, gerente: string) {
    try {
      await this.srv.salvarEquipe({ id: e.id, nome: e.nome, gerente_id: gerente || null });
      this.equipes.update((l) => l.map((x) => (x.id === e.id ? { ...x, gerente_id: gerente || null } : x)));
      this.avisos.ok('Gerente definido.');
    } catch (err) {
      this.avisos.erro(err);
    }
  }

  protected async removerEquipe(e: Equipe) {
    const ok = await this.avisos.confirmar(`Excluir a equipe ${e.nome}?`, { texto: 'As pessoas ficam sem equipe, mas nada mais se perde.' });
    if (!ok) return;
    try {
      await this.srv.removerEquipe(e.id);
      await this.carregar();
    } catch (err) {
      this.avisos.erro(err);
    }
  }
}
