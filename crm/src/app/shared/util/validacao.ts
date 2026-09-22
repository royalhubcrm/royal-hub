import { soDigitos } from './telefone';

/** Uma regra só para o app inteiro: algo@algo.algo, sem espaços. */
export function emailValido(e: string | null | undefined): boolean {
  const t = (e ?? '').trim();
  return !t || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t);
}

/** DDD + número (10 ou 11 dígitos), com ou sem o 55 na frente. Vazio passa. */
export function telefoneValido(t: string | null | undefined): boolean {
  const d = soDigitos(t) ?? '';
  return !d || (d.length >= 10 && d.length <= 13);
}

export function cepValido(c: string | null | undefined): boolean {
  const d = soDigitos(c) ?? '';
  return !d || d.length === 8;
}

/**
 * Depois de um "Salvar" que falhou, leva o foco para o primeiro campo
 * marcado como inválido — a pessoa vê o erro em vez de procurar.
 */
export function focarPrimeiroErro(raiz: ParentNode = document): void {
  setTimeout(() => raiz.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}
