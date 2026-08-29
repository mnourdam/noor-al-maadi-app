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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievement_registry: {
        Row: {
          category: string
          created_at: string
          dinars: number
          engine_version: number
          id: string
          rarity: string
          title_id: string | null
          xp: number
        }
        Insert: {
          category: string
          created_at?: string
          dinars?: number
          engine_version?: number
          id: string
          rarity: string
          title_id?: string | null
          xp?: number
        }
        Update: {
          category?: string
          created_at?: string
          dinars?: number
          engine_version?: number
          id?: string
          rarity?: string
          title_id?: string | null
          xp?: number
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          detail: Json
          id: string
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_campaign_versions: {
        Row: {
          campaign_id: string
          created_at: string
          data: Json
          editor_email: string | null
          editor_id: string | null
          id: string
          note: string | null
          slug: string | null
          status: string | null
          title: string | null
          version: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          data: Json
          editor_email?: string | null
          editor_id?: string | null
          id?: string
          note?: string | null
          slug?: string | null
          status?: string | null
          title?: string | null
          version: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          data?: Json
          editor_email?: string | null
          editor_id?: string | null
          id?: string
          note?: string | null
          slug?: string | null
          status?: string | null
          title?: string | null
          version?: number
        }
        Relationships: []
      }
      admin_campaigns: {
        Row: {
          content_version: number
          created_at: string
          data: Json
          draft_data: Json | null
          has_unpublished_changes: boolean
          id: string
          key_art_credit: string | null
          key_art_path: string | null
          key_art_source: string | null
          key_art_square_path: string | null
          last_editor_email: string | null
          published_at: string | null
          slug: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_version?: number
          created_at?: string
          data: Json
          draft_data?: Json | null
          has_unpublished_changes?: boolean
          id: string
          key_art_credit?: string | null
          key_art_path?: string | null
          key_art_source?: string | null
          key_art_square_path?: string | null
          last_editor_email?: string | null
          published_at?: string | null
          slug?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_version?: number
          created_at?: string
          data?: Json
          draft_data?: Json | null
          has_unpublished_changes?: boolean
          id?: string
          key_art_credit?: string | null
          key_art_path?: string | null
          key_art_source?: string | null
          key_art_square_path?: string | null
          last_editor_email?: string | null
          published_at?: string | null
          slug?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      admin_import_batches: {
        Row: {
          admin_user_id: string
          alias_count: number
          approved_plan_hash: string
          blocker_count: number
          completed_at: string | null
          content_type: string
          create_count: number
          created_at: string
          draft_count: number
          error_summary: string | null
          file_name: string | null
          id: string
          item_count: number
          metadata: Json
          mode: string
          original_payload_hash: string | null
          quality_average: number | null
          relation_remap_count: number
          skip_count: number
          started_at: string
          status: string
          update_count: number
          updated_at: string
          warning_count: number
        }
        Insert: {
          admin_user_id: string
          alias_count?: number
          approved_plan_hash: string
          blocker_count?: number
          completed_at?: string | null
          content_type: string
          create_count?: number
          created_at?: string
          draft_count?: number
          error_summary?: string | null
          file_name?: string | null
          id?: string
          item_count?: number
          metadata?: Json
          mode: string
          original_payload_hash?: string | null
          quality_average?: number | null
          relation_remap_count?: number
          skip_count?: number
          started_at?: string
          status?: string
          update_count?: number
          updated_at?: string
          warning_count?: number
        }
        Update: {
          admin_user_id?: string
          alias_count?: number
          approved_plan_hash?: string
          blocker_count?: number
          completed_at?: string | null
          content_type?: string
          create_count?: number
          created_at?: string
          draft_count?: number
          error_summary?: string | null
          file_name?: string | null
          id?: string
          item_count?: number
          metadata?: Json
          mode?: string
          original_payload_hash?: string | null
          quality_average?: number | null
          relation_remap_count?: number
          skip_count?: number
          started_at?: string
          status?: string
          update_count?: number
          updated_at?: string
          warning_count?: number
        }
        Relationships: []
      }
      admin_import_items: {
        Row: {
          accepted_repairs: Json | null
          action: string
          after_snapshot: Json | null
          batch_id: string
          before_snapshot: Json | null
          classification: string | null
          content_type: string
          created_at: string
          error_message: string | null
          id: string
          incoming_id: string | null
          incoming_slug: string | null
          issues: Json | null
          item_index: number
          result: string
          target_record_id: string | null
        }
        Insert: {
          accepted_repairs?: Json | null
          action: string
          after_snapshot?: Json | null
          batch_id: string
          before_snapshot?: Json | null
          classification?: string | null
          content_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          incoming_id?: string | null
          incoming_slug?: string | null
          issues?: Json | null
          item_index: number
          result?: string
          target_record_id?: string | null
        }
        Update: {
          accepted_repairs?: Json | null
          action?: string
          after_snapshot?: Json | null
          batch_id?: string
          before_snapshot?: Json | null
          classification?: string | null
          content_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          incoming_id?: string | null
          incoming_slug?: string | null
          issues?: Json | null
          item_index?: number
          result?: string
          target_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_import_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "admin_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_investigation_versions: {
        Row: {
          created_at: string
          data: Json
          editor_email: string | null
          editor_id: string | null
          id: string
          investigation_id: string
          note: string | null
          slug: string | null
          source: string
          title: string | null
          version: number
        }
        Insert: {
          created_at?: string
          data: Json
          editor_email?: string | null
          editor_id?: string | null
          id?: string
          investigation_id: string
          note?: string | null
          slug?: string | null
          source?: string
          title?: string | null
          version: number
        }
        Update: {
          created_at?: string
          data?: Json
          editor_email?: string | null
          editor_id?: string | null
          id?: string
          investigation_id?: string
          note?: string | null
          slug?: string | null
          source?: string
          title?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "admin_investigation_versions_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_investigation_versions_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_taxonomy: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          icon: string | null
          id: string
          key: string
          label_ar: string
          label_en: string | null
          metadata: Json
          sort_order: number
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          icon?: string | null
          id?: string
          key: string
          label_ar: string
          label_en?: string | null
          metadata?: Json
          sort_order?: number
          type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          icon?: string | null
          id?: string
          key?: string
          label_ar?: string
          label_en?: string | null
          metadata?: Json
          sort_order?: number
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_announcement_acks: {
        Row: {
          acked_at: string
          action: string
          announcement_id: string
          id: string
          user_id: string
        }
        Insert: {
          acked_at?: string
          action?: string
          announcement_id: string
          id?: string
          user_id: string
        }
        Update: {
          acked_at?: string
          action?: string
          announcement_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_announcement_acks_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "app_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      app_announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          cta_label: string | null
          dismissible: boolean
          effective_at: string | null
          expires_at: string | null
          external_url: string | null
          id: string
          internal_path: string | null
          is_active: boolean
          kind: string
          min_version_code: number | null
          once_per_user: boolean
          platform: string
          priority: number
          recommended_version_code: number | null
          segment_filters: Json | null
          segment_id: string | null
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          dismissible?: boolean
          effective_at?: string | null
          expires_at?: string | null
          external_url?: string | null
          id?: string
          internal_path?: string | null
          is_active?: boolean
          kind: string
          min_version_code?: number | null
          once_per_user?: boolean
          platform?: string
          priority?: number
          recommended_version_code?: number | null
          segment_filters?: Json | null
          segment_id?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          dismissible?: boolean
          effective_at?: string | null
          expires_at?: string | null
          external_url?: string | null
          id?: string
          internal_path?: string | null
          is_active?: boolean
          kind?: string
          min_version_code?: number | null
          once_per_user?: boolean
          platform?: string
          priority?: number
          recommended_version_code?: number | null
          segment_filters?: Json | null
          segment_id?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      applied_profile_deltas: {
        Row: {
          applied_at: string
          delta_id: string
          dinars: number
          hearts: number
          source: string | null
          user_id: string
          xp: number
        }
        Insert: {
          applied_at?: string
          delta_id: string
          dinars?: number
          hearts?: number
          source?: string | null
          user_id: string
          xp?: number
        }
        Update: {
          applied_at?: string
          delta_id?: string
          dinars?: number
          hearts?: number
          source?: string | null
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      atlas_entities: {
        Row: {
          aps_verified: boolean
          aps_verified_at: string | null
          aps_verified_by: string | null
          aps_x: number | null
          aps_y: number | null
          atlas_version: string
          created_at: string
          created_by: string | null
          encyclopedia_entity_id: string | null
          era: string | null
          geo_source: string | null
          id: string
          kind: Database["public"]["Enums"]["atlas_entity_kind"]
          lat: number | null
          lon: number | null
          metadata: Json
          name_ar: string
          name_en: string | null
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["atlas_entity_status"]
          updated_at: string
          updated_by: string | null
          year_end: number | null
          year_start: number | null
        }
        Insert: {
          aps_verified?: boolean
          aps_verified_at?: string | null
          aps_verified_by?: string | null
          aps_x?: number | null
          aps_y?: number | null
          atlas_version?: string
          created_at?: string
          created_by?: string | null
          encyclopedia_entity_id?: string | null
          era?: string | null
          geo_source?: string | null
          id?: string
          kind: Database["public"]["Enums"]["atlas_entity_kind"]
          lat?: number | null
          lon?: number | null
          metadata?: Json
          name_ar: string
          name_en?: string | null
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["atlas_entity_status"]
          updated_at?: string
          updated_by?: string | null
          year_end?: number | null
          year_start?: number | null
        }
        Update: {
          aps_verified?: boolean
          aps_verified_at?: string | null
          aps_verified_by?: string | null
          aps_x?: number | null
          aps_y?: number | null
          atlas_version?: string
          created_at?: string
          created_by?: string | null
          encyclopedia_entity_id?: string | null
          era?: string | null
          geo_source?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["atlas_entity_kind"]
          lat?: number | null
          lon?: number | null
          metadata?: Json
          name_ar?: string
          name_en?: string | null
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["atlas_entity_status"]
          updated_at?: string
          updated_by?: string | null
          year_end?: number | null
          year_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_entities_encyclopedia_entity_id_fkey"
            columns: ["encyclopedia_entity_id"]
            isOneToOne: false
            referencedRelation: "encyclopedia_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_import_runs: {
        Row: {
          batch: string
          counts: Json
          created_at: string
          created_by: string | null
          id: string
          kind: string
          notes: string | null
        }
        Insert: {
          batch: string
          counts?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          notes?: string | null
        }
        Update: {
          batch?: string
          counts?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          notes?: string | null
        }
        Relationships: []
      }
      automatic_notification_runs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          job_key: string
          notification_id: string | null
          run_date: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          job_key: string
          notification_id?: string | null
          run_date: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          job_key?: string
          notification_id?: string | null
          run_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automatic_notification_runs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_saves: {
        Row: {
          client_updated_at: string | null
          created_at: string
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          client_updated_at?: string | null
          created_at?: string
          data: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          client_updated_at?: string | null
          created_at?: string
          data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_registry: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
          name: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_facts: {
        Row: {
          body: string
          created_at: string
          deep_link: string | null
          enabled: boolean
          id: string
          last_sent_at: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          deep_link?: string | null
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          deep_link?: string | null
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          title?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_model: string | null
          enabled: boolean
          id: string
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          enabled?: boolean
          id?: string
          last_seen_at?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          enabled?: boolean
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      encyclopedia_entities: {
        Row: {
          aliases: string[]
          body: Json
          created_at: string
          enabled: boolean
          entity_type: string
          id: string
          image_credit: string | null
          image_path: string | null
          image_source: string | null
          image_url: string | null
          metadata: Json
          slug: string
          subtitle: string | null
          summary: string | null
          timeline_category: string | null
          timeline_end_year: number | null
          timeline_glyph: string | null
          timeline_hijri: string | null
          timeline_order: number | null
          timeline_start_year: number | null
          timeline_tone: string | null
          timeline_year: number | null
          title: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          body?: Json
          created_at?: string
          enabled?: boolean
          entity_type: string
          id?: string
          image_credit?: string | null
          image_path?: string | null
          image_source?: string | null
          image_url?: string | null
          metadata?: Json
          slug: string
          subtitle?: string | null
          summary?: string | null
          timeline_category?: string | null
          timeline_end_year?: number | null
          timeline_glyph?: string | null
          timeline_hijri?: string | null
          timeline_order?: number | null
          timeline_start_year?: number | null
          timeline_tone?: string | null
          timeline_year?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          body?: Json
          created_at?: string
          enabled?: boolean
          entity_type?: string
          id?: string
          image_credit?: string | null
          image_path?: string | null
          image_source?: string | null
          image_url?: string | null
          metadata?: Json
          slug?: string
          subtitle?: string | null
          summary?: string | null
          timeline_category?: string | null
          timeline_end_year?: number | null
          timeline_glyph?: string | null
          timeline_hijri?: string | null
          timeline_order?: number | null
          timeline_start_year?: number | null
          timeline_tone?: string | null
          timeline_year?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_issues: {
        Row: {
          admin_unread: boolean
          assigned_to: string | null
          category: string
          context: Json
          created_at: string
          description: string
          device_id: string | null
          id: string
          last_reply_at: string | null
          last_reply_by: string | null
          player_rating: number | null
          player_rating_at: string | null
          player_unread: boolean
          reporter_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_unread?: boolean
          assigned_to?: string | null
          category: string
          context?: Json
          created_at?: string
          description: string
          device_id?: string | null
          id?: string
          last_reply_at?: string | null
          last_reply_by?: string | null
          player_rating?: number | null
          player_rating_at?: string | null
          player_unread?: boolean
          reporter_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_unread?: boolean
          assigned_to?: string | null
          category?: string
          context?: Json
          created_at?: string
          description?: string
          device_id?: string | null
          id?: string
          last_reply_at?: string | null
          last_reply_by?: string | null
          player_rating?: number | null
          player_rating_at?: string | null
          player_unread?: boolean
          reporter_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_messages: {
        Row: {
          attachments: Json
          author_id: string | null
          author_role: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          issue_id: string
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          author_role: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          issue_id: string
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          issue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_messages_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "feedback_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          requester: string
          status: string
          updated_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester: string
          status?: string
          updated_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          requester?: string
          status?: string
          updated_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_requester_fkey"
            columns: ["requester"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_progress: {
        Row: {
          best_score: number
          completed: boolean
          created_at: string
          game_id: string
          id: string
          last_played_at: string
          stage_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_score?: number
          completed?: boolean
          created_at?: string
          game_id: string
          id?: string
          last_played_at?: string
          stage_index?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_score?: number
          completed?: boolean
          created_at?: string
          game_id?: string
          id?: string
          last_played_at?: string
          stage_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_progress_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          coin_reward: number
          created_at: string
          created_by: string | null
          description: string | null
          difficulty: number
          estimated_time: number
          hearts_penalty: number
          id: string
          metadata: Json
          mode: Database["public"]["Enums"]["game_mode"]
          published_at: string | null
          related_entities: Json
          slug: string
          stages: Json
          status: Database["public"]["Enums"]["game_status"]
          title: string
          updated_at: string
          xp_reward: number
        }
        Insert: {
          coin_reward?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: number
          estimated_time?: number
          hearts_penalty?: number
          id?: string
          metadata?: Json
          mode: Database["public"]["Enums"]["game_mode"]
          published_at?: string | null
          related_entities?: Json
          slug: string
          stages?: Json
          status?: Database["public"]["Enums"]["game_status"]
          title: string
          updated_at?: string
          xp_reward?: number
        }
        Update: {
          coin_reward?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: number
          estimated_time?: number
          hearts_penalty?: number
          id?: string
          metadata?: Json
          mode?: Database["public"]["Enums"]["game_mode"]
          published_at?: string | null
          related_entities?: Json
          slug?: string
          stages?: Json
          status?: Database["public"]["Enums"]["game_status"]
          title?: string
          updated_at?: string
          xp_reward?: number
        }
        Relationships: []
      }
      identity_link_audit: {
        Row: {
          id: string
          linked_at: string
          provider: string
          user_id: string
        }
        Insert: {
          id?: string
          linked_at?: string
          provider: string
          user_id: string
        }
        Update: {
          id?: string
          linked_at?: string
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      investigation_qa_status: {
        Row: {
          created_at: string
          investigation_id: string
          note: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          investigation_id: string
          note?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          investigation_id?: string
          note?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investigation_qa_status_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: true
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_qa_status_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: true
            referencedRelation: "investigations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      investigations: {
        Row: {
          content_version: number
          created_at: string
          description: string | null
          difficulty: string
          draft_data: Json | null
          enabled: boolean
          has_unpublished_changes: boolean
          id: string
          last_draft_saved_at: string | null
          last_editor_email: string | null
          published_at: string | null
          related_entities: Json
          reward: Json
          slug: string
          steps: Json
          subtitle: string | null
          title: string
          updated_at: string
          updated_by: string | null
          world_slug: string | null
        }
        Insert: {
          content_version?: number
          created_at?: string
          description?: string | null
          difficulty?: string
          draft_data?: Json | null
          enabled?: boolean
          has_unpublished_changes?: boolean
          id?: string
          last_draft_saved_at?: string | null
          last_editor_email?: string | null
          published_at?: string | null
          related_entities?: Json
          reward?: Json
          slug: string
          steps?: Json
          subtitle?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          world_slug?: string | null
        }
        Update: {
          content_version?: number
          created_at?: string
          description?: string | null
          difficulty?: string
          draft_data?: Json | null
          enabled?: boolean
          has_unpublished_changes?: boolean
          id?: string
          last_draft_saved_at?: string | null
          last_editor_email?: string | null
          published_at?: string | null
          related_entities?: Json
          reward?: Json
          slug?: string
          steps?: Json
          subtitle?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          world_slug?: string | null
        }
        Relationships: []
      }
      leaderboard_snapshots: {
        Row: {
          created_at: string
          id: string
          metric: string
          payload: Json
          period_end: string
          period_key: string
          period_start: string
          score: number
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metric: string
          payload?: Json
          period_end: string
          period_key: string
          period_start: string
          score?: number
          timeframe: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metric?: string
          payload?: Json
          period_end?: string
          period_key?: string
          period_start?: string
          score?: number
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          confirmed: boolean
          confirmed_at: string | null
          created_at: string
          email: string
          email_normalized: string | null
          id: string
          source: string | null
          subscribed: boolean
          unsubscribed_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          email: string
          email_normalized?: string | null
          id?: string
          source?: string | null
          subscribed?: boolean
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          email?: string
          email_normalized?: string | null
          id?: string
          source?: string | null
          subscribed?: boolean
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          created_at: string
          deleted_at: string | null
          delivered_at: string | null
          dismissed_at: string | null
          error: string | null
          id: string
          notification_id: string
          opened_at: string | null
          read_at: string | null
          sent_at: string | null
          status: string
          token: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          error?: string | null
          id?: string
          notification_id: string
          opened_at?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          token: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          error?: string | null
          id?: string
          notification_id?: string
          opened_at?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          categories: Json
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: Json
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categories?: Json
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          analytics: Json
          archived_at: string | null
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          deep_link: string | null
          icon: string | null
          id: string
          image_url: string | null
          payload: Json
          priority: string
          schedule: Json | null
          scheduled_at: string | null
          sender: string
          sent_at: string | null
          status: string
          target_segment_id: string | null
          target_type: string
          target_user_id: string | null
          target_user_ids: string[] | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          analytics?: Json
          archived_at?: string | null
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          deep_link?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          payload?: Json
          priority?: string
          schedule?: Json | null
          scheduled_at?: string | null
          sender?: string
          sent_at?: string | null
          status?: string
          target_segment_id?: string | null
          target_type?: string
          target_user_id?: string | null
          target_user_ids?: string[] | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          analytics?: Json
          archived_at?: string | null
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          deep_link?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          payload?: Json
          priority?: string
          schedule?: Json | null
          scheduled_at?: string | null
          sender?: string
          sent_at?: string | null
          status?: string
          target_segment_id?: string | null
          target_type?: string
          target_user_id?: string | null
          target_user_ids?: string[] | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_action_reminders: {
        Row: {
          action_key: string
          created_at: string
          last_sent_at: string | null
          sent_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          action_key: string
          created_at?: string
          last_sent_at?: string | null
          sent_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          action_key?: string
          created_at?: string
          last_sent_at?: string | null
          sent_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personal_notifications: {
        Row: {
          batch_key: string
          count: number
          created_at: string
          id: string
          kind: string
          last_actor_id: string | null
          payload: Json
          read_at: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["social_anchor_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_key: string
          count?: number
          created_at?: string
          id?: string
          kind: string
          last_actor_id?: string | null
          payload?: Json
          read_at?: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["social_anchor_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_key?: string
          count?: number
          created_at?: string
          id?: string
          kind?: string
          last_actor_id?: string | null
          payload?: Json
          read_at?: string | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["social_anchor_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          artifacts_collected: number
          avatar_id: string | null
          bio: string | null
          campaigns_completed: number
          created_at: string
          dinars: number
          discovery_pct: number
          display_name: string | null
          email: string | null
          favorite_figure_id: string | null
          favorite_state_id: string | null
          hearts: number
          hearts_at: string | null
          hearts_full_notified_at: string | null
          id: string
          investigations_completed: number
          join_date: string
          last_active: string
          last_streak_day: string | null
          level: number
          locale: string
          longest_streak: number
          marketing_opt_in: boolean
          museum_items_unlocked: number
          notification_started_at: string
          referral_code: string | null
          referred_by: string | null
          streak: number
          title: string | null
          updated_at: string
          username: string
          xp: number
        }
        Insert: {
          account_status?: string
          artifacts_collected?: number
          avatar_id?: string | null
          bio?: string | null
          campaigns_completed?: number
          created_at?: string
          dinars?: number
          discovery_pct?: number
          display_name?: string | null
          email?: string | null
          favorite_figure_id?: string | null
          favorite_state_id?: string | null
          hearts?: number
          hearts_at?: string | null
          hearts_full_notified_at?: string | null
          id: string
          investigations_completed?: number
          join_date?: string
          last_active?: string
          last_streak_day?: string | null
          level?: number
          locale?: string
          longest_streak?: number
          marketing_opt_in?: boolean
          museum_items_unlocked?: number
          notification_started_at?: string
          referral_code?: string | null
          referred_by?: string | null
          streak?: number
          title?: string | null
          updated_at?: string
          username: string
          xp?: number
        }
        Update: {
          account_status?: string
          artifacts_collected?: number
          avatar_id?: string | null
          bio?: string | null
          campaigns_completed?: number
          created_at?: string
          dinars?: number
          discovery_pct?: number
          display_name?: string | null
          email?: string | null
          favorite_figure_id?: string | null
          favorite_state_id?: string | null
          hearts?: number
          hearts_at?: string | null
          hearts_full_notified_at?: string | null
          id?: string
          investigations_completed?: number
          join_date?: string
          last_active?: string
          last_streak_day?: string | null
          level?: number
          locale?: string
          longest_streak?: number
          marketing_opt_in?: boolean
          museum_items_unlocked?: number
          notification_started_at?: string
          referral_code?: string | null
          referred_by?: string | null
          streak?: number
          title?: string | null
          updated_at?: string
          username?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reauth_challenges: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          locked_at: string | null
          max_attempts: number
          purpose: string
          requester_ip: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          locked_at?: string | null
          max_attempts?: number
          purpose?: string
          requester_ip?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          locked_at?: string | null
          max_attempts?: number
          purpose?: string
          requester_ip?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          created_at: string
          dinars_amount: number
          id: string
          kind: string
          notification_id: string | null
          referred_id: string
          referrer_id: string
          reward_source: string
        }
        Insert: {
          created_at?: string
          dinars_amount: number
          id?: string
          kind: string
          notification_id?: string | null
          referred_id: string
          referrer_id: string
          reward_source: string
        }
        Update: {
          created_at?: string
          dinars_amount?: number
          id?: string
          kind?: string
          notification_id?: string | null
          referred_id?: string
          referrer_id?: string
          reward_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          invited_at: string
          level5_reward_at: string | null
          referred_id: string
          referrer_id: string
          signup_reward_at: string | null
          stage: number
          stage1_at: string | null
          stage2_at: string | null
          stage3_at: string | null
          stage4_at: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          invited_at?: string
          level5_reward_at?: string | null
          referred_id: string
          referrer_id: string
          signup_reward_at?: string | null
          stage?: number
          stage1_at?: string | null
          stage2_at?: string | null
          stage3_at?: string | null
          stage4_at?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          invited_at?: string
          level5_reward_at?: string | null
          referred_id?: string
          referrer_id?: string
          signup_reward_at?: string | null
          stage?: number
          stage1_at?: string | null
          stage2_at?: string | null
          stage3_at?: string | null
          stage4_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_comment_contributions: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          archived_at: string | null
          archived_by: string | null
          category: Database["public"]["Enums"]["contribution_category"]
          comment_id: string
          editor_note: string | null
          marked_at: string
          marked_by: string | null
          note: string | null
          public_notice_text: string | null
          status: Database["public"]["Enums"]["contribution_status"]
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          category?: Database["public"]["Enums"]["contribution_category"]
          comment_id: string
          editor_note?: string | null
          marked_at?: string
          marked_by?: string | null
          note?: string | null
          public_notice_text?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          category?: Database["public"]["Enums"]["contribution_category"]
          comment_id?: string
          editor_note?: string | null
          marked_at?: string
          marked_by?: string | null
          note?: string | null
          public_notice_text?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_comment_contributions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "social_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      social_comment_reports: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          note: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          note?: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "social_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      social_comments: {
        Row: {
          anchor_id: string
          anchor_type: Database["public"]["Enums"]["social_anchor_type"]
          author_id: string
          body_text: string
          created_at: string
          edit_deadline_at: string
          edited_at: string | null
          editors_note: boolean
          editors_note_rank: number | null
          helpful_count: number
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          anchor_id: string
          anchor_type: Database["public"]["Enums"]["social_anchor_type"]
          author_id: string
          body_text: string
          created_at?: string
          edit_deadline_at?: string
          edited_at?: string | null
          editors_note?: boolean
          editors_note_rank?: number | null
          helpful_count?: number
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          anchor_id?: string
          anchor_type?: Database["public"]["Enums"]["social_anchor_type"]
          author_id?: string
          body_text?: string
          created_at?: string
          edit_deadline_at?: string
          edited_at?: string | null
          editors_note?: boolean
          editors_note_rank?: number | null
          helpful_count?: number
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_reactions: {
        Row: {
          anchor_id: string
          anchor_type: Database["public"]["Enums"]["social_anchor_type"]
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          anchor_id: string
          anchor_type: Database["public"]["Enums"]["social_anchor_type"]
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          anchor_id?: string
          anchor_type?: Database["public"]["Enums"]["social_anchor_type"]
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          category: Database["public"]["Enums"]["story_category"]
          collection_order: number | null
          content_version: number
          cover_media_id: string | null
          created_at: string
          dinar_reward: number
          display_order: number
          era: string | null
          gregorian_end: string | null
          gregorian_start: string | null
          hijri_end_day: number | null
          hijri_end_month: number | null
          hijri_end_year: number | null
          hijri_start_day: number | null
          hijri_start_month: number | null
          hijri_start_year: number | null
          historical_confidence: Database["public"]["Enums"]["story_historical_confidence"]
          id: string
          length_class: Database["public"]["Enums"]["story_length_class"]
          lock_explanation: string | null
          lock_visibility: Database["public"]["Enums"]["story_lock_visibility"]
          metadata: Json
          previous_draft: Json | null
          previous_draft_at: string | null
          production_status: Database["public"]["Enums"]["story_production_status"]
          published_at: string | null
          rarity: Database["public"]["Enums"]["story_rarity"]
          reaction_count: number
          schema_version: number
          slug: string
          snapshot_tier: Database["public"]["Enums"]["story_snapshot_tier"]
          status: string
          story_collection_id: string | null
          summary_ar: string | null
          summary_en: string | null
          tags: string[]
          time_precision: Database["public"]["Enums"]["story_time_precision"]
          title_ar: string
          title_en: string | null
          unlock_spec: Json
          updated_at: string
          world_slug: string | null
          xp_reward: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["story_category"]
          collection_order?: number | null
          content_version?: number
          cover_media_id?: string | null
          created_at?: string
          dinar_reward?: number
          display_order?: number
          era?: string | null
          gregorian_end?: string | null
          gregorian_start?: string | null
          hijri_end_day?: number | null
          hijri_end_month?: number | null
          hijri_end_year?: number | null
          hijri_start_day?: number | null
          hijri_start_month?: number | null
          hijri_start_year?: number | null
          historical_confidence?: Database["public"]["Enums"]["story_historical_confidence"]
          id: string
          length_class?: Database["public"]["Enums"]["story_length_class"]
          lock_explanation?: string | null
          lock_visibility?: Database["public"]["Enums"]["story_lock_visibility"]
          metadata?: Json
          previous_draft?: Json | null
          previous_draft_at?: string | null
          production_status?: Database["public"]["Enums"]["story_production_status"]
          published_at?: string | null
          rarity?: Database["public"]["Enums"]["story_rarity"]
          reaction_count?: number
          schema_version?: number
          slug: string
          snapshot_tier?: Database["public"]["Enums"]["story_snapshot_tier"]
          status?: string
          story_collection_id?: string | null
          summary_ar?: string | null
          summary_en?: string | null
          tags?: string[]
          time_precision?: Database["public"]["Enums"]["story_time_precision"]
          title_ar: string
          title_en?: string | null
          unlock_spec?: Json
          updated_at?: string
          world_slug?: string | null
          xp_reward?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["story_category"]
          collection_order?: number | null
          content_version?: number
          cover_media_id?: string | null
          created_at?: string
          dinar_reward?: number
          display_order?: number
          era?: string | null
          gregorian_end?: string | null
          gregorian_start?: string | null
          hijri_end_day?: number | null
          hijri_end_month?: number | null
          hijri_end_year?: number | null
          hijri_start_day?: number | null
          hijri_start_month?: number | null
          hijri_start_year?: number | null
          historical_confidence?: Database["public"]["Enums"]["story_historical_confidence"]
          id?: string
          length_class?: Database["public"]["Enums"]["story_length_class"]
          lock_explanation?: string | null
          lock_visibility?: Database["public"]["Enums"]["story_lock_visibility"]
          metadata?: Json
          previous_draft?: Json | null
          previous_draft_at?: string | null
          production_status?: Database["public"]["Enums"]["story_production_status"]
          published_at?: string | null
          rarity?: Database["public"]["Enums"]["story_rarity"]
          reaction_count?: number
          schema_version?: number
          slug?: string
          snapshot_tier?: Database["public"]["Enums"]["story_snapshot_tier"]
          status?: string
          story_collection_id?: string | null
          summary_ar?: string | null
          summary_en?: string | null
          tags?: string[]
          time_precision?: Database["public"]["Enums"]["story_time_precision"]
          title_ar?: string
          title_en?: string | null
          unlock_spec?: Json
          updated_at?: string
          world_slug?: string | null
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "stories_cover_media_fk"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "story_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_story_collection_id_fkey"
            columns: ["story_collection_id"]
            isOneToOne: false
            referencedRelation: "story_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      story_collections: {
        Row: {
          cover_media_id: string | null
          created_at: string
          display_order: number
          id: string
          metadata: Json
          slug: string
          summary_ar: string | null
          summary_en: string | null
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          cover_media_id?: string | null
          created_at?: string
          display_order?: number
          id: string
          metadata?: Json
          slug: string
          summary_ar?: string | null
          summary_en?: string | null
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          cover_media_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          metadata?: Json
          slug?: string
          summary_ar?: string | null
          summary_en?: string | null
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_collections_cover_media_id_fkey"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "story_media"
            referencedColumns: ["id"]
          },
        ]
      }
      story_media: {
        Row: {
          byte_size: number
          checksum_sha256: string
          collection_id: string | null
          created_at: string
          height: number
          id: string
          kind: string
          metadata: Json
          mime_type: string
          owner_scope: string
          preset: string
          processing_version: number
          storage_bucket: string
          storage_path: string
          story_id: string | null
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
          width: number
        }
        Insert: {
          byte_size: number
          checksum_sha256: string
          collection_id?: string | null
          created_at?: string
          height: number
          id?: string
          kind: string
          metadata?: Json
          mime_type?: string
          owner_scope?: string
          preset: string
          processing_version?: number
          storage_bucket: string
          storage_path: string
          story_id?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          width: number
        }
        Update: {
          byte_size?: number
          checksum_sha256?: string
          collection_id?: string | null
          created_at?: string
          height?: number
          id?: string
          kind?: string
          metadata?: Json
          mime_type?: string
          owner_scope?: string
          preset?: string
          processing_version?: number
          storage_bucket?: string
          storage_path?: string
          story_id?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_media_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "story_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_media_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_relations: {
        Row: {
          created_at: string
          display_order: number
          id: string
          metadata: Json
          notes: string | null
          role: Database["public"]["Enums"]["story_relation_role"]
          story_id: string
          target_extra: Json
          target_id: string
          target_type: Database["public"]["Enums"]["story_relation_target_type"]
        }
        Insert: {
          created_at?: string
          display_order?: number
          id: string
          metadata?: Json
          notes?: string | null
          role: Database["public"]["Enums"]["story_relation_role"]
          story_id: string
          target_extra?: Json
          target_id: string
          target_type: Database["public"]["Enums"]["story_relation_target_type"]
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          metadata?: Json
          notes?: string | null
          role?: Database["public"]["Enums"]["story_relation_role"]
          story_id?: string
          target_extra?: Json
          target_id?: string
          target_type?: Database["public"]["Enums"]["story_relation_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "story_relations_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_scenes: {
        Row: {
          created_at: string
          id: string
          payload: Json
          primary_media_id: string | null
          scene_index: number
          scene_type: string
          schema_version: number
          story_id: string
          title_ar: string | null
          title_en: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          payload?: Json
          primary_media_id?: string | null
          scene_index: number
          scene_type: string
          schema_version?: number
          story_id: string
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          primary_media_id?: string | null
          scene_index?: number
          scene_type?: string
          schema_version?: number
          story_id?: string
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_scenes_primary_media_fk"
            columns: ["primary_media_id"]
            isOneToOne: false
            referencedRelation: "story_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_scenes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_sources: {
        Row: {
          author: string | null
          citation: string
          created_at: string
          display_order: number
          id: string
          kind: Database["public"]["Enums"]["story_source_kind"]
          notes: string | null
          page: string | null
          source_key: string
          story_id: string
          title: string | null
          url: string | null
          weight: number | null
          year: string | null
        }
        Insert: {
          author?: string | null
          citation: string
          created_at?: string
          display_order?: number
          id: string
          kind: Database["public"]["Enums"]["story_source_kind"]
          notes?: string | null
          page?: string | null
          source_key: string
          story_id: string
          title?: string | null
          url?: string | null
          weight?: number | null
          year?: string | null
        }
        Update: {
          author?: string | null
          citation?: string
          created_at?: string
          display_order?: number
          id?: string
          kind?: Database["public"]["Enums"]["story_source_kind"]
          notes?: string | null
          page?: string | null
          source_key?: string
          story_id?: string
          title?: string | null
          url?: string | null
          weight?: number | null
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_sources_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      today_in_history_events: {
        Row: {
          body: string
          created_at: string
          day: number
          deep_link: string | null
          enabled: boolean
          gregorian_year: string | null
          hijri_year: string | null
          id: string
          month: number
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          day: number
          deep_link?: string | null
          enabled?: boolean
          gregorian_year?: string | null
          hijri_year?: string | null
          id?: string
          month: number
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          day?: number
          deep_link?: string | null
          enabled?: boolean
          gregorian_year?: string | null
          hijri_year?: string | null
          id?: string
          month?: number
          title?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          client_unlocked_at: string | null
          definition_version: number
          engine_version: number
          notified_at: string | null
          presentation_origin: string | null
          presented_at: string | null
          repair_metadata: Json
          repair_origin: string | null
          rewards_granted_at: string | null
          rewards_payload: Json
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          client_unlocked_at?: string | null
          definition_version?: number
          engine_version?: number
          notified_at?: string | null
          presentation_origin?: string | null
          presented_at?: string | null
          repair_metadata?: Json
          repair_origin?: string | null
          rewards_granted_at?: string | null
          rewards_payload?: Json
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          client_unlocked_at?: string | null
          definition_version?: number
          engine_version?: number
          notified_at?: string | null
          presentation_origin?: string | null
          presented_at?: string | null
          repair_metadata?: Json
          repair_origin?: string | null
          rewards_granted_at?: string | null
          rewards_payload?: Json
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_campaign_completions: {
        Row: {
          campaign_id: string
          campaign_version: number | null
          completed_at: string
          created_at: string
          id: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          campaign_version?: number | null
          completed_at?: string
          created_at?: string
          id?: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          campaign_version?: number | null
          completed_at?: string
          created_at?: string
          id?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_campaign_intros: {
        Row: {
          campaign_id: string
          created_at: string
          first_started_at: string
          id: string
          intro_version: number
          last_scene_index: number
          resolved_at: string | null
          status: string
          story_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          first_started_at?: string
          id?: string
          intro_version?: number
          last_scene_index?: number
          resolved_at?: string | null
          status?: string
          story_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          first_started_at?: string
          id?: string
          intro_version?: number
          last_scene_index?: number
          resolved_at?: string | null
          status?: string
          story_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_campaign_progress: {
        Row: {
          campaign_id: string
          chapter_id: string
          coins_earned: number
          completed_at: string | null
          created_at: string
          id: string
          score: number
          status: string
          updated_at: string
          user_id: string
          xp_earned: number
        }
        Insert: {
          campaign_id: string
          chapter_id: string
          coins_earned?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          score?: number
          status?: string
          updated_at?: string
          user_id: string
          xp_earned?: number
        }
        Update: {
          campaign_id?: string
          chapter_id?: string
          coins_earned?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          score?: number
          status?: string
          updated_at?: string
          user_id?: string
          xp_earned?: number
        }
        Relationships: []
      }
      user_collection: {
        Row: {
          id: string
          item_id: string
          item_type: string
          source_campaign_id: string | null
          source_chapter_id: string | null
          unlocked_at: string
          user_id: string
        }
        Insert: {
          id?: string
          item_id: string
          item_type: string
          source_campaign_id?: string | null
          source_chapter_id?: string | null
          unlocked_at?: string
          user_id: string
        }
        Update: {
          id?: string
          item_id?: string
          item_type?: string
          source_campaign_id?: string | null
          source_chapter_id?: string | null
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_entity_discoveries: {
        Row: {
          entity_id: string
          entity_slug: string
          entity_type: string
          first_discovered_at: string
          last_viewed_at: string
          source: string | null
          user_id: string
        }
        Insert: {
          entity_id: string
          entity_slug: string
          entity_type: string
          first_discovered_at?: string
          last_viewed_at?: string
          source?: string | null
          user_id: string
        }
        Update: {
          entity_id?: string
          entity_slug?: string
          entity_type?: string
          first_discovered_at?: string
          last_viewed_at?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entity_discoveries_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "encyclopedia_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_investigation_progress: {
        Row: {
          artifact_awarded: string | null
          badge_awarded: string | null
          completed_at: string | null
          correct_count: number
          created_at: string
          dinars_earned: number
          hearts_earned: number
          id: string
          investigation_id: string
          legacy_key: string | null
          reward_snapshot: Json | null
          score: number
          status: string
          updated_at: string
          user_id: string
          xp_earned: number
        }
        Insert: {
          artifact_awarded?: string | null
          badge_awarded?: string | null
          completed_at?: string | null
          correct_count?: number
          created_at?: string
          dinars_earned?: number
          hearts_earned?: number
          id?: string
          investigation_id: string
          legacy_key?: string | null
          reward_snapshot?: Json | null
          score?: number
          status?: string
          updated_at?: string
          user_id: string
          xp_earned?: number
        }
        Update: {
          artifact_awarded?: string | null
          badge_awarded?: string | null
          completed_at?: string | null
          correct_count?: number
          created_at?: string
          dinars_earned?: number
          hearts_earned?: number
          id?: string
          investigation_id?: string
          legacy_key?: string | null
          reward_snapshot?: Json | null
          score?: number
          status?: string
          updated_at?: string
          user_id?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_investigation_progress_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_investigation_progress_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding_state: {
        Row: {
          completed_at: string
          completed_version: number
          created_at: string
          id: string
          tutorial_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          completed_version: number
          created_at?: string
          id?: string
          tutorial_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string
          completed_version?: number
          created_at?: string
          id?: string
          tutorial_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reflections: {
        Row: {
          activity_id: string
          campaign_id: string
          choice_index: number | null
          choice_value: string | null
          context_id: string
          created_at: string
          id: string
          mode: string
          note: string | null
          source_id: string
          source_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          campaign_id: string
          choice_index?: number | null
          choice_value?: string | null
          context_id: string
          created_at?: string
          id?: string
          mode: string
          note?: string | null
          source_id: string
          source_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          campaign_id?: string
          choice_index?: number | null
          choice_value?: string | null
          context_id?: string
          created_at?: string
          id?: string
          mode?: string
          note?: string | null
          source_id?: string
          source_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_story_completions: {
        Row: {
          content_version_at_completion: number
          created_at: string
          first_completed_at: string
          metadata: Json
          reward_delta_id: string
          reward_dinars: number
          reward_xp: number
          story_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_version_at_completion: number
          created_at?: string
          first_completed_at?: string
          metadata?: Json
          reward_delta_id: string
          reward_dinars?: number
          reward_xp?: number
          story_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_version_at_completion?: number
          created_at?: string
          first_completed_at?: string
          metadata?: Json
          reward_delta_id?: string
          reward_dinars?: number
          reward_xp?: number
          story_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_story_completions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_story_progress: {
        Row: {
          content_version_seen: number
          created_at: string
          last_scene_index: number
          max_scene_index_reached: number
          story_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_version_seen?: number
          created_at?: string
          last_scene_index?: number
          max_scene_index_reached?: number
          story_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_version_seen?: number
          created_at?: string
          last_scene_index?: number
          max_scene_index_reached?: number
          story_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_story_progress_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_story_unlock_notices: {
        Row: {
          seen_at: string
          story_id: string
          user_id: string
        }
        Insert: {
          seen_at?: string
          story_id: string
          user_id: string
        }
        Update: {
          seen_at?: string
          story_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_streak_days: {
        Row: {
          activity_day: string
          client_key: string | null
          created_at: string
          source: string | null
          source_id: string | null
          user_id: string
        }
        Insert: {
          activity_day: string
          client_key?: string | null
          created_at?: string
          source?: string | null
          source_id?: string | null
          user_id: string
        }
        Update: {
          activity_day?: string
          client_key?: string | null
          created_at?: string
          source?: string | null
          source_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_streak_reward_claims: {
        Row: {
          artifact_id: string | null
          badge_id: string | null
          claimed_at: string
          dinars_granted: number
          id: string
          milestone_days: number
          reward_key: string
          reward_version: number
          source: string | null
          title_id: string | null
          user_id: string
          xp_granted: number
        }
        Insert: {
          artifact_id?: string | null
          badge_id?: string | null
          claimed_at?: string
          dinars_granted?: number
          id?: string
          milestone_days: number
          reward_key: string
          reward_version?: number
          source?: string | null
          title_id?: string | null
          user_id: string
          xp_granted?: number
        }
        Update: {
          artifact_id?: string | null
          badge_id?: string | null
          claimed_at?: string
          dinars_granted?: number
          id?: string
          milestone_days?: number
          reward_key?: string
          reward_version?: number
          source?: string | null
          title_id?: string | null
          user_id?: string
          xp_granted?: number
        }
        Relationships: []
      }
      user_titles: {
        Row: {
          earned_at: string
          source_achievement_id: string | null
          title_id: string
          user_id: string
        }
        Insert: {
          earned_at?: string
          source_achievement_id?: string | null
          title_id: string
          user_id: string
        }
        Update: {
          earned_at?: string
          source_achievement_id?: string | null
          title_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      campaigns_public: {
        Row: {
          content_version: number | null
          created_at: string | null
          data: Json | null
          id: string | null
          key_art_credit: string | null
          key_art_path: string | null
          key_art_square_path: string | null
          published_at: string | null
          slug: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          content_version?: number | null
          created_at?: string | null
          data?: Json | null
          id?: string | null
          key_art_credit?: string | null
          key_art_path?: string | null
          key_art_square_path?: string | null
          published_at?: string | null
          slug?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          content_version?: number | null
          created_at?: string | null
          data?: Json | null
          id?: string | null
          key_art_credit?: string | null
          key_art_path?: string | null
          key_art_square_path?: string | null
          published_at?: string | null
          slug?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      investigations_public: {
        Row: {
          content_version: number | null
          created_at: string | null
          description: string | null
          difficulty: string | null
          enabled: boolean | null
          id: string | null
          published_at: string | null
          related_entities: Json | null
          reward: Json | null
          slug: string | null
          steps: Json | null
          subtitle: string | null
          title: string | null
          updated_at: string | null
          world_slug: string | null
        }
        Insert: {
          content_version?: number | null
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          enabled?: boolean | null
          id?: string | null
          published_at?: string | null
          related_entities?: Json | null
          reward?: Json | null
          slug?: string | null
          steps?: Json | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
          world_slug?: string | null
        }
        Update: {
          content_version?: number | null
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          enabled?: boolean | null
          id?: string | null
          published_at?: string | null
          related_entities?: Json | null
          reward?: Json | null
          slug?: string | null
          steps?: Json | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
          world_slug?: string | null
        }
        Relationships: []
      }
      reflections_unified_v1: {
        Row: {
          anchor_id: string | null
          anchor_type: string | null
          author_id: string | null
          body: string | null
          created_at: string | null
          id: string | null
          likes: number | null
          replies: number | null
          source: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _admin_import_stories_v2_apply_core: {
        Args: { p_options?: Json; p_payload: Json }
        Returns: Json
      }
      _admin_import_stories_v2_preview_core: {
        Args: { p_options?: Json; p_payload: Json }
        Returns: Json
      }
      _emit_personal_notification: {
        Args: {
          p_actor: string
          p_batch_key: string
          p_batched?: boolean
          p_kind: string
          p_payload: Json
          p_subject_id: string
          p_subject_type: Database["public"]["Enums"]["social_anchor_type"]
          p_user_id: string
        }
        Returns: undefined
      }
      _ev_has: {
        Args: { p_ev: Json; p_key: string; p_val: string }
        Returns: boolean
      }
      _eval_unlock_node_guest_v2: {
        Args: { p_depth: number; p_ev: Json; p_node: Json }
        Returns: boolean
      }
      _eval_unlock_node_v2: {
        Args: { p_depth: number; p_node: Json; p_user_id: string }
        Returns: boolean
      }
      _feedback_dispatch_push: {
        Args: {
          p_body: string
          p_dedupe: string
          p_deep_link: string
          p_title: string
          p_user: string
        }
        Returns: boolean
      }
      _feedback_main_admin_id: { Args: never; Returns: string }
      _feedback_notify_admin: {
        Args: {
          p_admin: string
          p_body: string
          p_issue: string
          p_title: string
        }
        Returns: undefined
      }
      _normalize_comment_body: { Args: { p: string }; Returns: string }
      _story_canonicalize_incoming_v2: { Args: { p_in: Json }; Returns: Json }
      _story_export_v2_one: { Args: { p_id: string }; Returns: Json }
      _story_intro_import_issues: {
        Args: { p_options?: Json; p_payload: Json }
        Returns: Json
      }
      _story_normalize_unlock_v2: { Args: { p_in: Json }; Returns: Json }
      _story_prereqs_v2: {
        Args: { p_spec: Json; p_uid: string }
        Returns: Json
      }
      _story_redact_summary_v2: {
        Args: {
          p_completed: boolean
          p_is_editor: boolean
          p_prereqs: Json
          p_progress: Json
          p_row: Database["public"]["Tables"]["stories"]["Row"]
          p_scene_count: number
          p_unlocked: boolean
        }
        Returns: Json
      }
      _story_validate_v2_one: { Args: { p_in: Json }; Returns: Json }
      ack_announcement_v16: {
        Args: { p_action?: string; p_announcement_id: string }
        Returns: boolean
      }
      add_story_comment_v2: {
        Args: {
          p_anchor_id: string
          p_anchor_type: Database["public"]["Enums"]["social_anchor_type"]
          p_body: string
        }
        Returns: Json
      }
      admin_adjust_balance: {
        Args: {
          p_delta: number
          p_field: string
          p_reason: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_assign_role: {
        Args: {
          p_reason?: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      admin_attach_scene_media: {
        Args: { p_media_id: string; p_scene_id: string; p_story_id: string }
        Returns: Json
      }
      admin_attach_story_cover: {
        Args: { p_media_id: string; p_story_id: string }
        Returns: Json
      }
      admin_campaign_progress_impact: {
        Args: { v_campaign_id: string; v_incoming: Json }
        Returns: Json
      }
      admin_campaign_progress_stats: { Args: { p_id: string }; Returns: Json }
      admin_delete_story: {
        Args: { p_force?: boolean; p_mode?: string; p_story_id: string }
        Returns: Json
      }
      admin_delete_story_media: {
        Args: { p_media_id: string }
        Returns: {
          storage_bucket: string
          storage_path: string
        }[]
      }
      admin_delete_story_scene: {
        Args: { p_scene_id: string; p_story_id: string }
        Returns: boolean
      }
      admin_export_campaigns: { Args: { p_ids?: string[] }; Returns: Json }
      admin_export_investigations: {
        Args: { p_ids?: string[]; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      admin_export_stories: { Args: { p_ids: string[] }; Returns: Json }
      admin_export_stories_v2: { Args: { p_ids?: string[] }; Returns: Json }
      admin_feedback_stats: { Args: never; Returns: Json }
      admin_get_campaign_full: {
        Args: { p_id: string }
        Returns: {
          content_version: number
          created_at: string
          data: Json
          draft_data: Json | null
          has_unpublished_changes: boolean
          id: string
          key_art_credit: string | null
          key_art_path: string | null
          key_art_source: string | null
          key_art_square_path: string | null
          last_editor_email: string | null
          published_at: string | null
          slug: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_campaigns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_campaign_key_art: {
        Args: { p_id: string }
        Returns: {
          id: string
          key_art_credit: string
          key_art_path: string
          key_art_source: string
          key_art_square_path: string
          slug: string
          title: string
        }[]
      }
      admin_get_investigation_full: {
        Args: { p_id_or_slug: string }
        Returns: Json
      }
      admin_get_investigation_version: {
        Args: { p_id: string; p_version: number }
        Returns: Json
      }
      admin_get_story_full: { Args: { p_story_id: string }; Returns: Json }
      admin_import_campaigns_v2: {
        Args: { p_options?: Json; p_payload: Json }
        Returns: Json
      }
      admin_import_content_table: { Args: { p_ctype: string }; Returns: string }
      admin_import_investigations_v2: {
        Args: { p_options?: Json; p_payload: Json }
        Returns: Json
      }
      admin_import_stories_apply: {
        Args: { p_options?: Json; p_payload: Json }
        Returns: Json
      }
      admin_import_stories_preview: { Args: { p_payload: Json }; Returns: Json }
      admin_import_stories_v2_apply: {
        Args: { p_options?: Json; p_payload: Json }
        Returns: Json
      }
      admin_import_stories_v2_preview: {
        Args: { p_options?: Json; p_payload: Json }
        Returns: Json
      }
      admin_investigation_reward_audit: { Args: never; Returns: Json }
      admin_investigation_reward_reconcile: {
        Args: { p_dry_run?: boolean; p_user_ids?: string[] }
        Returns: Json
      }
      admin_list_campaign_versions: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          editor_email: string
          note: string
          title: string
          version: number
        }[]
      }
      admin_list_campaigns_full: {
        Args: never
        Returns: {
          content_version: number
          created_at: string
          data: Json
          draft_data: Json | null
          has_unpublished_changes: boolean
          id: string
          key_art_credit: string | null
          key_art_path: string | null
          key_art_source: string | null
          key_art_square_path: string | null
          last_editor_email: string | null
          published_at: string | null
          slug: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_campaigns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_feedback_issues: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_list_investigation_qa_status: {
        Args: never
        Returns: {
          created_at: string
          investigation_id: string
          note: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "investigation_qa_status"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_investigation_versions: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          editor_email: string
          note: string
          source: string
          title: string
          version: number
        }[]
      }
      admin_list_investigations: {
        Args: never
        Returns: {
          created_at: string
          difficulty: string
          enabled: boolean
          id: string
          question_count: number
          related_count: number
          related_entities: Json
          reward: Json
          slug: string
          step_count: number
          subtitle: string
          title: string
          updated_at: string
        }[]
      }
      admin_list_newsletter_subscribers: {
        Args: {
          p_filter?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_source?: string
          p_to?: string
        }
        Returns: {
          confirmed: boolean
          confirmed_at: string
          created_at: string
          email: string
          id: string
          is_suppressed: boolean
          source: string
          subscribed: boolean
          suppression_reason: string
          unsubscribed_at: string
          updated_at: string
          user_id: string
        }[]
      }
      admin_list_stories: {
        Args: never
        Returns: {
          content_version: number
          cover_media_id: string
          created_at: string
          dinar_reward: number
          display_order: number
          era: string
          id: string
          published_at: string
          scene_count: number
          slug: string
          status: string
          title_ar: string
          title_en: string
          updated_at: string
          world_slug: string
          xp_reward: number
        }[]
      }
      admin_list_story_media_orphans: {
        Args: { p_min_age_minutes?: number }
        Returns: {
          age_minutes: number
          byte_size: number
          id: string
          kind: string
          owner_scope: string
          preset: string
          storage_bucket: string
          storage_path: string
          verified: boolean
        }[]
      }
      admin_list_users: {
        Args: {
          p_filter?: string
          p_joined_after?: string
          p_joined_before?: string
          p_limit?: number
          p_max_level?: number
          p_min_level?: number
          p_offset?: number
          p_search?: string
        }
        Returns: Json
      }
      admin_mark_story_media_verified: {
        Args: {
          p_media_id: string
          p_observed_bytes: number
          p_observed_checksum: string
        }
        Returns: boolean
      }
      admin_merge_campaign_stable_ids: {
        Args: { v_existing: Json; v_incoming: Json }
        Returns: Json
      }
      admin_merge_investigation_stable_ids: {
        Args: { v_before: Json; v_data: Json }
        Returns: Json
      }
      admin_newsletter_stats: { Args: never; Returns: Json }
      admin_notification_stats: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      admin_publish_campaign: {
        Args: { p_id: string; p_note?: string }
        Returns: Json
      }
      admin_publish_investigation: {
        Args: {
          p_allow_removals?: boolean
          p_id: string
          p_note?: string
          p_version_signal?: string
        }
        Returns: Json
      }
      admin_register_story_media: {
        Args: {
          p_byte_size: number
          p_checksum_sha256: string
          p_height: number
          p_kind: string
          p_metadata?: Json
          p_mime_type: string
          p_preset: string
          p_processing_version: number
          p_storage_bucket: string
          p_storage_path: string
          p_story_id: string
          p_width: number
        }
        Returns: string
      }
      admin_reorder_story_scenes: {
        Args: { p_ordered_ids: string[]; p_story_id: string }
        Returns: boolean
      }
      admin_repair_chapter_completions_stickiness: {
        Args: never
        Returns: {
          rows_repaired: number
        }[]
      }
      admin_resolve_segment: {
        Args: { p_segment_id: string }
        Returns: string[]
      }
      admin_resolve_segment_v16: {
        Args: { p_filter?: Json; p_segment_id?: string }
        Returns: string[]
      }
      admin_restore_campaign_version: {
        Args: { p_as_draft?: boolean; p_id: string; p_version: number }
        Returns: Json
      }
      admin_restore_investigation_version_to_draft: {
        Args: { p_id: string; p_version: number }
        Returns: Json
      }
      admin_restore_previous_draft: {
        Args: { p_story_id: string }
        Returns: Json
      }
      admin_resubscribe_newsletter: {
        Args: { p_consent_evidence: string; p_id: string }
        Returns: Json
      }
      admin_revoke_role: {
        Args: {
          p_reason?: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      admin_rollback_campaign_batch: {
        Args: { p_batch: string; p_force?: boolean }
        Returns: Json
      }
      admin_rollback_import_batch: {
        Args: { p_batch: string; p_force?: boolean }
        Returns: Json
      }
      admin_run_campaign_batch: {
        Args: { p_mode: string; plan: Json }
        Returns: Json
      }
      admin_run_import_batch: {
        Args: { p_mode: string; plan: Json }
        Returns: Json
      }
      admin_save_campaign_draft: {
        Args: {
          p_draft_data: Json
          p_id: string
          p_slug: string
          p_title: string
        }
        Returns: Json
      }
      admin_save_investigation_draft: {
        Args: {
          p_allow_removals?: boolean
          p_draft: Json
          p_id: string
          p_version_signal?: string
        }
        Returns: Json
      }
      admin_segment_audience_v16: {
        Args: { p_filter?: Json; p_segment_id?: string }
        Returns: Json
      }
      admin_set_account_status: {
        Args: { p_reason: string; p_status: string; p_user_id: string }
        Returns: Json
      }
      admin_set_announcement_active_v16: {
        Args: { p_active: boolean; p_confirm?: string; p_id: string }
        Returns: boolean
      }
      admin_set_artifact_rarity: {
        Args: { _ids: string[]; _rarity: string }
        Returns: Json
      }
      admin_set_campaign_key_art: {
        Args: {
          p_credit: string
          p_id: string
          p_path: string
          p_source: string
          p_square_path: string
        }
        Returns: {
          id: string
          key_art_credit: string
          key_art_path: string
          key_art_source: string
          key_art_square_path: string
        }[]
      }
      admin_set_investigation_enabled: {
        Args: { p_enabled: boolean; p_id: string }
        Returns: Json
      }
      admin_set_investigation_qa_status: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: {
          created_at: string
          investigation_id: string
          note: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "investigation_qa_status"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_story_status: {
        Args: { p_status: string; p_story_id: string }
        Returns: Json
      }
      admin_slug_available: {
        Args: { p_ignore_id?: string; p_slug: string }
        Returns: boolean
      }
      admin_story_delete_impact: { Args: { p_ids: string[] }; Returns: Json }
      admin_system_health: { Args: never; Returns: Json }
      admin_unsubscribe_newsletter: {
        Args: { p_id: string; p_reason?: string }
        Returns: Json
      }
      admin_upsert_announcement_v16: {
        Args: { p_payload: Json }
        Returns: string
      }
      admin_upsert_story: { Args: { p_payload: Json }; Returns: Json }
      admin_upsert_story_scene: { Args: { p_payload: Json }; Returns: Json }
      admin_user_detail: { Args: { p_user_id: string }; Returns: Json }
      admin_validate_activity_shape: { Args: { v_act: Json }; Returns: Json }
      admin_validate_campaign_payload: { Args: { v_data: Json }; Returns: Json }
      admin_validate_investigation_payload: {
        Args: { v_allow_removals: boolean; v_before: Json; v_data: Json }
        Returns: undefined
      }
      admin_validate_story_publish: {
        Args: { p_story_id: string }
        Returns: Json
      }
      advance_referral_stage: { Args: { p_stage: number }; Returns: Json }
      analytics_atlas: { Args: never; Returns: Json }
      analytics_comms: { Args: { p_from: string; p_to: string }; Returns: Json }
      analytics_content_health: { Args: never; Returns: Json }
      analytics_content_progress: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      analytics_economy: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      analytics_growth_activity: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      analytics_overview: { Args: never; Returns: Json }
      analytics_system_health: { Args: never; Returns: Json }
      analytics_timeseries: {
        Args: {
          p_bucket?: string
          p_from: string
          p_metric: string
          p_to: string
        }
        Returns: Json
      }
      announcement_segment_matches_v16: {
        Args: { p_filter: Json; p_segment_id: string; p_uid: string }
        Returns: boolean
      }
      apply_contribution_v2: {
        Args: {
          p_comment_id: string
          p_editor_note?: string
          p_public_notice: string
        }
        Returns: Json
      }
      apply_profile_delta: {
        Args: {
          p_delta_id: string
          p_dinars?: number
          p_hearts?: number
          p_source?: string
          p_xp?: number
        }
        Returns: Json
      }
      archive_contribution_v2: {
        Args: { p_comment_id: string; p_editor_note?: string }
        Returns: Json
      }
      assign_feedback_issue: {
        Args: { p_assignee: string; p_issue_id: string }
        Returns: undefined
      }
      backfill_investigation_completion: {
        Args: { p_legacy_key: string }
        Returns: Json
      }
      backfill_investigation_completions: {
        Args: { p_legacy_keys: string[] }
        Returns: Json
      }
      campaign_id_for_intro_story: {
        Args: { p_story_id: string }
        Returns: string
      }
      campaign_intros_sync_v1: {
        Args: { p_since?: string; p_story_ids?: string[] }
        Returns: Json
      }
      claim_achievement_rewards: {
        Args: { _ids: string[] }
        Returns: {
          already_claimed: string[]
          inserted: string[]
          rejected: string[]
        }[]
      }
      claim_signup_referral_rewards: { Args: never; Returns: Json }
      claim_streak_reward: { Args: { p_days: number }; Returns: Json }
      clear_my_notifications: { Args: never; Returns: undefined }
      complete_investigation_v2: {
        Args: {
          p_correct_count?: number
          p_delta_id: string
          p_investigation_id: string
          p_score?: number
        }
        Returns: Json
      }
      complete_story_v2: { Args: { p_story_id: string }; Returns: Json }
      count_my_unread_feedback: { Args: never; Returns: number }
      create_feedback_issue: {
        Args: {
          p_category: string
          p_context?: Json
          p_description: string
          p_title: string
        }
        Returns: string
      }
      current_user_capabilities: { Args: never; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_my_notification: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      delete_own_comment_v2: { Args: { p_comment_id: string }; Returns: Json }
      dismiss_report_v2: {
        Args: { p_note?: string; p_report_id: string }
        Returns: Json
      }
      edit_story_comment_v2: {
        Args: { p_body: string; p_comment_id: string }
        Returns: Json
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      emit_story_unlock_notification: {
        Args: { p_story_id: string; p_user_id: string }
        Returns: Json
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_atlas_drafts_for_encyclopedia: { Args: never; Returns: Json }
      ensure_my_delivery: {
        Args: { p_notification_id: string }
        Returns: string
      }
      evaluate_unlock_spec: {
        Args: { p_spec: Json; p_user_id: string }
        Returns: boolean
      }
      evaluate_unlock_spec_guest_v2: {
        Args: { p_ev: Json; p_spec: Json }
        Returns: boolean
      }
      evaluate_unlock_spec_v2: {
        Args: { p_spec: Json; p_user_id: string }
        Returns: boolean
      }
      gen_referral_code: { Args: never; Returns: string }
      get_active_announcements_v16: {
        Args: { p_platform?: string }
        Returns: {
          body: string
          cta_label: string
          dismissible: boolean
          effective_at: string
          external_url: string
          id: string
          internal_path: string
          kind: string
          min_version_code: number
          once_per_user: boolean
          platform: string
          priority: number
          recommended_version_code: number
          server_time: string
          title: string
        }[]
      }
      get_content_manifest: {
        Args: never
        Returns: {
          collection: string
          last_updated: string
          total_count: number
        }[]
      }
      get_feedback_issue_thread: { Args: { p_issue_id: string }; Returns: Json }
      get_gated_public_profile: { Args: { p_user_id: string }; Returns: Json }
      get_gated_public_profile_by_username: {
        Args: { p_username: string }
        Returns: Json
      }
      get_my_email: { Args: never; Returns: string }
      get_my_newsletter_subscription: { Args: never; Returns: Json }
      get_my_notification_preferences: { Args: never; Returns: Json }
      get_my_profile: {
        Args: never
        Returns: {
          account_status: string
          artifacts_collected: number
          avatar_id: string | null
          bio: string | null
          campaigns_completed: number
          created_at: string
          dinars: number
          discovery_pct: number
          display_name: string | null
          email: string | null
          favorite_figure_id: string | null
          favorite_state_id: string | null
          hearts: number
          hearts_at: string | null
          hearts_full_notified_at: string | null
          id: string
          investigations_completed: number
          join_date: string
          last_active: string
          last_streak_day: string | null
          level: number
          locale: string
          longest_streak: number
          marketing_opt_in: boolean
          museum_items_unlocked: number
          notification_started_at: string
          referral_code: string | null
          referred_by: string | null
          streak: number
          title: string | null
          updated_at: string
          username: string
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_reactions_for_anchors_v2: {
        Args: {
          p_anchor_ids: string[]
          p_anchor_type: Database["public"]["Enums"]["social_anchor_type"]
        }
        Returns: {
          active: boolean
          anchor_id: string
          count: number
        }[]
      }
      get_story_access: { Args: { p_story_id: string }; Returns: Json }
      get_story_bundle_guest_v2: {
        Args: { p_evidence?: Json; p_story_id: string }
        Returns: Json
      }
      get_story_bundle_v2: { Args: { p_story_id: string }; Returns: Json }
      get_story_collection_v2: {
        Args: { p_collection_id: string }
        Returns: Json
      }
      get_story_media_urls_v2: { Args: { p_story_id: string }; Returns: Json }
      get_tutorial_completion: {
        Args: { p_tutorial_id: string }
        Returns: Json
      }
      grant_level5_reward: { Args: { p_referred_id: string }; Returns: string }
      grant_signup_reward: { Args: { p_referred_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_content_admin: { Args: never; Returns: boolean }
      is_content_editor: { Args: never; Returns: boolean }
      is_feedback_staff: { Args: { _uid?: string }; Returns: boolean }
      is_newsletter_admin: { Args: never; Returns: boolean }
      is_user_manager: { Args: never; Returns: boolean }
      is_username_available: { Args: { p_username: string }; Returns: boolean }
      journey_kind_counts: {
        Args: never
        Returns: {
          kind: Database["public"]["Enums"]["journey_event_kind"]
          total: number
        }[]
      }
      leaderboard_around: {
        Args: {
          p_metric?: string
          p_period_key?: string
          p_timeframe?: string
          p_window?: number
        }
        Returns: {
          avatar_id: string
          display_name: string
          id: string
          is_friend: boolean
          is_me: boolean
          level: number
          metric: string
          period_key: string
          rank: number
          score: number
          timeframe: string
          username: string
          xp: number
        }[]
      }
      leaderboard_around_me: {
        Args: { p_window?: number }
        Returns: {
          avatar_id: string
          display_name: string
          id: string
          is_friend: boolean
          is_me: boolean
          level: number
          rank: number
          username: string
          xp: number
        }[]
      }
      leaderboard_global: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          avatar_id: string
          display_name: string
          id: string
          is_friend: boolean
          is_me: boolean
          level: number
          rank: number
          username: string
          xp: number
        }[]
      }
      leaderboard_resolve_metric: {
        Args: { p_metric: string }
        Returns: string
      }
      leaderboard_top: {
        Args: {
          p_limit?: number
          p_metric?: string
          p_offset?: number
          p_period_key?: string
          p_timeframe?: string
        }
        Returns: {
          avatar_id: string
          display_name: string
          id: string
          is_friend: boolean
          is_me: boolean
          level: number
          metric: string
          period_key: string
          rank: number
          score: number
          timeframe: string
          username: string
          xp: number
        }[]
      }
      list_comment_reports_v2: { Args: { p_comment_id: string }; Returns: Json }
      list_comments_v2: {
        Args: {
          p_anchor_id: string
          p_anchor_type: Database["public"]["Enums"]["social_anchor_type"]
          p_cursor?: string
          p_limit?: number
          p_sort?: string
        }
        Returns: Json
      }
      list_contribution_queue_v2: {
        Args: { p_cursor?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      list_moderation_history_v2: {
        Args: { p_comment_id: string }
        Returns: Json
      }
      list_moderator_queue_v2: {
        Args: { p_cursor?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      list_my_campaign_completions: {
        Args: never
        Returns: {
          campaign_id: string
          campaign_version: number
          completed_at: string
          source: string
        }[]
      }
      list_my_campaign_intros: {
        Args: never
        Returns: {
          campaign_id: string
          first_started_at: string
          intro_version: number
          last_scene_index: number
          resolved_at: string
          status: string
          story_id: string
        }[]
      }
      list_my_feedback_issues: {
        Args: never
        Returns: {
          admin_unread: boolean
          assigned_to: string | null
          category: string
          context: Json
          created_at: string
          description: string
          device_id: string | null
          id: string
          last_reply_at: string | null
          last_reply_by: string | null
          player_rating: number | null
          player_rating_at: string | null
          player_unread: boolean
          reporter_id: string | null
          status: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "feedback_issues"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_my_journey: {
        Args: {
          _cursor_id?: string
          _cursor_ts?: string
          _kinds?: Database["public"]["Enums"]["journey_event_kind"][]
          _limit?: number
        }
        Returns: {
          event_id: string
          kind: Database["public"]["Enums"]["journey_event_kind"]
          metadata: Json
          occurred_at: string
          subject_id: string
          subject_type: string
        }[]
      }
      list_my_notifications:
        | { Args: { p_cursor?: string; p_limit?: number }; Returns: Json }
        | { Args: { p_before?: string; p_limit?: number }; Returns: Json }
      list_my_reflections_v1: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      list_public_contributions_v2: {
        Args: {
          p_anchor_id: string
          p_anchor_type: Database["public"]["Enums"]["social_anchor_type"]
        }
        Returns: Json
      }
      list_public_profiles: {
        Args: {
          p_exclude_id?: string
          p_ids?: string[]
          p_limit?: number
          p_search?: string
          p_username?: string
        }
        Returns: {
          artifacts_collected: number
          avatar_id: string
          bio: string
          campaigns_completed: number
          discovery_pct: number
          display_name: string
          favorite_figure_id: string
          favorite_state_id: string
          id: string
          investigations_completed: number
          join_date: string
          level: number
          longest_streak: number
          museum_items_unlocked: number
          streak: number
          title: string
          username: string
          xp: number
        }[]
      }
      list_published_stories: {
        Args: never
        Returns: {
          content_version: number
          cover_media_id: string
          dinar_reward: number
          display_order: number
          era: string
          id: string
          published_at: string
          slug: string
          summary_ar: string
          title_ar: string
          title_en: string
          world_slug: string
          xp_reward: number
        }[]
      }
      list_stories_guest_v3: {
        Args: {
          p_collection_id?: string
          p_evidence?: Json
          p_world_slug?: string
        }
        Returns: Json
      }
      list_stories_v2: { Args: { p_world_slug?: string }; Returns: Json }
      list_stories_v3: {
        Args: { p_collection_id?: string; p_world_slug?: string }
        Returns: Json
      }
      list_story_collections_v2: { Args: never; Returns: Json }
      list_story_relations_v1: {
        Args: never
        Returns: {
          display_order: number
          role: string
          story_id: string
          target_id: string
          target_type: string
        }[]
      }
      log_admin_action: {
        Args: {
          p_action: string
          p_detail: Json
          p_reason: string
          p_target: string
        }
        Returns: string
      }
      mark_achievement_notified: {
        Args: { _id: string; _origin?: string }
        Returns: boolean
      }
      mark_achievement_presented: {
        Args: { _ids: string[]; _origin?: string }
        Returns: string[]
      }
      mark_all_my_notifications_read: { Args: never; Returns: Json }
      mark_all_notifications_read: { Args: never; Returns: Json }
      mark_contribution_v2: {
        Args: {
          p_category: Database["public"]["Enums"]["contribution_category"]
          p_comment_id: string
          p_note?: string
        }
        Returns: Json
      }
      mark_feedback_issue_read: {
        Args: { p_issue_id: string }
        Returns: undefined
      }
      mark_hearts_full_notified: {
        Args: { _user_id: string }
        Returns: undefined
      }
      mark_my_notification_read: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      mark_notification_read: { Args: { p_id: string }; Returns: Json }
      moderate_comment_v2: {
        Args: {
          p_action: string
          p_comment_id: string
          p_rank?: number
          p_reason?: string
        }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_claimed_streak_rewards: { Args: never; Returns: number[] }
      my_contribution_flags_v2: {
        Args: { p_comment_ids: string[] }
        Returns: Json
      }
      my_pending_badges: { Args: never; Returns: Json }
      my_referral_stats: { Args: never; Returns: Json }
      my_unread_notification_count: { Args: never; Returns: number }
      normalize_unlock_spec_v2: { Args: { p_input: Json }; Returns: Json }
      purchase_heart: { Args: never; Returns: Json }
      purge_user_account_data: { Args: { p_user_id: string }; Returns: Json }
      rate_feedback_issue: {
        Args: { p_issue_id: string; p_rating: number }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reauth_challenges_cleanup: { Args: never; Returns: undefined }
      rebuild_reaction_counters: { Args: never; Returns: Json }
      record_campaign_completion: {
        Args: {
          p_campaign_id: string
          p_campaign_version?: number
          p_source?: string
        }
        Returns: Json
      }
      record_campaign_intro_v1: {
        Args: {
          p_campaign_id: string
          p_intro_version?: number
          p_last_scene_index?: number
          p_status?: string
          p_story_id?: string
        }
        Returns: Json
      }
      record_campaign_progress_v2: {
        Args: {
          p_campaign_id: string
          p_chapter_id: string
          p_coins_earned?: number
          p_completed?: boolean
          p_score?: number
          p_xp_earned?: number
        }
        Returns: Json
      }
      record_identity_link: { Args: { p_provider: string }; Returns: Json }
      record_notification_click: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      record_notification_dismissed: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      record_story_progress_v2: {
        Args: { p_scene_index: number; p_story_id: string }
        Returns: Json
      }
      record_streak_activity: {
        Args: { p_source?: string; p_source_id?: string }
        Returns: Json
      }
      record_streak_activity_v16: {
        Args: {
          p_activity_day?: string
          p_client_key?: string
          p_source?: string
          p_source_id?: string
        }
        Returns: Json
      }
      record_tutorial_completion: {
        Args: { p_tutorial_id: string; p_version: number }
        Returns: Json
      }
      redeem_referral_code: { Args: { p_code: string }; Returns: Json }
      repair_historical_achievements: {
        Args: { _ids: string[]; _metadata?: Json }
        Returns: {
          existing: string[]
          rejected: string[]
          repaired: string[]
        }[]
      }
      reply_to_feedback_issue: {
        Args: { p_body: string; p_is_internal?: boolean; p_issue_id: string }
        Returns: string
      }
      report_comment_v2: {
        Args: {
          p_comment_id: string
          p_note?: string
          p_reason: Database["public"]["Enums"]["report_reason"]
        }
        Returns: Json
      }
      send_friend_request_reminders: { Args: never; Returns: number }
      set_feedback_issue_status: {
        Args: { p_issue_id: string; p_status: string }
        Returns: undefined
      }
      set_my_display_name: { Args: { p_name: string }; Returns: string }
      set_my_newsletter_subscription: {
        Args: { p_source?: string; p_subscribed: boolean }
        Returns: Json
      }
      set_my_notification_preferences: {
        Args: { p_categories: Json }
        Returns: undefined
      }
      set_my_username: { Args: { p_username: string }; Returns: string }
      stable_delta_uuid: { Args: { p_key: string }; Returns: string }
      stories_snapshot_manifest_v2: {
        Args: { p_include_on_demand?: boolean }
        Returns: Json
      }
      story_is_campaign_intro: {
        Args: { p_metadata: Json; p_story_id: string; p_tags: string[] }
        Returns: boolean
      }
      story_media_reference_count: {
        Args: { p_media_id: string }
        Returns: number
      }
      sync_my_public_stats: { Args: { p_stats: Json }; Returns: undefined }
      toggle_reaction_v2: {
        Args: {
          p_anchor_id: string
          p_anchor_type: Database["public"]["Enums"]["social_anchor_type"]
        }
        Returns: Json
      }
      touch_my_last_active: { Args: never; Returns: undefined }
      unmark_contribution_v2: {
        Args: { p_comment_id: string; p_reason?: string }
        Returns: Json
      }
      unread_delivery_count: { Args: never; Returns: number }
      unread_notification_count: { Args: never; Returns: number }
      validate_unlock_spec_v2: { Args: { p_input: Json }; Returns: Json }
    }
    Enums: {
      app_role: "owner" | "admin" | "editor" | "player"
      atlas_entity_kind:
        | "place"
        | "battle"
        | "event"
        | "figure_marker"
        | "artifact_site"
        | "region"
        | "route_point"
      atlas_entity_status: "draft" | "review" | "published" | "retired"
      contribution_category:
        | "fact_correction"
        | "additional_context"
        | "source_reference"
        | "translation_nuance"
        | "other"
      contribution_status: "proposed" | "applied" | "archived"
      game_mode:
        | "crossword"
        | "chronology"
        | "who_am_i"
        | "connections"
        | "memory"
      game_status: "draft" | "published" | "archived"
      journey_event_kind:
        | "story_completed"
        | "campaign_completed"
        | "investigation_completed"
        | "achievement_earned"
        | "encyclopedia_discovery"
        | "museum_discovery"
      report_reason:
        | "spam"
        | "harassment"
        | "off_topic"
        | "misinformation"
        | "inappropriate"
        | "other"
      social_anchor_type: "story" | "comment" | "entity"
      story_category:
        | "event"
        | "character"
        | "city"
        | "landmark"
        | "battle"
        | "artifact"
        | "document"
        | "daily_life"
        | "analysis"
        | "alternate_history"
      story_historical_confidence:
        | "established"
        | "debated"
        | "speculative"
        | "alternate"
      story_length_class: "short" | "standard" | "epic"
      story_lock_visibility: "visible" | "mystery" | "hidden"
      story_production_status:
        | "idea"
        | "research"
        | "writing"
        | "json_ready"
        | "imported"
        | "images_in_progress"
        | "images_linked"
        | "testing"
        | "completed"
      story_rarity: "standard" | "featured" | "rare" | "legendary"
      story_relation_role:
        | "depicts"
        | "mentions"
        | "context"
        | "prerequisite"
        | "sequel_of"
        | "prequel_of"
        | "related_reading"
        | "part_of_collection"
        | "answers_investigation"
        | "unlocks"
        | "source_context"
      story_relation_target_type:
        | "campaign"
        | "campaign_chapter"
        | "investigation"
        | "encyclopedia_entity"
        | "atlas_entity"
        | "artifact"
        | "achievement"
        | "story"
        | "collection"
        | "today_in_history_event"
      story_snapshot_tier: "core" | "standard" | "on_demand"
      story_source_kind:
        | "book"
        | "manuscript"
        | "article"
        | "quran"
        | "hadith"
        | "url"
        | "archive"
        | "other"
      story_time_precision:
        | "day"
        | "month"
        | "year"
        | "decade"
        | "century"
        | "period"
        | "unknown"
    }
    CompositeTypes: {
      [_ in never]: never
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
      app_role: ["owner", "admin", "editor", "player"],
      atlas_entity_kind: [
        "place",
        "battle",
        "event",
        "figure_marker",
        "artifact_site",
        "region",
        "route_point",
      ],
      atlas_entity_status: ["draft", "review", "published", "retired"],
      contribution_category: [
        "fact_correction",
        "additional_context",
        "source_reference",
        "translation_nuance",
        "other",
      ],
      contribution_status: ["proposed", "applied", "archived"],
      game_mode: [
        "crossword",
        "chronology",
        "who_am_i",
        "connections",
        "memory",
      ],
      game_status: ["draft", "published", "archived"],
      journey_event_kind: [
        "story_completed",
        "campaign_completed",
        "investigation_completed",
        "achievement_earned",
        "encyclopedia_discovery",
        "museum_discovery",
      ],
      report_reason: [
        "spam",
        "harassment",
        "off_topic",
        "misinformation",
        "inappropriate",
        "other",
      ],
      social_anchor_type: ["story", "comment", "entity"],
      story_category: [
        "event",
        "character",
        "city",
        "landmark",
        "battle",
        "artifact",
        "document",
        "daily_life",
        "analysis",
        "alternate_history",
      ],
      story_historical_confidence: [
        "established",
        "debated",
        "speculative",
        "alternate",
      ],
      story_length_class: ["short", "standard", "epic"],
      story_lock_visibility: ["visible", "mystery", "hidden"],
      story_production_status: [
        "idea",
        "research",
        "writing",
        "json_ready",
        "imported",
        "images_in_progress",
        "images_linked",
        "testing",
        "completed",
      ],
      story_rarity: ["standard", "featured", "rare", "legendary"],
      story_relation_role: [
        "depicts",
        "mentions",
        "context",
        "prerequisite",
        "sequel_of",
        "prequel_of",
        "related_reading",
        "part_of_collection",
        "answers_investigation",
        "unlocks",
        "source_context",
      ],
      story_relation_target_type: [
        "campaign",
        "campaign_chapter",
        "investigation",
        "encyclopedia_entity",
        "atlas_entity",
        "artifact",
        "achievement",
        "story",
        "collection",
        "today_in_history_event",
      ],
      story_snapshot_tier: ["core", "standard", "on_demand"],
      story_source_kind: [
        "book",
        "manuscript",
        "article",
        "quran",
        "hadith",
        "url",
        "archive",
        "other",
      ],
      story_time_precision: [
        "day",
        "month",
        "year",
        "decade",
        "century",
        "period",
        "unknown",
      ],
    },
  },
} as const
