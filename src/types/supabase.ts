export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_contracts: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string
          location_id: string | null
          monthly_value: number | null
          notice_period_days: number | null
          org_id: string
          service_scope: string
          start_date: string
          status: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          location_id?: string | null
          monthly_value?: number | null
          notice_period_days?: number | null
          org_id: string
          service_scope: string
          start_date: string
          status?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          location_id?: string | null
          monthly_value?: number | null
          notice_period_days?: number | null
          org_id?: string
          service_scope?: string
          start_date?: string
          status?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_contracts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_contracts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          api_url: string | null
          created_at: string | null
          domain_url: string
          id: string
          is_active: boolean | null
          is_free: boolean | null
          name: string
        }
        Insert: {
          api_url?: string | null
          created_at?: string | null
          domain_url: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name: string
        }
        Update: {
          api_url?: string | null
          created_at?: string | null
          domain_url?: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name?: string
        }
        Relationships: []
      }
      cleaning_catalog: {
        Row: {
          created_at: string | null
          id: string
          name: string
          org_id: string
          unit: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          org_id: string
          unit: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
          unit?: string
        }
        Relationships: []
      }
      cleaning_clients: {
        Row: {
          contract_details: Json | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          org_id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          contract_details?: Json | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          org_id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          contract_details?: Json | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cleaning_inventory: {
        Row: {
          catalog_item_id: string | null
          current_quantity: number | null
          id: string
          item_name: string
          last_restock_at: string | null
          location_id: string | null
          min_threshold: number | null
          org_id: string
          unit: string | null
        }
        Insert: {
          catalog_item_id?: string | null
          current_quantity?: number | null
          id?: string
          item_name: string
          last_restock_at?: string | null
          location_id?: string | null
          min_threshold?: number | null
          org_id: string
          unit?: string | null
        }
        Update: {
          catalog_item_id?: string | null
          current_quantity?: number | null
          id?: string
          item_name?: string
          last_restock_at?: string | null
          location_id?: string | null
          min_threshold?: number | null
          org_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_inventory_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "cleaning_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_locations: {
        Row: {
          access_code: string | null
          access_codes: string | null
          address: string
          admin_compliance_score: number | null
          admin_contacts: Json | null
          auto_notify_issues: boolean | null
          billing_details: string | null
          board_portal_token: string
          c_kob_building_id: string | null
          cleaning_rate: number | null
          client_id: string | null
          client_notification_email: string | null
          community_id: string | null
          coordinator_can_view_financials: boolean | null
          coordinator_notes: string | null
          created_at: string | null
          geo_location: unknown
          geofence_radius_meters: number | null
          google_place_id: string | null
          hourly_rate_cleaning: number | null
          hourly_rate_snow: number | null
          id: string
          instruction_notes: string | null
          is_active_in_serwis: boolean | null
          is_admin_active: boolean | null
          is_cleaning_active: boolean | null
          is_maintenance_active: boolean | null
          issue_qr_token: string | null
          latitude: number | null
          location_master_id: string | null
          longitude: number | null
          maintenance_notes: string | null
          monthly_fee: number | null
          monthly_salary: number | null
          name: string | null
          org_id: string
          place_id: string | null
          preferred_contractor_id: string | null
          public_report_token: string
          qr_code_token: string | null
          require_gps_validation_serwis: boolean | null
          serwis_contacts: Json | null
          serwis_notes: string | null
          snow_removal_rate: number | null
          square_meters: number | null
          status: string | null
          ticket_routing_preference: string | null
          validation_config: Json | null
          visibility_config: Json | null
        }
        Insert: {
          access_code?: string | null
          access_codes?: string | null
          address: string
          admin_compliance_score?: number | null
          admin_contacts?: Json | null
          auto_notify_issues?: boolean | null
          billing_details?: string | null
          board_portal_token?: string
          c_kob_building_id?: string | null
          cleaning_rate?: number | null
          client_id?: string | null
          client_notification_email?: string | null
          community_id?: string | null
          coordinator_can_view_financials?: boolean | null
          coordinator_notes?: string | null
          created_at?: string | null
          geo_location?: unknown
          geofence_radius_meters?: number | null
          google_place_id?: string | null
          hourly_rate_cleaning?: number | null
          hourly_rate_snow?: number | null
          id?: string
          instruction_notes?: string | null
          is_active_in_serwis?: boolean | null
          is_admin_active?: boolean | null
          is_cleaning_active?: boolean | null
          is_maintenance_active?: boolean | null
          issue_qr_token?: string | null
          latitude?: number | null
          location_master_id?: string | null
          longitude?: number | null
          maintenance_notes?: string | null
          monthly_fee?: number | null
          monthly_salary?: number | null
          name?: string | null
          org_id: string
          place_id?: string | null
          preferred_contractor_id?: string | null
          public_report_token?: string
          qr_code_token?: string | null
          require_gps_validation_serwis?: boolean | null
          serwis_contacts?: Json | null
          serwis_notes?: string | null
          snow_removal_rate?: number | null
          square_meters?: number | null
          status?: string | null
          ticket_routing_preference?: string | null
          validation_config?: Json | null
          visibility_config?: Json | null
        }
        Update: {
          access_code?: string | null
          access_codes?: string | null
          address?: string
          admin_compliance_score?: number | null
          admin_contacts?: Json | null
          auto_notify_issues?: boolean | null
          billing_details?: string | null
          board_portal_token?: string
          c_kob_building_id?: string | null
          cleaning_rate?: number | null
          client_id?: string | null
          client_notification_email?: string | null
          community_id?: string | null
          coordinator_can_view_financials?: boolean | null
          coordinator_notes?: string | null
          created_at?: string | null
          geo_location?: unknown
          geofence_radius_meters?: number | null
          google_place_id?: string | null
          hourly_rate_cleaning?: number | null
          hourly_rate_snow?: number | null
          id?: string
          instruction_notes?: string | null
          is_active_in_serwis?: boolean | null
          is_admin_active?: boolean | null
          is_cleaning_active?: boolean | null
          is_maintenance_active?: boolean | null
          issue_qr_token?: string | null
          latitude?: number | null
          location_master_id?: string | null
          longitude?: number | null
          maintenance_notes?: string | null
          monthly_fee?: number | null
          monthly_salary?: number | null
          name?: string | null
          org_id?: string
          place_id?: string | null
          preferred_contractor_id?: string | null
          public_report_token?: string
          qr_code_token?: string | null
          require_gps_validation_serwis?: boolean | null
          serwis_contacts?: Json | null
          serwis_notes?: string | null
          snow_removal_rate?: number | null
          square_meters?: number | null
          status?: string | null
          ticket_routing_preference?: string | null
          validation_config?: Json | null
          visibility_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "cleaning_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_locations_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_locations_location_master_id_fkey"
            columns: ["location_master_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_staff: {
        Row: {
          contact_email: string | null
          created_at: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          employment_type: string | null
          full_name: string
          id: string
          internal_id: string | null
          is_active: boolean | null
          notes: string | null
          org_id: string | null
          phone: string | null
          pin: string | null
          status: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employment_type?: string | null
          full_name: string
          id?: string
          internal_id?: string | null
          is_active?: boolean | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          pin?: string | null
          status?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employment_type?: string | null
          full_name?: string
          id?: string
          internal_id?: string | null
          is_active?: boolean | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          pin?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_staff_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_tasks: {
        Row: {
          actual_performer_id: string | null
          applied_hourly_rate: number | null
          assigned_staff_id: string | null
          check_in_metadata: Json | null
          check_out_metadata: Json | null
          checklist: Json | null
          completed_at: string | null
          coordinator_notes: string | null
          created_at: string | null
          id: string
          is_paid: boolean | null
          location_id: string | null
          org_id: string
          priority: Database["public"]["Enums"]["priority_level"] | null
          scheduled_at: string
          section_id: string | null
          staff_notes: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_type: Database["public"]["Enums"]["task_type"]
          total_cost: number | null
        }
        Insert: {
          actual_performer_id?: string | null
          applied_hourly_rate?: number | null
          assigned_staff_id?: string | null
          check_in_metadata?: Json | null
          check_out_metadata?: Json | null
          checklist?: Json | null
          completed_at?: string | null
          coordinator_notes?: string | null
          created_at?: string | null
          id?: string
          is_paid?: boolean | null
          location_id?: string | null
          org_id: string
          priority?: Database["public"]["Enums"]["priority_level"] | null
          scheduled_at: string
          section_id?: string | null
          staff_notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: Database["public"]["Enums"]["task_type"]
          total_cost?: number | null
        }
        Update: {
          actual_performer_id?: string | null
          applied_hourly_rate?: number | null
          assigned_staff_id?: string | null
          check_in_metadata?: Json | null
          check_out_metadata?: Json | null
          checklist?: Json | null
          completed_at?: string | null
          coordinator_notes?: string | null
          created_at?: string | null
          id?: string
          is_paid?: boolean | null
          location_id?: string | null
          org_id?: string
          priority?: Database["public"]["Enums"]["priority_level"] | null
          scheduled_at?: string
          section_id?: string | null
          staff_notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_type?: Database["public"]["Enums"]["task_type"]
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_tasks_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "property_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          access_codes: Json
          board_email: string | null
          board_members: Json
          created_at: string
          financial_details: Json
          id: string
          legal_name: string | null
          name: string
          nip: string | null
          operational_notes: Json
          org_id: string
          regon: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          access_codes?: Json
          board_email?: string | null
          board_members?: Json
          created_at?: string
          financial_details?: Json
          id?: string
          legal_name?: string | null
          name: string
          nip?: string | null
          operational_notes?: Json
          org_id: string
          regon?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          access_codes?: Json
          board_email?: string | null
          board_members?: Json
          created_at?: string
          financial_details?: Json
          id?: string
          legal_name?: string | null
          name?: string
          nip?: string | null
          operational_notes?: Json
          org_id?: string
          regon?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      community_board: {
        Row: {
          author_id: string
          content: string
          created_at: string
          event_date: string | null
          expires_at: string | null
          id: string
          is_free: boolean
          location_id: string
          org_id: string
          post_type: Database["public"]["Enums"]["community_post_type"]
          price: number | null
          status: Database["public"]["Enums"]["community_post_status"]
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          event_date?: string | null
          expires_at?: string | null
          id?: string
          is_free?: boolean
          location_id: string
          org_id: string
          post_type: Database["public"]["Enums"]["community_post_type"]
          price?: number | null
          status?: Database["public"]["Enums"]["community_post_status"]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          event_date?: string | null
          expires_at?: string | null
          id?: string
          is_free?: boolean
          location_id?: string
          org_id?: string
          post_type?: Database["public"]["Enums"]["community_post_type"]
          price?: number | null
          status?: Database["public"]["Enums"]["community_post_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_board_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_board_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_board_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          category: Database["public"]["Enums"]["company_category"]
          created_at: string
          email: string | null
          id: string
          name: string
          org_id: string | null
          phone: string | null
          tax_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          category: Database["public"]["Enums"]["company_category"]
          created_at?: string
          email?: string | null
          id?: string
          name: string
          org_id?: string | null
          phone?: string | null
          tax_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: Database["public"]["Enums"]["company_category"]
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_id?: string | null
          phone?: string | null
          tax_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      e_board_messages: {
        Row: {
          audience: string | null
          author_id: string | null
          community_id: string | null
          content: string
          created_at: string | null
          created_by: string | null
          display_from: string | null
          display_until: string | null
          id: string
          is_active: boolean | null
          location_id: string | null
          msg_type: Database["public"]["Enums"]["eboard_msg_type"]
          org_id: string
          status: Database["public"]["Enums"]["eboard_msg_status"]
          title: string
          valid_until: string | null
        }
        Insert: {
          audience?: string | null
          author_id?: string | null
          community_id?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          display_from?: string | null
          display_until?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          msg_type?: Database["public"]["Enums"]["eboard_msg_type"]
          org_id: string
          status?: Database["public"]["Enums"]["eboard_msg_status"]
          title: string
          valid_until?: string | null
        }
        Update: {
          audience?: string | null
          author_id?: string | null
          community_id?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          display_from?: string | null
          display_until?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          msg_type?: Database["public"]["Enums"]["eboard_msg_type"]
          org_id?: string
          status?: Database["public"]["Enums"]["eboard_msg_status"]
          title?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "e_board_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "e_board_messages_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "e_board_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "e_board_messages_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_logs: {
        Row: {
          cost: number
          created_at: string
          current_mileage: number
          date: string
          driver_id: string
          fuel_type: string
          id: string
          liters: number
          org_id: string
          vehicle_id: string
        }
        Insert: {
          cost: number
          created_at?: string
          current_mileage: number
          date?: string
          driver_id: string
          fuel_type: string
          id?: string
          liters: number
          org_id: string
          vehicle_id: string
        }
        Update: {
          cost?: number
          created_at?: string
          current_mileage?: number
          date?: string
          driver_id?: string
          fuel_type?: string
          id?: string
          liters?: number
          org_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_active_notifications"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_campaigns: {
        Row: {
          category: string
          created_at: string
          e_board_message_id: string | null
          end_date: string
          end_time: string | null
          id: string
          location_id: string
          org_id: string
          start_date: string
          start_time: string | null
          title: string
          vendor_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          e_board_message_id?: string | null
          end_date: string
          end_time?: string | null
          id?: string
          location_id: string
          org_id: string
          start_date: string
          start_time?: string | null
          title: string
          vendor_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          e_board_message_id?: string | null
          end_date?: string
          end_time?: string | null
          id?: string
          location_id?: string
          org_id?: string
          start_date?: string
          start_time?: string | null
          title?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_campaigns_e_board_message_id_fkey"
            columns: ["e_board_message_id"]
            isOneToOne: false
            referencedRelation: "e_board_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_campaigns_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_campaigns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          attachments: Json | null
          created_at: string | null
          external_id: string | null
          id: string
          last_date: string | null
          location_id: string | null
          next_due_date: string | null
          source: string | null
          status: string | null
          title: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          last_date?: string | null
          location_id?: string | null
          next_due_date?: string | null
          source?: string | null
          status?: string | null
          title: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          last_date?: string | null
          location_id?: string | null
          next_due_date?: string | null
          source?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections_hybrid: {
        Row: {
          assigned_vendor_id: string | null
          attachments: Json | null
          category: string
          created_at: string | null
          external_id: string | null
          id: string
          last_inspection_date: string | null
          location_id: string | null
          next_due_date: string
          org_id: string
          source: string | null
          status: string | null
          title: string
        }
        Insert: {
          assigned_vendor_id?: string | null
          attachments?: Json | null
          category: string
          created_at?: string | null
          external_id?: string | null
          id?: string
          last_inspection_date?: string | null
          location_id?: string | null
          next_due_date: string
          org_id: string
          source?: string | null
          status?: string | null
          title: string
        }
        Update: {
          assigned_vendor_id?: string | null
          attachments?: Json | null
          category?: string
          created_at?: string | null
          external_id?: string | null
          id?: string
          last_inspection_date?: string | null
          location_id?: string | null
          next_due_date?: string
          org_id?: string
          source?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_hybrid_assigned_vendor_id_fkey"
            columns: ["assigned_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_hybrid_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_tasks: {
        Row: {
          assigned_to: string | null
          community_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          is_ai_generated: boolean | null
          location_id: string | null
          org_id: string
          priority: string | null
          status: string | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          community_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_ai_generated?: boolean | null
          location_id?: string | null
          org_id: string
          priority?: string | null
          status?: string | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          community_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_ai_generated?: boolean | null
          location_id?: string | null
          org_id?: string
          priority?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tasks_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          content: string
          created_by: string | null
          document_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          published_at: string | null
          version: string
        }
        Insert: {
          content: string
          created_by?: string | null
          document_type: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          published_at?: string | null
          version: string
        }
        Update: {
          content?: string
          created_by?: string | null
          document_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          published_at?: string | null
          version?: string
        }
        Relationships: []
      }
      location_access: {
        Row: {
          access_type: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          location_id: string | null
          user_id: string | null
        }
        Insert: {
          access_type?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          location_id?: string | null
          user_id?: string | null
        }
        Update: {
          access_type?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          location_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_access_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_holidays: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          holiday_date: string
          id: string
          location_id: string | null
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          holiday_date: string
          id?: string
          location_id?: string | null
          org_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          holiday_date?: string
          id?: string
          location_id?: string | null
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_holidays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_holidays_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_vendor_routing: {
        Row: {
          created_at: string
          id: string
          issue_category: string
          location_id: string
          org_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issue_category: string
          location_id: string
          org_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issue_category?: string
          location_id?: string
          org_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_vendor_routing_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_vendor_routing_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_vendor_routing_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          city: string | null
          created_at: string | null
          full_address: string
          google_place_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          org_id: string | null
          postal_code: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          full_address: string
          google_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          org_id?: string | null
          postal_code?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          full_address?: string
          google_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          org_id?: string | null
          postal_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requests: {
        Row: {
          created_at: string | null
          id: string
          items: Json
          location_id: string | null
          notes: string | null
          org_id: string | null
          requester_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          items: Json
          location_id?: string | null
          notes?: string | null
          org_id?: string | null
          requester_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          items?: Json
          location_id?: string | null
          notes?: string | null
          org_id?: string | null
          requester_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          can_view_billing: boolean | null
          can_view_financials: boolean | null
          created_at: string | null
          id: string
          is_active: boolean | null
          org_id: string
          permissions: Json | null
          require_gps_validation: boolean | null
          role: string
          specializations: string[] | null
          user_id: string
        }
        Insert: {
          can_view_billing?: boolean | null
          can_view_financials?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          org_id: string
          permissions?: Json | null
          require_gps_validation?: boolean | null
          role: string
          specializations?: string[] | null
          user_id: string
        }
        Update: {
          can_view_billing?: boolean | null
          can_view_financials?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          org_id?: string
          permissions?: Json | null
          require_gps_validation?: boolean | null
          role?: string
          specializations?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_template: string
          days_before: number
          id: string
          org_id: string | null
          send_to: string
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          body_template: string
          days_before?: number
          id?: string
          org_id?: string | null
          send_to?: string
          subject: string
          type: string
          updated_at?: string
        }
        Update: {
          body_template?: string
          days_before?: number
          id?: string
          org_id?: string | null
          send_to?: string
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_subscriptions: {
        Row: {
          app_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          org_id: string
          status: string | null
        }
        Insert: {
          app_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          org_id: string
          status?: string | null
        }
        Update: {
          app_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          org_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_subscriptions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          database_url: string | null
          global_coordinator_view_financials: boolean | null
          id: string
          is_snow_season: boolean | null
          name: string
          nip: string | null
          owner_id: string | null
          postal_code: string | null
          slug: string
          support_email: string | null
          task_generation_days: number | null
          tenant_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          database_url?: string | null
          global_coordinator_view_financials?: boolean | null
          id?: string
          is_snow_season?: boolean | null
          name: string
          nip?: string | null
          owner_id?: string | null
          postal_code?: string | null
          slug: string
          support_email?: string | null
          task_generation_days?: number | null
          tenant_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          database_url?: string | null
          global_coordinator_view_financials?: boolean | null
          id?: string
          is_snow_season?: boolean | null
          name?: string
          nip?: string | null
          owner_id?: string | null
          postal_code?: string | null
          slug?: string
          support_email?: string | null
          task_generation_days?: number | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      page_content: {
        Row: {
          content_key: string
          content_value: string
          description: string
          section_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          content_key: string
          content_value?: string
          description: string
          section_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          content_key?: string
          content_value?: string
          description?: string
          section_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      partner_offers: {
        Row: {
          created_at: string
          description: string
          id: string
          image_url: string | null
          is_active: boolean
          location_id: string | null
          org_id: string
          promo_code: string | null
          redirect_url: string | null
          title: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          location_id?: string | null
          org_id: string
          promo_code?: string | null
          redirect_url?: string | null
          title: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          location_id?: string | null
          org_id?: string
          promo_code?: string | null
          redirect_url?: string | null
          title?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_offers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_offers_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_plans: {
        Row: {
          app_id: string
          created_at: string
          features: Json
          id: string
          is_active: boolean
          name: string
          price_monthly: number
          price_yearly: number
          updated_at: string
        }
        Insert: {
          app_id: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          name: string
          price_monthly?: number
          price_yearly?: number
          updated_at?: string
        }
        Update: {
          app_id?: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          name?: string
          price_monthly?: number
          price_yearly?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_plans_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_terms_at: string
          account_type: string | null
          address: string | null
          base_hourly_rate: number | null
          contact_email: string | null
          created_at: string | null
          email: string | null
          emergency_contact: Json | null
          fixed_salary: number | null
          fleet_role: Database["public"]["Enums"]["fleet_role"] | null
          full_name: string | null
          id: string
          internal_notes: string | null
          ip_address: string | null
          is_first_login: boolean | null
          last_login_at: string | null
          license_no: string | null
          marketing_consent: boolean | null
          marketing_version: string | null
          phone: string | null
          platform_role: string | null
          preferences: Json | null
          snow_hourly_rate: number | null
          terms_version: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_terms_at: string
          account_type?: string | null
          address?: string | null
          base_hourly_rate?: number | null
          contact_email?: string | null
          created_at?: string | null
          email?: string | null
          emergency_contact?: Json | null
          fixed_salary?: number | null
          fleet_role?: Database["public"]["Enums"]["fleet_role"] | null
          full_name?: string | null
          id: string
          internal_notes?: string | null
          ip_address?: string | null
          is_first_login?: boolean | null
          last_login_at?: string | null
          license_no?: string | null
          marketing_consent?: boolean | null
          marketing_version?: string | null
          phone?: string | null
          platform_role?: string | null
          preferences?: Json | null
          snow_hourly_rate?: number | null
          terms_version?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_terms_at?: string
          account_type?: string | null
          address?: string | null
          base_hourly_rate?: number | null
          contact_email?: string | null
          created_at?: string | null
          email?: string | null
          emergency_contact?: Json | null
          fixed_salary?: number | null
          fleet_role?: Database["public"]["Enums"]["fleet_role"] | null
          full_name?: string | null
          id?: string
          internal_notes?: string | null
          ip_address?: string | null
          is_first_login?: boolean | null
          last_login_at?: string | null
          license_no?: string | null
          marketing_consent?: boolean | null
          marketing_version?: string | null
          phone?: string | null
          platform_role?: string | null
          preferences?: Json | null
          snow_hourly_rate?: number | null
          terms_version?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          discount_amount: number | null
          discount_percent: number | null
          id: string
          is_active: boolean
          max_uses: number | null
          used_count: number
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          used_count?: number
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          used_count?: number
          valid_until?: string | null
        }
        Relationships: []
      }
      property_checklists: {
        Row: {
          baseline_date: string | null
          created_at: string | null
          frequency: string | null
          frequency_config: Json | null
          id: string
          is_active: boolean | null
          location_id: string | null
          name: string
          org_id: string | null
          requires_photo: boolean | null
          section_id: string | null
        }
        Insert: {
          baseline_date?: string | null
          created_at?: string | null
          frequency?: string | null
          frequency_config?: Json | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          name: string
          org_id?: string | null
          requires_photo?: boolean | null
          section_id?: string | null
        }
        Update: {
          baseline_date?: string | null
          created_at?: string | null
          frequency?: string | null
          frequency_config?: Json | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          name?: string
          org_id?: string | null
          requires_photo?: boolean | null
          section_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_checklists_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_checklists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_checklists_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "property_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      property_contracts: {
        Row: {
          community_id: string | null
          company_id: string
          contract_number: string
          created_at: string
          currency: string
          custom_type_name: string | null
          document_url: string
          end_date: string | null
          gross_value: number | null
          id: string
          location_id: string
          net_value: number
          notice_period_months: number | null
          start_date: string
          type: Database["public"]["Enums"]["property_contract_type"]
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          community_id?: string | null
          company_id: string
          contract_number: string
          created_at?: string
          currency?: string
          custom_type_name?: string | null
          document_url?: string
          end_date?: string | null
          gross_value?: number | null
          id?: string
          location_id: string
          net_value: number
          notice_period_months?: number | null
          start_date: string
          type: Database["public"]["Enums"]["property_contract_type"]
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          community_id?: string | null
          company_id?: string
          contract_number?: string
          created_at?: string
          currency?: string
          custom_type_name?: string | null
          document_url?: string
          end_date?: string | null
          gross_value?: number | null
          id?: string
          location_id?: string
          net_value?: number
          notice_period_months?: number | null
          start_date?: string
          type?: Database["public"]["Enums"]["property_contract_type"]
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_contracts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contracts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_inspections: {
        Row: {
          c_kob_error_log: string | null
          c_kob_id: string | null
          c_kob_last_sync_at: string | null
          c_kob_sync_status: Database["public"]["Enums"]["sync_status"]
          company_id: string
          created_at: string
          document_url: string | null
          execution_date: string
          id: string
          inspector_name: string | null
          location_id: string
          notes: string | null
          protocol_number: string | null
          status: Database["public"]["Enums"]["inspection_status"]
          type: Database["public"]["Enums"]["inspection_type"]
          updated_at: string
          valid_until: string
        }
        Insert: {
          c_kob_error_log?: string | null
          c_kob_id?: string | null
          c_kob_last_sync_at?: string | null
          c_kob_sync_status?: Database["public"]["Enums"]["sync_status"]
          company_id: string
          created_at?: string
          document_url?: string | null
          execution_date: string
          id?: string
          inspector_name?: string | null
          location_id: string
          notes?: string | null
          protocol_number?: string | null
          status?: Database["public"]["Enums"]["inspection_status"]
          type: Database["public"]["Enums"]["inspection_type"]
          updated_at?: string
          valid_until: string
        }
        Update: {
          c_kob_error_log?: string | null
          c_kob_id?: string | null
          c_kob_last_sync_at?: string | null
          c_kob_sync_status?: Database["public"]["Enums"]["sync_status"]
          company_id?: string
          created_at?: string
          document_url?: string | null
          execution_date?: string
          id?: string
          inspector_name?: string | null
          location_id?: string
          notes?: string | null
          protocol_number?: string | null
          status?: Database["public"]["Enums"]["inspection_status"]
          type?: Database["public"]["Enums"]["inspection_type"]
          updated_at?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_inspections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_issues: {
        Row: {
          ai_confidence_score: number | null
          assigned_staff_id: string | null
          category: string | null
          claimed_by_org_id: string | null
          client_signature: string | null
          created_at: string | null
          delegated_vendor_id: string | null
          description: string | null
          estimated_hours: number | null
          estimated_resolution_date: string | null
          id: string
          internal_comments: Json | null
          is_ai_draft: boolean | null
          is_invoiced: boolean | null
          is_public_broadcast: boolean | null
          is_transfer_requested: boolean | null
          labor_cost: number | null
          labor_hours: number | null
          location_id: string | null
          materials_used: Json | null
          notification_status: string | null
          org_id: string | null
          photo_url: string | null
          photos_after: string[] | null
          photos_before: string[] | null
          priority: Database["public"]["Enums"]["issue_priority_enum"] | null
          reporter_email: string | null
          reporter_id: string | null
          reporter_name: string | null
          reporter_phone: string | null
          reporter_type: string | null
          require_gps_validation: boolean | null
          resolution_notes: string | null
          resolved_at: string | null
          scheduled_at: string | null
          signed_by: string | null
          source: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["issue_status_enum"] | null
          total_material_cost: number | null
          transfer_reason: string | null
          waiting_reason: string | null
        }
        Insert: {
          ai_confidence_score?: number | null
          assigned_staff_id?: string | null
          category?: string | null
          claimed_by_org_id?: string | null
          client_signature?: string | null
          created_at?: string | null
          delegated_vendor_id?: string | null
          description?: string | null
          estimated_hours?: number | null
          estimated_resolution_date?: string | null
          id?: string
          internal_comments?: Json | null
          is_ai_draft?: boolean | null
          is_invoiced?: boolean | null
          is_public_broadcast?: boolean | null
          is_transfer_requested?: boolean | null
          labor_cost?: number | null
          labor_hours?: number | null
          location_id?: string | null
          materials_used?: Json | null
          notification_status?: string | null
          org_id?: string | null
          photo_url?: string | null
          photos_after?: string[] | null
          photos_before?: string[] | null
          priority?: Database["public"]["Enums"]["issue_priority_enum"] | null
          reporter_email?: string | null
          reporter_id?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          reporter_type?: string | null
          require_gps_validation?: boolean | null
          resolution_notes?: string | null
          resolved_at?: string | null
          scheduled_at?: string | null
          signed_by?: string | null
          source?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["issue_status_enum"] | null
          total_material_cost?: number | null
          transfer_reason?: string | null
          waiting_reason?: string | null
        }
        Update: {
          ai_confidence_score?: number | null
          assigned_staff_id?: string | null
          category?: string | null
          claimed_by_org_id?: string | null
          client_signature?: string | null
          created_at?: string | null
          delegated_vendor_id?: string | null
          description?: string | null
          estimated_hours?: number | null
          estimated_resolution_date?: string | null
          id?: string
          internal_comments?: Json | null
          is_ai_draft?: boolean | null
          is_invoiced?: boolean | null
          is_public_broadcast?: boolean | null
          is_transfer_requested?: boolean | null
          labor_cost?: number | null
          labor_hours?: number | null
          location_id?: string | null
          materials_used?: Json | null
          notification_status?: string | null
          org_id?: string | null
          photo_url?: string | null
          photos_after?: string[] | null
          photos_before?: string[] | null
          priority?: Database["public"]["Enums"]["issue_priority_enum"] | null
          reporter_email?: string | null
          reporter_id?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          reporter_type?: string | null
          require_gps_validation?: boolean | null
          resolution_notes?: string | null
          resolved_at?: string | null
          scheduled_at?: string | null
          signed_by?: string | null
          source?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["issue_status_enum"] | null
          total_material_cost?: number | null
          transfer_reason?: string | null
          waiting_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_issues_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_issues_claimed_by_org_id_fkey"
            columns: ["claimed_by_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_issues_delegated_vendor_id_fkey"
            columns: ["delegated_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_issues_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_issues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_issues_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_policies: {
        Row: {
          community_id: string | null
          company_id: string
          coverage_amount: number
          created_at: string
          document_url: string
          end_date: string
          id: string
          insurer_name: string | null
          location_id: string
          policy_number: string
          policy_scope: Database["public"]["Enums"]["policy_scope_enum"] | null
          premium_amount: number
          start_date: string
          updated_at: string
        }
        Insert: {
          community_id?: string | null
          company_id: string
          coverage_amount: number
          created_at?: string
          document_url?: string
          end_date: string
          id?: string
          insurer_name?: string | null
          location_id: string
          policy_number: string
          policy_scope?: Database["public"]["Enums"]["policy_scope_enum"] | null
          premium_amount?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          community_id?: string | null
          company_id?: string
          coverage_amount?: number
          created_at?: string
          document_url?: string
          end_date?: string
          id?: string
          insurer_name?: string | null
          location_id?: string
          policy_number?: string
          policy_scope?: Database["public"]["Enums"]["policy_scope_enum"] | null
          premium_amount?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_policies_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_policies_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_sections: {
        Row: {
          allow_cross_access: boolean | null
          assigned_staff_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          location_id: string | null
          name: string
          sort_order: number | null
        }
        Insert: {
          allow_cross_access?: boolean | null
          assigned_staff_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          name: string
          sort_order?: number | null
        }
        Update: {
          allow_cross_access?: boolean | null
          assigned_staff_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_sections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_tasks: {
        Row: {
          assignee_id: string | null
          community_id: string | null
          created_at: string
          created_by: string
          id: string
          location_id: string
          priority: Database["public"]["Enums"]["property_task_priority"]
          status: Database["public"]["Enums"]["property_task_status"]
          title: string
          visibility: Database["public"]["Enums"]["property_task_visibility"]
        }
        Insert: {
          assignee_id?: string | null
          community_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          location_id: string
          priority?: Database["public"]["Enums"]["property_task_priority"]
          status?: Database["public"]["Enums"]["property_task_status"]
          title: string
          visibility?: Database["public"]["Enums"]["property_task_visibility"]
        }
        Update: {
          assignee_id?: string | null
          community_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          location_id?: string
          priority?: Database["public"]["Enums"]["property_task_priority"]
          status?: Database["public"]["Enums"]["property_task_status"]
          title?: string
          visibility?: Database["public"]["Enums"]["property_task_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "property_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_tasks_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_logs: {
        Row: {
          cost: number
          created_at: string | null
          description: string
          id: string
          org_id: string
          repair_date: string
          vehicle_id: string
        }
        Insert: {
          cost?: number
          created_at?: string | null
          description: string
          id?: string
          org_id?: string
          repair_date?: string
          vehicle_id: string
        }
        Update: {
          cost?: number
          created_at?: string | null
          description?: string
          id?: string
          org_id?: string
          repair_date?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_active_notifications"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "repair_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_configs: {
        Row: {
          created_at: string
          enable_community_board: boolean
          enable_partner_offers: boolean
          id: string
          location_id: string
          org_id: string
          show_cleaning_status: boolean
          show_service_tracker: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          enable_community_board?: boolean
          enable_partner_offers?: boolean
          id?: string
          location_id: string
          org_id: string
          show_cleaning_status?: boolean
          show_service_tracker?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          enable_community_board?: boolean
          enable_partner_offers?: boolean
          id?: string
          location_id?: string
          org_id?: string
          show_cleaning_status?: boolean
          show_service_tracker?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_configs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "cleaning_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      staff_equipment: {
        Row: {
          assigned_at: string | null
          created_at: string | null
          id: string
          name: string
          org_id: string
          staff_id: string
          type: string
        }
        Insert: {
          assigned_at?: string | null
          created_at?: string | null
          id?: string
          name: string
          org_id: string
          staff_id: string
          type: string
        }
        Update: {
          assigned_at?: string | null
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
          staff_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_equipment_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_equipment_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_financial_adjustments: {
        Row: {
          adjustment_date: string | null
          amount: number
          created_at: string | null
          id: string
          reason: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          adjustment_date?: string | null
          amount: number
          created_at?: string | null
          id?: string
          reason?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          adjustment_date?: string | null
          amount?: number
          created_at?: string | null
          id?: string
          reason?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_financial_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_payouts: {
        Row: {
          created_at: string | null
          id: string
          month: number
          notes: string | null
          org_id: string
          paid_at: string | null
          paid_by: string | null
          staff_id: string
          total_amount: number
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: number
          notes?: string | null
          org_id: string
          paid_at?: string | null
          paid_by?: string | null
          staff_id: string
          total_amount: number
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: number
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          paid_by?: string | null
          staff_id?: string
          total_amount?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_payouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payouts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_rate_history: {
        Row: {
          base_hourly_rate: number | null
          changed_at: string | null
          changed_by: string | null
          fixed_salary: number | null
          id: string
          snow_hourly_rate: number | null
          staff_id: string
        }
        Insert: {
          base_hourly_rate?: number | null
          changed_at?: string | null
          changed_by?: string | null
          fixed_salary?: number | null
          id?: string
          snow_hourly_rate?: number | null
          staff_id: string
        }
        Update: {
          base_hourly_rate?: number | null
          changed_at?: string | null
          changed_by?: string | null
          fixed_salary?: number | null
          id?: string
          snow_hourly_rate?: number | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_rate_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "property_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_execution_logs: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          notes: string | null
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          notes?: string | null
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_execution_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_step_logs: {
        Row: {
          created_at: string | null
          id: string
          is_extra_task: boolean | null
          photo_url: string | null
          step_name: string | null
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_extra_task?: boolean | null
          photo_url?: string | null
          step_name?: string | null
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_extra_task?: boolean | null
          photo_url?: string | null
          step_name?: string | null
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_step_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_inspection_records: {
        Row: {
          campaign_id: string
          id: string
          inspection_date: string | null
          notes: string | null
          photo_url: string | null
          signature_url: string | null
          status: Database["public"]["Enums"]["unit_inspection_status"]
          unit_number: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          id?: string
          inspection_date?: string | null
          notes?: string | null
          photo_url?: string | null
          signature_url?: string | null
          status?: Database["public"]["Enums"]["unit_inspection_status"]
          unit_number: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          id?: string
          inspection_date?: string | null
          notes?: string | null
          photo_url?: string | null
          signature_url?: string | null
          status?: Database["public"]["Enums"]["unit_inspection_status"]
          unit_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_inspection_records_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "inspection_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assigned_driver_id: string | null
          created_at: string
          id: string
          insurance_expiry: string
          mileage: number
          model: string
          next_inspection: string
          org_id: string
          policy_url: string | null
          reg_doc_url: string | null
          reg_no: string
          tire_change_date: string | null
          tire_info: string | null
          vin: string
          year: number
        }
        Insert: {
          assigned_driver_id?: string | null
          created_at?: string
          id?: string
          insurance_expiry: string
          mileage?: number
          model: string
          next_inspection: string
          org_id: string
          policy_url?: string | null
          reg_doc_url?: string | null
          reg_no: string
          tire_change_date?: string | null
          tire_info?: string | null
          vin: string
          year: number
        }
        Update: {
          assigned_driver_id?: string | null
          created_at?: string
          id?: string
          insurance_expiry?: string
          mileage?: number
          model?: string
          next_inspection?: string
          org_id?: string
          policy_url?: string | null
          reg_doc_url?: string | null
          reg_no?: string
          tire_change_date?: string | null
          tire_info?: string | null
          vin?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_partners: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          has_system_access: boolean | null
          id: string
          name: string
          org_id: string
          service_type: string
          status: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          has_system_access?: boolean | null
          id?: string
          name: string
          org_id: string
          service_type: string
          status?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          has_system_access?: boolean | null
          id?: string
          name?: string
          org_id?: string
          service_type?: string
          status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      cleaner_recent_activity: {
        Row: {
          action_type: string | null
          created_at: string | null
          id: string | null
          notes: string | null
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          action_type?: string | null
          created_at?: string | null
          id?: string | null
          notes?: string | null
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string | null
          created_at?: string | null
          id?: string | null
          notes?: string | null
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_execution_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      user_app_access: {
        Row: {
          app_api_url: string | null
          app_domain_url: string | null
          app_id: string | null
          app_name: string | null
          org_id: string | null
          org_name: string | null
          subscription_status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_subscriptions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      v_active_notifications: {
        Row: {
          alert_type: string | null
          body_template: string | null
          driver_email: string | null
          driver_name: string | null
          model: string | null
          org_id: string | null
          reg_no: string | null
          subject: string | null
          target_date: string | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_upcoming_deadlines: {
        Row: {
          days_left: number | null
          model: string | null
          org_id: string | null
          reg_no: string | null
          target_date: string | null
          type: string | null
          vehicle_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      can_manage_location: {
        Args: { target_location_id: string }
        Returns: boolean
      }
      check_is_admin: { Args: never; Returns: boolean }
      check_location_manager: {
        Args: { target_location_id: string }
        Returns: boolean
      }
      check_location_proximity: {
        Args: {
          p_location_id: string
          p_user_latitude: number
          p_user_longitude: number
        }
        Returns: Json
      }
      check_manager_access: {
        Args: { target_org_id: string }
        Returns: boolean
      }
      check_org_access: { Args: { target_org_id: string }; Returns: boolean }
      check_slug_available: { Args: { p_slug: string }; Returns: boolean }
      check_user_belongs_to_org: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      complete_task: {
        Args: { p_notes: string; p_photo_urls: string[]; p_task_id: string }
        Returns: undefined
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_auth_org_ids: {
        Args: never
        Returns: {
          o_id: string
        }[]
      }
      get_location_org_id_safe: {
        Args: { target_location_id: string }
        Returns: string
      }
      get_my_claims: {
        Args: never
        Returns: {
          org_id: string
          role: string
        }[]
      }
      get_my_org_and_role: {
        Args: never
        Returns: {
          org_id: string
          role: string
        }[]
      }
      get_my_org_id_safe: { Args: never; Returns: string }
      get_my_org_ids: {
        Args: never
        Returns: {
          org_id: string
        }[]
      }
      get_my_org_ids_safe: { Args: never; Returns: string[] }
      get_my_orgs: { Args: never; Returns: string[] }
      get_my_orgs_safe: { Args: never; Returns: string[] }
      get_profile_by_email: { Args: { target_email: string }; Returns: Json }
      get_property_tasks_with_comment_counts: {
        Args: { p_location_id: string }
        Returns: {
          assignee_id: string
          comments_count: number
          created_at: string
          created_by: string
          id: string
          location_id: string
          priority: Database["public"]["Enums"]["property_task_priority"]
          status: Database["public"]["Enums"]["property_task_status"]
          title: string
          visibility: Database["public"]["Enums"]["property_task_visibility"]
        }[]
      }
      get_user_highest_role: { Args: { p_org_id: string }; Returns: string }
      gettransactionid: { Args: never; Returns: unknown }
      has_location_access: {
        Args: { target_location_id: string }
        Returns: boolean
      }
      has_staff_access_safe: {
        Args: { target_location_id: string }
        Returns: boolean
      }
      is_admin_safe: { Args: { target_org_id: string }; Returns: boolean }
      is_management_role: { Args: { target_org_id: string }; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_manager_safe: { Args: never; Returns: boolean }
      is_org_manager: { Args: { target_org_id: string }; Returns: boolean }
      is_org_manager_safe: { Args: { target_org_id: string }; Returns: boolean }
      is_org_member: { Args: { target_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      link_user_to_org: {
        Args: {
          target_email: string
          target_full_name: string
          target_org_id: string
          target_role: string
          target_user_id: string
        }
        Returns: undefined
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      property_task_location_id: {
        Args: { p_task_id: string }
        Returns: string
      }
      property_task_user_has_access: {
        Args: { p_location_id: string }
        Returns: boolean
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      start_task_with_validation: {
        Args: {
          p_scanned_qr: string
          p_task_id: string
          p_user_lat: number
          p_user_lon: number
        }
        Returns: Json
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_company_by_tax_id: {
        Args: {
          p_address?: string
          p_category: Database["public"]["Enums"]["company_category"]
          p_email?: string
          p_name: string
          p_phone?: string
          p_tax_id: string
        }
        Returns: {
          address: string | null
          category: Database["public"]["Enums"]["company_category"]
          created_at: string
          email: string | null
          id: string
          name: string
          org_id: string | null
          phone: string | null
          tax_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "companies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_has_location_access_docs: {
        Args: { p_location_id: string }
        Returns: boolean
      }
    }
    Enums: {
      community_post_status: "active" | "completed" | "cancelled" | "deleted"
      community_post_type: "offer" | "request" | "event" | "general"
      company_category: "contractor" | "insurer" | "utility" | "other"
      eboard_msg_status: "published" | "pending_moderation" | "archived"
      eboard_msg_type: "official" | "advertisement" | "resident"
      fleet_role: "admin" | "driver"
      inspection_status: "positive" | "positive_with_defects" | "negative"
      inspection_type:
        | "building"
        | "building_5yr"
        | "chimney"
        | "gas"
        | "electrical"
        | "fire_safety"
        | "elevator_udt"
        | "elevator_electrical"
        | "separator"
        | "hydrophore"
        | "rainwater_pump"
        | "sewage_pump"
        | "mechanical_ventilation"
        | "car_platform"
        | "treatment_plant"
        | "garage_door"
        | "entrance_gate"
        | "barrier"
        | "co_lpg_detectors"
        | "other"
      issue_priority_enum: "low" | "medium" | "high" | "critical"
      issue_status_enum:
        | "new"
        | "open"
        | "pending_admin_approval"
        | "in_progress"
        | "waiting_for_parts"
        | "delegated"
        | "resolved"
        | "rejected"
      policy_scope_enum: "maj─ůtkowe" | "oc_ogolne" | "oc_zarzadu"
      priority_level: "low" | "medium" | "high" | "emergency"
      property_contract_type:
        | "cleaning"
        | "maintenance"
        | "administration"
        | "elevator"
        | "other"
      property_task_priority: "low" | "medium" | "urgent"
      property_task_status: "todo" | "in_progress" | "done"
      property_task_visibility: "internal_only" | "board_visible"
      sync_status: "not_synced" | "pending" | "synced" | "error"
      task_status: "pending" | "in_progress" | "done" | "cancelled"
      task_type:
        | "sop_standard"
        | "coordinator_single"
        | "long_term"
        | "employee_extra"
      unit_inspection_status:
        | "pending"
        | "completed"
        | "failed_no_access"
        | "failed_defects"
        | "rescheduled"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      community_post_status: ["active", "completed", "cancelled", "deleted"],
      community_post_type: ["offer", "request", "event", "general"],
      company_category: ["contractor", "insurer", "utility", "other"],
      eboard_msg_status: ["published", "pending_moderation", "archived"],
      eboard_msg_type: ["official", "advertisement", "resident"],
      fleet_role: ["admin", "driver"],
      inspection_status: ["positive", "positive_with_defects", "negative"],
      inspection_type: [
        "building",
        "building_5yr",
        "chimney",
        "gas",
        "electrical",
        "fire_safety",
        "elevator_udt",
        "elevator_electrical",
        "separator",
        "hydrophore",
        "rainwater_pump",
        "sewage_pump",
        "mechanical_ventilation",
        "car_platform",
        "treatment_plant",
        "garage_door",
        "entrance_gate",
        "barrier",
        "co_lpg_detectors",
        "other",
      ],
      issue_priority_enum: ["low", "medium", "high", "critical"],
      issue_status_enum: [
        "new",
        "open",
        "pending_admin_approval",
        "in_progress",
        "waiting_for_parts",
        "delegated",
        "resolved",
        "rejected",
      ],
      policy_scope_enum: ["maj─ůtkowe", "oc_ogolne", "oc_zarzadu"],
      priority_level: ["low", "medium", "high", "emergency"],
      property_contract_type: [
        "cleaning",
        "maintenance",
        "administration",
        "elevator",
        "other",
      ],
      property_task_priority: ["low", "medium", "urgent"],
      property_task_status: ["todo", "in_progress", "done"],
      property_task_visibility: ["internal_only", "board_visible"],
      sync_status: ["not_synced", "pending", "synced", "error"],
      task_status: ["pending", "in_progress", "done", "cancelled"],
      task_type: [
        "sop_standard",
        "coordinator_single",
        "long_term",
        "employee_extra",
      ],
      unit_inspection_status: [
        "pending",
        "completed",
        "failed_no_access",
        "failed_defects",
        "rescheduled",
      ],
    },
  },
} as const
