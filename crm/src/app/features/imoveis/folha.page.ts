import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Imovel } from '../../core/models/imovel.model';
import { ConfigService } from '../../core/services/config.service';
import { ImoveisService } from '../../core/services/imoveis.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { formatarTelefone } from '../../shared/util/telefone';

/**
 * Folha de opções para o cliente. No lugar do PDF gerado no servidor, o próprio
 * navegador imprime ou salva em PDF (Ctrl+P → "Salvar como PDF").
 */
@Component({
  selector: 'app-folha',
  imports: [RouterLink, BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="barra nao-imprimir">
      <a class="btn" routerLink="/imoveis">← Voltar</a>
      <label class="campo cliente">
        <span class="rotulo">Para (opcional)</span>
        <input [value]="cliente()" (input)="cliente.set($any($event.target).value)" placeholder="Nome do cliente" />
      </label>
      <button type="button" class="btn primario" (click)="imprimir()">Imprimir ou salvar PDF</button>
    </div>

    <article class="folha">
      <header>
        <div>
          <p class="empresa">{{ auth.empresa()?.nome }}</p>
          <h1>{{ cliente() ? 'Opções separadas para ' + cliente() : 'Opções de imóveis' }}</h1>
        </div>
        <p class="contato">
          {{ config.config()?.corretor }}@if (config.config()?.creci) { · CRECI {{ config.config()?.creci }} }<br />
          {{ whats() }}
        </p>
      </header>
      @for (m of imoveis(); track m.id) {
        <section class="opcao">
          @if (m.fotos[0]) { <img [src]="m.fotos[0]" [alt]="m.tipo + ' no ' + m.bairro" /> }
          <div>
            <p class="cod mono">Cód. {{ m.codigo }}</p>
            <h2>{{ m.tipo }} · {{ m.bairro }}, {{ m.cidade }}</h2>
            <p class="preco mono">{{ m.preco ? (m.preco | brl) : 'Sob consulta' }}</p>
            <p class="specs">
              @if (m.quartos) { {{ m.quartos }} quarto(s) · } @if (m.suites) { {{ m.suites }} suíte(s) · }
              @if (m.vagas) { {{ m.vagas }} vaga(s) · } @if (m.area) { {{ m.area }} m² }
            </p>
            @if (m.condominio || m.iptu) { <p class="specs">Condomínio {{ m.condominio | brl }} · IPTU {{ m.iptu | brl }}/ano</p> }
            <p class="desc">{{ m.descricao.slice(0, 420) }}</p>
            <p class="link mono">{{ origem }}/imovel/{{ m.id }}</p>
          </div>
        </section>
      } @empty {
        <p class="mudo">Carregando…</p>
      }
    </article>
  `,
  styles: `
    .barra { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin-bottom: 18px; .cliente { flex: 1 1 220px; } }
    .folha { background: #fff; max-width: 820px; margin: 0 auto; padding: 32px 36px; border: 1px solid var(--slate-200); border-radius: var(--raio); }
    .folha > header { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 2px solid var(--ouro-500); margin-bottom: 8px;
      .empresa { font: 500 11px/1 var(--mono); letter-spacing: .16em; text-transform: uppercase; color: var(--ouro-texto); margin-bottom: 8px; }
      h1 { font-family: var(--serif); font-weight: 600; font-size: 24px; letter-spacing: .01em; color: var(--navy-900); }
      .contato { text-align: right; font-size: 13px; color: var(--slate-600); } }
    .opcao { display: grid; grid-template-columns: 240px 1fr; gap: 18px; padding: 18px 0; border-bottom: 1px solid var(--slate-200); break-inside: avoid;
      img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 6px; }
      .cod { font-size: 12px; color: var(--slate-500); } h2 { font-size: 16px; margin: 2px 0 4px; }
      .preco { font-size: 18px; font-weight: 500; color: var(--navy-700); } .specs { font-size: 13px; color: var(--slate-600); }
      .desc { font-size: 13px; margin-top: 6px; } .link { font-size: 11px; color: var(--slate-500); margin-top: 6px; word-break: break-all; } }
    @media (max-width: 640px) { .opcao { grid-template-columns: 1fr; } .folha { padding: 18px; } }
    @media print {
      .folha { border: 0; padding: 0; max-width: none; }
    }
  `,
})
export default class FolhaPage {
  /** ?ids=a,b,c */
  readonly ids = input<string>('');

  protected readonly auth = inject(AuthService);
  protected readonly config = inject(ConfigService);
  private readonly srv = inject(ImoveisService);

  protected readonly imoveis = signal<Imovel[]>([]);
  protected readonly cliente = signal('');
  protected readonly origem = location.origin;
  protected readonly whats = () => formatarTelefone(this.config.config()?.whats);

  constructor() {
    void this.config.garantir().catch(() => null);
    effect(() => {
      const lista = (this.ids() ?? '').split(',').filter(Boolean);
      void this.carregar(lista);
    });
  }

  private async carregar(ids: string[]) {
    if (ids.length) this.imoveis.set(await this.srv.porIds(ids).catch(() => []));
  }

  protected imprimir() { window.print(); }
}
