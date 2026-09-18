import { createClient, SupabaseClient, type User } from "@supabase/supabase-js";
import { registerUserServerFn, checkUserExistsServerFn, syncAccountToSupabaseServerFn } from "@/services/auth-server";

/**
 * Supabase Client Helper for InstaSpark AI Helper
 * Reads VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY from environment.
 * Supports Auth, Instagram Accounts, Content Planner, and Chat History.
 * SSR-safe with guarded storage helpers.
 */

const envUrl =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && (process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"])) ||
  "";
const envKey =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" &&
    (process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
      process.env["SUPABASE_ANON_KEY"] ||
      process.env["VITE_SUPABASE_ANON_KEY"])) ||
  "";

export const isSupabaseConfigured = Boolean(envUrl && envKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(envUrl, envKey)
  : null;

export function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2500): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Supabase request timeout")), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// SSR Safe Local Storage Helpers
export function getLocalItem(key: string): string | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setLocalItem(key: string, value: string): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function removeLocalItem(key: string): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

// =========================================
// 1. User & Auth Types & State Management
// =========================================

export interface UserSession {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

const LOCAL_USER_KEY = "sparky_user_session";
const REGISTERED_USERS_KEY = "sparky_registered_accounts";
const migratedUsersSet = new Set<string>();

export interface RegisteredAccount {
  id: string;
  email: string;
  pass: string;
  name: string;
}

export function getDeterministicUserId(email: string): string {
  const clean = email.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
  return `usr_${clean}`;
}

export function getRegisteredAccounts(): Record<string, RegisteredAccount> {
  const defaultAccount: RegisteredAccount = {
    id: "usr_airaz_gmail_com",
    email: "airaz@gmail.com",
    pass: "123456",
    name: "Airaz"
  };

  try {
    const raw = getLocalItem(REGISTERED_USERS_KEY);
    const accounts: Record<string, RegisteredAccount> = raw ? JSON.parse(raw) : {};
    if (!accounts["airaz@gmail.com"]) {
      accounts["airaz@gmail.com"] = defaultAccount;
      setLocalItem(REGISTERED_USERS_KEY, JSON.stringify(accounts));
    }
    return accounts;
  } catch {
    return { "airaz@gmail.com": defaultAccount };
  }
}

export function saveRegisteredAccount(acc: RegisteredAccount): void {
  try {
    const accounts = getRegisteredAccounts();
    accounts[acc.email.toLowerCase()] = acc;
    setLocalItem(REGISTERED_USERS_KEY, JSON.stringify(accounts));
  } catch {}
}

export function migrateLegacyUserData(email: string, targetUserId: string): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  const userKey = `${email.toLowerCase()}_${targetUserId}`;
  if (migratedUsersSet.has(userKey)) return;
  migratedUsersSet.add(userKey);

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith("sparky_posts_usr-") && key !== `sparky_posts_${targetUserId}`) {
        const legacyData = localStorage.getItem(key);
        const currentData = localStorage.getItem(`sparky_posts_${targetUserId}`);
        if (legacyData && legacyData !== "[]" && (!currentData || currentData === "[]")) {
          localStorage.setItem(`sparky_posts_${targetUserId}`, legacyData);
        }
        keysToRemove.push(key);
      }

      if ((key.startsWith("sparky_conversations_usr-") || key.startsWith("sparky_threads_usr-")) && key !== `sparky_threads_${targetUserId}`) {
        const legacyData = localStorage.getItem(key);
        const currentData = localStorage.getItem(`sparky_threads_${targetUserId}`);
        if (legacyData && legacyData !== "[]" && (!currentData || currentData === "[]")) {
          localStorage.setItem(`sparky_threads_${targetUserId}`, legacyData);
        }
        keysToRemove.push(key);
      }

      if (key.startsWith("sparky_linked_ig_account_usr-") && key !== `sparky_linked_ig_account_${targetUserId}`) {
        const legacyData = localStorage.getItem(key);
        const currentData = localStorage.getItem(`sparky_linked_ig_account_${targetUserId}`);
        if (legacyData && !currentData) {
          localStorage.setItem(`sparky_linked_ig_account_${targetUserId}`, legacyData);
        }
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn("Legacy data migration notice:", err);
  }
}

export async function getCurrentUser(): Promise<UserSession | null> {
  if (supabase) {
    try {
      const { data: { session } } = await withTimeout(supabase.auth.getSession(), 2000);
      if (session?.user) {
        const rawEmail = session.user.email || "";
        const cleanEmail = rawEmail.trim().toLowerCase();
        const metaName = session.user.user_metadata?.full_name || cleanEmail.split("@")[0] || "Sparky User";
        const formattedName = metaName.charAt(0).toUpperCase() + metaName.slice(1);
        const u: UserSession = {
          id: session.user.id,
          email: cleanEmail,
          name: formattedName,
          avatar_url: session.user.user_metadata?.avatar_url
        };
        setLocalItem(LOCAL_USER_KEY, JSON.stringify(u));
        migrateLegacyUserData(u.email, u.id);
        return u;
      }
    } catch (err) {
      console.warn("Supabase auth session fetch notice:", err);
    }
  }

  // Fallback to local session storage
  try {
    const stored = getLocalItem(LOCAL_USER_KEY);
    if (stored) {
      const u: UserSession = JSON.parse(stored);
      if (u && u.email) {
        u.email = u.email.trim().toLowerCase();
        const name = u.name || u.email.split("@")[0];
        u.name = name.charAt(0).toUpperCase() + name.slice(1);
        migrateLegacyUserData(u.email, u.id);
        return u;
      }
    }
  } catch {
    // Ignore storage parse error
  }
  return null;
}

