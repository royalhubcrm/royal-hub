import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { CAMPOS_EMPREENDIMENTO, Empreendimento, EMPREENDIMENTO_VAZIO, EmpreendimentoEditavel } from '../../core/models/empreendimento.model';
import { EmpreendimentosService } from '../../core/services/empreendimentos.service';
import { AvisosService } from '../../core/ui/avisos.service';

/**
 * Empreendimentos: os books das construtoras em forma de ficha. O que estiver
 * aqui a assistente pode falar com segurança — e só isso (preço e tabela, nunca).
 */
@Component({
  selector: 'app-empreendimentos',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabecalho-pagina">
      <div>
        <h1>Empreendimentos</h1>
        <p>Os lançamentos que vocês vendem. A assistente cita estes pelo nome, com o que estiver escrito aqui.</p>
      </div>
      @if (podeMexer()) {
        <div class="acoes"><button type="button" class="btn primario" (click)="novo()">Novo empreendimento</button></div>
      }
    </header>

    @if (carregando()) { <p class="mudo" role="status">Carregando…</p> }
    @else if (!lista().length) {
      <section class="cartao vazio">
        <p>Nenhum empreendimento cadastrado ainda.</p>
        <p class="mudo">Cadastre um por aqui com o que está no book da construtora: situação, plantas, lazer e o que tem em volta.</p>
      </section>
    } @else {
      <div class="grade">
        @for (e of lista(); track e.id) {
          <article class="cartao ficha">
            <header>
              <h2>{{ e.nome }}</h2>
              @if (e.construtora) { <span class="etiqueta sem-ponto">{{ e.construtora }}</span> }
            </header>
            <p class="mudo local">{{ e.bairro }}{{ e.endereco ? ' · ' + e.endereco : '' }}</p>
            @if (e.situacao) { <p class="situacao">{{ e.situacao }}</p> }
            @for (c of campos; track c.chave) {
              @if (texto(e, c.chave)) { <p class="linha"><b>{{ c.rotulo }}:</b> {{ texto(e, c.chave) }}</p> }
            }
            @if (podeMexer()) {
              <div class="linha-botoes">
                <button type="button" class="btn pequeno" (click)="editar(e)">Editar</button>
                <button type="button" class="btn pequeno fantasma" (click)="remover(e)">Excluir</button>
              </div>
            }
          </article>
        }
      </div>
    }

    @if (editando(); as f) {
      <section class="cartao editor" aria-labelledby="t-editor">
        <h2 id="t-editor">{{ f.id ? 'Editar' : 'Novo' }} empreendimento</h2>
        <form class="pilha" (ngSubmit)="gravar()">
          <div class="grade-campos">
            <div class="campo"><label for="e-nome">Nome</label><input id="e-nome" name="nome" required [(ngModel)]="f.nome" /></div>
            <div class="campo"><label for="e-const">Construtora</label><input id="e-const" name="construtora" [(ngModel)]="f.construtora" /></div>
            <div class="campo"><label for="e-bairro">Bairro</label><input id="e-bairro" name="bairro" [(ngModel)]="f.bairro" /></div>
            <div class="campo"><label for="e-end">Endereço</label><input id="e-end" name="endereco" [(ngModel)]="f.endereco" /></div>
          </div>
          @for (c of campos; track c.chave) {
            <div class="campo">
              <label [attr.for]="'e-' + c.chave">{{ c.rotulo }}</label>
              <textarea [id]="'e-' + c.chave" [name]="c.chave" [rows]="c.linhas"
                        [ngModel]="valor(f, c.chave)" (ngModelChange)="mudar(c.chave, $event)"
                        [attr.aria-describedby]="'a-' + c.chave"></textarea>
              <span class="ajuda" [id]="'a-' + c.chave">{{ c.ajuda }}</span>
            </div>
          }
          <div class="linha-botoes">
            <button class="btn primario" type="submit" [disabled]="salvando() || !f.nome.trim()">Salvar</button>
            <button class="btn fantasma" type="button" (click)="editando.set(null)">Cancelar</button>
          </div>
        </form>
      </section>
    }
  `,
  styles: `
    .grade { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); align-items: start; }
    .ficha > header { display: flex; align-items: center; gap: 8px; justify-content: space-between; margin-bottom: 4px;
      h2 { font-size: 16px; margin: 0; } }
    .local { margin: 0 0 8px; font-size: 13px; }
    .situacao { margin: 0 0 8px; font-weight: 500; }
    .linha { margin: 0 0 6px; font-size: 13.5px; line-height: 1.5; }
    .linha-botoes { display: flex; gap: 8px; margin-top: 10px; }
    .editor { margin-top: 16px; }
    .vazio p { margin: 0 0 6px; }
  `,
})
export default class EmpreendimentosPage {
  private readonly servico = inject(EmpreendimentosService);
  private readonly avisos = inject(AvisosService);
  protected readonly auth = inject(AuthService);

  protected readonly campos = CAMPOS_EMPREENDIMENTO;
  protected readonly lista = signal<Empreendimento[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly editando = signal<EmpreendimentoEditavel | null>(null);
  protected readonly podeMexer = computed(() => this.auth.pode('admin', 'gerente'));

  constructor() { void this.carregar(); }

  private async carregar() {
    this.carregando.set(true);
    try {
      this.lista.set(await this.servico.listar());
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.carregando.set(false);
    }
  }

  protected texto(e: Empreendimento, chave: keyof Empreendimento) { return String(e[chave] ?? '').trim(); }
  protected valor(f: EmpreendimentoEditavel, chave: keyof Empreendimento) { return String((f as Record<string, unknown>)[chave] ?? ''); }
  protected mudar(chave: keyof Empreendimento, v: string) {
    this.editando.update((f) => (f ? { ...f, [chave]: v } : f));
  }

  protected novo() { this.editando.set(EMPREENDIMENTO_VAZIO()); }
  protected editar(e: Empreendimento) { this.editando.set({ ...e }); }

  protected async gravar() {
    const f = this.editando();
    if (!f?.nome.trim()) return;
    this.salvando.set(true);
    try {
      await this.servico.salvar(f);
      this.editando.set(null);
      await this.carregar();
      this.avisos.ok('Salvo. A assistente já pode falar dele.');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  protected async remover(e: Empreendimento) {
    if (!(await this.avisos.confirmar(`Excluir ${e.nome}?`, { texto: 'A assistente para de falar deste empreendimento.', confirmar: 'Excluir' }))) return;
    try {
      await this.servico.remover(e.id);
      await this.carregar();
    } catch (err) {
      this.avisos.erro(err);
    }
  }
}
