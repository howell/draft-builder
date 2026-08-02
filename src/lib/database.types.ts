export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cost_adjustments: {
        Row: {
          adjusted_cost: number
          created_at: string | null
          draft_session_id: string | null
          id: string
          player_id: string
          roster_position: string
          updated_at: string | null
        }
        Insert: {
          adjusted_cost: number
          created_at?: string | null
          draft_session_id?: string | null
          id?: string
          player_id: string
          roster_position: string
          updated_at?: string | null
        }
        Update: {
          adjusted_cost?: number
          created_at?: string | null
          draft_session_id?: string | null
          id?: string
          player_id?: string
          roster_position?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_adjustments_draft_session_id_fkey"
            columns: ["draft_session_id"]
            isOneToOne: false
            referencedRelation: "draft_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_sessions: {
        Row: {
          created_at: string | null
          draft_type: string | null
          id: string
          league_id: string | null
          name: string
          notes: string | null
          updated_at: string | null
          user_id: string | null
          year: string
        }
        Insert: {
          created_at?: string | null
          draft_type?: string | null
          id?: string
          league_id?: string | null
          name: string
          notes?: string | null
          updated_at?: string | null
          user_id?: string | null
          year: string
        }
        Update: {
          created_at?: string | null
          draft_type?: string | null
          id?: string
          league_id?: string | null
          name?: string
          notes?: string | null
          updated_at?: string | null
          user_id?: string | null
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_sessions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_settings: {
        Row: {
          created_at: string | null
          draft_session_id: string | null
          estimation_weight: number | null
          estimation_years: string[] | null
          id: string
          search_max_price: number | null
          search_min_price: number | null
          search_player_count: number | null
          search_positions: string[] | null
          search_show_only_available: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          draft_session_id?: string | null
          estimation_weight?: number | null
          estimation_years?: string[] | null
          id?: string
          search_max_price?: number | null
          search_min_price?: number | null
          search_player_count?: number | null
          search_positions?: string[] | null
          search_show_only_available?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          draft_session_id?: string | null
          estimation_weight?: number | null
          estimation_years?: string[] | null
          id?: string
          search_max_price?: number | null
          search_min_price?: number | null
          search_player_count?: number | null
          search_positions?: string[] | null
          search_show_only_available?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_settings_draft_session_id_fkey"
            columns: ["draft_session_id"]
            isOneToOne: true
            referencedRelation: "draft_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      in_progress_selections: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          league_id: string | null
          session_data: Json
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          league_id?: string | null
          session_data: Json
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          league_id?: string | null
          session_data?: Json
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "in_progress_selections_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_progress_selections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          auth_data_encrypted: string | null
          created_at: string | null
          id: string
          league_id: string
          platform: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_data_encrypted?: string | null
          created_at?: string | null
          id?: string
          league_id: string
          platform: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_data_encrypted?: string | null
          created_at?: string | null
          id?: string
          league_id?: string
          platform?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leagues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      live_draft_archive_bids: {
        Row: {
          amount: number | null
          archive_id: string
          at_ms: number | null
          id: number
          kind: string
          player_id: number
          seq: number
          team_id: number
          user_id: string
        }
        Insert: {
          amount?: number | null
          archive_id: string
          at_ms?: number | null
          id?: never
          kind: string
          player_id: number
          seq: number
          team_id: number
          user_id: string
        }
        Update: {
          amount?: number | null
          archive_id?: string
          at_ms?: number | null
          id?: never
          kind?: string
          player_id?: number
          seq?: number
          team_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_draft_archive_bids_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "live_draft_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_draft_archive_bids_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      live_draft_archive_frames: {
        Row: {
          archive_id: string
          capture_id: string
          data: string
          dir: string
          id: number
          seq: number
          source_frame_id: number
          ts: string
          user_id: string
        }
        Insert: {
          archive_id: string
          capture_id: string
          data: string
          dir: string
          id?: never
          seq: number
          source_frame_id: number
          ts: string
          user_id: string
        }
        Update: {
          archive_id?: string
          capture_id?: string
          data?: string
          dir?: string
          id?: never
          seq?: number
          source_frame_id?: number
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_draft_archive_frames_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "live_draft_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_draft_archive_frames_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      live_draft_archive_picks: {
        Row: {
          archive_id: string
          distinct_bidders: number | null
          id: number
          nominating_team_id: number | null
          observed_bid_count: number | null
          pick_number: number
          player_id: number
          player_name: string | null
          position: string | null
          price: number
          sold_at_ms: number | null
          team_id: number
          user_id: string
        }
        Insert: {
          archive_id: string
          distinct_bidders?: number | null
          id?: never
          nominating_team_id?: number | null
          observed_bid_count?: number | null
          pick_number: number
          player_id: number
          player_name?: string | null
          position?: string | null
          price: number
          sold_at_ms?: number | null
          team_id: number
          user_id: string
        }
        Update: {
          archive_id?: string
          distinct_bidders?: number | null
          id?: never
          nominating_team_id?: number | null
          observed_bid_count?: number | null
          pick_number?: number
          player_id?: number
          player_name?: string | null
          position?: string | null
          price?: number
          sold_at_ms?: number | null
          team_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_draft_archive_picks_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "live_draft_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_draft_archive_picks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      live_draft_archive_values: {
        Row: {
          archive_id: string
          id: number
          overall_rank: number
          platform_value: number | null
          player_id: number
          player_name: string | null
          position: string
          position_rank: number
          user_id: string
        }
        Insert: {
          archive_id: string
          id?: never
          overall_rank: number
          platform_value?: number | null
          player_id: number
          player_name?: string | null
          position: string
          position_rank: number
          user_id: string
        }
        Update: {
          archive_id?: string
          id?: never
          overall_rank?: number
          platform_value?: number | null
          player_id?: number
          player_name?: string | null
          position?: string
          position_rank?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_draft_archive_values_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "live_draft_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_draft_archive_values_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      live_draft_archives: {
        Row: {
          bid_count: number
          capture_count: number
          created_at: string | null
          drafted_at: string | null
          frame_count: number
          id: string
          kind: string
          league_id: string
          name: string
          pick_count: number
          season: string
          status: string
          total_spent: number
          updated_at: string | null
          user_id: string
          value_count: number
          values_snapshot_date: string | null
        }
        Insert: {
          bid_count?: number
          capture_count?: number
          created_at?: string | null
          drafted_at?: string | null
          frame_count?: number
          id?: string
          kind: string
          league_id: string
          name: string
          pick_count?: number
          season: string
          status?: string
          total_spent?: number
          updated_at?: string | null
          user_id: string
          value_count?: number
          values_snapshot_date?: string | null
        }
        Update: {
          bid_count?: number
          capture_count?: number
          created_at?: string | null
          drafted_at?: string | null
          frame_count?: number
          id?: string
          kind?: string
          league_id?: string
          name?: string
          pick_count?: number
          season?: string
          status?: string
          total_spent?: number
          updated_at?: string | null
          user_id?: string
          value_count?: number
          values_snapshot_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_draft_archives_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      live_draft_frames: {
        Row: {
          capture_id: string
          created_at: string | null
          data: string
          dir: string
          id: number
          league_id: string
          seq: number
          ts: string
          user_id: string
        }
        Insert: {
          capture_id: string
          created_at?: string | null
          data: string
          dir: string
          id?: never
          league_id: string
          seq: number
          ts: string
          user_id: string
        }
        Update: {
          capture_id?: string
          created_at?: string | null
          data?: string
          dir?: string
          id?: never
          league_id?: string
          seq?: number
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_draft_frames_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      live_draft_picks: {
        Row: {
          id: string
          live_draft_id: string | null
          pick_number: number
          player_id: string
          player_name: string
          player_position: string
          price: number
          team_id: string
          team_name: string
          timestamp: string | null
        }
        Insert: {
          id?: string
          live_draft_id?: string | null
          pick_number: number
          player_id: string
          player_name: string
          player_position: string
          price: number
          team_id: string
          team_name: string
          timestamp?: string | null
        }
        Update: {
          id?: string
          live_draft_id?: string | null
          pick_number?: number
          player_id?: string
          player_name?: string
          player_position?: string
          price?: number
          team_id?: string
          team_name?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_draft_picks_live_draft_id_fkey"
            columns: ["live_draft_id"]
            isOneToOne: false
            referencedRelation: "live_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      live_draft_teams: {
        Row: {
          budget: number
          created_at: string | null
          filled_positions: Json | null
          id: string
          live_draft_id: string | null
          remaining_budget: number
          roster_slots: Json | null
          team_id: string
          team_name: string
          updated_at: string | null
        }
        Insert: {
          budget: number
          created_at?: string | null
          filled_positions?: Json | null
          id?: string
          live_draft_id?: string | null
          remaining_budget: number
          roster_slots?: Json | null
          team_id: string
          team_name: string
          updated_at?: string | null
        }
        Update: {
          budget?: number
          created_at?: string | null
          filled_positions?: Json | null
          id?: string
          live_draft_id?: string | null
          remaining_budget?: number
          roster_slots?: Json | null
          team_id?: string
          team_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_draft_teams_live_draft_id_fkey"
            columns: ["live_draft_id"]
            isOneToOne: false
            referencedRelation: "live_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      live_drafts: {
        Row: {
          created_at: string | null
          current_pick_number: number | null
          draft_id: string
          draft_name: string
          id: string
          league_id: string | null
          settings: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_pick_number?: number | null
          draft_id: string
          draft_name: string
          id?: string
          league_id?: string | null
          settings?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_pick_number?: number | null
          draft_id?: string
          draft_name?: string
          id?: string
          league_id?: string | null
          settings?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_drafts_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_player_values: {
        Row: {
          auction_value: number | null
          bye_week: number | null
          created_at: string | null
          id: string
          overall_rank: number | null
          platform: string
          player_id: string | null
          player_name: string
          position: string
          position_rank: number | null
          rank_type: string
          season: string
          snapshot_date: string
          source: string
          team: string | null
        }
        Insert: {
          auction_value?: number | null
          bye_week?: number | null
          created_at?: string | null
          id?: string
          overall_rank?: number | null
          platform?: string
          player_id?: string | null
          player_name: string
          position: string
          position_rank?: number | null
          rank_type?: string
          season: string
          snapshot_date: string
          source: string
          team?: string | null
        }
        Update: {
          auction_value?: number | null
          bye_week?: number | null
          created_at?: string | null
          id?: string
          overall_rank?: number | null
          platform?: string
          player_id?: string | null
          player_name?: string
          position?: string
          position_rank?: number | null
          rank_type?: string
          season?: string
          snapshot_date?: string
          source?: string
          team?: string | null
        }
        Relationships: []
      }
      player_selections: {
        Row: {
          default_position: string
          draft_session_id: string | null
          estimated_cost: number | null
          id: string
          overall_rank: number | null
          player_id: string
          player_name: string
          position_rank: number | null
          positions: string[] | null
          roster_position: string
          selected_at: string | null
        }
        Insert: {
          default_position: string
          draft_session_id?: string | null
          estimated_cost?: number | null
          id?: string
          overall_rank?: number | null
          player_id: string
          player_name: string
          position_rank?: number | null
          positions?: string[] | null
          roster_position: string
          selected_at?: string | null
        }
        Update: {
          default_position?: string
          draft_session_id?: string | null
          estimated_cost?: number | null
          id?: string
          overall_rank?: number | null
          player_id?: string
          player_name?: string
          position_rank?: number | null
          positions?: string[] | null
          roster_position?: string
          selected_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_selections_draft_session_id_fkey"
            columns: ["draft_session_id"]
            isOneToOne: false
            referencedRelation: "draft_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          data: Json
          id: string
          key: string
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          data: Json
          id?: string
          key: string
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          data?: Json
          id?: string
          key?: string
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_selections: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

