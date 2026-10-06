/**
 * DOMIO Home - Waste Management Constants
 * Konfiguracja typów odpadów i kategorii
 */

import type { WasteType, WasteCategory, WasteTypeConfig, WasteCategoryConfig } from "@/types/wasteManagement";
import {
  Trash2,
  Recycle,
  FileText,
  Wine,
  Leaf,
  Sofa,
  Skull,
  Cross,
  MapPin,
  Zap,
  Shirt,
} from "lucide-react";

// ============================================================================
// Konfiguracja typów odpadów (harmonogram)
// ============================================================================

export const WASTE_TYPE_CONFIGS: Record<WasteType, WasteTypeConfig> = {
  bulk: {
    type: 'bulk',
    label: 'Gabaryty',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    icon: 'Sofa',
    description: 'Meble, materace, duże przedmioty',
  },
  mixed: {
    type: 'mixed',
    label: 'Zmieszane',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'Trash2',
    description: 'Pojemnik czarny',
  },
  plastic: {
    type: 'plastic',
    label: 'Metale i tworzywa sztuczne',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    icon: 'Recycle',
    description: 'Pojemnik żółty',
  },
  paper: {
    type: 'paper',
    label: 'Papier',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'FileText',
    description: 'Pojemnik niebieski',
  },
  glass: {
    type: 'glass',
    label: 'Szkło',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'Wine',
    description: 'Pojemnik zielony',
  },
  bio: {
    type: 'bio',
    label: 'Bio',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'Leaf',
    description: 'Pojemnik brązowy',
  },
};

// ============================================================================
// Konfiguracja kategorii odpadów (przewodnik)
// ============================================================================

export const WASTE_CATEGORY_CONFIGS: Record<WasteCategory, WasteCategoryConfig> = {
  plastic: {
    category: 'plastic',
    label: 'Metale i tworzywa sztuczne',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    icon: 'Recycle',
    containerLabel: 'Żółty pojemnik',
  },
  paper: {
    category: 'paper',
    label: 'Papier',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'FileText',
    containerLabel: 'Niebieski pojemnik',
  },
  glass: {
    category: 'glass',
    label: 'Szkło',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'Wine',
    containerLabel: 'Zielony pojemnik',
  },
  bio: {
    category: 'bio',
    label: 'Bio',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'Leaf',
    containerLabel: 'Brązowy pojemnik',
  },
  mixed: {
    category: 'mixed',
    label: 'Zmieszane',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'Trash2',
    containerLabel: 'Czarny pojemnik',
  },
  bulk: {
    category: 'bulk',
    label: 'Gabaryty',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    icon: 'Sofa',
    containerLabel: 'Altana śmietnikowa',
  },
  hazardous: {
    category: 'hazardous',
    label: 'Odpady niebezpieczne',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'Skull',
    containerLabel: 'PSZOK',
  },
  pharmacy: {
    category: 'pharmacy',
    label: 'Leki i baterie',
    color: 'text-rose-700',
    bgColor: 'bg-rose-100',
    icon: 'Cross',
    containerLabel: 'Apteka',
  },
  pszok: {
    category: 'pszok',
    label: 'PSZOK',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    icon: 'MapPin',
    containerLabel: 'Punkt Selektywnej Zbiórki Odpadów Komunalnych',
  },
  electronics: {
    category: 'electronics',
    label: 'Elektronika',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-100',
    icon: 'Zap',
    containerLabel: 'PSZOK / Sklep RTV/AGD',
  },
  textiles: {
    category: 'textiles',
    label: 'Tekstylia',
    color: 'text-teal-700',
    bgColor: 'bg-teal-100',
    icon: 'Shirt',
    containerLabel: 'Kontener na odzież',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

export function getWasteTypeConfig(type: WasteType): WasteTypeConfig {
  return WASTE_TYPE_CONFIGS[type];
}

export function getWasteCategoryConfig(category: WasteCategory): WasteCategoryConfig {
  return WASTE_CATEGORY_CONFIGS[category];
}

export function getWasteTypeLabel(type: WasteType): string {
  return WASTE_TYPE_CONFIGS[type]?.label ?? type;
}

export function getWasteCategoryLabel(category: WasteCategory): string {
  return WASTE_CATEGORY_CONFIGS[category]?.label ?? category;
}

// ============================================================================
// Ikony dla kategorii (export dla łatwego użycia w komponentach)
// ============================================================================

export const WasteIcons = {
  Trash2,
  Recycle,
  FileText,
  Wine,
  Leaf,
  Sofa,
  Skull,
  Cross,
  MapPin,
  Zap,
  Shirt,
};
