/* ==========================================================================
   The shape of the Postgres schema, for the Supabase client to type against.

   Hand-maintained to match supabase/migrations/0001_accounts_and_orders.sql.
   If you change that SQL, change this too — or regenerate it once you have the
   Supabase CLI installed:

     npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts

   Money is always an integer in minor units (pence). Never a float.
   ========================================================================== */

export type Gender =
  'female' | 'male' | 'non_binary' | 'prefer_not_to_say' | 'self_described'

export type AccountStatus = 'active' | 'suspended' | 'banned' | 'deleted'
export type AuthMethod = 'email' | 'google'

export type OrderStatus =
  'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded'

export type ActivityType =
  | 'signed_up'
  | 'signed_in'
  | 'signed_out'
  | 'password_changed'
  | 'password_reset_requested'
  | 'profile_updated'
  | 'address_added'
  | 'address_updated'
  | 'address_deleted'
  | 'avatar_updated'
  | 'email_verified'
  | 'order_placed'
  | 'account_deleted'
  | 'suspended_by_admin'
  | 'banned_by_admin'
  | 'reinstated_by_admin'

export type UserRow = {
  id: string
  email: string
  username: string | null
  status: AccountStatus
  auth_method: AuthMethod
  email_verified: boolean
  last_login_at: string | null
  status_reason: string
  status_changed_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type ProfileRow = {
  user_id: string
  full_name: string
  phone_number: string
  /** A storage object path such as `<uid>/avatar.webp`, not a URL. */
  profile_picture: string
  date_of_birth: string | null
  gender: Gender | null
  gender_self_described: string
  bio: string
  marketing_opt_in: boolean
  created_at: string
  updated_at: string
}

export type AddressRow = {
  id: string
  user_id: string
  label: string
  recipient: string
  country: string
  state: string
  city: string
  postal_code: string
  street_address: string
  phone_number: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export type OrderRow = {
  id: string
  reference: string
  user_id: string | null
  email: string
  customer_name: string
  phone: string
  subtotal_amount: number
  shipping_amount: number
  total_amount: number
  currency: string
  payment_status: PaymentStatus
  order_status: OrderStatus
  shipping_address: string
  tracking_number: string
  tracking_url: string
  delivered_at: string | null
  admin_note: string
  notified: boolean
  notify_error: string
  created_at: string
  updated_at: string
}

export type OrderItemRow = {
  id: string
  order_id: string
  product_id: number | null
  product_kind: string
  product_name: string
  variant_label: string
  quantity: number
  unit_price: number
  created_at: string
}

export type PaymentRow = {
  id: string
  order_id: string
  payment_provider: string
  transaction_id: string
  amount: number
  currency: string
  payment_status: PaymentStatus
  provider_payload: Record<string, unknown>
  failure_reason: string
  created_at: string
  updated_at: string
}

export type ActivityRow = {
  id: string
  user_id: string | null
  activity_type: ActivityType
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string
  created_at: string
}

export type UserStatsRow = {
  total_users: number
  active_users: number
  suspended_users: number
  banned_users: number
  verified_users: number
  new_last_7_days: number
  new_last_30_days: number
  active_last_30_days: number
}

export type OrderStatsRow = {
  total_orders: number
  paid_orders: number
  pending_orders: number
  revenue_total: number
  revenue_30_days: number
  average_order_value: number
}

/**
 * supabase-js infers from this shape. `Relationships` is not optional to it —
 * omitting it makes the whole generic collapse to `never`, which shows up as
 * "Property 'x' does not exist on type 'never'" at every call site rather than
 * as a helpful error here.
 */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      users: Table<UserRow, Partial<UserRow> & { id: string; email: string }>
      profiles: Table<ProfileRow, Partial<ProfileRow> & { user_id: string }>
      addresses: Table<AddressRow, Partial<AddressRow> & { user_id: string }>
      orders: Table<OrderRow, Partial<OrderRow> & { reference: string; email: string }>
      order_items: Table<
        OrderItemRow,
        Partial<OrderItemRow> & {
          order_id: string
          product_name: string
          unit_price: number
        }
      >
      payments: Table<PaymentRow, Partial<PaymentRow> & { order_id: string }>
      account_activity: Table<
        ActivityRow,
        Partial<ActivityRow> & { activity_type: ActivityType }
      >
    }
    Views: {
      admin_user_stats: { Row: UserStatsRow; Relationships: [] }
      admin_order_stats: { Row: OrderStatsRow; Relationships: [] }
    }
    Functions: Record<string, never>
    CompositeTypes: Record<string, never>
    Enums: {
      gender_option: Gender
      account_status: AccountStatus
      auth_method: AuthMethod
      order_status: OrderStatus
      payment_status: PaymentStatus
      activity_type: ActivityType
    }
  }
}
