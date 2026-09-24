-- QR code da ponte aparece em Ajustes → WhatsApp (a ponte manda, a tela mostra).
alter table crm.config
  add column if not exists ponte_qr text,
  add column if not exists ponte_qr_em timestamptz,
  add column if not exists ponte_numero text not null default '';
