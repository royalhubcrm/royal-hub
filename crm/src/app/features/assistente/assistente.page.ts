import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Config } from '../../core/models/config.model';
import { ConfigService } from '../../core/services/config.service';
import { AvisosService } from '../../core/ui/avisos.service';
import { AbasDirective } from '../../shared/ui/abas.directive';
import { AssistenteConfig } from './assistente-config';
import { TestarAssistente } from './testar-assistente';

type Aba = 'testar' | 'configurar';

/** Tudo da assistente de IA num lugar só: testar (todos) e configurar (admin). */
@Component({
  selector: 'app-assistente',
  imports: [AbasDirective, AssistenteConfig, TestarAssistente],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabecalho-pagina">
      <div>
        <h1>Assistente</h1>
        <p>Responde no WhatsApp com a carteira e marca visitas.</p>
      </div>
      @if (cfg.config(); as c) {
        <div class="acoes">
          <span class="etiqueta" [class.ok]="c.bot_ligado" [class.frio]="!c.bot_ligado">{{ c.bot_ligado ? 'Ligada' : 'Desligada' }}</span>
          @if (auth.pode('admin')) {
            <button type="button" class="btn" (click)="alternar(c)" [disabled]="mudando()">{{ c.bot_ligado ? 'Desligar' : 'Ligar' }}</button>
          }
        </div>
      }
    </header>

    @if (auth.pode('admin')) {
      <div class="abas" role="tablist" aria-label="Assistente" appAbas>
        <button type="button" role="tab" id="aba-testar" aria-controls="painel-testar" [attr.aria-selected]="atual() === 'testar'"
                [attr.tabindex]="atual() === 'testar' ? 0 : -1" (click)="atual.set('testar')">Testar</button>
        <button type="button" role="tab" id="aba-configurar" aria-controls="painel-configurar" [attr.aria-selected]="atual() === 'configurar'"
                [attr.tabindex]="atual() === 'configurar' ? 0 : -1" (click)="atual.set('configurar')">Configurar</button>
      </div>
    }

    @if (atual() === 'configurar' && auth.pode('admin')) {
      <div id="painel-configurar" role="tabpanel" aria-labelledby="aba-configurar"><app-assistente-config /></div>
    } @else {
      <div id="painel-testar" role="tabpanel" aria-labelledby="aba-testar"><app-testar-assistente /></div>
    }
  `,
})
export default class AssistentePage {
  /** /assistente?aba=configurar abre direto na configuração. */
  readonly aba = input<string>();

  protected readonly cfg = inject(ConfigService);
  protected readonly auth = inject(AuthService);
  private readonly avisos = inject(AvisosService);

  protected readonly atual = signal<Aba>('testar');
  protected readonly mudando = signal(false);

  constructor() {
    void this.cfg.garantir().catch(() => null);
    effect(() => { if (this.aba() === 'configurar') this.atual.set('configurar'); });
  }

  protected async alternar(c: Config) {
    this.mudando.set(true);
    try {
      await this.cfg.salvar({ bot_ligado: !c.bot_ligado });
      this.avisos.ok(c.bot_ligado ? 'Assistente desligada em todas as conversas.' : 'Assistente ligada.');
    } catch (e) {
      this.avisos.erro(e);
    } finally {
      this.mudando.set(false);
    }
  }
}
