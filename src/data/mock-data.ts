export interface Location {
  id: string;
  name: string;
  address: string;
  is_admin_active: boolean;
  admin_compliance_score: number;
}

export interface Inspection {
  id: string;
  title: string;
  category: 'fire' | 'chimney' | 'gas' | 'hvac';
  next_due_date: string;
  status: 'valid' | 'expired' | 'pending';
  source: 'ckob' | 'internal';
}

export interface Contract {
  id: string;
  service_scope: string;
  vendor_name: string;
  monthly_value: number;
  status: 'active' | 'terminating';
}

export interface Issue {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'resolved';
  is_ai_draft: boolean;
}

export const mockLocation: Location = {
  id: '1',
  name: 'Rezydencja Parkowa',
  address: 'ul. Marszałkowska 12, 00-001 Warszawa',
  is_admin_active: true,
  admin_compliance_score: 100,
};

export const mockInspections: Inspection[] = [
  { id: '1', title: 'Przegląd instalacji przeciwpożarowej', category: 'fire', next_due_date: '2026-04-15', status: 'valid', source: 'ckob' },
  { id: '2', title: 'Przegląd kominiarski – kanały dymowe', category: 'chimney', next_due_date: '2026-03-10', status: 'expired', source: 'ckob' },
  { id: '3', title: 'Przegląd instalacji gazowej', category: 'gas', next_due_date: '2026-05-20', status: 'valid', source: 'internal' },
  { id: '4', title: 'Przegląd klimatyzacji HVAC', category: 'hvac', next_due_date: '2026-04-01', status: 'pending', source: 'ckob' },
  { id: '5', title: 'Kontrola gaśnic i hydrantów', category: 'fire', next_due_date: '2026-06-30', status: 'valid', source: 'internal' },
  { id: '6', title: 'Przegląd wentylacji mechanicznej', category: 'hvac', next_due_date: '2026-02-28', status: 'expired', source: 'ckob' },
];

export const mockContracts: Contract[] = [
  { id: '1', service_scope: 'Konserwacja wind', vendor_name: 'LiftTech Sp. z o.o.', monthly_value: 2400, status: 'active' },
  { id: '2', service_scope: 'Sprzątanie części wspólnych', vendor_name: 'CleanPro S.A.', monthly_value: 3800, status: 'active' },
  { id: '3', service_scope: 'Ochrona obiektu', vendor_name: 'SecureGuard Sp. z o.o.', monthly_value: 5200, status: 'terminating' },
  { id: '4', service_scope: 'Konserwacja instalacji elektrycznej', vendor_name: 'ElektroServis', monthly_value: 1800, status: 'active' },
];

export const mockIssues: Issue[] = [
  { id: '1', title: 'Awaria pompy ciepła w budynku A', status: 'open', is_ai_draft: false },
  { id: '2', title: 'Uszkodzony domofon – klatka 3', status: 'in_progress', is_ai_draft: false },
  { id: '3', title: 'Wilgoć w piwnicy – sektor B2', status: 'open', is_ai_draft: true },
  { id: '4', title: 'Wymiana oświetlenia LED – parking', status: 'resolved', is_ai_draft: false },
  { id: '5', title: 'Nieszczelność dachu – segment C', status: 'open', is_ai_draft: true },
];
