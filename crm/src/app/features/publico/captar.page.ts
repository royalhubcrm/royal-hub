import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { EmpresaPublica, SitesService } from '../../core/services/sites.service';
import { erroAmigavel } from '../../core/supabase/supabase.client';
import { linkWhats, soDigitos } from '../../shared/util/telefone';

/** /captar/:empresa?c=campanha — o formulário que vai no anúncio ou na bio. */
@Component({
  selector: 'app-captar',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="captar">
      @if (empresa(); as e) {
        <p class="marca">{{ e.nome }}</p>
        @if (!enviado()) {
          <h1>Conte o que você procura</h1>
          <p class="apoio">Um corretor te chama no WhatsApp com opções que encaixam no que você pediu.</p>
          <form class="pilha" (ngSubmit)="enviar()" novalidate>
            <div class="campo">
              <label for="c-nome">Seu nome</label>
              <input id="c-nome" name="nome" autocomplete="name" [(ngModel)]="f.nome" required
                     [attr.aria-invalid]="tentou() && f.nome.trim().length < 2" aria-describedby="c-nome-erro" />
              @if (tentou() && f.nome.trim().length < 2) { <span class="erro" id="c-nome-erro">Digite o seu nome.</span> }
            </div>
            <div class="campo">
              <label for="c-tel">WhatsApp com DDD</label>
              <input id="c-tel" name="tel" type="tel" autocomplete="tel" inputmode="tel" [(ngModel)]="f.telefone" required
                     placeholder="(34) 99999-0000" [attr.aria-invalid]="tentou() && !telOk()" aria-describedby="c-tel-erro" />
              @if (tentou() && !telOk()) { <span class="erro" id="c-tel-erro">Confira o número com DDD.</span> }
            </div>
            <div class="campo">
              <label for="c-email">E-mail <span class="opcional">(opcional)</span></label>
              <input id="c-email" name="email" type="email" autocomplete="email" [(ngModel)]="f.email" />
            </div>
            <div class="campo">
              <label for="c-int">O que você procura?</label>
              <textarea id="c-int" name="interesse" rows="3" [(ngModel)]="f.interesse" placeholder="Ex.: casa de 3 quartos na Zona Sul, até 500 mil"></textarea>
            </div>
            @if (erro()) { <p class="aviso erro" role="alert">{{ erro() }}</p> }
            <button class="btn primario" type="submit" [disabled]="enviando()">{{ enviando() ? 'Enviando…' : 'Quero receber opções' }}</button>
            <p class="lgpd">Usamos seus dados só para falar com você sobre imóveis.</p>
          </form>
        } @else {
          <div class="pronto" role="status">
            <h1>Recebemos, {{ f.nome.split(' ')[0] }}!</h1>
            <p class="apoio">Um corretor vai te chamar no WhatsApp em breve.</p>
            @if (whats(); as w) { <a class="btn primario" [href]="w" target="_blank" rel="noopener">Quero falar agora no WhatsApp</a> }
          </div>
        }
      } @else if (naoAchou()) {
        <h1>Formulário indisponível</h1>
        <p class="apoio">Confira o link ou fale direto com a imobiliária.</p>
      } @else {
        <p role="status">Carregando…</p>
      }
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--navy-900); padding: clamp(16px, 5vw, 48px) 16px; }
    .captar { max-width: 460px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 28px clamp(18px, 5vw, 32px);
      display: flex; flex-direction: column; gap: 10px; }
    .marca { font: 500 11.5px/1 var(--mono); letter-spacing: .18em; text-transform: uppercase; color: var(--ouro-texto); }
    h1 { font-family: var(--serif); font-weight: 600; font-size: 25px; letter-spacing: .01em; color: var(--navy-900); }
    .apoio { color: var(--slate-600); margin-bottom: 8px; }
    .btn.primario { min-height: 48px; font-size: 15px; width: 100%; }
    input, textarea { font-size: 16px !important; } /* evita o zoom automático do iPhone */
    .opcional { font-weight: 400; color: var(--slate-500); }
    .lgpd { font-size: 12px; color: var(--slate-500); text-align: center; }
    .pronto { display: flex; flex-direction: column; gap: 10px; }
  `,
})
export default class CaptarPage {
  readonly empresaSlug = input.required<string>({ alias: 'empresa' });
  /** ?c=campanha */
  readonly c = input<string>();

  private readonly srv = inject(SitesService);
  private readonly titulo = inject(Title);
  protected readonly empresa = signal<EmpresaPublica | null>(null);
  protected readonly naoAchou = signal(false);
  protected readonly enviado = signal(false);
  protected readonly enviando = signal(false);
  protected readonly tentou = signal(false);
  protected readonly erro = signal('');
  protected f = { nome: '', telefone: '', email: '', interesse: '' };

  protected readonly whats = computed(() => {
    const e = this.empresa();
    return e ? linkWhats(e.whats, `Olá! Acabei de preencher o formulário. Procuro: ${this.f.interesse || 'um imóvel'}.`) : null;
  });

  constructor() {
    effect(() => {
      const slug = this.empresaSlug();
      void this.srv.empresaPublica(slug).then((e) => {
        this.empresa.set(e);
        this.naoAchou.set(!e);
        if (e) this.titulo.setTitle(`Fale com a ${e.nome}`);
      });
    });
  }

  protected telOk() { return (soDigitos(this.f.telefone) ?? '').length >= 10; }

  protected async enviar() {
    this.tentou.set(true);
    if (this.f.nome.trim().length < 2 || !this.telOk()) return;
    this.enviando.set(true);
    this.erro.set('');
    try {
      await this.srv.captar({ empresa: this.empresaSlug(), ...this.f, campanha: this.c() ?? '' });
      this.enviado.set(true);
    } catch (e) {
      this.erro.set(erroAmigavel(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
