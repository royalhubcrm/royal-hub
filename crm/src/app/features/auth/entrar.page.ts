import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SUPABASE_CONFIGURADO, erroAmigavel } from '../../core/supabase/supabase.client';
import { Marca } from '../../shared/ui/marca';

type Modo = 'entrar' | 'esqueci' | 'enviado' | 'primeiro' | 'sem-acesso';

@Component({
  selector: 'app-entrar',
  imports: [FormsModule, Marca],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.scss',
  template: `
    <div class="auth">
      <aside class="auth-marca">
        <app-marca [escuro]="true" [altura]="64" />
        <p>Leads, imóveis e WhatsApp da imobiliária em um lugar só.</p>
      </aside>

      <main class="auth-caixa">
        @if (!configurado) {
          <h1>Falta ligar o Supabase</h1>
          <p class="mudo">Abra <span class="mono">src/environments/environment.ts</span> e preencha o endereço do projeto e a chave
            <b>anon</b> (Supabase → Project Settings → API). Depois recarregue esta página.</p>
        } @else {
          @switch (modo()) {
            @case ('entrar') {
              <h1>Entrar</h1>
              <form class="pilha" (ngSubmit)="entrar()" #f="ngForm">
                <div class="campo">
                  <label for="email">E-mail</label>
                  <input id="email" name="email" type="email" autocomplete="username" required [(ngModel)]="email" autofocus />
                </div>
                <div class="campo">
                  <label for="senha">Senha</label>
                  <div class="senha">
                    <input id="senha" name="senha" [type]="verSenha() ? 'text' : 'password'" autocomplete="current-password"
                           required [(ngModel)]="senha" />
                    <button type="button" class="btn fantasma pequeno" (click)="verSenha.set(!verSenha())"
                            [attr.aria-pressed]="verSenha()">{{ verSenha() ? 'Esconder' : 'Mostrar' }}</button>
                  </div>
                </div>
                @if (erro()) { <p class="aviso erro" role="alert">{{ erro() }}</p> }
                <button class="btn primario" type="submit" [disabled]="ocupado()">{{ ocupado() ? 'Entrando…' : 'Entrar' }}</button>
                <button type="button" class="link" (click)="trocar('esqueci')">Esqueci minha senha</button>
              </form>
            }
            @case ('esqueci') {
              <h1>Recuperar senha</h1>
              <p class="mudo">Mandamos um link para o seu e-mail. Clicando nele, você escolhe uma senha nova.</p>
              <form class="pilha" (ngSubmit)="esqueci()">
                <div class="campo">
                  <label for="email2">E-mail</label>
                  <input id="email2" name="email" type="email" autocomplete="username" required [(ngModel)]="email" autofocus />
                </div>
                @if (erro()) { <p class="aviso erro" role="alert">{{ erro() }}</p> }
                <button class="btn primario" type="submit" [disabled]="ocupado()">Enviar link</button>
                <button type="button" class="link" (click)="trocar('entrar')">Voltar para o login</button>
              </form>
            }
            @case ('enviado') {
              <h1>Confira o seu e-mail</h1>
              <p class="mudo" role="status">Se <b>{{ email }}</b> tiver acesso, o link chega em alguns minutos. Olhe também o spam.</p>
              <button type="button" class="btn" (click)="trocar('entrar')">Voltar para o login</button>
            }
            @case ('primeiro') {
              <h1>Bem-vindo! Vamos começar</h1>
              <p class="mudo">Este é o primeiro acesso ao sistema. Você vira o administrador e depois cadastra a sua equipe.</p>
              <form class="pilha" (ngSubmit)="primeiroAcesso()">
                <div class="campo">
                  <label for="pa-empresa">Nome da imobiliária</label>
                  <input id="pa-empresa" name="empresa" required minlength="2" [(ngModel)]="nomeEmpresa" autofocus />
                </div>
                <div class="campo">
                  <label for="pa-nome">Seu nome</label>
                  <input id="pa-nome" name="nome" required autocomplete="name" [(ngModel)]="nomePessoa" />
                </div>
                @if (erro()) { <p class="aviso erro" role="alert">{{ erro() }}</p> }
                <button class="btn primario" type="submit" [disabled]="ocupado()">Criar e entrar</button>
              </form>
            }
            @case ('sem-acesso') {
              <h1>Conta sem acesso</h1>
              <p class="mudo">O seu login existe, mas ainda não está ligado a nenhuma imobiliária — ou foi desativado.
                Peça para o administrador liberar o seu acesso na tela Equipe.</p>
              <button type="button" class="btn" (click)="auth.sair(); trocar('entrar')">Entrar com outra conta</button>
            }
          }
        }
      </main>
    </div>
  `,
})
export default class EntrarPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /** Para onde voltar depois do login (vem da URL: /entrar?volta=/leads). */
  readonly volta = input<string>();

  protected readonly configurado = SUPABASE_CONFIGURADO;
  protected readonly modo = signal<Modo>('entrar');
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  protected readonly verSenha = signal(false);
  protected email = '';
  protected senha = '';
  protected nomeEmpresa = '';
  protected nomePessoa = '';

  constructor() {
    // já logado mas sem perfil (voltou do e-mail, ou conta sem empresa)
    void this.auth.pronto.then(() => { if (this.auth.logado() && !this.auth.perfil()) void this.semPerfil(); });
  }

  protected trocar(m: Modo) { this.modo.set(m); this.erro.set(''); }

  protected async entrar() {
    if (!this.email || !this.senha) { this.erro.set('Preencha e-mail e senha.'); return; }
    await this.tentar(async () => {
      const perfil = await this.auth.entrar(this.email, this.senha);
      if (perfil?.ativo) await this.router.navigateByUrl(this.volta() || '/');
      else await this.semPerfil();
    });
  }

  protected async esqueci() {
    if (!this.email) { this.erro.set('Digite o seu e-mail.'); return; }
    await this.tentar(async () => { await this.auth.esqueciSenha(this.email); this.trocar('enviado'); });
  }

  protected async primeiroAcesso() {
    if (this.nomeEmpresa.trim().length < 2 || !this.nomePessoa.trim()) { this.erro.set('Preencha os dois campos.'); return; }
    await this.tentar(async () => {
      await this.auth.primeiroAcesso(this.nomeEmpresa, this.nomePessoa);
      await this.router.navigateByUrl('/ajustes');
    });
  }

  private async semPerfil() {
    this.trocar(this.auth.perfil() || (await this.auth.sistemaConfigurado()) ? 'sem-acesso' : 'primeiro');
  }

  private async tentar(acao: () => Promise<void>) {
    this.ocupado.set(true);
    this.erro.set('');
    try { await acao(); } catch (e) { this.erro.set(erroAmigavel(e)); } finally { this.ocupado.set(false); }
  }
}
