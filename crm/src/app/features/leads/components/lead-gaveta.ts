import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { Historico, Lead, LeadEditavel, ORIGENS, TEMPERATURAS } from '../../../core/models/lead.model';
import { ConfigService } from '../../../core/services/config.service';
import { EquipeService } from '../../../core/services/equipe.service';
import { LeadsService } from '../../../core/services/leads.service';
import { PipelineService } from '../../../core/services/pipeline.service';
import { AvisosService } from '../../../core/ui/avisos.service';
import { erroAmigavel } from '../../../core/supabase/supabase.client';
import { QuandoPipe } from '../../../shared/pipes/formatos.pipe';
import { Gaveta } from '../../../shared/ui/gaveta';
import { MascaraDirective } from '../../../shared/ui/mascara.directive';
import { formatarTelefone, linkWhats, soDigitos } from '../../../shared/util/telefone';
import { emailValido, focarPrimeiroErro, telefoneValido } from '../../../shared/util/validacao';

interface Rascunho {
  nome: string; telefone: string; email: string; empresa: string; origem: string; campanha: string;
  interesse: string; status: string; temperatura: string; valor_estimado: number | null;
  imoveis: string; responsavel_id: string; obs: string;
}

/**
 * A ficha do lead, num painel lateral. É a mesma na tela de Leads e no Pipeline:
 * editar, ver o histórico, anotar, chamar no WhatsApp e pedir uma sugestão de mensagem.
 */
