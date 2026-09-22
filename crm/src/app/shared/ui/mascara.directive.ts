import { Directive, ElementRef, HostListener, forwardRef, inject, input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type TipoMascara = 'telefone' | 'cep' | 'moeda' | 'inteiro';

const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** "34999990000" → "(34) 99999-0000" enquanto digita (aceita 8 a 11 dígitos, ou com 55). */
function mascaraTelefone(v: string): string {
  let d = v.replace(/\D/g, '').slice(0, 13);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** "38400100" → "38400-100" */
function mascaraCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Máscara de digitação para telefone, CEP e dinheiro, funcionando com
 * [(ngModel)] do jeito de sempre:
 *   <input appMascara="telefone" [(ngModel)]="f.telefone" />   → o modelo guarda o texto formatado
 *   <input appMascara="moeda"    [(ngModel)]="f.preco" />      → o modelo guarda o número (850000)
 * O campo vira type="text" com inputmode numérico, então no celular abre o teclado de números.
 */
@Directive({
  selector: 'input[appMascara]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MascaraDirective), multi: true }],
  host: { '[attr.inputmode]': 'tipo() === "telefone" ? "tel" : "numeric"', '[attr.autocomplete]': 'tipo() === "telefone" ? "tel" : null' },
})
export class MascaraDirective implements ControlValueAccessor {
  readonly tipo = input.required<TipoMascara>({ alias: 'appMascara' });

  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private aoMudar: (v: unknown) => void = () => undefined;
  private aoTocar: () => void = () => undefined;

  writeValue(v: unknown): void {
    // zero em campo de dinheiro é "não informado": mostra vazio, não "0"
    const vazio = v == null || ((this.tipo() === 'moeda' || this.tipo() === 'inteiro') && !Number(v));
    this.el.value = vazio ? '' : this.formatar(String(v));
  }
  registerOnChange(fn: (v: unknown) => void): void { this.aoMudar = fn; }
  registerOnTouched(fn: () => void): void { this.aoTocar = fn; }
  setDisabledState(d: boolean): void { this.el.disabled = d; }

  @HostListener('input')
  digitou(): void {
    const bruto = this.el.value;
    const texto = this.formatar(bruto);
    // reposiciona o cursor só quando a máscara mexeu no texto (senão o cursor pula para o fim)
    if (texto !== bruto) {
      const noFim = this.el.selectionStart === bruto.length;
      this.el.value = texto;
      if (!noFim) this.el.setSelectionRange(texto.length, texto.length);
    }
    this.aoMudar(this.paraModelo(texto));
  }

  @HostListener('blur')
  saiu(): void { this.aoTocar(); }

  private formatar(v: string): string {
    switch (this.tipo()) {
      case 'telefone': return mascaraTelefone(v);
      case 'cep': return mascaraCep(v);
      case 'moeda':
      case 'inteiro': {
        const d = v.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
        return d ? inteiro.format(Number(d)) : '';
      }
    }
  }

  private paraModelo(texto: string): unknown {
    if (this.tipo() === 'moeda' || this.tipo() === 'inteiro') {
      const d = texto.replace(/\D/g, '');
      return d ? Number(d) : null;
    }
    return texto;
  }
}
