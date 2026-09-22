/** "(34) 99999-0000" → "34999990000"; vazio vira null. */
export function soDigitos(t: string | null | undefined): string | null {
  const d = (t ?? '').replace(/\D/g, '');
  return d || null;
}

/** Mesma regra do banco (crm.telefone_normal): sempre com 55 na frente. */
export function telefoneNormal(t: string | null | undefined): string | null {
  const d = soDigitos(t);
  if (!d) return null;
  return d.length === 10 || d.length === 11 ? '55' + d : d;
}

/** Mesma regra do banco (crm.telefone_chave): ignora o nono dígito. */
export function telefoneChave(t: string | null | undefined): string | null {
  const d = telefoneNormal(t);
  if (!d) return null;
  return d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(0, 4) + d.slice(-8) : d;
}

/** "5534999990000" → "(34) 99999-0000" */
export function formatarTelefone(t: string | null | undefined): string {
  let d = soDigitos(t) ?? '';
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ?? '';
}

/** Link que abre a conversa no WhatsApp (celular ou WhatsApp Web). */
export function linkWhats(t: string | null | undefined, texto = ''): string | null {
  const d = telefoneNormal(t);
  if (!d) return null;
  return `https://wa.me/${d}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
}
