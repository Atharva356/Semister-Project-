/**
 * ==============================================================================
 * AgriMandi - Central API Client Module (api.js)
 * ==============================================================================
 * Handles all HTTP communications with the Flask REST API:
 * - Automatically attaches current Supabase session Bearer JWT
 * - Handles 401 session expirations with redirect to login.html
 * - Standardizes response parsing ({success, data, error}) and error toast notifications
 * ==============================================================================
 */

(function () {
  const getBaseUrl = () => {
    let raw = (window.AGRIMANDI_CONFIG && window.AGRIMANDI_CONFIG.apiBaseUrl) || "http://localhost:5000";
    if (typeof raw === "string") {
      raw = raw.trim();
      // Extract URL if placeholder or example text was accidentally entered
      const match = raw.match(/https?:\/\/[^\s),"]+/i);
      if (match) {
        return match[0].replace(/\/+$/, '');
      }
      if (!raw.startsWith("http://") && !raw.startsWith("https://") && !raw.startsWith("/")) {
        console.error("[AgriMandi] Invalid API_BASE_URL configured:", raw);
        return "http://localhost:5000";
      }
      return raw.replace(/\/+$/, '');
    }
    return "http://localhost:5000";
  };

  /**
   * Core HTTP request dispatcher
   */
  async function apiFetch(path, options = {}) {
    const baseUrl = getBaseUrl();
    const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
    const opts = { ...options };

    opts.headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    // Attach Supabase JWT Bearer token if session exists
    try {
      if (window.agriMandiSupabase && typeof window.agriMandiSupabase.getAccessToken === "function") {
        const token = await window.agriMandiSupabase.getAccessToken();
        if (token) {
          opts.headers["Authorization"] = `Bearer ${token}`;
        }
      }
    } catch (tokenErr) {
      console.warn("Could not retrieve bearer token:", tokenErr);
    }

    try {
      const response = await fetch(url, opts);

      // Handle 401 Unauthorized
      if (response.status === 401) {
        if (!options.skipAuthRedirect) {
          if (typeof window.showToast === "function") {
            window.showToast("Your session has expired. Please log in again.", "error");
          }
          setTimeout(() => {
            const currentPath = window.location.pathname;
            if (currentPath.includes("dashboard")) {
              window.location.href = "login.html";
            }
          }, 1200);
        }
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        data = { success: false, error: `Invalid server response (${response.status})` };
      }

      if (!response.ok || (data && data.success === false)) {
        const errMsg = (data && data.error) || `Request failed with status ${response.status}`;
        if (!options.silent && typeof window.showToast === "function") {
          window.showToast(errMsg, "error");
        }
        return {
          success: false,
          error: errMsg,
          status: response.status,
          data: null
        };
      }

      return data;
    } catch (networkError) {
      console.error("API Network Error:", networkError);
      const networkMsg = "Unable to connect to AgriMandi server. Please ensure the backend is running.";
      if (!options.silent && typeof window.showToast === "function") {
        window.showToast(networkMsg, "error");
      }
      return {
        success: false,
        error: networkMsg,
        data: null
      };
    }
  }

  // API Resource Endpoints
  const api = {
    fetch: apiFetch,

    // Produce endpoints
    produce: {
      async list(queryParams = {}) {
        const searchParams = new URLSearchParams();
        for (const [k, v] of Object.entries(queryParams)) {
          if (v !== undefined && v !== null && v !== "") {
            searchParams.append(k, v);
          }
        }
        const qs = searchParams.toString();
        return apiFetch(`/api/produce${qs ? "?" + qs : ""}`);
      },

      async get(id) {
        return apiFetch(`/api/produce/${encodeURIComponent(id)}`);
      },

      async stats() {
        return apiFetch("/api/produce/stats");
      },

      async create(produceData) {
        return apiFetch("/api/produce", {
          method: "POST",
          body: JSON.stringify(produceData)
        });
      },

      async update(id, updates) {
        return apiFetch(`/api/produce/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(updates)
        });
      },

      async delete(id) {
        return apiFetch(`/api/produce/${encodeURIComponent(id)}`, {
          method: "DELETE"
        });
      }
    },

    // Orders endpoints
    orders: {
      async list() {
        return apiFetch("/api/orders");
      },

      async get(id) {
        return apiFetch(`/api/orders/${encodeURIComponent(id)}`);
      },

      async create(orderData) {
        return apiFetch("/api/orders", {
          method: "POST",
          body: JSON.stringify(orderData)
        });
      },

      async checkout(checkoutData) {
        return apiFetch("/api/orders/checkout", {
          method: "POST",
          body: JSON.stringify(checkoutData)
        });
      },

      async updateStatus(id, status, reason = null) {
        const body = { status };
        if (reason) body.reason = reason;
        return apiFetch(`/api/orders/${encodeURIComponent(id)}/status`, {
          method: "PATCH",
          body: JSON.stringify(body)
        });
      }
    },

    // Notifications endpoints
    notifications: {
      async list(silent = true) {
        return apiFetch("/api/notifications", { silent });
      },

      async markRead(id) {
        return apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
          method: "PATCH"
        });
      },

      async markAllRead() {
        return apiFetch("/api/notifications/mark-all-read", {
          method: "POST"
        });
      }
    }
  };

  // Attach to window
  window.agriMandiApi = api;
})();
