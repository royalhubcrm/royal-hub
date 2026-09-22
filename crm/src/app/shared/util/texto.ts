/** "Prime Imóveis Uberlândia" → "prime-imoveis-uberlandia" (mesma regra do crm.slugificar). */
export function slugDe(t: string): string {
  return String(t ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