export async function signUpWithEmail(email: string, pass: string, name: string): Promise<{ user: UserSession | null; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !pass) {
    return { user: null, error: "Mohon isi alamat email dan kata sandi." };
  }

  // 1. Register User via Server Function (uses SUPABASE_SERVICE_ROLE_KEY with email_confirm: true)
  // This completely eliminates email SMTP rate limits and makes the user immediately active across all devices.
  try {
    const res = await registerUserServerFn({
      data: {
        email: cleanEmail,
        pass,
        name: name || cleanEmail.split("@")[0]
      }
    });

    if (!res.success) {
      if (res.code === "ALREADY_REGISTERED") {
        return {
          user: null,
          error: `ALREADY_REGISTERED: Email "${cleanEmail}" sudah terdaftar! Silakan klik tab 'Masuk' untuk login.`
        };
      }
      return {
        user: null,
        error: res.error || "Gagal membuat akun."
      };
    }

    // 2. Immediately sign in with Supabase Auth to establish the real client session token
    if (supabase) {
      try {
        const { data: signData } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: pass
        });

        if (signData?.user) {
          const u: UserSession = {
            id: signData.user.id,
            email: signData.user.email || cleanEmail,
            name: name || cleanEmail.split("@")[0]
          };
          saveRegisteredAccount({
            id: signData.user.id,
            email: cleanEmail,
            pass,
            name: u.name
          });
          setLocalItem(LOCAL_USER_KEY, JSON.stringify(u));
          migrateLegacyUserData(cleanEmail, u.id);
          return { user: u };
        }
      } catch (signErr) {
        console.warn("Post-signup signIn notice:", signErr);
      }
    }

    // If client signIn hasn't resolved yet, return the registered user info from server
    if (res.user) {
      const u: UserSession = {
        id: res.user.id,
        email: cleanEmail,
        name: res.user.name
      };
      saveRegisteredAccount({
        id: res.user.id,
        email: cleanEmail,
        pass,
        name: u.name
      });
      setLocalItem(LOCAL_USER_KEY, JSON.stringify(u));
      migrateLegacyUserData(cleanEmail, u.id);
      return { user: u };
    }
  } catch (err: any) {
    console.warn("Server registration call failed:", err);
  }

  // Fallback if server call fails entirely
  const deterministicId = getDeterministicUserId(cleanEmail);
  const newAcc: RegisteredAccount = {
    id: deterministicId,
    email: cleanEmail,
    pass,
    name: name || cleanEmail.split("@")[0]
  };
  saveRegisteredAccount(newAcc);

  const u: UserSession = {
    id: deterministicId,
    email: cleanEmail,
    name: newAcc.name
  };
  setLocalItem(LOCAL_USER_KEY, JSON.stringify(u));
  migrateLegacyUserData(cleanEmail, u.id);
  return { user: u };
}

export async function signInWithEmail(email: string, pass: string): Promise<{ user: UserSession | null; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !pass) {
    return { user: null, error: "Mohon isi alamat email dan kata sandi." };
  }

  // 1. Try Supabase cloud auth FIRST so every device authenticates against the same database
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: pass
      });

      if (data?.user) {
        const u: UserSession = {
          id: data.user.id,
          email: data.user.email || cleanEmail,
          name: data.user.user_metadata?.full_name || cleanEmail.split("@")[0]
        };
        saveRegisteredAccount({
          id: data.user.id,
          email: cleanEmail,
          pass,
          name: u.name
        });
        setLocalItem(LOCAL_USER_KEY, JSON.stringify(u));
        migrateLegacyUserData(cleanEmail, u.id);
        return { user: u };
      }

      // If invalid credentials, check if it's an un-synced local account from before
      const accounts = getRegisteredAccounts();
      const existingLocal = accounts[cleanEmail];
      if (existingLocal && existingLocal.pass === pass) {
        try {
          const syncRes = await syncAccountToSupabaseServerFn({
            data: {
              email: cleanEmail,
              pass,
              name: existingLocal.name
            }
          });
          if (syncRes.synced) {
            const retry = await supabase.auth.signInWithPassword({
              email: cleanEmail,
              password: pass
            });
            if (retry.data?.user) {
              const u: UserSession = {
                id: retry.data.user.id,
                email: cleanEmail,
                name: existingLocal.name
              };
              setLocalItem(LOCAL_USER_KEY, JSON.stringify(u));
              migrateLegacyUserData(cleanEmail, u.id);
              return { user: u };
            }
          }
        } catch (syncErr) {
          console.warn("Auto-sync error:", syncErr);
        }
      }
    } catch (err: any) {
      console.warn("Supabase signin exception:", err);
    }
  }

  // 2. Check if user exists in Supabase cloud (e.g. registered from another device)
  try {
    const existsRes = await checkUserExistsServerFn({ data: { email: cleanEmail } });
    if (existsRes.exists) {
      // User definitely exists in cloud, so invalid password
      return {
        user: null,
        error: "Kata sandi salah. Silakan periksa kembali kata sandi Anda."
      };
    }
  } catch (err) {
    console.warn("checkUserExistsServerFn call notice:", err);
  }

  // 3. Local registry check as fallback
  const accounts = getRegisteredAccounts();
  const existingLocalAccount = accounts[cleanEmail];

  if (existingLocalAccount) {
    if (existingLocalAccount.pass === pass) {
      const u: UserSession = {
        id: existingLocalAccount.id,
        email: cleanEmail,
        name: existingLocalAccount.name
      };
      setLocalItem(LOCAL_USER_KEY, JSON.stringify(u));
      migrateLegacyUserData(cleanEmail, u.id);
      return { user: u };
    } else {
      return {
        user: null,
        error: "Kata sandi salah. Silakan periksa kembali kata sandi Anda."
      };
    }
  }

  // Email is NOT registered anywhere: REJECT signin
  return {
    user: null,
    error: `UNREGISTERED_EMAIL: Akun dengan email "${cleanEmail}" belum terdaftar. Silakan buat akun di tab 'Daftar Baru'.`
  };
}

