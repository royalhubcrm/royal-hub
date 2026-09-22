import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { AuthService } from '../../core/auth/auth.service';
import { EtapaPipeline } from '../../core/models/etapa.model';
import { Lead, TEMPERATURAS, rotuloTemperatura } from '../../core/models/lead.model';
import { EquipeService } from '../../core/services/equipe.service';
import { LeadsService } from '../../core/services/leads.service';
import { PipelineService } from '../../core/services/pipeline.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { semAcento } from '../../shared/util/planilha';
import { LeadGaveta } from '../leads/components/lead-gaveta';

interface Coluna { etapa: EtapaPipeline; cards: Lead[]; total: number; ponderado: number }

const MAX_CARDS = 60;

@Component({
  selector: 'app-pipeline',
  imports: [FormsModule, CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder, BrlPipe, LeadGaveta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pipeline.page.html',
  styleUrl: './pipeline.page.scss',
})
export default class PipelinePage {
  private readonly leadsSrv = inject(LeadsService);
  private readonly pipeline = inject(PipelineService);
  private readonly avisos = inject(AvisosService);
  private readonly anunciar = inject(LiveAnnouncer);
  protected readonly equipe = inject(EquipeService);
  protected readonly auth = inject(AuthService);

  protected readonly temperaturas = TEMPERATURAS;
  protected readonly rotuloTemperatura = rotuloTemperatura;
  protected readonly maxCards = MAX_CARDS;

  protected readonly etapas = signal<EtapaPipeline[]>([]);
  protected readonly leads = signal<Lead[]>([]);
  protected readonly carregando = signal(true);
  protected readonly busca = signal('');
  protected readonly soMeus = signal(false);
  protected readonly temperatura = signal('');

  protected readonly aberto = signal<Lead | null>(null);
  protected readonly gavetaAberta = signal(false);
  protected readonly etapaNova = signal('novo');

  protected readonly visiveis = computed(() => {
    const termo = semAcento(this.busca());
    const eu = this.auth.perfil()?.id;
    return this.leads().filter((l) =>
      (!termo || semAcento(`${l.nome} ${l.interesse} ${l.telefone ?? ''} ${l.empresa ?? ''}`).includes(termo)) &&
      (!this.soMeus() || l.responsavel_id === eu) &&
      (!this.temperatura() || l.temperatura === this.temperatura()));
  });

  protected readonly colunas = computed<Coluna[]>(() => {
    const porEtapa = new Map<string, Lead[]>();
    for (const l of this.visiveis()) (porEtapa.get(l.status) ?? porEtapa.set(l.status, []).get(l.status)!).push(l);
    return this.etapas().map((etapa) => {
      const cards = (porEtapa.get(etapa.slug) ?? []).sort((a, b) => a.posicao - b.posicao);
      const total = cards.reduce((t, l) => t + Number(l.valor_estimado || 0), 0);
      return { etapa, cards, total, ponderado: (total * etapa.probabilidade) / 100 };
    });
  });

  protected readonly totalAberto = computed(() =>
    this.colunas().filter((c) => c.etapa.tipo === 'aberta').reduce((t, c) => t + c.total, 0));
  protected readonly totalPonderado = computed(() =>
    this.colunas().filter((c) => c.etapa.tipo === 'aberta').reduce((t, c) => t + c.ponderado, 0));

  constructor() {
    void this.carregar();
    void this.equipe.garantirPessoas().catch(() => null);
    const parar = this.leadsSrv.aoMudar(() => void this.carregar(true));
    inject(DestroyRef).onDestroy(parar);
  }

  protected async carregar(silencioso = false) {
    if (!silencioso) this.carregando.set(true);
    try {
      const [etapas, leads] = await Promise.all([this.pipeline.etapas(), this.leadsSrv.doKanban()]);
      this.etapas.set(etapas);
      this.leads.set(leads);
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.carregando.set(false);
    }
  }

  // ---------------------------------------------------------------- mover
  /** Soltou o card: calcula a posição entre os vizinhos e grava. */
  protected soltar(ev: CdkDragDrop<Coluna>) {
    const lead = ev.item.data as Lead;
    const destino = ev.container.data;
    const cards = destino.cards.filter((c) => c.id !== lead.id);
    const antes = cards[ev.currentIndex - 1];
    const depois = cards[ev.currentIndex];
    const posicao = antes && depois ? (antes.posicao + depois.posicao) / 2
      : antes ? antes.posicao + 1 : depois ? depois.posicao - 1 : Date.now() / 1000;
    if (lead.status === destino.etapa.slug && ev.previousIndex === ev.currentIndex) return;
    void this.mover(lead, destino.etapa, posicao);
  }

  /** Teclado e leitor de tela: botões "mover para a etapa anterior/próxima". */
  protected moverPara(lead: Lead, etapa: EtapaPipeline) {
    const col = this.colunas().find((c) => c.etapa.slug === etapa.slug);
    const ultimo = col?.cards.at(-1)?.posicao ?? Date.now() / 1000;
    void this.mover(lead, etapa, ultimo + 1);
  }

  private async mover(lead: Lead, etapa: EtapaPipeline, posicao: number) {
    const antes = this.leads();
    // muda na tela na hora; se o banco recusar, volta como estava
    this.leads.set(antes.map((l) => (l.id === lead.id ? { ...l, status: etapa.slug, posicao } : l)));
    // o foco do teclado acompanha o card até a coluna nova
    setTimeout(() => document.querySelector<HTMLElement>(`[data-lead="${lead.id}"] .card-abrir`)?.focus(), 60);
    try {
      await this.leadsSrv.mover(lead.id, etapa.slug, posicao);
      if (lead.status !== etapa.slug) this.anunciar.announce(`${lead.nome} foi para ${etapa.nome}.`);
    } catch (e) {
      this.leads.set(antes);
      this.avisos.erro(e);
    }
  }

  protected vizinha(etapa: EtapaPipeline, passo: -1 | 1): EtapaPipeline | undefined {
    const i = this.etapas().findIndex((e) => e.slug === etapa.slug);
    return this.etapas()[i + passo];
  }

  // ---------------------------------------------------------------- gaveta
  protected abrir(l: Lead) { this.aberto.set(l); this.gavetaAberta.set(true); }

  protected novo(etapa: string) {
    this.etapaNova.set(etapa);
    this.aberto.set(null);
    this.gavetaAberta.set(true);
  }

  protected aoSalvar() { this.gavetaAberta.set(false); void this.carregar(true); }
  protected aoRemover() { this.gavetaAberta.set(false); void this.carregar(true); }

  protected iniciais(id: string | null) {
    const nome = this.equipe.nomeDe(id);
    return nome ? nome.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() : '';
  }
}
