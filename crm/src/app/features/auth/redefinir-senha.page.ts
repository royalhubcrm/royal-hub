import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { erroAmigavel } from '../../core/supabase/supabase.client';
import { Marca } from '../../shared/ui/marca';
import { BotaoTema } from '../../shared/ui/botao-tema';

/** Aberta pelo link do e-mail "Esqueci minha senha" (e também para trocar a senha provisória). */
@Component({
  selector: 'app-redefinir-senha',
  imports: [FormsModule, Marca, BotaoTema],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.scss',
  template: `
    <div class="auth">
      <div class="auth-tema"><app-botao-tema /></div>
      <aside class="auth-marca"><img class="auth-foto" src="/login-lado.webp" srcset="/login-lado-p.webp 480w, /login-lado.webp 900w" sizes="(max-width: 760px) 0px, 42vw" alt="" fetchpriority="high" decoding="async" /><app-marca [escuro]="true" [altura]="64" /></aside>
      <main class="auth-caixa">
        <h1>Escolha uma senha nova</h1>
        @if (!auth.logado()) {
          <p class="aviso">O link expirou ou já foi usado. Peça outro em "Esqueci minha senha".</p>
          <a class="btn" href="/entrar">Ir para o login</a>
        } @else {
          <form class="pilha" (ngSubmit)="salvar()">
            <div class="campo">
              <label for="nova">Senha nova</label>
              <input id="nova" name="nova" type="password" autocomplete="new-password" minlength="8" required
                     [(ngModel)]="nova" aria-describedby="nova-ajuda" autofocus />
              <span class="ajuda" id="nova-ajuda">Pelo menos 8 caracteres.</span>
            </div>
            <div class="campo">
              <label for="repete">Repita a senha</label>
              <input id="repete" name="repete" type="password" autocomplete="new-password" required [(ngModel)]="repete" />
            </div>
            @if (erro()) { <p class="aviso erro" role="alert">{{ erro() }}</p> }
            <button class="btn primario" type="submit" [disabled]="ocupado()">Salvar e entrar</button>
          </form>
        }
      </main>
    </div>
  `,
})
export default class RedefinirSenhaPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected nova = '';
  protected repete = '';
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);

  protected async salvar() {
    if (this.nova.length < 8) return this.erro.set('A senha precisa de pelo menos 8 caracteres.');
    if (this.nova !== this.repete) return this.erro.set('As duas senhas não são iguais.');
    this.ocupado.set(true);
    try {
      await this.auth.trocarSenha(this.nova);
      await this.auth.carregarPerfil();
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.erro.set(erroAmigavel(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