@Component({
  selector: 'app-lead-gaveta',
  imports: [FormsModule, Gaveta, QuandoPipe, MascaraDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lead-gaveta.html',
  styleUrl: './lead-gaveta.scss',
})
export class LeadGaveta {
  /** O lead aberto; null = cadastro novo. */
  readonly lead = input<Lead | null>(null);
  readonly aberta = input(false);
  /** Etapa sugerida ao criar pelo Kanban. */
  readonly etapaInicial = input('novo');
  readonly fechar = output<void>();
  readonly salvo = output<Lead>();
  readonly removido = output<string>();

  private readonly leads = inject(LeadsService);
  private readonly avisos = inject(AvisosService);
  private readonly config = inject(ConfigService);
  protected readonly auth = inject(AuthService);
  protected readonly pipeline = inject(PipelineService);
  protected readonly equipe = inject(EquipeService);

  protected readonly origens = ORIGENS;
  protected readonly temperaturas = TEMPERATURAS;
  protected f: Rascunho = this.vazio();
  protected readonly tentouSalvar = signal(false);
  /** Campos por onde a pessoa já passou: o erro aparece ao sair do campo, não enquanto digita. */
  protected readonly tocados = signal<Set<string>>(new Set());
  protected readonly salvando = signal(false);
  protected readonly historico = signal<Historico[]>([]);
  protected readonly sugestao = signal('');
  protected readonly pensando = signal(false);
  protected nota = '';

  protected readonly titulo = computed(() => this.lead()?.nome || 'Novo lead');
  protected readonly podeExcluir = computed(() => !!this.lead() && this.auth.pode('admin', 'gerente'));

  constructor() {
    // abriu (ou trocou de lead): recarrega o formulário e o histórico
    effect(() => {
      const l = this.lead();
      if (!this.aberta()) return;
      this.f = l ? this.deLead(l) : { ...this.vazio(), status: this.etapaInicial() };
      this.tentouSalvar.set(false);
      this.tocados.set(new Set());
      this.sugestao.set('');
      this.nota = '';
      this.historico.set([]);
      void this.equipe.garantirPessoas().catch(() => null);
      void this.pipeline.etapas().catch(() => null);
      if (l) void this.carregarHistorico(l.id);
    });
  }

  // ---------------------------------------------------------------- validação
  protected get erroNome() { return this.f.nome.trim() ? '' : 'Digite o nome.'; }
  protected get erroTelefone() { return telefoneValido(this.f.telefone) ? '' : 'Use DDD + número (10 ou 11 dígitos).'; }
  protected get erroEmail() { return emailValido(this.f.email) ? '' : 'E-mail incompleto.'; }
  protected tocar(campo: string) { this.tocados.update((s) => new Set(s).add(campo)); }
  protected mostraErro(campo: string) { return this.tentouSalvar() || this.tocados().has(campo); }
  protected get whats() { return linkWhats(this.f.telefone); }

  protected async salvar() {
    this.tentouSalvar.set(true);
    if (this.erroNome || this.erroTelefone || this.erroEmail) {
      this.avisos.erro('Confira os campos marcados.');
      focarPrimeiroErro();
      return;
    }
    this.salvando.set(true);
    try {
      const salvo = await this.leads.salvar(this.lead()?.id ?? null, this.paraSalvar());
      this.avisos.ok(this.lead() ? 'Lead atualizado.' : 'Lead cadastrado.');
      this.salvo.emit(salvo);
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  protected async excluir() {
    const l = this.lead();
    if (!l) return;
    const ok = await this.avisos.confirmar(`Excluir ${l.nome}?`, {
      texto: 'O lead e todo o histórico dele somem. Isso não tem volta.', confirmar: 'Excluir lead',
    });
    if (!ok) return;
    try {
      await this.leads.remover(l.id);
      this.avisos.ok('Lead excluído.');
      this.removido.emit(l.id);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected async anotar() {
    const l = this.lead();
    const uid = this.auth.perfil()?.id;
    if (!l || !uid || !this.nota.trim()) return;
    try {
      await this.leads.anotar(l.id, this.nota, uid);
      this.nota = '';
      await this.carregarHistorico(l.id);
    } catch (e) {
      this.avisos.erro(e);
    }
  }

  protected async sugerir() {
    const l = this.lead();
    if (!l) return;
    this.pensando.set(true);
    this.sugestao.set('');
    try {
      const r = await this.config.ia({ acao: 'sugestao', lead_id: l.id });
      this.sugestao.set(r.texto);
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.pensando.set(false);
    }
  }

  protected copiar(texto: string) {
    void navigator.clipboard?.writeText(texto).then(() => this.avisos.ok('Copiado.'));
  }

  protected whatsCom(texto: string) { return linkWhats(this.f.telefone, texto); }

  protected nomeAutor(id: string | null) { return id ? this.equipe.nomeDe(id) || 'Alguém da equipe' : 'Sistema'; }

  private async carregarHistorico(id: string) {
    try { this.historico.set(await this.leads.historico(id)); }
    catch (e) { this.avisos.erro(erroAmigavel(e)); }
  }

  private vazio(): Rascunho {
    return {
      nome: '', telefone: '', email: '', empresa: '', origem: 'Manual', campanha: '', interesse: '',
      status: 'novo', temperatura: 'morno', valor_estimado: null, imoveis: '', responsavel_id: this.auth.perfil()?.id ?? '', obs: '',
    };
  }

  private deLead(l: Lead): Rascunho {
    return {
      nome: l.nome, telefone: formatarTelefone(l.telefone), email: l.email ?? '', empresa: l.empresa ?? '',
      origem: l.origem, campanha: l.campanha, interesse: l.interesse, status: l.status, temperatura: l.temperatura,
      valor_estimado: l.valor_estimado || null, imoveis: l.imoveis.join(', '), responsavel_id: l.responsavel_id ?? '', obs: l.obs,
    };
  }

  private paraSalvar(): LeadEditavel {
    const f = this.f;
    return {
      nome: f.nome.trim(), telefone: soDigitos(f.telefone), email: f.email.trim() || null, empresa: f.empresa.trim() || null,
      origem: f.origem, campanha: f.campanha.trim(), interesse: f.interesse.trim(), status: f.status,
      temperatura: f.temperatura as LeadEditavel['temperatura'], valor_estimado: Number(f.valor_estimado) || 0,
      imoveis: f.imoveis.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean),
      responsavel_id: f.responsavel_id || null, obs: f.obs,
    };
  }
}
