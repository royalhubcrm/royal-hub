import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Config } from '../../core/models/config.model';
import { Imovel, pendenciasPortais } from '../../core/models/imovel.model';
import { ConfigService } from '../../core/services/config.service';
import { ImoveisService } from '../../core/services/imoveis.service';
import { SUPABASE } from '../../core/supabase/supabase.client';
import { AvisosService } from '../../core/ui/avisos.service';

type Aba = 'imobiliaria' | 'assistente' | 'whatsapp' | 'captacao' | 'portais';

@Component({
  selector: 'app-ajustes',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ajustes.page.html',
  styleUrl: './ajustes.page.scss',
})
export default class AjustesPage {
  private readonly cfgSrv = inject(ConfigService);
  private readonly imoveisSrv = inject(ImoveisService);
  private readonly avisos = inject(AvisosService);
  private readonly db = inject(SUPABASE);
  protected readonly auth = inject(AuthService);

  protected readonly abas: { id: Aba; rotulo: string }[] = [
    { id: 'imobiliaria', rotulo: 'Imobiliária' },
    { id: 'assistente', rotulo: 'Assistente de IA' },
    { id: 'whatsapp', rotulo: 'WhatsApp' },
    { id: 'captacao', rotulo: 'Captação de leads' },
    { id: 'portais', rotulo: 'Portais' },
  ];
  protected readonly aba = signal<Aba>('imobiliaria');

  protected f: Partial<Config> = {};
  protected nomeEmpresa = '';
  protected readonly salvando = signal(false);
  protected readonly carregado = signal(false);

  protected wa = { numero: '', token: '', verificacao: '' };
  protected readonly token = signal('');
  protected readonly imoveis = signal<Imovel[]>([]);

  protected readonly slug = computed(() => this.auth.empresa()?.slug ?? '');
  protected readonly linkCaptar = computed(() => `${location.origin}/captar/${this.slug()}`);
  protected readonly linkWebhook = computed(() => `${this.cfgSrv.enderecoFuncao('leads-webhook')}?empresa=${this.slug()}&token=${this.token() || 'SEU_TOKEN'}`);
  protected readonly linkWhatsapp = computed(() => `${this.cfgSrv.enderecoFuncao('whatsapp')}?empresa=${this.slug()}`);
  protected readonly linkFeed = computed(() => `${this.cfgSrv.enderecoFuncao('feed-portais')}?empresa=${this.slug()}`);

  protected readonly disponiveis = computed(() => this.imoveis().filter((m) => m.status === 'disponivel'));
  protected readonly comPendencia = computed(() =>
    this.disponiveis().map((m) => ({ m, falta: pendenciasPortais(m) })).filter((x) => x.falta.length));
  protected readonly resumoPendencias = computed(() => {
    const cont: Record<string, number> = {};
    for (const { falta } of this.comPendencia())
      for (const f of falta) { const k = f.replace(/^\d+ /, ''); cont[k] = (cont[k] ?? 0) + 1; }
    return Object.entries(cont).map(([k, n]) => `${n} sem ${k}`).join(', ');
  });

  constructor() { void this.carregar(); }

  private async carregar() {
    try {
      const c = await this.cfgSrv.carregar();
      this.f = { ...c };
      this.nomeEmpresa = this.auth.empresa()?.nome ?? '';
      this.wa = { numero: c.wa_numero_id, token: '', verificacao: c.wa_verificacao };
      this.carregado.set(true);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected escolher(a: Aba) {
    this.aba.set(a);
    if (a === 'portais' && !this.imoveis().length) void this.imoveisSrv.listar().then((l) => this.imoveis.set(l)).catch((e) => this.avisos.erro(e));
  }

  /** Setas do teclado entre as abas (padrão ARIA de tablist). */
  protected teclaAba(ev: KeyboardEvent, i: number) {
    const passo = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!passo) return;
    const prox = this.abas[(i + passo + this.abas.length) % this.abas.length];
    this.escolher(prox.id);
    (document.getElementById('aba-' + prox.id) as HTMLElement | null)?.focus();
  }

  protected async salvar(campos: (keyof Config)[]) {
    this.salvando.set(true);
    try {
      const parcial = Object.fromEntries(campos.map((k) => [k, this.f[k]])) as Partial<Config>;
      if (parcial.whats) parcial.whats = String(parcial.whats).replace(/\D/g, '');
      await this.cfgSrv.salvar(parcial);
      if (this.aba() === 'imobiliaria' && this.nomeEmpresa.trim() && this.nomeEmpresa !== this.auth.empresa()?.nome) {
        const { error } = await this.db.from('empresas').update({ nome: this.nomeEmpresa.trim() }).eq('id', this.auth.empresa()!.id);
        if (error) throw error;
        await this.auth.carregarPerfil();
      }
      this.avisos.ok('Ajustes salvos.');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  protected async salvarWhatsapp() {
    this.salvando.set(true);
    try {
      const c = await this.cfgSrv.salvarWhatsapp(this.wa.numero, this.wa.token, this.wa.verificacao);
      this.wa.token = '';
      this.f = { ...c };
      this.avisos.ok(c.wa_configurado ? 'WhatsApp oficial ligado.' : 'Salvo. Falta o token ou o número para ligar.');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  protected async verToken(trocar = false) {
    if (trocar && !(await this.avisos.confirmar('Trocar o token do webhook?', {
      texto: 'O Make/Zapier que usa o token antigo para de funcionar até você colar o link novo lá.', confirmar: 'Trocar token',
    }))) return;
    try { this.token.set(await this.cfgSrv.tokenWebhook(trocar)); if (trocar) this.avisos.ok('Token trocado.'); }
    catch (e) { this.avisos.erro(e); }
  }

  protected copiar(t: string) { void navigator.clipboard?.writeText(t).then(() => this.avisos.ok('Copiado.')); }
}
