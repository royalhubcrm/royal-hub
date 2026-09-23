import { Routes } from '@angular/router';
import { Shell } from './layout/shell/shell';
import { deslogadoGuard, logadoGuard, papelGuard } from './core/auth/guards';

const t = (nome: string) => `${nome} · Royal CRM`;

export const routes: Routes = [
  // ---------------------------------------------------------------- públicas
  { path: 'entrar', title: t('Entrar'), canActivate: [deslogadoGuard], loadComponent: () => import('./features/auth/entrar.page') },
  { path: 'redefinir-senha', title: t('Nova senha'), loadComponent: () => import('./features/auth/redefinir-senha.page') },
  { path: 'captar/:empresa', title: 'Fale com a gente', loadComponent: () => import('./features/publico/captar.page') },
  { path: 'imovel/:id', title: 'Imóvel', loadComponent: () => import('./features/publico/imovel-publico.page') },
  { path: 's/:slug', title: 'Imóveis', loadComponent: () => import('./features/publico/site-publico.page') },

  // ---------------------------------------------------------------- painel (precisa de login)
  {
    path: '',
    component: Shell,
    canActivate: [logadoGuard],
    canActivateChild: [papelGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      { path: 'painel', title: t('Painel'), loadComponent: () => import('./features/dashboard/dashboard.page') },
      { path: 'pipeline', title: t('Pipeline'), loadComponent: () => import('./features/pipeline/pipeline.page') },
      { path: 'leads', title: t('Leads'), loadComponent: () => import('./features/leads/leads.page') },
      { path: 'conversas', title: t('Conversas'), loadComponent: () => import('./features/conversas/conversas.page') },
      { path: 'assistente', title: t('Assistente'), loadComponent: () => import('./features/assistente/assistente.page') },
      { path: 'imoveis', title: t('Imóveis'), data: { papeis: ['admin', 'gerente', 'corretor'] },
        loadComponent: () => import('./features/imoveis/imoveis.page') },
      { path: 'imoveis/folha', title: t('Folha de imóveis'), data: { papeis: ['admin', 'gerente', 'corretor'] },
        loadComponent: () => import('./features/imoveis/folha.page') },
      { path: 'gerencia', title: t('Agenda e gerência'), data: { papeis: ['admin', 'gerente'] },
        loadComponent: () => import('./features/gerencia/gerencia.page') },
      { path: 'sites', title: t('Sites'), data: { papeis: ['admin'] }, loadComponent: () => import('./features/sites/sites.page') },
      { path: 'equipe', title: t('Equipe'), data: { papeis: ['admin'] }, loadComponent: () => import('./features/equipe/equipe.page') },
      { path: 'ajustes', title: t('Ajustes'), data: { papeis: ['admin'] }, loadComponent: () => import('./features/ajustes/ajustes.page') },
      { path: 'empresas', title: t('Empresas'), data: { dono: true }, loadComponent: () => import('./features/empresas/empresas.page') },
    ],
  },
  { path: '**', redirectTo: '' },
];