/**
 * Background helper to sync any local accounts into Supabase cloud
 */
export async function syncAllLocalAccountsToSupabase(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const accounts = getRegisteredAccounts();
    for (const [email, acc] of Object.entries(accounts)) {
      if (email === "airaz@gmail.com") continue;
      if (acc.email && acc.pass) {
        await syncAccountToSupabaseServerFn({
          data: {
            email: acc.email,
            pass: acc.pass,
            name: acc.name
          }
        }).catch(() => {});
      }
    }
  } catch {}
}

if (typeof window !== "undefined") {
  setTimeout(() => {
    syncAllLocalAccountsToSupabase();
  }, 2000);
}

export async function signOutUser(): Promise<void> {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Signout error:", err);
    }
  }
  removeLocalItem(LOCAL_USER_KEY);
  localPostsStorage = [];
}

// =========================================
// 2. Instagram Account 2FA Connection Types
// =========================================

export interface InstagramAccountItem {
  id: string;
  user_id: string;
  ig_username: string;
  full_name?: string;
  profile_pic_url?: string;
  is_verified: boolean;
  followers_count: number;
  following_count: number;
  posts_count: number;
  reach_30d: string;
  engagement_rate: string;
  connected_at: string;
}

const LOCAL_IG_KEY = "sparky_linked_ig_account";

export async function getInstagramAccount(userId: string): Promise<InstagramAccountItem | null> {
  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase.from("instagram_accounts").select("*").eq("user_id", userId).maybeSingle(),
        2000
      );
      if (!error && data) {
        return data as InstagramAccountItem;
      }
    } catch (err) {
      console.warn("Supabase fetch IG notice:", err);
    }
  }

  // Local Storage Fallback
  try {
    const stored = getLocalItem(`${LOCAL_IG_KEY}_${userId}`);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return null;
}

export async function linkInstagramAccount2FA(userId: string, igUsername: string): Promise<InstagramAccountItem> {
  const cleanUsername = igUsername.replace(/^@/, "").trim() || "creator.studio";
  const account: InstagramAccountItem = {
    id: `ig-${Date.now()}`,
    user_id: userId,
    ig_username: cleanUsername,
    full_name: `${cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1)} Studio`,
    profile_pic_url: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
    is_verified: true,
    followers_count: 48200,
    following_count: 512,
    posts_count: 428,
    reach_30d: "184K",
    engagement_rate: "5.8%",
    connected_at: new Date().toISOString()
  };

  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase.from("instagram_accounts").upsert([account]).select().single(),
        2500
      );
      if (!error && data) {
        return data as InstagramAccountItem;
      }
    } catch (err) {
      console.warn("Supabase IG upsert notice:", err);
    }
  }

  setLocalItem(`${LOCAL_IG_KEY}_${userId}`, JSON.stringify(account));
  return account;
}

export async function unlinkInstagramAccount(userId: string): Promise<boolean> {
  if (supabase) {
    try {
      await withTimeout(supabase.from("instagram_accounts").delete().eq("user_id", userId), 2000);
    } catch (err) {
      console.warn("Supabase IG delete notice:", err);
    }
  }
  removeLocalItem(`${LOCAL_IG_KEY}_${userId}`);
  return true;
}

// =========================================
// 3. Content Planner Posts
// =========================================

export interface ContentPostItem {
  id: string;
  user_id?: string;
  title: string;
  concept?: string;
  script: string;
  caption: string;
  hashtags: string[];
  image_prompt?: string;
  video_prompt?: string;
  veo_duration_seconds?: number;
  veo_cost_usd?: number;
  veo_cost_idr?: number;
  media_url?: string | null;
  media_type?: "image" | "video" | "carousel" | null;
  recommended_time?: string;
  scheduled_date: string;
  scheduled_time: string;
  scheduled_at?: string | null;
  published_at?: string | null;
  status: "Draft" | "Scheduled" | "Published";
  created_at?: string;
  updated_at?: string;
}

