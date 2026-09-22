import { Pipe, PipeTransform } from '@angular/core';

const formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** 1250000 → "R$ 1.250.000" */
@Pipe({ name: 'brl' })
export class BrlPipe implements PipeTransform {
  transform(valor: number | null | undefined): string {
    return formato.format(Number(valor) || 0);
  }
}
