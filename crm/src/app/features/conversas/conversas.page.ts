import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Conversa, Mensagem, estadoConversa } from '../../core/models/conversa.model';
import { ConfigService } from '../../core/services/config.service';
import { ConversasService } from '../../core/services/conversas.service';
import { EquipeService } from '../../core/services/equipe.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { erroAmigavel } from '../../core/supabase/supabase.client';
import { QuandoPipe, TelefonePipe } from '../../shared/pipes/formatos.pipe';
import { linkWhats } from '../../shared/util/telefone';
import { semAcento } from '../../shared/util/planilha';

@Component({
  selector: 'app-conversas',
  imports: [FormsModule, RouterLink, QuandoPipe, TelefonePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversas.page.html',
  styleUrl: './conversas.page.scss',
})
export default class ConversasPage {
  /** /conversas?c=<id> abre direto essa conversa (links da Gerência). */
  readonly c = input<string>();

  private readonly srv = inject(ConversasService);
  private readonly avisos = inject(AvisosService);
  protected readonly cfg = inject(ConfigService);
  protected readonly equipe = inject(EquipeService);
  protected readonly auth = inject(AuthService);
  private readonly caixa = viewChild<ElementRef<HTMLElement>>('caixa');

  protected readonly lista = signal<Conversa[]>([]);
  protected readonly selId = signal<string | null>(null);
  protected readonly mensagens = signal<Mensagem[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal('');
  protected readonly busca = signal('');
  protected readonly soNaoLidas = signal(false);
  protected readonly enviando = signal(false);
  protected texto = '';

  protected readonly estado = estadoConversa;
  protected readonly sel = computed(() => this.lista().find((c) => c.id === this.selId()) ?? null);
  protected readonly filtradas = computed(() => {
    const t = semAcento(this.busca());
    return this.lista().filter((c) =>
      (!t || semAcento(`${c.nome} ${c.telefone} ${c.ultima}`).includes(t)) && (!this.soNaoLidas() || c.nao_lidas > 0));
  });
  protected readonly podeEnviar = computed(() => !!this.cfg.config()?.wa_configurado);

  constructor() {
    void this.carregar();
    void this.cfg.garantir().catch(() => null);
    void this.equipe.garantirPessoas().catch(() => null);
    const parar = this.srv.aoMudar(() => void this.carregar(true));
    inject(DestroyRef).onDestroy(parar);
  }

  protected async carregar(silencioso = false) {
    try {
      this.lista.set(await this.srv.listar());
      this.erro.set('');
      const pedida = this.c();
      if (pedida && !silencioso && !this.selId()) {
        const alvo = this.lista().find((x) => x.id === pedida);
        if (alvo) return void (await this.abrir(alvo));
      }
      const id = this.selId();
      if (id) this.mensagens.set(await this.srv.mensagens(id));
      if (silencioso) this.rolarParaFim();
    } catch (e) {
      if (!silencioso) { this.erro.set(erroAmigavel(e)); this.avisos.erro(e); }
    } finally {
      this.carregando.set(false);
    }
  }

  protected async abrir(c: Conversa) {
    this.selId.set(c.id);
    this.mensagens.set([]);
    try {
      this.mensagens.set(await this.srv.mensagens(c.id));
      this.rolarParaFim();
      if (c.nao_lidas) {
        await this.srv.ajustar(c.id, { nao_lidas: 0 });
        this.lista.update((l) => l.map((x) => (x.id === c.id ? { ...x, nao_lidas: 0 } : x)));
      }
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected voltar() { this.selId.set(null); }

  protected async ajustar(campos: Parameters<ConversasService['ajustar']>[1], aviso: string) {
    const c = this.sel();
    if (!c) return;
    try {
      await this.srv.ajustar(c.id, campos);
      this.lista.update((l) => l.map((x) => (x.id === c.id ? { ...x, ...campos } : x)));
      this.avisos.ok(aviso);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected alternarAssistente(c: Conversa) {
    void this.ajustar({ bot_ativo: !c.bot_ativo, pausado_ate: null },
      c.bot_ativo ? 'A assistente não responde mais esta conversa.' : 'A assistente voltou a responder esta conversa.');
  }

  protected alternarNaoPerturbe(c: Conversa) {
    void this.ajustar({ nao_perturbe: !c.nao_perturbe },
      c.nao_perturbe ? 'Voltou a receber retomadas.' : 'Não recebe mais mensagem automática.');
  }

  protected retomarAgora(c: Conversa) {
    void this.ajustar({ pausado_ate: null }, 'A assistente volta a conduzir a conversa.');
  }

  protected definirResponsavel(id: string) {
    void this.ajustar({ responsavel_id: id || null }, id ? 'Responsável definido (vale também para o lead).' : 'Conversa sem responsável.');
  }

  protected async enviar() {
    const c = this.sel();
    const t = this.texto.trim();
    if (!c || !t) return;
    this.enviando.set(true);
    try {
      await this.srv.enviar(c.id, t);
      this.texto = '';
      // a assistente recuou nesta conversa: a lista mostra "Você conduzindo"
      const [msgs, lista] = await Promise.all([this.srv.mensagens(c.id), this.srv.listar()]);
      this.mensagens.set(msgs);
      this.lista.set(lista);
      this.rolarParaFim();
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.enviando.set(false);
    }
  }

  /** Enter envia; Shift+Enter quebra linha. */
  protected tecla(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void this.enviar(); }
  }

  protected whats(c: Conversa) { return linkWhats(c.telefone); }

  protected pausada(c: Conversa) { return !!c.pausado_ate && new Date(c.pausado_ate) > new Date(); }

  private rolarParaFim() {
    setTimeout(() => { const el = this.caixa()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }
}