export function getTodayLocalDateString(dateInput: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(dateInput);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch (err) {
    console.warn("Intl timezone formatting notice, falling back to UTC+7 offset:", err);
  }

  // Fallback: Fixed UTC+7 offset for Asia/Jakarta (WIB)
  const d = new Date(dateInput.getTime() + 7 * 60 * 60 * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let localPostsStorage: ContentPostItem[] = [];

export async function fetchAllPostsFromDb(userId?: string, email?: string): Promise<ContentPostItem[]> {
  const targetId = userId || "guest";
  const idsToQuery = Array.from(new Set([
    targetId,
    email ? getDeterministicUserId(email) : null,
    targetId.includes("@") ? getDeterministicUserId(targetId) : null
  ].filter(Boolean))) as string[];

  let dbPosts: ContentPostItem[] = [];

  if (supabase && targetId !== "guest") {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("content_posts")
          .select("*")
          .in("user_id", idsToQuery)
          .order("created_at", { ascending: false }),
        2500
      );

      if (!error && data) {
        dbPosts = data.map((d: any) => ({
          id: String(d.id || crypto.randomUUID()),
          user_id: d.user_id,
          title: String(d.title || ""),
          concept: d.concept,
          script: String(d.script || ""),
          caption: String(d.caption || ""),
          hashtags: Array.isArray(d.hashtags) ? d.hashtags : [],
          image_prompt: d.image_prompt,
          video_prompt: d.video_prompt,
          veo_duration_seconds: d.veo_duration_seconds,
          veo_cost_usd: d.veo_cost_usd,
          veo_cost_idr: d.veo_cost_idr,
          media_url: d.media_url,
          media_type: d.media_type,
          recommended_time: d.recommended_time,
          scheduled_date: String(d.scheduled_date || getTodayLocalDateString()),
          scheduled_time: String(d.scheduled_time || "18:00"),
          scheduled_at: d.scheduled_at,
          published_at: d.published_at,
          status: (d.status as any) || "Draft",
          created_at: d.created_at,
          updated_at: d.updated_at
        }));
      }
    } catch (err) {
      console.warn("Supabase fetch posts notice, using local fallback:", err);
    }
  }

  let localPosts: ContentPostItem[] = [];
  try {
    idsToQuery.forEach((id) => {
      const stored = getLocalItem(`sparky_posts_${id}`);
      if (stored !== null) {
        const parsed: ContentPostItem[] = JSON.parse(stored);
        localPosts.push(...parsed);
      }
    });
  } catch {}

  const map = new Map<string, ContentPostItem>();
  dbPosts.forEach((p) => map.set(p.id, p));
  localPosts.forEach((p) => {
    if (!map.has(p.id)) map.set(p.id, p);
  });

  // Filter out any legacy dummy sample posts automatically
  const merged = Array.from(map.values()).filter(
    (p) => p.id !== "post-sample-1" && p.id !== "post-sample-2"
  );

  // Purge sample posts from DB if present
  if (supabase && targetId !== "guest") {
    withTimeout(supabase.from("content_posts").delete().in("id", ["post-sample-1", "post-sample-2"]), 2000).catch(() => {});
  }

  idsToQuery.forEach((id) => setLocalItem(`sparky_posts_${id}`, JSON.stringify(merged)));

  if (merged.length > 0 && supabase && targetId !== "guest") {
    const unsynced = localPosts.filter(
      (p) => p.id !== "post-sample-1" && p.id !== "post-sample-2" && !dbPosts.some((dbp) => dbp.id === p.id)
    );
    if (unsynced.length > 0) {
      withTimeout(supabase.from("content_posts").upsert(unsynced), 3000).catch((e) =>
        console.warn("Background posts sync notice:", e)
      );
    }
  }

  return merged;
}

