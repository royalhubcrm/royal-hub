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
import { QuandoPipe } from '../../shared/pipes/formatos.pipe';
import { MascaraDirective } from '../../shared/ui/mascara.directive';

/** Ajustes da imobiliária numa página só: dados, WhatsApp oficial, captação e portais. */
@Component({
  selector: 'app-ajustes',
  imports: [FormsModule, RouterLink, MascaraDirective, QuandoPipe],
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

  /** A ponte avisa a cada 45 s que está viva; 3 min sem sinal = caiu. */
  protected ponteViva() { const v = this.f.ponte_visto_em; return !!v && Date.now() - new Date(v).getTime() < 3 * 60000; }
  protected waLigado() { return this.f.wa_canal === 'ponte' ? this.ponteViva() : !!this.f.wa_configurado; }
  protected estadoWa() { return this.f.wa_canal === 'ponte' ? (this.ponteViva() ? 'Ligado' : 'Esperando a ponte') : this.f.wa_configurado ? 'Ligado' : 'Desligado'; }

  protected async mudarCanal(canal: Config['wa_canal']) {
    this.f.wa_canal = canal;
    try {
      await this.cfgSrv.salvar({ wa_canal: canal });
      this.avisos.ok(canal === 'ponte' ? 'WhatsApp por QR code. Ligue a ponte no computador.' : 'WhatsApp pela API oficial da Meta.');
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  constructor() { void this.carregar(); }

  private async carregar() {
    try {
      const c = await this.cfgSrv.carregar();
      this.f = { ...c };
      this.nomeEmpresa = this.auth.empresa()?.nome ?? '';
      this.wa = { numero: c.wa_numero_id, token: '', verificacao: c.wa_verificacao };
      this.carregado.set(true);
      void this.imoveisSrv.listar().then((l) => this.imoveis.set(l)).catch((e) => this.avisos.erro(e));
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected async salvarImobiliaria() {
    this.salvando.set(true);
    try {
      const campos: (keyof Config)[] = ['corretor', 'creci', 'whats', 'endereco', 'cidade'];
      const parcial = Object.fromEntries(campos.map((k) => [k, this.f[k]])) as Partial<Config>;
      if (parcial.whats) parcial.whats = String(parcial.whats).replace(/\D/g, '');
      await this.cfgSrv.salvar(parcial);
      if (this.nomeEmpresa.trim() && this.nomeEmpresa !== this.auth.empresa()?.nome) {
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

  protected copiar(t: string) { this.avisos.copiar(t); }
}
