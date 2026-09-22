import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Papel, rotuloPapel } from '../../core/models/pessoa.model';
import { ConversasService } from '../../core/services/conversas.service';
import { Marca } from '../../shared/ui/marca';

interface ItemMenu { rota: string; rotulo: string; papeis?: Papel[]; dono?: boolean; grupo: 'dia' | 'gestao' }

const MENU: ItemMenu[] = [
  { rota: '/painel', rotulo: 'Painel', grupo: 'dia' },
  { rota: '/pipeline', rotulo: 'Pipeline', grupo: 'dia' },
  { rota: '/leads', rotulo: 'Leads', grupo: 'dia' },
  { rota: '/conversas', rotulo: 'Conversas', grupo: 'dia' },
  { rota: '/imoveis', rotulo: 'Imóveis', papeis: ['admin', 'gerente', 'corretor'], grupo: 'dia' },
  { rota: '/gerencia', rotulo: 'Agenda e gerência', papeis: ['admin', 'gerente'], grupo: 'gestao' },
  { rota: '/sites', rotulo: 'Sites', papeis: ['admin'], grupo: 'gestao' },
  { rota: '/equipe', rotulo: 'Equipe', papeis: ['admin'], grupo: 'gestao' },
  { rota: '/ajustes', rotulo: 'Ajustes', papeis: ['admin'], grupo: 'gestao' },
  { rota: '/empresas', rotulo: 'Empresas', dono: true, grupo: 'gestao' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Marca],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly conversas = inject(ConversasService);
  private readonly conteudo = viewChild.required<ElementRef<HTMLElement>>('conteudo');

  protected readonly menuAberto = signal(false);
  protected readonly naoLidas = this.conversas.naoLidas;
  protected readonly rotuloPapel = rotuloPapel;

  protected readonly itens = computed(() => {
    const p = this.auth.perfil();
    return MENU.filter((i) => (i.dono ? p?.dono : !i.papeis || (p && i.papeis.includes(p.papel))));
  });
  protected readonly dia = computed(() => this.itens().filter((i) => i.grupo === 'dia'));
  protected readonly gestao = computed(() => this.itens().filter((i) => i.grupo === 'gestao'));

  constructor() {
    const router = inject(Router);
    // a cada troca de tela: fecha o menu do celular e leva o foco para o conteúdo
    // (o leitor de tela anuncia a página nova, junto com o título da aba)
    const sub = router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.menuAberto.set(false);
      queueMicrotask(() => this.conteudo().nativeElement.focus({ preventScroll: true }));
      window.scrollTo(0, 0);
    });

    // bolinha de mensagens não lidas no menu "Conversas"
    void this.conversas.contarNaoLidas();
    const parar = this.conversas.aoMudar(() => void this.conversas.contarNaoLidas());

    inject(DestroyRef).onDestroy(() => { sub.unsubscribe(); parar(); });
  }
}
