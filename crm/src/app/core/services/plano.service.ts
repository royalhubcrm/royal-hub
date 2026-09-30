import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SUPABASE } from '../supabase/supabase.client';
import { CAMPOS_PLANO, planoEstrategico } from '../../shared/pdf/plano';

export type CampoPlano = [chave: string, rotulo: string, dica: string];
export interface GrupoPlano { grupo: string; campos: CampoPlano[] }

const MARCA = `${environment.supabaseUrl}/storage/v1/object/public/imoveis/marca`;
const semAcento = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const reais = (v: number) =>
  v ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

function mesDeHoje() {
  const m = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/**
 * O PDF Personalizado: o mesmo plano de 6 páginas do gerador antigo (o de Python),
 * montado aqui no navegador e já preenchido com o que o sistema sabe do imóvel.
 */
@Injectable({ providedIn: 'root' })
export class PlanoService {
  private readonly db = inject(SUPABASE);
  private marcas: [Uint8Array | null, Uint8Array | null] | null = null;

  readonly grupos = CAMPOS_PLANO as GrupoPlano[];

  /** O que já dá para preencher sozinho (config da empresa + o código ou o empreendimento). */
  async preencher(busca: string, cfg: Record<string, any> | null): Promise<{ dados: Record<string, string>; achou: string }> {
    const d: Record<string, string> = {
      mes_referencia: mesDeHoje(),
      corretor: cfg?.['corretor'] ?? '',
      creci: cfg?.['creci'] ?? '',
      whatsapp: cfg?.['whats'] ?? '',
    };
    const alvo = String(busca ?? '').trim();
    if (!alvo) return { dados: d, achou: '' };

    const [{ data: imv }, { data: fichas }] = await Promise.all([
      this.db.from('imoveis').select('codigo, tipo, bairro, preco, quartos, suites, vagas, area, descricao')
        .eq('codigo', alvo).maybeSingle(),
      this.db.from('empreendimentos').select('nome, construtora, bairro, tipologias, lazer, situacao'),
    ]);
    const lista = (fichas ?? []) as any[];
    const ficha = lista.find((e) => semAcento(e.nome) === semAcento(alvo))
      ?? lista.find((e) => semAcento(alvo) && semAcento(e.nome).includes(semAcento(alvo)))
      ?? (imv ? lista.find((e) => semAcento(`${imv.descricao} ${imv.bairro}`).includes(semAcento(e.nome))) : null);

    let achou = '';
    if (imv) {
      achou = `Imóvel ${imv.codigo} — ${imv.tipo} no ${imv.bairro}`;
      d['empreendimento'] = ficha?.nome || `${imv.tipo} no ${imv.bairro}`;
      d['bloco_unidade'] = `cód. ${imv.codigo}`;
      d['vaga'] = imv.vagas ? `${imv.vagas} vaga${imv.vagas > 1 ? 's' : ''}` : '';
      d['tipologia'] = [imv.quartos && `${imv.quartos} quartos`, imv.suites && `${imv.suites} suíte${imv.suites > 1 ? 's' : ''}`,
        imv.area && `${imv.area} m²`].filter(Boolean).join(', ');
      d['valor_total'] = reais(imv.preco);
    }
    if (ficha) {
      achou = achou || `Empreendimento ${ficha.nome}`;
      d['empreendimento'] = d['empreendimento'] || ficha.nome;
      d['construtora'] = ficha.construtora ?? '';
      d['tipologia'] = d['tipologia'] || (ficha.tipologias ?? '');
      d['condominio'] = ficha.lazer ?? '';
      d['prazo_obra'] = ficha.situacao ?? '';
    }
    return { dados: d, achou };
  }

  /** A marca em dois fundos (fica guardada depois da primeira vez). Sem ela o PDF sai igual, só sem logo. */
  private async marca(): Promise<[Uint8Array | null, Uint8Array | null]> {
    if (this.marcas) return this.marcas;
    const baixar = async (nome: string) => {
      try {
        const r = await fetch(`${MARCA}/${nome}`);
        return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
      } catch { return null; }
    };
    this.marcas = await Promise.all([baixar('logo-royal.jpg'), baixar('logo-royal-escuro.jpg')]) as [Uint8Array | null, Uint8Array | null];
    return this.marcas;
  }

  /** Monta o PDF aqui mesmo, sem servidor. */
  async gerar(dados: Record<string, string>): Promise<Blob> {
    const [logo, escura] = await this.marca();
    const gerar = planoEstrategico as (d: unknown, a: Uint8Array | null, b: Uint8Array | null) => Uint8Array;
    const bytes = gerar(dados, logo, escura);
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  }
}