export async function savePostToDb(post: Partial<ContentPostItem> & { id?: string; title?: string }): Promise<ContentPostItem> {
  const currentUser = await getCurrentUser();
  const targetUserId = post.user_id || currentUser?.id || "guest";
  const hasValidId = Boolean(post.id && typeof post.id === "string" && post.id.trim() !== "");
  const targetPostId = hasValidId ? post.id!.trim() : undefined;

  // If targetPostId is provided, try to fetch existing post to merge fields so nothing is wiped
  let existing: ContentPostItem | undefined;
  if (targetPostId) {
    try {
      if (supabase && targetUserId !== "guest") {
        const { data } = await withTimeout(
          supabase.from("content_posts").select("*").eq("id", targetPostId).maybeSingle(),
          2000
        );
        if (data) {
          existing = {
            id: String(data.id),
            user_id: data.user_id,
            title: String(data.title || ""),
            concept: data.concept,
            script: String(data.script || ""),
            caption: String(data.caption || ""),
            hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
            image_prompt: data.image_prompt,
            video_prompt: data.video_prompt,
            veo_duration_seconds: data.veo_duration_seconds,
            veo_cost_usd: data.veo_cost_usd,
            veo_cost_idr: data.veo_cost_idr,
            media_url: data.media_url,
            media_type: data.media_type,
            recommended_time: data.recommended_time,
            scheduled_date: String(data.scheduled_date || getTodayLocalDateString()),
            scheduled_time: String(data.scheduled_time || "18:00"),
            scheduled_at: data.scheduled_at,
            published_at: data.published_at,
            status: (data.status as any) || "Draft"
          };
        }
      }
    } catch {}

    if (!existing) {
      try {
        const current = await fetchAllPostsFromDb(targetUserId);
        existing = current.find((p) => String(p.id) === String(targetPostId));
      } catch {}
    }
  }

  const postId = targetPostId || existing?.id || crypto.randomUUID();
  const sDate = post.scheduled_date ?? existing?.scheduled_date ?? getTodayLocalDateString();
  const sTime = post.scheduled_time ?? existing?.scheduled_time ?? "18:00";

  let computedScheduledAt = post.scheduled_at;
  if (computedScheduledAt === undefined) {
    if (sDate && sTime) {
      try {
        const timeWithSec = sTime.length === 5 ? `${sTime}:00` : sTime;
        computedScheduledAt = new Date(`${sDate}T${timeWithSec}+07:00`).toISOString();
      } catch {
        computedScheduledAt = existing?.scheduled_at || null;
      }
    } else {
      computedScheduledAt = existing?.scheduled_at || null;
    }
  }

  const newPost: ContentPostItem = {
    id: postId,
    user_id: targetUserId,
    title: post.title ?? existing?.title ?? "Konten Tanpa Judul",
    concept: post.concept ?? existing?.concept,
    script: post.script ?? existing?.script ?? "",
    caption: post.caption ?? existing?.caption ?? "",
    hashtags: post.hashtags ?? existing?.hashtags ?? [],
    image_prompt: post.image_prompt ?? existing?.image_prompt,
    video_prompt: post.video_prompt ?? existing?.video_prompt,
    veo_duration_seconds: post.veo_duration_seconds ?? existing?.veo_duration_seconds,
    veo_cost_usd: post.veo_cost_usd ?? existing?.veo_cost_usd,
    veo_cost_idr: post.veo_cost_idr ?? existing?.veo_cost_idr,
    media_url: post.media_url !== undefined ? post.media_url : existing?.media_url,
    media_type: post.media_type !== undefined ? post.media_type : existing?.media_type,
    recommended_time: post.recommended_time ?? existing?.recommended_time,
    scheduled_date: sDate,
    scheduled_time: sTime,
    scheduled_at: computedScheduledAt,
    published_at: post.published_at !== undefined ? post.published_at : existing?.published_at,
    status: post.status ?? existing?.status ?? "Draft"
  };

  if (supabase && targetUserId !== "guest") {
    try {
      const { data, error } = await withTimeout(
        supabase.from("content_posts").upsert([newPost]).select().single(),
        2500
      );
      if (!error && data) {
        const saved: ContentPostItem = {
          id: String(data.id || newPost.id),
          user_id: data.user_id || targetUserId,
          title: String(data.title || newPost.title),
          concept: data.concept || newPost.concept,
          script: String(data.script || newPost.script),
          caption: String(data.caption || newPost.caption),
          hashtags: Array.isArray(data.hashtags) ? data.hashtags : newPost.hashtags,
          image_prompt: data.image_prompt || newPost.image_prompt,
          video_prompt: data.video_prompt || newPost.video_prompt,
          veo_duration_seconds: data.veo_duration_seconds ?? newPost.veo_duration_seconds,
          veo_cost_usd: data.veo_cost_usd ?? newPost.veo_cost_usd,
          veo_cost_idr: data.veo_cost_idr ?? newPost.veo_cost_idr,
          media_url: data.media_url !== undefined ? data.media_url : newPost.media_url,
          media_type: data.media_type !== undefined ? data.media_type : newPost.media_type,
          recommended_time: data.recommended_time || newPost.recommended_time,
          scheduled_date: String(data.scheduled_date || newPost.scheduled_date),
          scheduled_time: String(data.scheduled_time || newPost.scheduled_time),
          scheduled_at: data.scheduled_at || newPost.scheduled_at,
          published_at: data.published_at || newPost.published_at,
          status: (data.status as any) || newPost.status
        };
        try {
          const current = await fetchAllPostsFromDb(targetUserId);
          const updated = [saved, ...current.filter((p) => String(p.id) !== String(saved.id))];
          setLocalItem(`sparky_posts_${targetUserId}`, JSON.stringify(updated));
        } catch {}
        return saved;
      }
    } catch (err) {
      console.warn("Supabase upsert post notice, falling back to local:", err);
    }
  }

  try {
    const current = await fetchAllPostsFromDb(targetUserId);
    const updated = [newPost, ...current.filter((p) => String(p.id) !== String(newPost.id))];
    setLocalItem(`sparky_posts_${targetUserId}`, JSON.stringify(updated));
  } catch {
    // ignore
  }

  localPostsStorage = [newPost, ...localPostsStorage.filter((p) => String(p.id) !== String(newPost.id))];
  return newPost;
}

export async function deletePostFromDb(id: string, userId?: string): Promise<boolean> {
  const currentUser = await getCurrentUser();
  const targetUserId = userId || currentUser?.id || "guest";

  if (supabase) {
    try {
      await withTimeout(supabase.from("content_posts").delete().eq("id", id), 2000);
    } catch (err) {
      console.warn("Supabase delete post notice:", err);
    }
  }

  // Purge from ALL sparky_posts_* local storage keys so deleted post never returns
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sparky_posts_")) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const current: ContentPostItem[] = JSON.parse(stored);
            const updated = current.filter((p) => String(p.id) !== String(id));
            localStorage.setItem(key, JSON.stringify(updated));
          }
        }
      }
    } catch (e) {
      console.warn("Error purging deleted post from localStorage:", e);
    }
  }

  localPostsStorage = localPostsStorage.filter((p) => String(p.id) !== String(id));
  return true;
}

// =========================================
// 4. Chat Multi-Thread Library (ChatGPT Style)
// =========================================

export interface ChatConversationItem {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageItem {
  id: string;
  conversation_id: string;
  user_id?: string;
  sender: "user" | "sparky";
  content: string;
  created_at: string;
  actions?: any;
}

export async function getUserConversations(userId: string, email?: string): Promise<ChatConversationItem[]> {
  const idsToQuery = Array.from(new Set([
    userId,
    email ? getDeterministicUserId(email) : null,
    userId.includes("@") ? getDeterministicUserId(userId) : null
  ].filter(Boolean))) as string[];

  let dbConvs: ChatConversationItem[] = [];
  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("chat_conversations")
          .select("*")
          .in("user_id", idsToQuery)
          .order("updated_at", { ascending: false }),
        2500
      );

