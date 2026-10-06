/**
 * Resident-order e-mail templates are stored and filled with technical
 * tokens such as {{org.name}}. The settings form shows short Polish tokens
 * such as #nazwa_firmy and converts both ways on load and save.
 */

export type ResidentOrderTemplateTokenGroup = "order" | "place" | "resident" | "sender" | "extra";

export interface ResidentOrderTemplateToken {
  technical: string;
  friendly: string;
  label: string;
  group: ResidentOrderTemplateTokenGroup;
}

export const RESIDENT_ORDER_TEMPLATE_TOKENS: readonly ResidentOrderTemplateToken[] = [
  { technical: "{{item.name}}", friendly: "#nazwa_pozycji", label: "nazwa zamówionej rzeczy", group: "order" },
  { technical: "{{order.quantity}}", friendly: "#ilosc", label: "liczba sztuk", group: "order" },
  { technical: "{{item.price_label}}", friendly: "#cena", label: "cena z katalogu", group: "order" },
  { technical: "{{order.notes}}", friendly: "#uwagi", label: "uwagi dopisane przez mieszkańca", group: "order" },
  { technical: "{{order.number}}", friendly: "#numer_zamowienia", label: "numer tego zamówienia", group: "order" },
  { technical: "{{order.created_at}}", friendly: "#data_zamowienia", label: "data i godzina złożenia", group: "order" },
  { technical: "{{building.address}}", friendly: "#adres_budynku", label: "adres budynku", group: "place" },
  { technical: "{{unit.number}}", friendly: "#numer_lokalu", label: "numer mieszkania", group: "place" },
  { technical: "{{resident.full_name}}", friendly: "#mieszkaniec", label: "imię i nazwisko", group: "resident" },
  { technical: "{{resident.phone}}", friendly: "#telefon_mieszkanca", label: "telefon", group: "resident" },
  { technical: "{{resident.email}}", friendly: "#email_mieszkanca", label: "adres e-mail", group: "resident" },
  { technical: "{{org.name}}", friendly: "#nazwa_firmy", label: "nazwa firmy, która wysyła zamówienie", group: "sender" },
  { technical: "{{item.description}}", friendly: "#opis_pozycji", label: "opis pozycji z katalogu", group: "extra" },
  { technical: "{{building.name}}", friendly: "#nazwa_budynku", label: "nazwa budynku", group: "extra" },
  { technical: "{{community.name}}", friendly: "#nazwa_wspolnoty", label: "nazwa wspólnoty", group: "extra" },
  { technical: "{{community.legal_name}}", friendly: "#pelna_nazwa_wspolnoty", label: "pełna nazwa wspólnoty", group: "extra" },
  { technical: "{{community.nip}}", friendly: "#nip_wspolnoty", label: "NIP wspólnoty", group: "extra" },
  { technical: "{{community.board_email}}", friendly: "#email_zarzadu", label: "e-mail zarządu", group: "extra" },
  { technical: "{{org.nip}}", friendly: "#nip_firmy", label: "NIP Twojej firmy", group: "extra" },
  { technical: "{{org.address}}", friendly: "#adres_firmy", label: "adres Twojej firmy", group: "extra" },
  { technical: "{{org.support_email}}", friendly: "#email_firmy", label: "e-mail Twojej firmy", group: "extra" },
  { technical: "{{order.contact_name}}", friendly: "#osoba_kontaktowa", label: "inna osoba do kontaktu, jeśli podana", group: "extra" },
  { technical: "{{order.contact_phone}}", friendly: "#telefon_kontaktowy", label: "telefon osoby kontaktowej", group: "extra" },
  { technical: "{{order.contact_email}}", friendly: "#email_kontaktowy", label: "e-mail osoby kontaktowej", group: "extra" },
  { technical: "{{order.id}}", friendly: "#id_zamowienia", label: "wewnętrzny identyfikator", group: "extra" },
];

