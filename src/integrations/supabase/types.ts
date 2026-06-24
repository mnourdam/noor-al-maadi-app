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
      admin_campaigns: {
        Row: {
          created_at: string
          data: Json
          id: string
          slug: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
          slug?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          slug?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      atlas_entities: {
        Row: {
          aps_verified: boolean
          aps_verified_at: string | null
          aps_verified_by: string | null
          aps_x: number
          aps_y: number
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
          aps_x: number
          aps_y: number
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
          aps_x?: number
          aps_y?: number
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
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
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
      encyclopedia_entities: {
        Row: {
          body: Json
          created_at: string
          enabled: boolean
          entity_type: string
          id: string
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
          body?: Json
          created_at?: string
          enabled?: boolean
          entity_type: string
          id?: string
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
          body?: Json
          created_at?: string
          enabled?: boolean
          entity_type?: string
          id?: string
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
            foreignKeyName: "friendships_requester_fkey"
            columns: ["requester"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
            foreignKeyName: "friendships_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investigations: {
        Row: {
          created_at: string
          description: string | null
          difficulty: string
          enabled: boolean
          id: string
          related_entities: Json
          reward: Json
          slug: string
          steps: Json
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          difficulty?: string
          enabled?: boolean
          id?: string
          related_entities?: Json
          reward?: Json
          slug: string
          steps?: Json
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          difficulty?: string
          enabled?: boolean
          id?: string
          related_entities?: Json
          reward?: Json
          slug?: string
          steps?: Json
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          created_at: string
          error: string | null
          id: string
          notification_id: string
          sent_at: string | null
          status: string
          token: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          notification_id: string
          sent_at?: string | null
          status?: string
          token: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          notification_id?: string
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
      notifications: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          deep_link: string | null
          id: string
          image_url: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          target_type: string
          target_user_id: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          deep_link?: string | null
          id?: string
          image_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_type?: string
          target_user_id?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          deep_link?: string | null
          id?: string
          image_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_type?: string
          target_user_id?: string | null
          title?: string
          type?: string
          updated_at?: string
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
          id: string
          investigations_completed: number
          join_date: string
          last_active: string
          level: number
          locale: string
          longest_streak: number
          marketing_opt_in: boolean
          museum_items_unlocked: number
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
          id: string
          investigations_completed?: number
          join_date?: string
          last_active?: string
          level?: number
          locale?: string
          longest_streak?: number
          marketing_opt_in?: boolean
          museum_items_unlocked?: number
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
          id?: string
          investigations_completed?: number
          join_date?: string
          last_active?: string
          level?: number
          locale?: string
          longest_streak?: number
          marketing_opt_in?: boolean
          museum_items_unlocked?: number
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
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "referral_rewards_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      public_profiles: {
        Row: {
          artifacts_collected: number | null
          avatar_id: string | null
          bio: string | null
          campaigns_completed: number | null
          discovery_pct: number | null
          display_name: string | null
          favorite_figure_id: string | null
          favorite_state_id: string | null
          id: string | null
          level: number | null
          title: string | null
          username: string | null
        }
        Insert: {
          artifacts_collected?: number | null
          avatar_id?: string | null
          bio?: string | null
          campaigns_completed?: number | null
          discovery_pct?: number | null
          display_name?: string | null
          favorite_figure_id?: string | null
          favorite_state_id?: string | null
          id?: string | null
          level?: number | null
          title?: string | null
          username?: string | null
        }
        Update: {
          artifacts_collected?: number | null
          avatar_id?: string | null
          bio?: string | null
          campaigns_completed?: number | null
          discovery_pct?: number | null
          display_name?: string | null
          favorite_figure_id?: string | null
          favorite_state_id?: string | null
          id?: string | null
          level?: number | null
          title?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_adjust_balance: {
        Args: {
          p_delta: number
          p_field: string
          p_reason: string
          p_user_id: string
        }
        Returns: Json
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
      admin_set_account_status: {
        Args: { p_reason: string; p_status: string; p_user_id: string }
        Returns: Json
      }
      admin_user_detail: { Args: { p_user_id: string }; Returns: Json }
      advance_referral_stage: { Args: { p_stage: number }; Returns: Json }
      claim_signup_referral_rewards: { Args: never; Returns: Json }
      gen_referral_code: { Args: never; Returns: string }
      get_my_email: { Args: never; Returns: string }
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
          id: string
          investigations_completed: number
          join_date: string
          last_active: string
          level: number
          locale: string
          longest_streak: number
          marketing_opt_in: boolean
          museum_items_unlocked: number
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
      grant_level5_reward: { Args: { p_referred_id: string }; Returns: string }
      grant_signup_reward: { Args: { p_referred_id: string }; Returns: string }
      is_content_admin: { Args: never; Returns: boolean }
      log_admin_action: {
        Args: {
          p_action: string
          p_detail: Json
          p_reason: string
          p_target: string
        }
        Returns: string
      }
      my_referral_stats: { Args: never; Returns: Json }
      redeem_referral_code: { Args: { p_code: string }; Returns: Json }
      set_my_display_name: { Args: { p_name: string }; Returns: string }
      sync_my_public_stats: { Args: { p_stats: Json }; Returns: undefined }
      touch_my_last_active: { Args: never; Returns: undefined }
    }
    Enums: {
      atlas_entity_kind:
        | "place"
        | "battle"
        | "event"
        | "figure_marker"
        | "artifact_site"
        | "region"
        | "route_point"
      atlas_entity_status: "draft" | "review" | "published" | "retired"
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
    },
  },
} as const
