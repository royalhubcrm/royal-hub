import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Imovel, TIPOS_IMOVEL } from '../../core/models/imovel.model';
import { ImovelVitrine, Site, SiteEditavel, siteVazio } from '../../core/models/site.model';
import { ConfigService } from '../../core/services/config.service';
import { ImoveisService } from '../../core/services/imoveis.service';
import { SitesService } from '../../core/services/sites.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { slugDe } from '../../shared/util/texto';
import { Vitrine } from '../publico/vitrine';
import { MascaraDirective } from '../../shared/ui/mascara.directive';
import { focarPrimeiroErro } from '../../shared/util/validacao';

@Component({
  selector: 'app-sites',
  imports: [FormsModule, Vitrine, MascaraDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sites.page.html',
  styleUrl: './sites.page.scss',
})
export default class SitesPage {
  private readonly srv = inject(SitesService);
  private readonly imoveisSrv = inject(ImoveisService);
  private readonly cfg = inject(ConfigService);
  private readonly avisos = inject(AvisosService);

  protected readonly tiposImovel = TIPOS_IMOVEL;
  protected readonly sites = signal<Site[]>([]);
  protected readonly carteira = signal<Imovel[]>([]);
  /** O site sendo editado (null = nenhum aberto). É um sinal para a prévia acompanhar cada tecla. */
  protected readonly rascunho = signal<SiteEditavel | null>(null);
  protected readonly salvando = signal(false);
  protected readonly desenhando = signal(false);
  protected readonly tentouSalvar = signal(false);
  protected readonly tocados = signal<Set<string>>(new Set());
  protected descricao = '';
  protected readonly origem = location.origin;

  /** Os imóveis que o filtro do site deixa passar (mesma regra do banco). */
  protected readonly vitrine = computed<ImovelVitrine[]>(() => {
    const r = this.rascunho();
    if (!r) return [];
    const f = r.filtro ?? {};
    return this.carteira()
      .filter((m) => m.status === 'disponivel'
        && (!f.tipos?.length || f.tipos.includes(m.tipo))
        && (!f.cidade || m.cidade.toLowerCase() === f.cidade.toLowerCase())
        && (!f.precoMax || m.preco <= f.precoMax))
      .map((m) => ({ ...m, foto: m.fotos[0] ?? null }));
  });

  constructor() { void this.carregar(); }

  private async carregar() {
    try {
      const [s, c] = await Promise.all([this.srv.listar(), this.imoveisSrv.listar()]);
      this.sites.set(s);
      this.carteira.set(c);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected async novo() {
    const c = await this.cfg.garantir().catch(() => null);
    this.rascunho.set({ ...siteVazio(), whats: c?.whats ?? '', creci: c?.creci ?? '', endereco: c?.endereco ?? '' });
  }

  protected editar(s: Site) { this.rascunho.set(structuredClone(s)); }

  protected slugOk(slug: string) { return /^[a-z0-9-]{2,40}$/.test(slug); }
  protected tocar(campo: string) { this.tocados.update((s) => new Set(s).add(campo)); }
  protected mostraErro(campo: string) { return this.tentouSalvar() || this.tocados().has(campo); }

  /** Atualiza um campo do rascunho (a prévia acompanha na hora). */
  protected mudar<K extends keyof SiteEditavel>(campo: K, valor: SiteEditavel[K]) {
    this.rascunho.update((r) => {
      if (!r) return r;
      const novo = { ...r, [campo]: valor };
      // endereço acompanha o nome enquanto a pessoa não mexeu nele
      if (campo === 'nome' && !r.id && (!r.slug || r.slug === slugDe(r.nome))) novo.slug = slugDe(String(valor));
      return novo;
    });
  }

  protected mudarFiltro(campo: 'cidade' | 'precoMax', valor: string | number | null) {
    this.rascunho.update((r) => r && { ...r, filtro: { ...r.filtro, [campo]: campo === 'precoMax' ? Number(valor) || undefined : valor || undefined } });
  }

  protected alternarTipo(tipo: string, marcado: boolean) {
    this.rascunho.update((r) => {
      if (!r) return r;
      const tipos = new Set(r.filtro.tipos ?? []);
      if (marcado) tipos.add(tipo); else tipos.delete(tipo);
      return { ...r, filtro: { ...r.filtro, tipos: [...tipos] } };
    });
  }

  /** A IA monta o rascunho a partir da descrição em texto livre. */
  protected async desenhar() {
    if (!this.descricao.trim()) return this.avisos.erro('Descreva como o site deve ser.');
    this.desenhando.set(true);
    try {
      const r = await this.cfg.ia<{ site: Partial<SiteEditavel> }>({ acao: 'site', descricao: this.descricao });
      const base = this.rascunho() ?? { ...siteVazio(), ...(await this.cfg.garantir().then((c) => ({ whats: c.whats, creci: c.creci, endereco: c.endereco }))) };
      const s = r.site;
      this.rascunho.set({ ...base, ...s, slug: base.id ? base.slug : slugDe(s.nome || base.nome), filtro: { ...base.filtro, ...(s.filtro ?? {}) } });
      this.avisos.ok('Rascunho pronto. Ajuste o que quiser e publique.');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.desenhando.set(false);
    }
  }

  protected async salvar() {
    const r = this.rascunho();
    if (!r) return;
    this.tentouSalvar.set(true);
    if (!r.nome.trim() || !this.slugOk(r.slug)) { focarPrimeiroErro(); return this.avisos.erro('Confira os campos marcados.'); }
    this.salvando.set(true);
    try {
      const salvo = await this.srv.salvar({ ...r, whats: r.whats.replace(/\D/g, '') });
      this.avisos.ok(`Site no ar: ${this.origem}/s/${salvo.slug}`);
      this.rascunho.set(null);
      this.tentouSalvar.set(false);
      this.tocados.set(new Set());
      await this.carregar();
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  protected async remover(s: Site) {
    if (!(await this.avisos.confirmar(`Excluir o site ${s.nome}?`, { texto: 'O endereço para de funcionar na hora.', confirmar: 'Excluir site' }))) return;
    try {
      await this.srv.remover(s.id);
      await this.carregar();
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected copiar(s: Site) { void navigator.clipboard?.writeText(`${this.origem}/s/${s.slug}`).then(() => this.avisos.ok('Link copiado.')); }
}
