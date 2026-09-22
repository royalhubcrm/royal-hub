import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Agendamento, Conversa, Duvida, Interesse, StatusAgendamento } from '../../core/models/conversa.model';
import { ConfigService } from '../../core/services/config.service';
import { ConversasService } from '../../core/services/conversas.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { Metrica } from '../dashboard/components/metrica';
import { DiaSemanaPipe, QuandoPipe, TelefonePipe } from '../../shared/pipes/formatos.pipe';
import { Gaveta } from '../../shared/ui/gaveta';
import { MascaraDirective } from '../../shared/ui/mascara.directive';
import { soDigitos } from '../../shared/util/telefone';
import { focarPrimeiroErro, telefoneValido } from '../../shared/util/validacao';

const DIAS_PARADA = 2;

interface Retomada { conversa: Conversa; texto: string; dias: number }

@Component({
  selector: 'app-gerencia',
  imports: [FormsModule, RouterLink, Metrica, DiaSemanaPipe, QuandoPipe, TelefonePipe, Gaveta, MascaraDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gerencia.page.html',
  styleUrl: './gerencia.page.scss',
})
export default class GerenciaPage {
  private readonly srv = inject(ConversasService);
  private readonly avisos = inject(AvisosService);
  protected readonly cfg = inject(ConfigService);

  protected readonly agenda = signal<Agendamento[]>([]);
  protected readonly duvidas = signal<Duvida[]>([]);
  protected readonly interesses = signal<Interesse[]>([]);
  protected readonly conversas = signal<Conversa[]>([]);
  protected readonly carregando = signal(true);
  protected readonly respostas: Record<string, string> = {};
  protected readonly retomada = signal<Retomada | null>(null);
  protected readonly gerando = signal<string | null>(null);

  protected readonly marcando = signal(false);
  protected nova = { nome: '', telefone: '', data: '', hora: '', imovel: '', local: '' };
  protected readonly tentouMarcar = signal(false);
  protected readonly tocados = signal<Set<string>>(new Set());

  protected readonly diasParada = DIAS_PARADA;
  protected readonly hoje = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso do navegador

  protected readonly proximos = computed(() =>
    this.agenda().filter((a) => a.status !== 'cancelado' && (!a.data || a.data >= this.hoje)));
  protected readonly passados = computed(() =>
    this.agenda().filter((a) => a.data && a.data < this.hoje).reverse().slice(0, 30));
  protected readonly numeros = computed(() => {
    const a = this.agenda();
    return {
      marcados: a.filter((x) => x.status === 'marcado').length,
      pelaIA: a.filter((x) => x.marcado_por === 'assistente').length,
      compareceram: a.filter((x) => x.status === 'compareceu').length,
      faltaram: a.filter((x) => x.status === 'faltou').length,
    };
  });
  /** Cliente falou por último e ficou sem resposta há dias. */
  protected readonly paradas = computed(() => {
    const limite = Date.now() - DIAS_PARADA * 864e5;
    return this.conversas().filter((c) => c.ultimo_de === 'cliente' && new Date(c.atualizado_em).getTime() < limite).slice(0, 20);
  });
  protected readonly porCliente = computed(() => {
    const grupos = new Map<string, { cliente: string; conversa: string | null; itens: Interesse[] }>();
    for (const i of this.interesses()) {
      const chave = i.conversa_id ?? i.lead_id ?? i.cliente ?? '?';
      const g = grupos.get(chave) ?? { cliente: i.cliente ?? 'Cliente', conversa: i.conversa_id, itens: [] };
      g.itens.push(i);
      grupos.set(chave, g);
    }
    return [...grupos.values()].slice(0, 25);
  });

  constructor() {
    void this.carregar();
    void this.cfg.garantir().catch(() => null);
  }

  protected async carregar() {
    this.carregando.set(true);
    try {
      const [agenda, duvidas, interesses, conversas] = await Promise.all([
        this.srv.agenda(), this.srv.duvidasAbertas(), this.srv.interesses(), this.srv.listar(),
      ]);
      this.agenda.set(agenda);
      this.duvidas.set(duvidas);
      this.interesses.set(interesses);
      this.conversas.set(conversas);
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.carregando.set(false);
    }
  }

  protected async status(a: Agendamento, s: StatusAgendamento) {
    try {
      await this.srv.statusAgendamento(a.id, s);
      this.agenda.update((l) => l.map((x) => (x.id === a.id ? { ...x, status: s } : x)));
      this.avisos.ok(`${a.nome || 'Atendimento'}: ${s}.`);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected async responder(d: Duvida) {
    try {
      await this.srv.responderDuvida(d.id, this.respostas[d.id] ?? '');
      this.duvidas.update((l) => l.filter((x) => x.id !== d.id));
      this.avisos.ok('Pergunta marcada como respondida.');
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected async gerarRetomada(c: Conversa) {
    this.gerando.set(c.id);
    try {
      const r = await this.cfg.ia<{ texto: string; dias: number }>({ acao: 'retomada', conversa_id: c.id });
      this.retomada.set({ conversa: c, texto: r.texto, dias: r.dias });
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.gerando.set(null);
    }
  }

  protected async enviarRetomada() {
    const r = this.retomada();
    if (!r) return;
    try {
      await this.srv.enviar(r.conversa.id, r.texto);
      this.avisos.ok('Mensagem enviada.');
      this.retomada.set(null);
      void this.carregar();
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected copiar(t: string) { void navigator.clipboard?.writeText(t).then(() => this.avisos.ok('Copiado.')); }

  protected tocar(campo: string) { this.tocados.update((s) => new Set(s).add(campo)); }
  protected mostraErro(campo: string) { return this.tentouMarcar() || this.tocados().has(campo); }
  protected telefoneOk() { return telefoneValido(this.nova.telefone); }

  protected async marcar() {
    const n = this.nova;
    this.tentouMarcar.set(true);
    if (!n.nome.trim() || !n.data || !this.telefoneOk()) { focarPrimeiroErro(); return this.avisos.erro('Preencha pelo menos o nome e o dia.'); }
    try {
      await this.srv.marcar({
        nome: n.nome.trim(), telefone: soDigitos(n.telefone) ?? '', data: n.data, hora: n.hora || null,
        imovel: n.imovel.trim(), local: n.local.trim() || this.cfg.config()?.endereco || '', marcado_por: 'manual',
        como: 'Marcado no painel',
      });
      this.nova = { nome: '', telefone: '', data: '', hora: '', imovel: '', local: '' };
      this.tentouMarcar.set(false);
      this.tocados.set(new Set());
      this.marcando.set(false);
      this.avisos.ok('Atendimento marcado.');
      void this.carregar();
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected rotuloStatus(s: string) {
    return ({ marcado: 'Marcado', compareceu: 'Compareceu', faltou: 'Faltou', cancelado: 'Cancelado' } as Record<string, string>)[s] ?? s;
  }
}
