import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { Empresa } from '../../core/models/pessoa.model';
import { EquipeService } from '../../core/services/equipe.service';
import { AvisosService } from '../../core/ui/avisos.service';

/** Só para o dono da plataforma: as imobiliárias que usam o sistema. */
@Component({
  selector: 'app-empresas',
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabecalho-pagina">
      <div>
        <p class="sobretitulo">Plataforma</p>
        <h1>Empresas</h1>
        <p>As imobiliárias que usam o sistema. Cada uma só enxerga os próprios dados. Bloquear tira o acesso de todos dela na hora (nada é apagado).</p>
      </div>
    </header>

    <section class="cartao" aria-labelledby="t-nova-emp">
      <h2 id="t-nova-emp">Nova imobiliária</h2>
      <form class="nova" (ngSubmit)="criar()">
        <div class="campo"><label for="e-emp">Nome da imobiliária</label><input id="e-emp" name="empresa" [(ngModel)]="nova.empresa" /></div>
        <div class="campo"><label for="e-nome">Administrador</label><input id="e-nome" name="nome" [(ngModel)]="nova.nome" /></div>
        <div class="campo"><label for="e-email">E-mail dele</label><input id="e-email" name="email" type="email" [(ngModel)]="nova.email" /></div>
        <div class="campo"><label for="e-senha">Senha provisória</label><input id="e-senha" name="senha" class="mono" [(ngModel)]="nova.senha" autocomplete="new-password" /></div>
        <button class="btn primario" type="submit" [disabled]="ocupado()">{{ ocupado() ? 'Criando…' : 'Criar' }}</button>
      </form>
    </section>

    <section class="cartao" aria-labelledby="t-emps">
      <h2 id="t-emps">Imobiliárias</h2>
      <div class="tabela-rolagem">
        <table class="tabela">
          <caption class="sr-only">Imobiliárias cadastradas</caption>
          <thead><tr><th scope="col">Imobiliária</th><th scope="col">Endereço público</th><th scope="col">Desde</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>
            @for (e of empresas(); track e.id) {
              <tr>
                <td><b>{{ e.nome }}</b>@if (e.id === auth.empresa()?.id) { <span class="mudo"> (a sua)</span> }</td>
                <td class="mono pequeno">/captar/{{ e.slug }}</td>
                <td class="mono pequeno">{{ e.criado_em | date: 'dd/MM/yyyy' }}</td>
                <td><span class="etiqueta" [class.ok]="e.ativa" [class.quente]="!e.ativa">{{ e.ativa ? 'Ativa' : 'Bloqueada' }}</span></td>
                <td>
                  @if (e.id !== auth.empresa()?.id) {
                    <button type="button" class="btn pequeno" [class.perigo]="e.ativa" (click)="alternar(e)">{{ e.ativa ? 'Bloquear' : 'Liberar' }} <span class="sr-only">{{ e.nome }}</span></button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `.nova { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items: end; } .cartao h2 { font-size: 14px; margin-bottom: 12px; }`,
})
export default class EmpresasPage {
  private readonly srv = inject(EquipeService);
  private readonly avisos = inject(AvisosService);
  protected readonly auth = inject(AuthService);
  protected readonly empresas = signal<Empresa[]>([]);
  protected readonly ocupado = signal(false);
  protected nova = { empresa: '', nome: '', email: '', senha: '' };

  constructor() { void this.carregar(); }

  private async carregar() {
    try { this.empresas.set(await this.srv.empresas()); } catch (e) { this.avisos.erro(e); }
  }

  protected async criar() {
    const n = this.nova;
    if (!n.empresa.trim() || !n.nome.trim() || !n.email.includes('@') || n.senha.length < 8)
      return this.avisos.erro('Preencha tudo; a senha precisa de 8 caracteres.');
    this.ocupado.set(true);
    try {
      await this.srv.novaEmpresa(n);
      this.avisos.ok(`${n.empresa} criada. Passe o e-mail e a senha para ${n.nome}.`);
      this.nova = { empresa: '', nome: '', email: '', senha: '' };
      await this.carregar();
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async alternar(e: Empresa) {
    if (e.ativa && !(await this.avisos.confirmar(`Bloquear ${e.nome}?`, { texto: 'Ninguém dela consegue entrar até você liberar. Os dados ficam guardados.', confirmar: 'Bloquear' }))) return;
    try {
      await this.srv.ativarEmpresa(e.id, !e.ativa);
      await this.carregar();
    } catch (err) {
      this.avisos.erro(err);
    }
  }
}
