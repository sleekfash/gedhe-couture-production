export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      order_audit_events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          event_type: string;
          from_value: string | null;
          id: string;
          metadata: Json;
          note: string;
          order_id: string;
          order_reference: string;
          to_value: string | null;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type: string;
          from_value?: string | null;
          id?: string;
          metadata?: Json;
          note?: string;
          order_id: string;
          order_reference: string;
          to_value?: string | null;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type?: string;
          from_value?: string | null;
          id?: string;
          metadata?: Json;
          note?: string;
          order_id?: string;
          order_reference?: string;
          to_value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_audit_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          address: string;
          admin_notes: string;
          city: string;
          created_at: string;
          currency: string;
          customer_email: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee: number;
          fulfilment_status: string;
          id: string;
          items: Json;
          last_payment_error: string | null;
          lookup_expires_at: string | null;
          lookup_revoked_at: string | null;
          lookup_token_hash: string | null;
          notes: string;
          paid_at: string | null;
          payment_attempts: number;
          payment_provider: string;
          payment_status: string;
          provider_checkout_url: string | null;
          provider_reference: string | null;
          reference: string;
          subtotal: number;
          total: number;
          updated_at: string;
          volume: number;
        };
        Insert: {
          address?: string;
          admin_notes?: string;
          city?: string;
          created_at?: string;
          currency?: string;
          customer_email?: string;
          customer_name: string;
          customer_phone?: string;
          delivery_fee?: number;
          fulfilment_status?: string;
          id?: string;
          items?: Json;
          last_payment_error?: string | null;
          lookup_expires_at?: string | null;
          lookup_revoked_at?: string | null;
          lookup_token_hash?: string | null;
          notes?: string;
          paid_at?: string | null;
          payment_attempts?: number;
          payment_provider?: string;
          payment_status?: string;
          provider_checkout_url?: string | null;
          provider_reference?: string | null;
          reference: string;
          subtotal?: number;
          total?: number;
          updated_at?: string;
          volume?: number;
        };
        Update: {
          address?: string;
          admin_notes?: string;
          city?: string;
          created_at?: string;
          currency?: string;
          customer_email?: string;
          customer_name?: string;
          customer_phone?: string;
          delivery_fee?: number;
          fulfilment_status?: string;
          id?: string;
          items?: Json;
          last_payment_error?: string | null;
          lookup_expires_at?: string | null;
          lookup_revoked_at?: string | null;
          lookup_token_hash?: string | null;
          notes?: string;
          paid_at?: string | null;
          payment_attempts?: number;
          payment_provider?: string;
          payment_status?: string;
          provider_checkout_url?: string | null;
          provider_reference?: string | null;
          reference?: string;
          subtotal?: number;
          total?: number;
          updated_at?: string;
          volume?: number;
        };
        Relationships: [];
      };
      payment_events: {
        Row: {
          event_id: string;
          event_type: string;
          failure_reason: string | null;
          id: string;
          order_reference: string | null;
          payload_hash: string | null;
          processed_at: string | null;
          provider: string;
          received_at: string;
        };
        Insert: {
          event_id: string;
          event_type?: string;
          failure_reason?: string | null;
          id?: string;
          order_reference?: string | null;
          payload_hash?: string | null;
          processed_at?: string | null;
          provider: string;
          received_at?: string;
        };
        Update: {
          event_id?: string;
          event_type?: string;
          failure_reason?: string | null;
          id?: string;
          order_reference?: string | null;
          payload_hash?: string | null;
          processed_at?: string | null;
          provider?: string;
          received_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          category: string;
          code: string;
          created_at: string;
          description: string;
          gallery: Json;
          id: string;
          image_url: string;
          min_qty: number;
          name: string;
          option_label: string;
          options: string[];
          pattern: string;
          price_gbp: number;
          price_ngn: number;
          published: boolean;
          sort_order: number;
          stock_status: string;
          updated_at: string;
          variant: string;
          volume_tiers: Json;
        };
        Insert: {
          category: string;
          code: string;
          created_at?: string;
          description?: string;
          gallery?: Json;
          id?: string;
          image_url?: string;
          min_qty?: number;
          name: string;
          option_label?: string;
          options?: string[];
          pattern?: string;
          price_gbp?: number;
          price_ngn: number;
          published?: boolean;
          sort_order?: number;
          stock_status?: string;
          updated_at?: string;
          variant?: string;
          volume_tiers?: Json;
        };
        Update: {
          category?: string;
          code?: string;
          created_at?: string;
          description?: string;
          gallery?: Json;
          id?: string;
          image_url?: string;
          min_qty?: number;
          name?: string;
          option_label?: string;
          options?: string[];
          pattern?: string;
          price_gbp?: number;
          price_ngn?: number;
          published?: boolean;
          sort_order?: number;
          stock_status?: string;
          updated_at?: string;
          variant?: string;
          volume_tiers?: Json;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      app_role: "admin" | "staff";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const;
