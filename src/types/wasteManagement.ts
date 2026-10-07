/**
 * DOMIO Home - Waste Management Types
 * Typy dla modułu Gospodarki Odpadami
 */

export type WasteType = 
  | 'bulk'      // Gabaryty
  | 'mixed'     // Zmieszane (czarny)
  | 'plastic'   // Plastik/metal (żółty)
  | 'paper'     // Papier (niebieski)
  | 'glass'     // Szkło (zielony)
  | 'bio';      // Bio (brązowy)

export type WasteCategory = 
  | 'plastic' 
  | 'paper' 
  | 'glass' 
  | 'bio' 
  | 'mixed' 
  | 'bulk' 
  | 'hazardous' 
  | 'pharmacy' 
  | 'pszok'
  | 'electronics'
  | 'textiles';

export type DataSource = 'manual' | 'city_api' | 'city_scraper';

export type SyncStatus = 'success' | 'error' | 'partial';

// ============================================================================
// Database Row Types
// ============================================================================

export interface WasteCollectionScheduleRow {
  id: string;
  org_id: string;
  location_id: string;
  waste_type: WasteType;
  collection_date: string; // ISO date YYYY-MM-DD
  collection_time_from: string | null; // HH:MM:SS
  collection_time_until: string | null; // HH:MM:SS
  data_source: DataSource;
  city_adapter: string | null;
  street_name: string | null;
  building_number: string | null;
  is_confirmed: boolean;
  is_cancelled: boolean;
  cancellation_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  last_synced_at: string | null;
}

export interface WasteGuideItemRow {
  id: string;
  org_id: string | null;
  item_name_pl: string;
  item_keywords: string[];
  waste_category: WasteCategory;
  disposal_instructions: string | null;
  additional_notes: string | null;
  requires_special_location: boolean;
  special_location_type: 'pszok' | 'pharmacy' | 'recycling_point' | null;
  special_location_addresses: SpecialLocation[];
  display_order: number;
  is_popular: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface WasteScheduleSyncLogRow {
  id: string;
  location_id: string;
  city_adapter: string;
  sync_status: SyncStatus;
  records_added: number;
  records_updated: number;
  error_message: string | null;
  synced_at: string;
  synced_by: string | null;
}

// ============================================================================
// Application Types (camelCase)
// ============================================================================

export interface WasteCollectionSchedule {
  id: string;
  orgId: string;
  locationId: string;
  wasteType: WasteType;
  collectionDate: string; // ISO date
  collectionTimeFrom: string | null; // HH:MM
  collectionTimeUntil: string | null;
  dataSource: DataSource;
  cityAdapter: string | null;
  streetName: string | null;
  buildingNumber: string | null;
  isConfirmed: boolean;
  isCancelled: boolean;
  cancellationNote: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  lastSyncedAt: string | null;
}

export interface WasteGuideItem {
  id: string;
  orgId: string | null;
  itemNamePl: string;
  itemKeywords: string[];
  wasteCategory: WasteCategory;
  disposalInstructions: string | null;
  additionalNotes: string | null;
  requiresSpecialLocation: boolean;
  specialLocationType: 'pszok' | 'pharmacy' | 'recycling_point' | null;
  specialLocationAddresses: SpecialLocation[];
  displayOrder: number;
  isPopular: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WasteScheduleSyncLog {
  id: string;
  locationId: string;
  cityAdapter: string;
  syncStatus: SyncStatus;
  recordsAdded: number;
  recordsUpdated: number;
  errorMessage: string | null;
  syncedAt: string;
  syncedBy: string | null;
}

export interface SpecialLocation {
  name: string;
  address: string;
  city?: string;
  phone?: string;
  hours?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface CityAdapterResponse {
  success: boolean;
  schedules: Array<{
    wasteType: WasteType;
    collectionDate: string;
    collectionTimeFrom?: string;
    collectionTimeUntil?: string;
  }>;
  error?: string;
  source?: string;
}

export interface WasteSyncResult {
  success: boolean;
  recordsAdded: number;
  recordsUpdated: number;
  error?: string;
  logId?: string;
}

// ============================================================================
// City Adapter Interface
// ============================================================================

export interface ICityWasteAdapter {
  cityName: string;
  adapterKey: string; // 'lodz', 'warszawa', etc.
  
  /**
   * Fetch waste collection schedule from city source
   */
  fetchSchedule(street: string, buildingNumber: string): Promise<CityAdapterResponse>;
  
  /**
   * Check if address is supported by this adapter
   */
  isAddressSupported(street: string): boolean;
  
  /**
   * Get list of supported streets (optional, for autocomplete)
   */
  getSupportedStreets?(): Promise<string[]>;
}

// ============================================================================
// UI Helper Types
// ============================================================================

export interface WasteTypeConfig {
  type: WasteType;
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  description: string;
}

export interface WasteCategoryConfig {
  category: WasteCategory;
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  containerLabel: string;
}

// ============================================================================
// Form Types
// ============================================================================

export interface WasteScheduleFormData {
  wasteType: WasteType;
  collectionDate: Date;
  collectionTimeFrom?: string;
  collectionTimeUntil?: string;
  notes?: string;
}

export interface WasteGuideFormData {
  itemNamePl: string;
  itemKeywords: string[];
  wasteCategory: WasteCategory;
  disposalInstructions?: string;
  additionalNotes?: string;
  requiresSpecialLocation: boolean;
  specialLocationType?: 'pszok' | 'pharmacy' | 'recycling_point';
  specialLocationAddresses?: SpecialLocation[];
  isPopular: boolean;
}

// ============================================================================
// Mapper Functions
// ============================================================================

export function mapScheduleRowToSchedule(row: WasteCollectionScheduleRow): WasteCollectionSchedule {
  return {
    id: row.id,
    orgId: row.org_id,
    locationId: row.location_id,
    wasteType: row.waste_type,
    collectionDate: row.collection_date,
    collectionTimeFrom: row.collection_time_from ? row.collection_time_from.substring(0, 5) : null,
    collectionTimeUntil: row.collection_time_until ? row.collection_time_until.substring(0, 5) : null,
    dataSource: row.data_source,
    cityAdapter: row.city_adapter,
    streetName: row.street_name,
    buildingNumber: row.building_number,
    isConfirmed: row.is_confirmed,
    isCancelled: row.is_cancelled,
    cancellationNote: row.cancellation_note,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    lastSyncedAt: row.last_synced_at,
  };
}

export function mapSyncLogRowToSyncLog(row: WasteScheduleSyncLogRow): WasteScheduleSyncLog {
  return {
    id: row.id,
    locationId: row.location_id,
    cityAdapter: row.city_adapter,
    syncStatus: row.sync_status,
    recordsAdded: row.records_added,
    recordsUpdated: row.records_updated,
    errorMessage: row.error_message,
    syncedAt: row.synced_at,
    syncedBy: row.synced_by,
  };
}

export function mapGuideItemRowToGuideItem(row: WasteGuideItemRow): WasteGuideItem {
  return {
    id: row.id,
    orgId: row.org_id,
    itemNamePl: row.item_name_pl,
    itemKeywords: row.item_keywords,
    wasteCategory: row.waste_category,
    disposalInstructions: row.disposal_instructions,
    additionalNotes: row.additional_notes,
    requiresSpecialLocation: row.requires_special_location,
    specialLocationType: row.special_location_type,
    specialLocationAddresses: row.special_location_addresses,
    displayOrder: row.display_order,
    isPopular: row.is_popular,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