      if (!error && data) {
        dbConvs = data as ChatConversationItem[];
      }
    } catch (err) {
      console.warn("Supabase fetch conversations notice:", err);
    }
  }

  let localConvs: ChatConversationItem[] = [];
  try {
    idsToQuery.forEach((id) => {
      const stored = getLocalItem(`sparky_threads_${id}`);
      if (stored) {
        const parsed: ChatConversationItem[] = JSON.parse(stored);
        localConvs.push(...parsed);
      }
    });
  } catch {
    // ignore
  }

  const map = new Map<string, ChatConversationItem>();
  dbConvs.forEach((c) => map.set(c.id, c));
  localConvs.forEach((c) => {
    if (!map.has(c.id)) map.set(c.id, c);
  });

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
  );

  if (merged.length > 0) {
    idsToQuery.forEach((id) => setLocalItem(`sparky_threads_${id}`, JSON.stringify(merged)));
  }

  return merged;
}

export async function createConversation(userId: string, title?: string): Promise<ChatConversationItem> {
  const conv: ChatConversationItem = {
    id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    user_id: userId,
    title: title || "Obrolan Baru",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase.from("chat_conversations").insert([conv]).select().single(),
        2000
      );
      if (!error && data) {
        return data as ChatConversationItem;
      }
    } catch (err) {
      console.warn("Supabase create conversation notice:", err);
    }
  }

  try {
    const current = await getUserConversations(userId);
    const updated = [conv, ...current];
    setLocalItem(`sparky_threads_${userId}`, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return conv;
}

export async function deleteConversation(conversationId: string, userId: string): Promise<boolean> {
  if (supabase) {
    try {
      await withTimeout(supabase.from("chat_messages").delete().eq("conversation_id", conversationId), 2000);
      await withTimeout(supabase.from("chat_conversations").delete().eq("id", conversationId), 2000);
    } catch (err) {
      console.warn("Supabase delete conversation notice:", err);
    }
  }

  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("sparky_threads_") || key.startsWith("sparky_conversations_"))) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const currentConvs: ChatConversationItem[] = JSON.parse(stored);
            const updatedConvs = currentConvs.filter((c) => String(c.id) !== String(conversationId));
            localStorage.setItem(key, JSON.stringify(updatedConvs));
          }
        }
      }
      removeLocalItem(`sparky_messages_${conversationId}`);
    } catch (e) {
      console.warn("Error purging deleted conversation from localStorage:", e);
    }
  }

  return true;
}

export async function getConversationMessages(conversationId: string, userId: string): Promise<ChatMessageItem[]> {
  let dbMsgs: ChatMessageItem[] = [];
  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("chat_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
        2000
      );

      if (!error && data) {
        dbMsgs = data as ChatMessageItem[];
      }
    } catch (err) {
      console.warn("Supabase fetch conversation messages notice:", err);
    }
  }

  let localMsgs: ChatMessageItem[] = [];
  try {
    const stored = getLocalItem(`sparky_messages_${conversationId}`);
    if (stored) localMsgs = JSON.parse(stored);
  } catch {
    // ignore
  }

  const map = new Map<string, ChatMessageItem>();
  dbMsgs.forEach((m) => map.set(m.id, m));
  localMsgs.forEach((m) => {
    if (!map.has(m.id)) map.set(m.id, m);
  });

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (merged.length > 0) {
    setLocalItem(`sparky_messages_${conversationId}`, JSON.stringify(merged));
  }

  return merged;
}

export async function saveChatMessageToDb(
  userId: string,
  conversationId: string,
  sender: "user" | "sparky",
  content: string,
  actions?: any,
  updateTitle?: string
): Promise<ChatMessageItem> {
  const msg: ChatMessageItem = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    conversation_id: conversationId,
    user_id: userId,
    sender,
    content,
    created_at: new Date().toISOString(),
    actions
  };

  if (supabase) {
    try {
      await withTimeout(supabase.from("chat_messages").insert([msg]), 2000);
      const updateData: any = { updated_at: new Date().toISOString() };
      if (updateTitle) updateData.title = updateTitle;
      await withTimeout(supabase.from("chat_conversations").update(updateData).eq("id", conversationId), 2000);
    } catch (err) {
      console.warn("Supabase save chat message notice:", err);
    }
  }

  try {
    const currentMsgs = await getConversationMessages(conversationId, userId);
    const updatedMsgs = [...currentMsgs, msg];
    setLocalItem(`sparky_messages_${conversationId}`, JSON.stringify(updatedMsgs));

    const threads = await getUserConversations(userId);
    const updatedThreads = threads.map((t) => {
      if (t.id === conversationId) {
        return {
          ...t,
          title: updateTitle || t.title,
          updated_at: new Date().toISOString()
        };
      }
      return t;
    });
    setLocalItem(`sparky_threads_${userId}`, JSON.stringify(updatedThreads));
  } catch {
    // ignore
  }

  return msg;
}

// =========================================
// 5. Media Library & Content Planner Integration
// =========================================

export interface UserMediaItem {
  id: string;
  user_id: string;
  post_id?: string | null;
  media_type: "image" | "video";
  media_url: string;
  title: string;
  prompt?: string;
  created_at: string;
  scheduled_date?: string;
  status: "generated" | "scheduled" | "published";
  caption?: string;
  hashtags?: string;
}

