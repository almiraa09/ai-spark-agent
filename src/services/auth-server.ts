import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url =
    (typeof process !== "undefined" && (process.env?.["SUPABASE_URL"] || process.env?.["VITE_SUPABASE_URL"])) ||
    "https://gedmfwakfluakwgyntjc.supabase.co";
  const key =
    (typeof process !== "undefined" && (process.env?.["SUPABASE_SERVICE_ROLE_KEY"] || process.env?.["VITE_SUPABASE_SERVICE_ROLE_KEY"])) ||
    "";

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server environment.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export interface RegisterResult {
  success: boolean;
  code?: "ALREADY_REGISTERED" | "RATE_LIMIT" | "ERROR";
  error?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Server Function: Register User Directly with Auto-Confirm
 * Uses SUPABASE_SERVICE_ROLE_KEY to create user in auth.users with email_confirm: true.
 * This bypasses free-tier email SMTP rate limits and allows immediate login from any device.
 */
export const registerUserServerFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; pass: string; name: string }) => data)
  .handler(async ({ data }): Promise<RegisterResult> => {
    const cleanEmail = (data.email || "").trim().toLowerCase();
    const pass = data.pass || "";
    const name = (data.name || "").trim() || cleanEmail.split("@")[0] || "Sparky User";

    if (!cleanEmail || !pass) {
      return { success: false, code: "ERROR", error: "Email dan kata sandi wajib diisi." };
    }

    try {
      const admin = getSupabaseAdmin();

      const res = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: pass,
        email_confirm: true,
        user_metadata: {
          full_name: name
        }
      });

      if (res.error) {
        const msg = res.error.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists") || res.error.code === "user_already_exists") {
          return {
            success: false,
            code: "ALREADY_REGISTERED",
            error: `Email "${cleanEmail}" sudah terdaftar! Silakan klik tab 'Masuk' untuk login.`
          };
        }
        return {
          success: false,
          code: "ERROR",
          error: res.error.message || "Gagal membuat akun."
        };
      }

      if (res.data?.user) {
        return {
          success: true,
          user: {
            id: res.data.user.id,
            email: cleanEmail,
            name
          }
        };
      }

      return { success: false, code: "ERROR", error: "Tidak dapat membuat pengguna." };
    } catch (err: any) {
      console.error("registerUserServerFn error:", err);
      return { success: false, code: "ERROR", error: err?.message || "Terjadi kesalahan server saat mendaftar." };
    }
  });

/**
 * Server Function: Check if an email exists in Supabase Auth
 */
export const checkUserExistsServerFn = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }): Promise<{ exists: boolean }> => {
    const cleanEmail = (data.email || "").trim().toLowerCase();
    if (!cleanEmail) return { exists: false };

    try {
      const admin = getSupabaseAdmin();
      const { data: listData, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });

      if (error || !listData?.users) {
        return { exists: false };
      }

      const found = listData.users.some(u => u.email?.toLowerCase() === cleanEmail);
      return { exists: found };
    } catch (err) {
      console.warn("checkUserExistsServerFn error:", err);
      return { exists: false };
    }
  });

/**
 * Server Function: Sync a Local Account into Cloud Supabase Auth
 * If the user does not exist in Supabase auth, creates them with email_confirm: true.
 */
export const syncAccountToSupabaseServerFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; pass: string; name: string }) => data)
  .handler(async ({ data }): Promise<{ synced: boolean; alreadyExisted: boolean; error?: string }> => {
    const cleanEmail = (data.email || "").trim().toLowerCase();
    const pass = data.pass || "";
    const name = (data.name || "").trim() || cleanEmail.split("@")[0];

    if (!cleanEmail || !pass) {
      return { synced: false, alreadyExisted: false };
    }

    try {
      const admin = getSupabaseAdmin();
      const res = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: pass,
        email_confirm: true,
        user_metadata: { full_name: name }
      });

      if (res.error) {
        const msg = res.error.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists")) {
          return { synced: true, alreadyExisted: true };
        }
        return { synced: false, alreadyExisted: false, error: res.error.message };
      }

      return { synced: true, alreadyExisted: false };
    } catch (err: any) {
      return { synced: false, alreadyExisted: false, error: err?.message };
    }
  });
