import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ImovelPublico, SitesService } from '../../core/services/sites.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { linkWhats } from '../../shared/util/telefone';

/** /imovel/:id — a página que o cliente abre pelo link (WhatsApp, anúncio, site). */
@Component({
  selector: 'app-imovel-publico',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (m(); as m) {
      <div class="pagina">
        <header class="topo"><span class="marca">{{ m.empresa }}</span>
          @if (whats()) { <a class="botao" [href]="whats()" target="_blank" rel="noopener">Tenho interesse</a> }</header>
        <main>
          <section class="galeria" aria-label="Fotos">
            @if (m.fotos.length) {
              <img class="principal" [src]="m.fotos[foto()]" [alt]="'Foto ' + (foto() + 1) + ' de ' + m.fotos.length + ': ' + m.tipo + ' no ' + m.bairro" />
              @if (m.fotos.length > 1) {
                <ul class="miniaturas">
                  @for (f of m.fotos; track f; let i = $index) {
                    <li><button type="button" (click)="foto.set(i)" [attr.aria-pressed]="foto() === i" [attr.aria-label]="'Ver foto ' + (i + 1)">
                      <img [src]="f" alt="" loading="lazy" /></button></li>
                  }
                </ul>
              }
            } @else { <div class="sem-foto">Fotos sob pedido</div> }
          </section>

          <section class="dados">
            <p class="codigo">Cód. {{ m.codigo }} · {{ m.finalidade === 'aluguel' ? 'Aluguel' : 'Venda' }}</p>
            <h1>{{ m.tipo }} no {{ m.bairro }}</h1>
            <p class="cidade">{{ m.cidade }}</p>
            <p class="preco">{{ m.preco ? (m.preco | brl) : 'Sob consulta' }}@if (m.finalidade === 'aluguel') {<small>/mês</small>}</p>
            <dl class="specs">
              @if (m.quartos) { <div><dt>Quartos</dt><dd>{{ m.quartos }}</dd></div> }
              @if (m.suites) { <div><dt>Suítes</dt><dd>{{ m.suites }}</dd></div> }
              @if (m.banheiros) { <div><dt>Banheiros</dt><dd>{{ m.banheiros }}</dd></div> }
              @if (m.vagas) { <div><dt>Vagas</dt><dd>{{ m.vagas }}</dd></div> }
              @if (m.area) { <div><dt>Área</dt><dd>{{ m.area }} m²</dd></div> }
              @if (m.condominio) { <div><dt>Condomínio</dt><dd>{{ m.condominio | brl }}</dd></div> }
              @if (m.iptu) { <div><dt>IPTU/ano</dt><dd>{{ m.iptu | brl }}</dd></div> }
            </dl>
            @if (m.descricao) { <p class="descricao">{{ m.descricao }}</p> }
            @if (whats()) { <a class="botao grande" [href]="whats()" target="_blank" rel="noopener">Chamar no WhatsApp sobre este imóvel</a> }
            <p class="corretor">{{ m.corretor }}@if (m.creci) { · CRECI {{ m.creci }} } · {{ m.empresa }}</p>
          </section>
        </main>
      </div>
    } @else if (naoAchou()) {
      <main class="publico-vazio"><h1>Imóvel indisponível</h1><p>Ele pode ter sido vendido. Fale com a imobiliária para ver opções parecidas.</p></main>
    } @else {
      <p class="publico-vazio" role="status">Carregando…</p>
    }
  `,
  styles: `
    .pagina { background: #fff; min-height: 100dvh; }
    .topo { display: flex; justify-content: space-between; align-items: center; padding: 14px clamp(16px, 4vw, 48px); border-bottom: 1px solid var(--slate-200);
      .marca { font-family: var(--serif); font-weight: 600; font-size: 17px; letter-spacing: .04em; color: var(--navy-900); } }
    .botao { background: var(--navy-700); color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 500;
      &.grande { display: block; text-align: center; padding: 14px; font-size: 15px; margin-top: 18px; background: #1F7A4D; } }
    main { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 32px; padding: 24px clamp(16px, 4vw, 48px) 48px; max-width: 1280px; margin: 0 auto; }
    .galeria { .principal { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; background: var(--slate-100); }
      .sem-foto { aspect-ratio: 4 / 3; display: grid; place-items: center; background: var(--slate-100); border-radius: 8px; color: var(--slate-500); } }
    .miniaturas { list-style: none; margin: 10px 0 0; padding: 0; display: flex; gap: 8px; overflow-x: auto;
      button { all: unset; cursor: pointer; display: block; border-radius: 6px; overflow: hidden; border: 2px solid transparent;
        &[aria-pressed=true] { border-color: var(--navy-700); } &:focus-visible { box-shadow: var(--foco); } }
      img { width: 88px; height: 66px; object-fit: cover; display: block; } }
    .dados { display: flex; flex-direction: column; gap: 6px;
      .codigo { font: 500 11.5px/1 var(--mono); color: var(--ouro-texto); letter-spacing: .14em; text-transform: uppercase; }
      h1 { font-family: var(--serif); font-weight: 600; font-size: 27px; letter-spacing: .01em; color: var(--navy-900); }
      .cidade { color: var(--slate-500); }
      .preco { font: 500 28px/1.2 var(--mono); color: var(--navy-700); margin-top: 6px; small { font-size: 14px; color: var(--slate-500); } }
      .descricao { white-space: pre-wrap; margin-top: 12px; color: var(--slate-700); }
      .corretor { font-size: 13px; color: var(--slate-500); margin-top: 16px; } }
    .specs { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; margin: 12px 0 0;
      div { background: var(--slate-100); border-radius: 6px; padding: 8px 10px; }
      dt { font-size: 11px; color: var(--slate-500); text-transform: uppercase; letter-spacing: .06em; } dd { margin: 0; font-weight: 600; font-size: 15px; } }
    .publico-vazio { padding: 48px 20px; text-align: center; color: var(--slate-600); }
    @media (max-width: 860px) { main { grid-template-columns: 1fr; } }
  `,
})
export default class ImovelPublicoPage {
  readonly id = input.required<string>();
  private readonly srv = inject(SitesService);
  private readonly titulo = inject(Title);

  protected readonly m = signal<ImovelPublico | null>(null);
  protected readonly naoAchou = signal(false);
  protected readonly foto = signal(0);
  protected readonly whats = computed(() => {
    const m = this.m();
    return m ? linkWhats(m.whats, `Olá! Tenho interesse no imóvel cód. ${m.codigo} (${m.tipo} no ${m.bairro}).`) : null;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      void this.srv.imovelPublico(id).then((m) => {
        this.m.set(m);
        this.naoAchou.set(!m);
        if (m) this.titulo.setTitle(`${m.tipo} no ${m.bairro} · ${m.empresa}`);
      });
    });
  }
}
