export type LegalEntityKind =
  | "housing_community"
  | "housing_cooperative"
  | "property_manager"
  | "company";

export const LEGAL_ENTITY_KIND_LABELS: Record<LegalEntityKind, string> = {
  housing_community: "Wspólnota mieszkaniowa",
  housing_cooperative: "Spółdzielnia mieszkaniowa",
  property_manager: "Zarządca nieruchomości",
  company: "Firma",
};

export const HOUSING_KINDS: LegalEntityKind[] = [
  "housing_community",
  "housing_cooperative",
];

export const COMPANY_KINDS: LegalEntityKind[] = ["company", "property_manager"];

export type AddressOwner = {
  ownerNip?: string;
  ownerName?: string;
};

export function legalEntityErrorMessage(
  code: string,
  owner?: AddressOwner | null,
): string {
  switch (code) {
    case "invalid_nip":
      return "Niepoprawny NIP. Sprawdź sumę kontrolną i 10 cyfr.";
    case "not_in_gus":
      return "Nie znaleziono podmiotu w GUS. Zapis bez GUS jest możliwy tylko dla administratora platformy DOMIO.";
    case "gus_inactive":
      return "Podmiot w GUS jest wykreślony. Nie można go dodać.";
    case "NOT_IN_GUS":
      return "Nie znaleziono podmiotu w GUS.";
    case "GUS_INACTIVE":
      return "Podmiot w GUS jest wykreślony.";
    case "GUS_NOT_CONFIGURED":
      return "Wyszukiwanie GUS nie jest skonfigurowane. Skontaktuj się z administratorem platformy DOMIO.";
    case "ADDRESS_OWNED_BY_OTHER_ENTITY": {
      const name = owner?.ownerName?.trim();
      const nip = owner?.ownerNip?.trim();
      if (name && nip) {
        return `Ten adres jest już przypisany do ${name} (NIP ${nip}).`;
      }
      return "Ten adres jest już przypisany do innego podmiotu.";
    }
    case "LEGAL_ENTITY_INCOMPLETE_DATA":
      return "Uzupełnij e-mail, telefon i dane z GUS. Niekompletnego podmiotu nie zapisujemy.";
    case "LEGAL_ENTITY_NOT_ENROLLED":
      return "Najpierw dodaj podmiot do organizacji.";
    case "BUILDING_ADDRESS_REQUIRED":
      return "Wybierz adres z Google Places.";
    case "DUPLICATE_BUILDING":
      return "Ten adres istnieje już w systemie DOMIO.";
    default:
      return "Nie udało się wykonać operacji. Spróbuj ponownie.";
  }
}
