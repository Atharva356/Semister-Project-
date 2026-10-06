/**
 * ==============================================================================
 * AgriMandi - Supabase Client Configuration & Auth Helper
 * ==============================================================================
 * This module connects the frontend to Supabase for:
 * 1. User Authentication (Signup, Login, Logout, Session management)
 * 2. User Profile and Role mapping (Farmer vs Buyer)
 * ==============================================================================
 */

// 1. SUPABASE CREDENTIALS CONFIGURATION
const SUPABASE_CONFIG = {
  url: window.AGRIMANDI_SUPABASE_URL || "https://wkqyjrxtwrdqvyknajhx.supabase.co",
  anonKey: window.AGRIMANDI_SUPABASE_ANON_KEY || "sb_publishable_vmmPdMwngg45PbeftR0SHg_57NkIzH1"
};

// Check if credentials are set
function isSupabaseClientConfigured() {
  return (
    SUPABASE_CONFIG.url &&
    !SUPABASE_CONFIG.url.includes("your-project-id") &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.anonKey.includes("your-anon-key-here")
  );
}

// 2. CLIENT INITIALIZATION
// Note: We use _agriSupabaseClient to avoid colliding with window.supabase from the CDN bundle!
let _agriSupabaseClient = null;

try {
  if (typeof window.supabase !== "undefined" && typeof window.supabase.createClient === "function") {
    _agriSupabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    console.log("⚡ [AgriMandi] Supabase client initialized successfully.");
  } else {
    console.error("❌ [AgriMandi] Supabase JS library is not loaded from CDN.");
  }
} catch (error) {
  console.error("❌ [AgriMandi] Failed to initialize Supabase client:", error);
}

// 3. AUTHENTICATION HELPERS

/**
 * Sign up a new user with Supabase Auth
 * Automatically attaches metadata: name, role ('farmer' | 'buyer'), and location.
 */
async function supabaseSignUp(email, password, { name, role, location }) {
  if (!_agriSupabaseClient) {
    return {
      user: null,
      session: null,
      error: new Error("Supabase client is not connected. Please check your internet connection or credentials."),
      isMock: false
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
    return { user: data.user, session: data.session, error: null, isMock: false };
  } catch (err) {
    console.error("Supabase signup error:", err);
    return { user: null, session: null, error: err, isMock: false };
  }
}

/**
 * Sign in an existing user with email and password
 */
async function supabaseSignIn(email, password) {
  if (!_agriSupabaseClient) {
    return {
      user: null,
      session: null,
      error: new Error("Supabase client is not connected. Please check your network or credentials."),
      isMock: false
    };
  }

  try {
    const { data, error } = await _agriSupabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    // Guard against null user (e.g. email not confirmed)
    if (!data || !data.user) {
      return {
        user: null,
        session: null,
        error: new Error("Login failed. Please check your credentials or confirm your email address."),
        isMock: false
      };
    }

    return { user: data.user, session: data.session, error: null, isMock: false };
  } catch (err) {
    console.error("Supabase signin error:", err);
    return { user: null, session: null, error: err, isMock: false };
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
  localStorage.removeItem("agrimandi_user");
}

/**
 * Get current session user
 */
async function supabaseGetCurrentUser() {
  if (_agriSupabaseClient) {
    try {
      const { data } = await _agriSupabaseClient.auth.getSession();
      if (data && data.session && data.session.user) {
        const u = data.session.user;
        return {
          id: u.id,
          email: u.email,
          name: u.user_metadata?.name || u.user_metadata?.full_name || u.email.split("@")[0],
          role: u.user_metadata?.role || "buyer",
          location: u.user_metadata?.location || "India"
        };
      }
    } catch (e) {
      console.warn("Failed to get session:", e);
    }
  }

  // Fallback to localStorage
  const stored = localStorage.getItem("agrimandi_user");
  return stored ? JSON.parse(stored) : null;
}

// Export functions to global window object
window.agriMandiSupabase = {
  client: _agriSupabaseClient,
  isConfigured: isSupabaseClientConfigured,
  signUp: supabaseSignUp,
  signIn: supabaseSignIn,
  signOut: supabaseSignOut,
  getCurrentUser: supabaseGetCurrentUser
};
