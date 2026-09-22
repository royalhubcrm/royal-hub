import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { Imovel, ImovelEditavel } from '../models/imovel.model';

@Injectable({ providedIn: 'root' })
export class ImoveisService {
  private readonly db = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  /** A carteira inteira (centenas de imóveis cabem de uma vez; o filtro é na tela). */
  async listar(): Promise<Imovel[]> {
    const { data, error } = await this.db.from('imoveis').select('*').order('atualizado_em', { ascending: false }).limit(3000);
    if (error) throw error;
    return (data ?? []) as Imovel[];
  }

  /** Os imóveis pedidos, na mesma ordem dos ids. */
  async porIds(ids: string[]): Promise<Imovel[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db.from('imoveis').select('*').in('id', ids);
    if (error) throw error;
    const porId = new Map(((data ?? []) as Imovel[]).map((m) => [m.id, m]));
    return ids.map((id) => porId.get(id)).filter((m): m is Imovel => !!m);
  }

  async salvar(id: string | null, m: ImovelEditavel): Promise<Imovel> {
    const corpo = { ...m, codigo: m.codigo.trim(), cep: m.cep.replace(/\D/g, '') };
    const consulta = id ? this.db.from('imoveis').update(corpo).eq('id', id) : this.db.from('imoveis').insert(corpo);
    const { data, error } = await consulta.select('*').single();
    if (error) throw error;
    return data as Imovel;
  }

  async remover(id: string): Promise<void> {
    const { error } = await this.db.from('imoveis').delete().eq('id', id);
    if (error) throw error;
  }

  /** Importação: código que já existe é atualizado, código novo é criado. */
  async importar(itens: ImovelEditavel[]): Promise<number> {
    const empresa_id = this.auth.perfil()?.empresa_id;
    const { error, count } = await this.db
      .from('imoveis')
      .upsert(itens.map((m) => ({ ...m, empresa_id })), { onConflict: 'empresa_id,codigo', defaultToNull: false, count: 'exact' });
    if (error) throw error;
    return count ?? itens.length;
  }

  /** Sobe uma foto para o Storage (pasta da empresa) e devolve o endereço público. */
  async enviarFoto(arquivo: File): Promise<string> {
    const empresa = this.auth.perfil()?.empresa_id;
    const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const caminho = `${empresa}/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.db.storage.from('imoveis').upload(caminho, arquivo, {
      cacheControl: '31536000', contentType: arquivo.type || undefined,
    });
    if (error) throw error;
    return this.db.storage.from('imoveis').getPublicUrl(caminho).data.publicUrl;
  }

  /** Busca rua, bairro e cidade pelo CEP (ViaCEP, gratuito, direto do navegador). */
  async buscarCep(cep: string): Promise<{ rua: string; bairro: string; cidade: string } | null> {
    const d = cep.replace(/\D/g, '');
    if (d.length !== 8) return null;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro) return null;
      return { rua: j.logradouro ?? '', bairro: j.bairro ?? '', cidade: j.localidade ?? '' };
    } catch {
      return null;
    }
  }
}
