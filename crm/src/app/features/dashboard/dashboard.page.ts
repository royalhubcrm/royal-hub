import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { rotuloTemperatura } from '../../core/models/lead.model';
import { ResumoEtapa } from '../../core/models/etapa.model';
import { LeadsService } from '../../core/services/leads.service';
import { Painel, PipelineService } from '../../core/services/pipeline.service';
import { erroAmigavel } from '../../core/supabase/supabase.client';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { QuandoPipe } from '../../shared/pipes/formatos.pipe';
import { GraficoBarras } from './components/grafico-barras';
import { Metrica } from './components/metrica';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Metrica, GraficoBarras, BrlPipe, QuandoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export default class DashboardPage {
  private readonly pipeline = inject(PipelineService);
  protected readonly auth = inject(AuthService);

  protected readonly p = signal<Painel | null>(null);
  protected readonly funil = signal<ResumoEtapa[]>([]);
  protected readonly erro = signal('');
  protected readonly rotuloTemperatura = rotuloTemperatura;

  protected readonly saudacao = computed(() => {
    const h = new Date().getHours();
    return (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + (this.auth.primeiroNome() ? ', ' + this.auth.primeiroNome() : '');
  });
  protected readonly conversao = computed(() => {
    const p = this.p();
    return p && p.total ? Math.round((p.fechados / p.total) * 100) : 0;
  });
  protected readonly maxFunil = computed(() => Math.max(1, ...this.funil().map((f) => f.quantidade)));
  protected readonly somaSerie = computed(() => (this.p()?.serie ?? []).reduce((t, x) => t + x.n, 0));

  constructor() {
    void this.carregar();
    // lead novo entrando (formulário, WhatsApp) atualiza os números sozinho
    const parar = inject(LeadsService).aoMudar(() => void this.carregar());
    inject(DestroyRef).onDestroy(parar);
  }

  protected async carregar() {
    try {
      const [p, funil] = await Promise.all([this.pipeline.painel(), this.pipeline.resumo(), this.pipeline.etapas()]);
      this.p.set(p);
      this.funil.set(funil);
      this.erro.set('');
    } catch (e) {
      this.erro.set(erroAmigavel(e));
    }
  }

  protected nomeEtapa(slug: string) { return this.pipeline.nomeDaEtapa(slug); }
}
