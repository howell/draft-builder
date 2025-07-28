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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
          updated_at: string | null
        }
        Insert: {
          adjusted_cost: number
          created_at?: string | null
          draft_session_id?: string | null
          id?: string
          player_id: string
          updated_at?: string | null
        }
        Update: {
          adjusted_cost?: number
          created_at?: string | null
          draft_session_id?: string | null
          id?: string
          player_id?: string
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
      cleanup_expired_selections: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
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

