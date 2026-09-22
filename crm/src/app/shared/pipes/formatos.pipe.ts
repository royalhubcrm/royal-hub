import { Pipe, PipeTransform } from '@angular/core';
import { formatarTelefone } from '../util/telefone';

/** 5534999990000 → (34) 99999-0000 */
@Pipe({ name: 'telefone' })
export class TelefonePipe implements PipeTransform {
  transform(t: string | null | undefined): string {
    return formatarTelefone(t) || '—';
  }
}

/** "há 3 dias", "hoje 14:05" — datas curtas para listas densas. */
@Pipe({ name: 'quando' })
export class QuandoPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    if (!v) return '—';
    const d = new Date(v);
    const hoje = new Date();
    const dias = Math.floor((new Date(hoje.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (dias === 0) return `hoje ${hora}`;
    if (dias === 1) return `ontem ${hora}`;
    if (dias < 7) return `há ${dias} dias`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() === hoje.getFullYear() ? undefined : '2-digit' });
  }
}

/** "2026-09-25" → "25/09 · quinta" */
@Pipe({ name: 'diaSemana' })
export class DiaSemanaPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    if (!v) return 'sem data';
    const [a, m, d] = v.split('-').map(Number);
    const dt = new Date(a, m - 1, d);
    const semana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][dt.getDay()];
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} · ${semana}`;
  }
}
