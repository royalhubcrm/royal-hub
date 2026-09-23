import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ImovelVitrine, Site } from '../../core/models/site.model';
import { SitesService } from '../../core/services/sites.service';
import { Vitrine } from './vitrine';

/** /s/:slug — o site do cliente, sem login. */
@Component({
  selector: 'app-site-publico',
  imports: [Vitrine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tema-claro' },
  template: `
    @if (dados(); as d) {
      <app-vitrine [site]="d.site" [imoveis]="d.imoveis" />
    } @else if (naoAchou()) {
      <main class="publico-vazio"><h1>Site não encontrado</h1><p>Confira o endereço ou fale com a imobiliária.</p></main>
    } @else {
      <p class="publico-vazio" role="status">Carregando…</p>
    }
  `,
  styles: `.publico-vazio { padding: 48px 20px; text-align: center; color: var(--slate-600); }`,
})
export default class SitePublicoPage {
  readonly slug = input.required<string>();
  private readonly srv = inject(SitesService);
  private readonly titulo = inject(Title);
  protected readonly dados = signal<{ site: Site; imoveis: ImovelVitrine[] } | null>(null);
  protected readonly naoAchou = signal(false);

  constructor() {
    effect(() => {
      const slug = this.slug();
      void this.srv.sitePublico(slug).then((d) => {
        this.dados.set(d);
        this.naoAchou.set(!d);
        if (d) this.titulo.setTitle(d.site.nome || 'Imóveis');
      });
    });
  }
}
