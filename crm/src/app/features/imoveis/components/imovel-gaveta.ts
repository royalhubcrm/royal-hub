import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Imovel, ImovelEditavel, STATUS_IMOVEL, TIPOS_IMOVEL, imovelVazio, pendenciasPortais } from '../../../core/models/imovel.model';
import { ConfigService } from '../../../core/services/config.service';
import { ImoveisService } from '../../../core/services/imoveis.service';
import { AvisosService } from '../../../core/ui/avisos.service';
import { Gaveta } from '../../../shared/ui/gaveta';

@Component({
  selector: 'app-imovel-gaveta',
  imports: [FormsModule, Gaveta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './imovel-gaveta.html',
  styleUrl: './imovel-gaveta.scss',
})
export class ImovelGaveta {
  readonly imovel = input<Imovel | null>(null);
  readonly aberta = input(false);
  readonly fechar = output<void>();
  readonly salvo = output<Imovel>();
  readonly removido = output<void>();

  private readonly srv = inject(ImoveisService);
  private readonly avisos = inject(AvisosService);
  private readonly config = inject(ConfigService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly tipos = TIPOS_IMOVEL;
  protected readonly statusLista = STATUS_IMOVEL;
  protected f: ImovelEditavel = imovelVazio();
  protected readonly fotos = signal<string[]>([]);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly enviando = signal(0);
  protected novaUrl = '';

  protected readonly titulo = computed(() => (this.imovel() ? `Imóvel ${this.imovel()!.codigo}` : 'Novo imóvel'));

  constructor() {
    effect(() => {
      const m = this.imovel();
      if (!this.aberta()) return;
      const cidade = this.config.config()?.cidade || 'Uberlândia';
      this.f = m ? { ...m } : imovelVazio(cidade);
      this.fotos.set(m ? [...m.fotos] : []);
      this.tentou.set(false);
      this.novaUrl = '';
      if (!this.config.config()) void this.config.carregar().catch(() => null);
    });
  }

  protected get erroCodigo() { return this.f.codigo.trim() ? '' : 'Digite o código.'; }
  protected get pendencias() { return pendenciasPortais({ ...this.f, fotos: this.fotos() } as Imovel); }

  protected async preencherCep() {
    const r = await this.srv.buscarCep(this.f.cep);
    if (!r) return;
    this.f.rua ||= r.rua;
    this.f.bairro ||= r.bairro;
    this.f.cidade = r.cidade || this.f.cidade;
    this.cdr.markForCheck(); // o formulário mudou depois de uma espera: redesenha
    this.avisos.ok('Endereço preenchido pelo CEP.');
  }

  // ---------------------------------------------------------------- fotos
  protected async enviarFotos(ev: Event) {
    const campo = ev.target as HTMLInputElement;
    const arquivos = [...(campo.files ?? [])].filter((a) => a.type.startsWith('image/'));
    campo.value = '';
    for (const a of arquivos) {
      if (a.size > 8 * 1024 * 1024) { this.avisos.erro(`${a.name} passa de 8 MB.`); continue; }
      this.enviando.update((n) => n + 1);
      try {
        const url = await this.srv.enviarFoto(a);
        this.fotos.update((l) => [...l, url]);
      } catch (e) {
        this.avisos.erro(e);
      } finally {
        this.enviando.update((n) => n - 1);
      }
    }
  }

  protected adicionarUrl() {
    const u = this.novaUrl.trim();
    if (!/^https?:\/\//.test(u)) return this.avisos.erro('Cole um endereço que comece com http.');
    this.fotos.update((l) => [...l, u]);
    this.novaUrl = '';
  }

  protected capa(i: number) {
    this.fotos.update((l) => [l[i], ...l.filter((_, j) => j !== i)]);
  }

  protected tirar(i: number) {
    this.fotos.update((l) => l.filter((_, j) => j !== i));
  }

  // ---------------------------------------------------------------- gravar
  protected async salvar() {
    this.tentou.set(true);
    if (this.erroCodigo) return this.avisos.erro('Confira os campos marcados.');
    this.salvando.set(true);
    try {
      const { id: _id, criado_em: _c, atualizado_em: _a, ...campos } = { ...this.f, fotos: this.fotos() } as Imovel;
      const numeros = ['preco', 'condominio', 'iptu', 'quartos', 'suites', 'banheiros', 'vagas', 'area'] as const;
      for (const n of numeros) (campos as Record<string, unknown>)[n] = Number(campos[n]) || 0;
      const salvo = await this.srv.salvar(this.imovel()?.id ?? null, campos);
      this.avisos.ok('Imóvel salvo.');
      this.salvo.emit(salvo);
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  protected async excluir() {
    const m = this.imovel();
    if (!m) return;
    const ok = await this.avisos.confirmar(`Excluir o imóvel ${m.codigo}?`, {
      texto: 'Se ele só foi vendido, prefira mudar a situação para "Vendido": assim o histórico fica.', confirmar: 'Excluir',
    });
    if (!ok) return;
    try {
      await this.srv.remover(m.id);
      this.avisos.ok('Imóvel excluído.');
      this.removido.emit();
    } catch (e) {
      this.avisos.erro(e);
    }
  }
}