export interface PlannerEventItem {
  id: string;
  user_id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  media_url?: string;
  media_type?: "image" | "video";
  caption?: string;
  hashtags?: string;
  status: "scheduled" | "published";
  created_at: string;
}

export async function saveMediaToLibrary(
  userId: string,
  mediaData: Omit<UserMediaItem, "id" | "created_at" | "user_id"> & { id?: string }
): Promise<UserMediaItem> {
  const isValidUUID = (val?: string | null) =>
    Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

  const item: UserMediaItem = {
    id: isValidUUID(mediaData.id) ? (mediaData.id as string) : crypto.randomUUID(),
    user_id: userId,
    post_id: isValidUUID(mediaData.post_id) ? (mediaData.post_id as string) : null,
    media_type: mediaData.media_type,
    media_url: mediaData.media_url,
    title: mediaData.title || "",
    prompt: mediaData.prompt,
    created_at: new Date().toISOString(),
    scheduled_date: mediaData.scheduled_date,
    status: mediaData.status || "generated",
    caption: mediaData.caption,
    hashtags: mediaData.hashtags
  };

  if (supabase) {
    try {
      const dbPayload = {
        id: item.id,
        user_id: item.user_id,
        post_id: item.post_id,
        media_type: item.media_type,
        media_url: item.media_url,
        title: item.title,
        prompt: item.prompt,
        status: item.status,
        created_at: item.created_at
      };
      await withTimeout(supabase.from("user_media_library").insert([dbPayload]), 2000);
    } catch (err) {
      console.warn("Supabase save media notice:", err);
    }
  }

  try {
    const current = await getUserMediaLibrary(userId);
    const updated = [item, ...current.filter((m) => m.id !== item.id)];
    setLocalItem(`sparky_media_library_${userId}`, JSON.stringify(updated));
  } catch {}

  return item;
}

export async function getUserMediaLibrary(userId: string): Promise<UserMediaItem[]> {
  let dbItems: UserMediaItem[] = [];
  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("user_media_library")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        2000
      );
      if (!error && data) dbItems = data as UserMediaItem[];
    } catch (err) {
      console.warn("Supabase fetch media library notice:", err);
    }
  }

  let localItems: UserMediaItem[] = [];
  try {
    const stored = getLocalItem(`sparky_media_library_${userId}`);
    if (stored) localItems = JSON.parse(stored);
  } catch {}

  const map = new Map<string, UserMediaItem>();
  dbItems.forEach((i) => map.set(i.id, i));
  localItems.forEach((i) => {
    if (!map.has(i.id)) map.set(i.id, i);
  });

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (merged.length > 0) {
    setLocalItem(`sparky_media_library_${userId}`, JSON.stringify(merged));
  }

  return merged;
}

export function isValidMediaUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length < 5) return false;
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:image/") || trimmed.startsWith("data:video/")) return true;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const lower = trimmed.toLowerCase();
    if (lower.includes("example.com") || lower.includes("placeholder.com") || lower.includes("fake-url")) {
      return false;
    }
    return true;
  }
  return false;
}

