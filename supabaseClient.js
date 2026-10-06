/**
 * ==============================================================================
 * AgriMandi - Supabase Client Configuration & Auth Helper (v2)
 * ==============================================================================
 * Connects frontend to Supabase for:
 * 1. User Authentication (Signup, Login, Logout, Session Token management)
 * 2. User Profile and authoritative Role retrieval from the `profiles` table
 * 3. Secure file upload to Supabase Storage (`produce-images` bucket)
 * ==============================================================================
 */

// 1. SUPABASE CREDENTIALS CONFIGURATION
const _config = window.AGRIMANDI_CONFIG || {};

const SUPABASE_CONFIG = {
  url: _config.supabaseUrl || "",
  anonKey: _config.supabaseAnonKey || ""
};

function isSupabaseClientConfigured() {
  return Boolean(
    SUPABASE_CONFIG.url &&
    !SUPABASE_CONFIG.url.includes("your-project-id") &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.anonKey.includes("your-supabase")
  );
}

// 2. CLIENT INITIALIZATION
let _agriSupabaseClient = null;

try {
  if (typeof window.supabase !== "undefined" && typeof window.supabase.createClient === "function") {
    if (isSupabaseClientConfigured()) {
      _agriSupabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
      console.log("⚡ [AgriMandi] Supabase client initialized from config.");
    } else {
      console.warn("⚠️ [AgriMandi] Supabase credentials not configured in config.js.");
    }
  } else {
    console.error("❌ [AgriMandi] Supabase JS library is not loaded from CDN.");
  }
} catch (error) {
  console.error("❌ [AgriMandi] Failed to initialize Supabase client:", error);
}

// 3. AUTHENTICATION HELPERS

/**
 * Sign up a new user with Supabase Auth
 */
async function supabaseSignUp(email, password, { name, role, location }) {
  if (!_agriSupabaseClient) {
    return {
      user: null,
      session: null,
      error: new Error("Supabase client is not connected. Please check configuration.")
    };
  }

  try {
    const { data, error } = await _agriSupabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          name: name,
          full_name: name,
          role: role,
          location: location || "India"
        }
      }
    });

    if (error) throw error;
    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    console.error("Supabase signup error:", err);
    return { user: null, session: null, error: err };
  }
}

/**
 * Sign in existing user with email and password
 */
async function supabaseSignIn(email, password) {
  if (!_agriSupabaseClient) {
    return {
      user: null,
      session: null,
      error: new Error("Supabase client is not connected.")
    };
  }

  try {
    const { data, error } = await _agriSupabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    if (!data || !data.user) {
      return {
        user: null,
        session: null,
        error: new Error("Login failed. Please check credentials or confirm your email.")
      };
    }

    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    console.error("Supabase signin error:", err);
    return { user: null, session: null, error: err };
  }
}

/**
 * Sign out current user
 */
async function supabaseSignOut() {
  if (_agriSupabaseClient) {
    try {
      await _agriSupabaseClient.auth.signOut();
    } catch (e) {
      console.warn("Sign out warning:", e);
    }
  }
  // Clear any cached UI tokens
  sessionStorage.removeItem("agrimandi_cached_user");
}

/**
 * Get current access token (for Authorization: Bearer <jwt> headers)
 */
async function supabaseGetAccessToken() {
  if (!_agriSupabaseClient) return null;
  try {
    const { data } = await _agriSupabaseClient.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  } catch (e) {
    console.warn("Could not retrieve session token:", e);
    return null;
  }
}

/**
 * Get current session user and fetch role from `profiles` table (never localStorage)
 */
async function supabaseGetCurrentUser() {
  if (!_agriSupabaseClient) return null;

  try {
    const { data: sessionData, error: sessionErr } = await _agriSupabaseClient.auth.getSession();
    if (sessionErr || !sessionData || !sessionData.session || !sessionData.session.user) {
      return null;
    }

    const authUser = sessionData.session.user;

    // Fetch authoritative role from the profiles table
    let role = "buyer";
    let fullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email.split("@")[0];
    let location = authUser.user_metadata?.location || "India";

    try {
      const { data: profileData, error: profileErr } = await _agriSupabaseClient
        .from("profiles")
        .select("role, full_name, location")
        .eq("id", authUser.id)
        .single();

      if (!profileErr && profileData) {
        if (profileData.role) role = profileData.role;
        if (profileData.full_name) fullName = profileData.full_name;
        if (profileData.location) location = profileData.location;
      }
    } catch (profileFetchError) {
      console.warn("Could not query profiles table directly; falling back to metadata:", profileFetchError);
      role = authUser.user_metadata?.role || "buyer";
    }

    return {
      id: authUser.id,
      email: authUser.email,
      name: fullName,
      role: role,
      location: location,
      accessToken: sessionData.session.access_token
    };
  } catch (e) {
    console.warn("Failed to get current session:", e);
    return null;
  }
}

/**
 * Upload produce image to Supabase Storage bucket `produce-images`
 * Size limit: 2MB. Allowed types: image/jpeg, image/png, image/webp.
 */
async function supabaseUploadProduceImage(file, userId) {
  if (!_agriSupabaseClient) {
    throw new Error("Supabase client is not connected.");
  }

  if (!file) {
    throw new Error("No file provided for upload.");
  }

  // Validate file size (max 2MB)
  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error("Image file size must be less than 2MB.");
  }

  // Validate MIME type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only JPG, PNG, and WebP images are allowed.");
  }

  const fileExt = file.name.split(".").pop();
  const filePath = `${userId || "public"}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

  const { data, error } = await _agriSupabaseClient.storage
    .from("produce-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (error) {
    console.error("Supabase storage upload error:", error);
    throw error;
  }

  const { data: publicUrlData } = _agriSupabaseClient.storage
    .from("produce-images")
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
}

// Global export
window.agriMandiSupabase = {
  client: _agriSupabaseClient,
  isConfigured: isSupabaseClientConfigured,
  signUp: supabaseSignUp,
  signIn: supabaseSignIn,
  signOut: supabaseSignOut,
  getAccessToken: supabaseGetAccessToken,
  getCurrentUser: supabaseGetCurrentUser,
  uploadProduceImage: supabaseUploadProduceImage
};
