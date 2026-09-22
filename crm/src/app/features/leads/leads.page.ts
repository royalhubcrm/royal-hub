import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ColunaOrdenavel, FiltroLeads, Lead, TEMPERATURAS, rotuloTemperatura } from '../../core/models/lead.model';
import { EquipeService } from '../../core/services/equipe.service';
import { LeadsService } from '../../core/services/leads.service';
import { PipelineService } from '../../core/services/pipeline.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { QuandoPipe, TelefonePipe } from '../../shared/pipes/formatos.pipe';
import { ImportarLeads } from './components/importar-leads';
import { LeadGaveta } from './components/lead-gaveta';

@Component({
  selector: 'app-leads',
  imports: [FormsModule, LeadGaveta, ImportarLeads, BrlPipe, QuandoPipe, TelefonePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leads.page.html',
  styleUrl: './leads.page.scss',
})
export default class LeadsPage {
  // parâmetros da URL: /leads?novo=1, ?abrir=<id>, ?temperatura=quente
  readonly novo = input<string>();
  readonly abrir = input<string>();
  readonly temperatura = input<string>();

  private readonly leads = inject(LeadsService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  protected readonly pipeline = inject(PipelineService);
  protected readonly equipe = inject(EquipeService);
  protected readonly auth = inject(AuthService);

  protected readonly temperaturas = TEMPERATURAS;
  protected readonly rotuloTemperatura = rotuloTemperatura;
  protected readonly tamanhos = [25, 50, 100];

  protected readonly filtro = signal<FiltroLeads>({ pagina: 1, porPagina: 25, ordenarPor: 'data_criacao', crescente: false });
  protected readonly itens = signal<Lead[]>([]);
  protected readonly total = signal(0);
  protected readonly carregando = signal(true);
  protected readonly erro = signal('');

  protected readonly aberto = signal<Lead | null>(null);
  protected readonly gavetaAberta = signal(false);
  protected readonly importando = signal(false);

  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.total() / this.filtro().porPagina)));
  protected readonly faixa = computed(() => {
    const f = this.filtro();
    const ini = this.total() ? (f.pagina - 1) * f.porPagina + 1 : 0;
    return `${ini}–${Math.min(f.pagina * f.porPagina, this.total())} de ${this.total()}`;
  });
  protected readonly temFiltro = computed(() => {
    const f = this.filtro();
    return !!(f.busca || f.status || f.temperatura || f.responsavel);
  });

  private espera?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.pipeline.etapas().catch(() => null);
    void this.equipe.garantirPessoas().catch(() => null);

    // os links do painel chegam pela URL
    effect(() => {
      const temp = this.temperatura();
      const novo = this.novo();
      const id = this.abrir();
      untracked(() => {
        if (temp) this.filtro.update((f) => ({ ...f, temperatura: temp, pagina: 1 }));
        if (novo) this.novoLead();
        if (id) void this.abrirPorId(id);
      });
    });

    // toda mudança de filtro/página busca de novo
    effect(() => {
      const f = this.filtro();
      untracked(() => void this.buscar(f));
    });

    const parar = this.leads.aoMudar(() => void this.buscar(this.filtro(), true));
    inject(DestroyRef).onDestroy(parar);
  }

  private async buscar(f: FiltroLeads, silencioso = false) {
    if (!silencioso) this.carregando.set(true);
    try {
      const r = await this.leads.listar(f);
      if (f !== this.filtro()) return; // chegou resposta velha
      this.itens.set(r.itens);
      this.total.set(r.total);
      this.erro.set('');
    } catch (e) {
      this.erro.set((e as Error).message);
      this.avisos.erro(e);
    } finally {
      this.carregando.set(false);
    }
  }

  protected mudar(campos: Partial<FiltroLeads>) {
    this.filtro.update((f) => ({ ...f, pagina: 1, ...campos }));
  }

  /** Busca espera a pessoa parar de digitar. */
  protected digitar(texto: string) {
    clearTimeout(this.espera);
    this.espera = setTimeout(() => this.mudar({ busca: texto }), 300);
  }

  protected limpar() {
    this.filtro.set({ pagina: 1, porPagina: this.filtro().porPagina, ordenarPor: 'data_criacao', crescente: false });
  }

  protected ordenar(coluna: ColunaOrdenavel) {
    const f = this.filtro();
    this.filtro.set({ ...f, pagina: 1, ordenarPor: coluna, crescente: f.ordenarPor === coluna ? !f.crescente : coluna === 'nome' });
  }

  protected ariaSort(coluna: ColunaOrdenavel) {
    const f = this.filtro();
    return f.ordenarPor !== coluna ? 'none' : f.crescente ? 'ascending' : 'descending';
  }

  protected irPara(pagina: number) {
    this.filtro.update((f) => ({ ...f, pagina: Math.min(Math.max(1, pagina), this.paginas()) }));
  }

  protected novoLead() {
    this.aberto.set(null);
    this.gavetaAberta.set(true);
  }

  protected abrirLead(l: Lead) {
    this.aberto.set(l);
    this.gavetaAberta.set(true);
  }

  private async abrirPorId(id: string) {
    const l = await this.leads.buscar(id).catch(() => null);
    if (l) this.abrirLead(l);
    else this.avisos.erro('Esse lead não existe mais ou é de outra equipe.');
  }

  protected fecharGaveta() {
    this.gavetaAberta.set(false);
    // tira ?novo / ?abrir da URL para o "voltar" do navegador não reabrir
    if (this.novo() || this.abrir()) void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected aoSalvar(l: Lead) {
    this.aberto.set(l);
    void this.buscar(this.filtro(), true);
    this.fecharGaveta();
  }

  protected aoRemover() {
    this.fecharGaveta();
    void this.buscar(this.filtro(), true);
  }

  protected nomeEtapa(slug: string) { return this.pipeline.nomeDaEtapa(slug); }
  protected corEtapa(slug: string) { return this.pipeline.etapasCache().find((e) => e.slug === slug)?.cor ?? '#64748B'; }
}
