import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DEMO } from '../../core/supabase/demo';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/services/config.service';
import { AvisosService } from '../../core/ui/avisos.service';

type Provedor = 'groq' | 'gemini' | 'anthropic';
const NOMES: Record<Provedor, string> = { groq: 'Groq', gemini: 'Gemini', anthropic: 'Claude' };

interface Fala { papel: 'cliente' | 'bot'; texto: string; acoes?: string[]; provedor?: Provedor; ms?: number }

/**
 * Simulador: você escreve como se fosse o cliente e vê o que a assistente
 * responderia — sem mandar nada para ninguém e sem gravar agenda.
 */
@Component({
  selector: 'app-testar-assistente',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="teste">
      <p class="mudo">Escreva como se fosse o cliente — "tem casa de 3 quartos até 600 mil?" — e veja a resposta.
        É só um teste: nada é enviado e nada é gravado. O jeito de falar se ajusta em Ajustes → Assistente.</p>
      <div class="linha modelo">
        <label for="t-modelo">Responder com</label>
        <select id="t-modelo" [ngModel]="provedor()" name="modelo" (ngModelChange)="provedor.set($event)" aria-describedby="t-modelo-ajuda">
          <option value="">Automático (o configurado em "Assistente: prompt e modelo")</option>
          @for (p of disponiveis(); track p) { <option [value]="p">{{ nome(p) }}</option> }
        </select>
        <span class="ajuda" id="t-modelo-ajuda">
          @if (disponiveis().length) { Ligadas: {{ ligadas() }}. Mande a mesma pergunta em cada uma para comparar. }
          @else { Nenhuma chave de IA configurada nas funções (GROQ_API_KEY ou GEMINI_API_KEY). }
        </span>
      </div>
      <ol class="falas" #caixa aria-live="polite" aria-label="Conversa de teste">
        @for (f of falas(); track $index) {
          <li class="fala" [class.bot]="f.papel === 'bot'">
            <span class="autor">{{ f.papel === 'bot' ? 'Assistente' : 'Cliente (você)' }}@if (f.provedor) { <span class="quem">· {{ nome(f.provedor) }}@if (f.ms) { · {{ (f.ms / 1000).toFixed(1) }}s }</span> }</span>
            <p>{{ f.texto }}</p>
            @if (f.acoes?.length) {
              <ul class="acoes">@for (a of f.acoes; track a) { <li>{{ a }}</li> }</ul>
            }
          </li>
        } @empty {
          <li class="mudo pequeno">A conversa aparece aqui.</li>
        }
        @if (pensando()) { <li class="fala bot"><span class="autor">Assistente</span><p>Consultando a carteira…</p></li> }
      </ol>
      <form class="enviar" (ngSubmit)="enviar()">
        <label class="sr-only" for="t-msg">Mensagem do cliente</label>
        <input id="t-msg" name="msg" [(ngModel)]="texto" placeholder="Mensagem do cliente" autocomplete="off" />
        <button class="btn primario" type="submit" [disabled]="pensando()">Responder</button>
        <button class="btn" type="button" (click)="falas.set([])" [disabled]="!falas().length">Recomeçar</button>
      </form>
    </div>
  `,
  styles: `
    .teste { display: flex; flex-direction: column; gap: 12px; max-width: 760px; }
    .falas { list-style: none; margin: 0; padding: 14px; min-height: 320px; max-height: 58dvh; overflow-y: auto;
      background: var(--superficie); border: 1px solid var(--slate-200); border-radius: var(--raio); display: flex; flex-direction: column; gap: 8px; }
    .fala { max-width: 80%; align-self: flex-start; padding: 8px 11px; border-radius: 8px; background: var(--slate-100);
      &.bot { align-self: flex-end; background: var(--azul-100); }
      p { white-space: pre-wrap; } .autor { font: 500 10.5px/1.3 var(--mono); text-transform: uppercase; color: var(--slate-500); } }
    .acoes { margin: 6px 0 0; padding-left: 16px; font-size: 12px; color: var(--navy-700); }
    .enviar { display: flex; gap: 8px; }
    .modelo { align-items: flex-start; gap: 4px 10px; label { font-size: 12px; font-weight: 500; color: var(--slate-700); min-height: var(--alvo); display: inline-flex; align-items: center; }
      select { width: auto; min-width: 220px; } .ajuda { flex-basis: 100%; font-size: 12px; color: var(--slate-500); } }
    .quem { font-weight: 400; color: var(--ouro-texto); }
  `,
})
export class TestarAssistente {
  private readonly cfg = inject(ConfigService);
  private readonly avisos = inject(AvisosService);
  private readonly caixa = viewChild<ElementRef<HTMLElement>>('caixa');

  protected readonly falas = signal<Fala[]>([]);
  protected readonly pensando = signal(false);
  protected readonly provedor = signal<Provedor | ''>('');
  protected readonly disponiveis = signal<Provedor[]>([]);
  protected texto = '';

  constructor() {
    // na demonstração não há função no servidor: mostra as duas para o layout
    if (DEMO) this.disponiveis.set(['groq', 'gemini']);
    else void this.cfg.ia<{ provedores: Provedor[] }>({ acao: 'provedores' }).then((r) => this.disponiveis.set(r.provedores)).catch(() => null);
  }

  protected nome(p: Provedor) { return NOMES[p] ?? p; }
  protected ligadas() { return this.disponiveis().map((p) => this.nome(p)).join(' e '); }

  protected async enviar() {
    const t = this.texto.trim();
    if (!t) return;
    this.texto = '';
    this.falas.update((l) => [...l, { papel: 'cliente', texto: t }]);
    this.pensando.set(true);
    this.rolar();
    try {
      const r = await this.cfg.ia<{ texto: string; acoes?: string[]; provedor?: Provedor; ms?: number }>({
        acao: 'chat',
        provedor: this.provedor() || undefined,
        mensagens: this.falas().map((f) => ({ papel: f.papel, texto: f.texto })),
      });
      this.falas.update((l) => [...l, { papel: 'bot', texto: r.texto, acoes: r.acoes, provedor: r.provedor, ms: r.ms }]);
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.pensando.set(false);
      this.rolar();
    }
  }

  private rolar() {
    setTimeout(() => { const el = this.caixa()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }
}