/** Factory copy still stored for communities that never edited the template. */
export const RESIDENT_ORDER_FACTORY_SUBJECT =
  "[DOMIO {{order.number}}] Zamówienie: {{item.name}} — {{building.address}}, lokal {{unit.number}}";

export const RESIDENT_ORDER_FACTORY_BODY = `Dzień dobry,

Prosimy o realizację zamówienia złożonego przez mieszkańca.

Administracja
{{org.name}}
NIP: {{org.nip}}
Adres: {{org.address}}
E-mail: {{org.support_email}}

Wspólnota
{{community.name}}
{{community.legal_name}}
NIP: {{community.nip}}
E-mail zarządu: {{community.board_email}}

Budynek i lokal
{{building.name}}
{{building.address}}
Lokal: {{unit.number}}

Zamawiający
{{resident.full_name}}
E-mail: {{resident.email}}
Telefon: {{resident.phone}}

Kontakt dla realizacji (opcjonalny)
{{order.contact_name}}
{{order.contact_phone}}
{{order.contact_email}}

Pozycja
{{item.name}}
{{item.description}}
Ilość: {{order.quantity}}
Cena: {{item.price_label}}

Uwagi
{{order.notes}}

Numer zamówienia: {{order.number}}
Data: {{order.created_at}}

W odpowiedzi podaj numer zamówienia: {{order.number}}
oraz czy zamówienie jest przyjęte, gotowe albo odrzucone.`;

export const RESIDENT_ORDER_SIMPLE_SUBJECT =
  "[DOMIO #numer_zamowienia] Zamówienie: #nazwa_pozycji — #adres_budynku, lokal #numer_lokalu";

export const RESIDENT_ORDER_SIMPLE_BODY = `Dzień dobry,

prosimy o realizację zamówienia.

Co zamówiono: #nazwa_pozycji
Ile sztuk: #ilosc
Cena: #cena
Uwagi: #uwagi

Adres: #adres_budynku
Lokal: #numer_lokalu

Mieszkaniec: #mieszkaniec
Telefon: #telefon_mieszkanca
E-mail: #email_mieszkanca

Numer zamówienia: #numer_zamowienia
Data: #data_zamowienia

W odpowiedzi podaj numer zamówienia: #numer_zamowienia
oraz czy zamówienie jest przyjęte, gotowe albo odrzucone.

Pozdrawiamy
#nazwa_firmy`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTemplate(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

export function residentOrderTemplateToFriendly(template: string): string {
  return RESIDENT_ORDER_TEMPLATE_TOKENS.reduce(
    (text, token) => text.replaceAll(token.technical, token.friendly),
    template,
  );
}

export function residentOrderTemplateToTechnical(template: string): string {
  const tokens = [...RESIDENT_ORDER_TEMPLATE_TOKENS].sort((a, b) => b.friendly.length - a.friendly.length);
  return tokens.reduce((text, token) => {
    const pattern = new RegExp(`(?<![\\w#])${escapeRegExp(token.friendly)}(?![\\w])`, "g");
    return text.replace(pattern, token.technical);
  }, template);
}

export function isFactoryResidentOrderTemplate(subject: string, body: string): boolean {
  return (
    normalizeTemplate(subject) === RESIDENT_ORDER_FACTORY_SUBJECT &&
    normalizeTemplate(body) === RESIDENT_ORDER_FACTORY_BODY
  );
}

export function insertResidentOrderToken(
  value: string,
  token: string,
  start: number,
  end: number,
): { value: string; cursor: number } {
  const max = value.length;
  const from = Math.max(0, Math.min(start, end, max));
  const to = Math.max(0, Math.min(Math.max(start, end), max));
  const prefix = value.slice(0, from);
  const suffix = value.slice(to);
  const lead = prefix.length > 0 && !/\s$/u.test(prefix) ? " " : "";
  const trail = suffix.length > 0 && !/^\s/u.test(suffix) ? " " : "";
  const inserted = `${lead}${token}${trail}`;
  return {
    value: `${prefix}${inserted}${suffix}`,
    cursor: prefix.length + inserted.length,
  };
}
