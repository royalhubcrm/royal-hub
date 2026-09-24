import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Marca } from '../../shared/ui/marca';

/** Contato comercial do Royal Hub. Preencha o WhatsApp (só dígitos, com 55 e DDD) para os botões "Falar com a gente" aparecerem. */
const CONTATO_WHATS = '';

/** A página inicial pública (landing page): apresenta o Royal Hub e leva para o login. */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink, Marca],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tema-claro' },
  templateUrl: './inicio.page.html',
  styleUrl: './inicio.page.scss',
})
export default class InicioPage {
  protected readonly ano = new Date().getFullYear();
  protected readonly contato = CONTATO_WHATS
    ? `https://wa.me/${CONTATO_WHATS}?text=${encodeURIComponent('Olá! Quero conhecer o Royal Hub.')}` : '';

  protected readonly recursos = [
    { titulo: 'Leads e funil', texto: 'Cada contato vira um lead com ficha, histórico e etapa. O funil em quadro mostra onde cada negócio está e o que falta para fechar.',
      d: 'M3 5h18l-7 8v6l-4 2v-8z' },
    { titulo: 'Conversas no WhatsApp', texto: 'Toda a equipe atende pelo painel, com a ficha do cliente ao lado. Nada se perde no celular de um corretor.',
      d: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5' },
    { titulo: 'Assistente que atende', texto: 'Responde na hora, com a sua personalidade, qualifica o interesse, sugere imóveis da carteira e marca visitas. Você entra quando vale a pena.',
      d: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z M19 3v4 M17 5h4' },
    { titulo: 'Carteira de imóveis', texto: 'Fotos, endereço por CEP, situação e portais em um cadastro só. Uma folha elegante para o cliente, pronta para imprimir ou mandar em PDF.',
      d: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6' },
    { titulo: 'Site e portais', texto: 'Um site com a sua marca, atualizado com a carteira, e o feed que alimenta os portais. Rascunho por IA para começar em minutos.',
      d: 'M3 5h18v11H3z M9 20h6 M12 16v4 M7 9h10 M7 12h6' },
    { titulo: 'Agenda e equipe', texto: 'Visitas marcadas, clientes parados e perguntas que a assistente deixou para você. Papéis de administrador, gerente e corretor.',
      d: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4 M8 14h3' },
  ];

  protected readonly passos = [
    { titulo: 'Cadastre a imobiliária', texto: 'Nome, corretor responsável, CRECI e a equipe com o papel de cada um. Leva poucos minutos.' },
    { titulo: 'Conecte o WhatsApp', texto: 'Escaneie um QR code na tela de Ajustes, como no WhatsApp Web, ou use a API oficial da Meta. Você escolhe.' },
    { titulo: 'Receba e atenda', texto: 'Leads chegam do anúncio, do formulário, dos portais e do WhatsApp. O funil organiza, a assistente responde, a equipe fecha.' },
  ];

  protected readonly diferenciais = [
    { titulo: 'Fácil de verdade', texto: 'Telas diretas, sem manual. Quem nunca usou um CRM entende em uma tarde.' },
    { titulo: 'Acessível para toda a equipe', texto: 'Funciona no celular, no teclado e com leitor de tela. Contraste alto e modo escuro.' },
    { titulo: 'Tudo integrado', texto: 'Lead, conversa, imóvel, visita e site falam entre si. Nada de copiar dados de um lugar para outro.' },
    { titulo: 'Sua marca em primeiro plano', texto: 'Site, folha de imóveis e formulário de captação com o seu nome. O Royal Hub fica nos bastidores.' },
  ];

  protected readonly perguntas = [
    { p: 'Preciso instalar algo ou manter um servidor?', r: 'Não. O Royal Hub roda no navegador, no computador ou no celular. Só o WhatsApp por QR code pede um computador ligado com a ponte; pela API oficial da Meta, nem isso.' },
    { p: 'Por onde os leads entram?', r: 'Pelo formulário de captação (um link para o anúncio ou a bio), pelo webhook que recebe Meta Lead Ads, Make e Zapier, por planilha importada e pelas conversas do WhatsApp.' },
    { p: 'A assistente responde tudo sozinha?', r: 'Você decide quando ela responde, o tom e as instruções. Dá para desligar por conversa, e as dúvidas que ela não sabe responder ficam na Agenda para a equipe.' },
    { p: 'Minha equipe vê tudo?', r: 'Cada pessoa tem um papel. O corretor vê leads, conversas e imóveis; o gerente acompanha a agenda; o administrador cuida da equipe, do site e dos ajustes.' },
    { p: 'Consigo ter um site com a minha marca?', r: 'Sim. A tela Sites monta um site público com a sua identidade, atualizado com a carteira, com prévia ao vivo e um rascunho inicial por IA.' },
    { p: 'Funciona bem no celular?', r: 'Sim. Todas as telas se adaptam, com alvos de toque maiores, e as páginas públicas para o cliente final foram feitas para o celular primeiro.' },
  ];

  constructor() {
    inject(Meta).updateTag({ name: 'description', content: 'Royal Hub: CRM para imobiliárias com leads, funil, imóveis, WhatsApp com assistente de IA, agenda e sites. Fácil, acessível e com a sua marca.' });
  }
}