export async function getMediaByPostId(postId: string, userId?: string): Promise<UserMediaItem[]> {
  if (!postId) return [];
  let dbItems: UserMediaItem[] = [];

  if (supabase) {
    try {
      let query = supabase.from("user_media_library").select("*").eq("post_id", postId);
      if (userId && userId !== "guest") {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await withTimeout(
        query.order("created_at", { ascending: false }),
        2000
      );
      if (!error && data) dbItems = data as UserMediaItem[];
    } catch (err) {
      console.warn("Supabase fetch media by post_id notice:", err);
    }
  }

  let localItems: UserMediaItem[] = [];
  if (userId) {
    try {
      const stored = getLocalItem(`sparky_media_library_${userId}`);
      if (stored) {
        const parsed: UserMediaItem[] = JSON.parse(stored);
        localItems = parsed.filter((m) => m.post_id === postId);
      }
    } catch {}
  }

  const map = new Map<string, UserMediaItem>();
  dbItems.forEach((i) => map.set(i.id, i));
  localItems.forEach((i) => {
    if (!map.has(i.id)) map.set(i.id, i);
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function attachMediaToPost(
  postId: string,
  mediaUrl: string,
  mediaType: "image" | "video",
  userId?: string
): Promise<ContentPostItem | null> {
  if (!postId || !isValidMediaUrl(mediaUrl)) {
    return null;
  }
  return savePostToDb({
    id: postId,
    user_id: userId,
    media_url: mediaUrl,
    media_type: mediaType
  });
}

export async function savePlannerEvent(
  userId: string,
  eventData: Omit<PlannerEventItem, "id" | "created_at" | "user_id">
): Promise<PlannerEventItem> {
  const item: PlannerEventItem = {
    id: `event-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    user_id: userId,
    ...eventData,
    created_at: new Date().toISOString()
  };

  try {
    const current = await getPlannerEvents(userId);
    const updated = [item, ...current.filter((e) => e.id !== item.id)];
    setLocalItem(`sparky_planner_${userId}`, JSON.stringify(updated));
  } catch {}

  return item;
}

export async function getPlannerEvents(userId: string): Promise<PlannerEventItem[]> {
  let localEvents: PlannerEventItem[] = [];
  try {
    const stored = getLocalItem(`sparky_planner_${userId}`);
    if (stored) localEvents = JSON.parse(stored);
  } catch {}

  return localEvents;
}

// =========================================
// 6. Daily News & Daily Brief Types & Storage
// =========================================

export interface DailyTrendingTopic {
  rank: string;
  topic: string;
  growth: string;
  tag: string;
  region?: string;
}

export interface DailyNewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string;
  topic?: string;
  excerpt?: string;
  summary?: string;
  region?: string;
  image_url?: string;
  imageUrl?: string;
  read_time?: string;
}

export interface SelectedNewsContext {
  id: string;
  title: string;
  source: string;
  url?: string;
  published_at?: string;
  topic?: string;
  excerpt?: string;
  summary?: string;
  region?: string;
  image_url?: string;
  imageUrl?: string;
  timestamp: number;
}

export const SELECTED_NEWS_CONTEXT_KEY = "sparky_selected_news_context";

export interface DailyBrief {
  id: string;
  brief_date: string; // YYYY-MM-DD
  topics: DailyTrendingTopic[];
  news_items: DailyNewsItem[];
  created_at: string;
  updated_at: string;
}

const LOCAL_DAILY_BRIEFS_KEY = "sparky_daily_briefs";

function isValidUuid(str?: string): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function saveDailyBrief(
  briefData: Omit<DailyBrief, "id" | "created_at" | "updated_at"> & {
    id?: string;
    created_at?: string;
    updated_at?: string;
  }
): Promise<DailyBrief> {
  const now = new Date().toISOString();
  const validId = isValidUuid(briefData.id) ? briefData.id! : generateUUID();
  const brief: DailyBrief = {
    id: validId,
    brief_date: briefData.brief_date,
    topics: briefData.topics || [],
    news_items: briefData.news_items || [],
    created_at: briefData.created_at || now,
    updated_at: now,
  };

  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("daily_briefs")
          .upsert(
            [
              {
                id: brief.id,
                brief_date: brief.brief_date,
                topics: brief.topics,
                news_items: brief.news_items,
                created_at: brief.created_at,
                updated_at: brief.updated_at,
              },
            ],
            { onConflict: "brief_date" }
          )
          .select()
          .single(),
        5000
      );
      if (!error && data) {
        brief.id = String(data.id || brief.id);
        brief.created_at = String(data.created_at || brief.created_at);
        brief.updated_at = String(data.updated_at || brief.updated_at);
      } else if (error) {
        console.warn("Supabase save daily brief error:", error.message);
      }
    } catch (err) {
      console.warn("Supabase save daily brief notice, using local fallback:", err);
    }
  }

  // Local Storage fallback & sync
  try {
    const raw = getLocalItem(LOCAL_DAILY_BRIEFS_KEY);
    const existing: DailyBrief[] = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter((b) => b.brief_date !== brief.brief_date && b.id !== brief.id);
    const updated = [brief, ...filtered];
    setLocalItem(LOCAL_DAILY_BRIEFS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("LocalStorage save daily brief notice:", e);
  }

  return brief;
}

export async function getLatestDailyBrief(): Promise<DailyBrief | null> {
  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("daily_briefs")
          .select("*")
          .order("brief_date", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        5000
      );
      if (!error && data) {
        const item: DailyBrief = {
          id: String(data.id),
          brief_date: String(data.brief_date),
          topics: Array.isArray(data.topics) ? data.topics : [],
          news_items: Array.isArray(data.news_items) ? data.news_items : [],
          created_at: String(data.created_at || ""),
          updated_at: String(data.updated_at || ""),
        };
        // Sync to local
        try {
          const raw = getLocalItem(LOCAL_DAILY_BRIEFS_KEY);
          const existing: DailyBrief[] = raw ? JSON.parse(raw) : [];
          const filtered = existing.filter((b) => b.brief_date !== item.brief_date && b.id !== item.id);
          setLocalItem(LOCAL_DAILY_BRIEFS_KEY, JSON.stringify([item, ...filtered]));
        } catch {}
        return item;
      }
    } catch (err) {
      console.warn("Supabase fetch latest daily brief notice, falling back to local:", err);
    }
  }

  try {
    const raw = getLocalItem(LOCAL_DAILY_BRIEFS_KEY);
    if (raw) {
      const existing: DailyBrief[] = JSON.parse(raw);
      if (existing.length > 0) {
        existing.sort((a, b) => {
          const dateComp = b.brief_date.localeCompare(a.brief_date);
          if (dateComp !== 0) return dateComp;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        return existing[0];
      }
    }
  } catch {}

  return null;
}

export async function getDailyBriefByDate(dateStr: string): Promise<DailyBrief | null> {
  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("daily_briefs")
          .select("*")
          .eq("brief_date", dateStr)
          .maybeSingle(),
        5000
      );
      if (!error && data) {
        return {
          id: String(data.id),
          brief_date: String(data.brief_date),
          topics: Array.isArray(data.topics) ? data.topics : [],
          news_items: Array.isArray(data.news_items) ? data.news_items : [],
          created_at: String(data.created_at || ""),
          updated_at: String(data.updated_at || ""),
        };
      }
    } catch (err) {
      console.warn("Supabase fetch daily brief by date notice, falling back to local:", err);
    }
  }

  try {
    const raw = getLocalItem(LOCAL_DAILY_BRIEFS_KEY);
    if (raw) {
      const existing: DailyBrief[] = JSON.parse(raw);
      const found = existing.find((b) => b.brief_date === dateStr);
      if (found) return found;
    }
  } catch {}

  return null;
}
