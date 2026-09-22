import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { ImovelVitrine, Site, SiteEditavel } from '../models/site.model';

export interface EmpresaPublica { nome: string; slug: string; whats: string; corretor: string }

export interface ImovelPublico {
  id: string; codigo: string; tipo: string; finalidade: string; bairro: string; cidade: string;
  preco: number; condominio: number; iptu: number; quartos: number; suites: number; banheiros: number;
  vagas: number; area: number; descricao: string; fotos: string[];
  empresa: string; empresa_slug: string; whats: string; corretor: string; creci: string;
}

/** Sites dos clientes (painel) e as páginas públicas (sem login). */
@Injectable({ providedIn: 'root' })
export class SitesService {
  private readonly db = inject(SUPABASE);

  async listar(): Promise<Site[]> {
    const { data, error } = await this.db.from('sites').select('*').order('nome');
    if (error) throw error;
    return (data ?? []) as Site[];
  }

  async salvar(s: SiteEditavel): Promise<Site> {
    const { id, ...campos } = s;
    const consulta = id ? this.db.from('sites').update(campos).eq('id', id) : this.db.from('sites').insert(campos);
    const { data, error } = await consulta.select('*').single();
    if (error) throw error;
    return data as Site;
  }

  async remover(id: string) {
    const { error } = await this.db.from('sites').delete().eq('id', id);
    if (error) throw error;
  }

  // ------------------------------------------------------------ público
  async empresaPublica(slug: string): Promise<EmpresaPublica | null> {
    const { data } = await this.db.rpc('empresa_publica', { p_slug: slug });
    return (data as EmpresaPublica) ?? null;
  }

  async captar(p: { empresa: string; nome: string; telefone: string; email: string; interesse: string; campanha: string }) {
    const { error } = await this.db.rpc('captar_lead', {
      p_empresa: p.empresa, p_nome: p.nome, p_telefone: p.telefone,
      p_email: p.email, p_interesse: p.interesse, p_campanha: p.campanha,
    });
    if (error) throw error;
  }

  async imovelPublico(id: string): Promise<ImovelPublico | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data } = await this.db.rpc('imovel_publico', { p_id: id });
    return (data as ImovelPublico) ?? null;
  }

  async sitePublico(slug: string): Promise<{ site: Site; imoveis: ImovelVitrine[] } | null> {
    const { data } = await this.db.rpc('site_publico', { p_slug: slug });
    return (data as { site: Site; imoveis: ImovelVitrine[] }) ?? null;
  }
}
