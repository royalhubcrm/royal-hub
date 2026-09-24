import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Papel } from '../models/pessoa.model';

/** Só entra quem está logado e tem perfil ativo. */
export const logadoGuard: CanActivateFn = async (_rota, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.pronto;
  if (auth.logado() && auth.perfil()?.ativo) return true;
  return router.createUrlTree(['/entrar'], { queryParams: estado.url !== '/' ? { volta: estado.url } : {} });
};

/** Tela de login: quem já está dentro vai direto para o painel. (inject só vale antes do await) */
export const deslogadoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.pronto;
  return auth.logado() && auth.perfil() ? router.createUrlTree(['/painel']) : true;
};

/** Página inicial pública: quem já está dentro vai direto para o painel. */
export const inicioGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.pronto;
  return auth.logado() && auth.perfil()?.ativo ? router.createUrlTree(['/painel']) : true;
};
/** Rotas restritas por papel: data: { papeis: ['admin'] } */
export const papelGuard: CanActivateFn = (rota) => {
  const auth = inject(AuthService);
  const papeis = (rota.data['papeis'] ?? []) as Papel[];
  if (rota.data['dono']) return auth.perfil()?.dono ? true : inject(Router).createUrlTree(['/']);
  return !papeis.length || auth.pode(...papeis) ? true : inject(Router).createUrlTree(['/']);
};

