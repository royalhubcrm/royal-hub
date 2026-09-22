import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Imovel, STATUS_IMOVEL, pendenciasPortais, rotuloStatusImovel } from '../../core/models/imovel.model';
import { ImoveisService } from '../../core/services/imoveis.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { semAcento } from '../../shared/util/planilha';
import { ImovelGaveta } from './components/imovel-gaveta';
import { ImportarImoveis } from './components/importar-imoveis';

@Component({
  selector: 'app-imoveis',
  imports: [FormsModule, BrlPipe, ImovelGaveta, ImportarImoveis],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './imoveis.page.html',
  styleUrl: './imoveis.page.scss',
})
export default class ImoveisPage {
  private readonly srv = inject(ImoveisService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);

  protected readonly statusLista = STATUS_IMOVEL;
  protected readonly rotuloStatus = rotuloStatusImovel;
  protected readonly todos = signal<Imovel[]>([]);
  protected readonly carregando = signal(true);

  protected readonly busca = signal('');
  protected readonly bairro = signal('');
  protected readonly tipo = signal('');
  protected readonly status = signal('disponivel');
  protected readonly selecionados = signal<Set<string>>(new Set());

  protected readonly aberto = signal<Imovel | null>(null);
  protected readonly gavetaAberta = signal(false);
  protected readonly importando = signal(false);

  protected readonly bairros = computed(() => [...new Set(this.todos().map((m) => m.bairro).filter(Boolean))].sort());
  protected readonly tipos = computed(() => [...new Set(this.todos().map((m) => m.tipo).filter(Boolean))].sort());
  protected readonly lista = computed(() => {
    const t = semAcento(this.busca());
    return this.todos().filter((m) =>
      (!t || semAcento(`${m.codigo} ${m.tipo} ${m.bairro} ${m.rua} ${m.descricao}`).includes(t)) &&
      (!this.bairro() || m.bairro === this.bairro()) &&
      (!this.tipo() || m.tipo === this.tipo()) &&
      (!this.status() || m.status === this.status()));
  });
  protected readonly prontosPortal = computed(() =>
    this.todos().filter((m) => m.status === 'disponivel' && !pendenciasPortais(m).length).length);

  constructor() { void this.carregar(); }

  protected async carregar() {
    try { this.todos.set(await this.srv.listar()); }
    catch (e) { this.avisos.erro(e); }
    finally { this.carregando.set(false); }
  }

  protected pendencias(m: Imovel) { return pendenciasPortais(m); }

  protected marcar(id: string, sim: boolean) {
    const s = new Set(this.selecionados());
    if (sim) s.add(id); else s.delete(id);
    this.selecionados.set(s);
  }

  /** Folha para imprimir ou salvar em PDF, com os marcados (ou os 3 primeiros da busca). */
  protected folha() {
    const ids = this.selecionados().size ? [...this.selecionados()] : this.lista().slice(0, 3).map((m) => m.id);
    if (!ids.length) return this.avisos.erro('Nenhum imóvel na busca para montar a folha.');
    void this.router.navigate(['/imoveis/folha'], { queryParams: { ids: ids.slice(0, 6).join(',') } });
  }

  protected linkPublico(m: Imovel) { return `${location.origin}/imovel/${m.id}`; }

  protected copiar(m: Imovel) {
    void navigator.clipboard?.writeText(this.linkPublico(m)).then(() => this.avisos.ok('Link copiado.'));
  }

  protected novo() { this.aberto.set(null); this.gavetaAberta.set(true); }
  protected editar(m: Imovel) { this.aberto.set(m); this.gavetaAberta.set(true); }
  protected aoSalvar() { this.gavetaAberta.set(false); void this.carregar(); }

  protected limpar() { this.busca.set(''); this.bairro.set(''); this.tipo.set(''); this.status.set(''); }
}
