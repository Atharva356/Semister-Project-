/**
 * ==============================================================================
 * AgriMandi - Main Application Logic (app.js) - Version 2.0
 * Direct Farmer-to-Buyer Marketplace
 * Pure Vanilla JavaScript (No frameworks, No build step)
 *
 * Architecture:
 * - Supabase Auth for client sessions and JWT tokens
 * - Flask REST API for produce and orders (/api/produce, /api/orders)
 * - Authoritative roles loaded from `profiles` table
 * - Strict XSS protection via escapeHtml()
 * ==============================================================================
 */

// Category fallback preview images
const CATEGORY_IMAGES = {
  Vegetables: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",
  Fruits: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=80",
  Grains: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80",
  Pulses: "https://images.unsplash.com/photo-1585672840545-21d96677c7f1?auto=format&fit=crop&w=600&q=80",
  Spices: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80"
};

// ==============================================================================
// 1. SECURITY & UTILITY HELPERS
// ==============================================================================

/**
 * XSS Sanitizer: Encodes HTML entities in user-controlled strings
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Validates and sanitizes image URLs (http/https only)
 */
function sanitizeImageUrl(url, fallbackCategory = "Vegetables") {
  if (!url || typeof url !== "string") {
    return CATEGORY_IMAGES[fallbackCategory] || CATEGORY_IMAGES.Vegetables;
  }
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/")) {
    return escapeHtml(trimmed);
  }
  return CATEGORY_IMAGES[fallbackCategory] || CATEGORY_IMAGES.Vegetables;
}

/**
 * Toast Notification system
 */
function showToast(message, type = "success") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : ""}`;
  toast.innerHTML = `
    <span>${type === "error" ? "⚠️" : "✅"}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
window.showToast = showToast;

/**
 * Formats amount into Indian Rupee (INR) representation
 */
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(num);
}

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return String(dateStr);
  }
}

function getStatusBadge(status) {
  const s = String(status || "Pending");
  let badgeClass = "badge-pending";
  if (s === "Confirmed") badgeClass = "badge-confirmed";
  else if (s === "Dispatched") badgeClass = "badge-dispatched";
  else if (s === "Delivered") badgeClass = "badge-delivered";
  else if (s === "Cancelled") badgeClass = "badge-cancelled";
  else if (s === "Rejected") badgeClass = "badge-rejected";
  return `<span class="badge ${badgeClass}">${escapeHtml(s)}</span>`;
}

/**
 * Universal Action Confirmation Modal ("Are you sure?")
 */
function showConfirmDialog({
  title = "⚠️ Confirm Action",
  message = "Are you sure you want to proceed?",
  requireReason = false,
  reasonPlaceholder = "Please provide a reason...",
  confirmText = "Confirm",
  isDanger = false,
  onConfirm
}) {
  let modal = document.getElementById("confirmActionModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "confirmActionModal";
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 440px;">
        <div class="modal-header">
          <h3 id="confirmModalTitle">⚠️ Confirmation</h3>
          <button type="button" class="modal-close-btn" id="closeConfirmModal" aria-label="Close dialog">&times;</button>
        </div>
        <div class="modal-body">
          <p id="confirmModalMessage" style="font-size: 1rem; color: var(--text-main); margin-bottom: 14px;"></p>
          <div id="confirmModalInputGroup" style="display: none; margin-top: 10px;">
            <label for="confirmModalReason" class="form-label" style="font-size: 0.85rem;">Reason *</label>
            <textarea id="confirmModalReason" class="form-control" rows="2"></textarea>
            <small id="confirmModalReasonError" class="error-message" style="display: none;">Reason is required.</small>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline btn-sm" id="cancelConfirmModalBtn">Cancel</button>
          <button type="button" class="btn btn-sm" id="executeConfirmModalBtn">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const titleEl = modal.querySelector("#confirmModalTitle");
  const msgEl = modal.querySelector("#confirmModalMessage");
  const inputGroup = modal.querySelector("#confirmModalInputGroup");
  const reasonInput = modal.querySelector("#confirmModalReason");
  const reasonError = modal.querySelector("#confirmModalReasonError");
  const cancelBtn = modal.querySelector("#cancelConfirmModalBtn");
  const closeBtn = modal.querySelector("#closeConfirmModal");
  const confirmBtn = modal.querySelector("#executeConfirmModalBtn");

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  if (requireReason) {
    if (inputGroup) inputGroup.style.display = "block";
    if (reasonInput) {
      reasonInput.value = "";
      reasonInput.placeholder = reasonPlaceholder;
      reasonInput.classList.remove("is-invalid");
    }
    if (reasonError) reasonError.style.display = "none";
  } else {
    if (inputGroup) inputGroup.style.display = "none";
  }

  if (confirmBtn) {
    confirmBtn.textContent = confirmText;
    confirmBtn.className = isDanger ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm";
  }

  const closeModal = () => {
    modal.classList.remove("active");
  };

  const handleConfirm = async () => {
    let reasonVal = "";
    if (requireReason && reasonInput) {
      reasonVal = reasonInput.value.trim();
      if (!reasonVal) {
        reasonInput.classList.add("is-invalid");
        if (reasonError) reasonError.style.display = "block";
        return;
      }
    }
    closeModal();
    if (typeof onConfirm === "function") {
      await onConfirm(reasonVal);
    }
  };

  // Re-bind click handlers cleanly
  if (cancelBtn) cancelBtn.onclick = closeModal;
  if (closeBtn) closeBtn.onclick = closeModal;
  if (confirmBtn) confirmBtn.onclick = handleConfirm;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };

  modal.classList.add("active");
  if (requireReason && reasonInput) {
    setTimeout(() => reasonInput.focus(), 100);
  }
}
window.showConfirmDialog = showConfirmDialog;

// ==============================================================================
// 1.5. CLIENT-SIDE SHOPPING CART
// ==============================================================================
const CART_STORAGE_KEY = "agrimandi_cart";

function getCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCart(cartItems) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  updateCartBadges();
}

function addToCart(item, qty = 1) {
  const cart = getCart();
  const existing = cart.find(i => String(i.id) === String(item.id));
  const maxStock = Number(item.quantity) || 9999;

  if (existing) {
    const newQty = existing.quantity + qty;
    if (newQty > maxStock) {
      existing.quantity = maxStock;
      showToast(`Only ${maxStock} ${item.unit} available in stock for ${item.name}.`, "error");
    } else {
      existing.quantity = newQty;
      showToast(`Added another ${item.name} to your cart!`);
    }
  } else {
    cart.push({
      id: item.id,
      name: item.name,
      category: item.category,
      price: Number(item.price),
      unit: item.unit || "Kg",
      quantity: Math.min(qty, maxStock),
      maxQuantity: maxStock,
      farmerName: item.farmerName || "Verified Grower",
      location: item.location || "India",
      image: item.image
    });
    showToast(`"${item.name}" added to cart!`);
  }
  saveCart(cart);
  animateCartBadge();
}

function updateCartQuantity(id, newQty) {
  let cart = getCart();
  const item = cart.find(i => String(i.id) === String(id));
  if (!item) return;

  const validQty = Math.max(1, Math.min(newQty, item.maxQuantity || 9999));
  item.quantity = validQty;
  saveCart(cart);
  renderCartPage();
}

function removeFromCart(id) {
  let cart = getCart();
  const item = cart.find(i => String(i.id) === String(id));
  const name = item ? item.name : "Item";
  cart = cart.filter(i => String(i.id) !== String(id));
  saveCart(cart);
  showToast(`"${name}" removed from cart.`);
  renderCartPage();
}

function clearCart() {
  localStorage.removeItem(CART_STORAGE_KEY);
  updateCartBadges();
}

function updateCartBadges() {
  const cart = getCart();
  const totalCount = cart.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const badges = document.querySelectorAll("#navCartBadge, #mobileNavCartBadge");
  badges.forEach(b => {
    b.textContent = totalCount;
    b.style.display = totalCount > 0 ? "inline-flex" : "none";
  });
}

function animateCartBadge() {
  const badges = document.querySelectorAll("#navCartBadge, #mobileNavCartBadge");
  badges.forEach(b => {
    b.classList.remove("bounce");
    void b.offsetWidth; // Trigger reflow
    b.classList.add("bounce");
    setTimeout(() => b.classList.remove("bounce"), 300);
  });
}

function showInputError(fieldId, message) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  input.classList.add("is-invalid");
  let errorEl = input.nextElementSibling;
  if (!errorEl || !errorEl.classList.contains("error-message")) {
    errorEl = document.createElement("div");
    errorEl.className = "error-message";
    input.parentNode.appendChild(errorEl);
  }
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

function clearInputError(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  input.classList.remove("is-invalid");
  const errorEl = input.nextElementSibling;
  if (errorEl && errorEl.classList.contains("error-message")) {
    errorEl.style.display = "none";
  }
}

// ==============================================================================
// 2. AUTHENTICATION & ROLE GUARDS
// ==============================================================================

/**
 * Strict Role Guard on Page Load
 * Reads authoritative role from Supabase profiles table.
 * Redirects unauthorized users immediately.
 */
async function enforceRoleGuards() {
  const path = window.location.pathname;
  const isFarmerPage = path.includes("farmer-dashboard.html");
  const isBuyerProtectedPage = path.includes("buyer-dashboard.html") || 
                               path.includes("cart.html") || 
                               path.includes("orders.html") || 
                               path.includes("order-detail.html") ||
                               path.includes("order-success.html");
  const isAuthPage = path.includes("login.html") || path.includes("register.html");

  if (!window.agriMandiSupabase) return;

  const currentUser = await window.agriMandiSupabase.getCurrentUser();

  // Protected farmer portal
  if (isFarmerPage) {
    if (!currentUser) {
      window.location.replace("login.html?role=farmer");
      return;
    }
    if (currentUser.role !== "farmer") {
      showToast("Access restricted: Farmer portal requires a registered farmer profile.", "error");
      setTimeout(() => window.location.replace("buyer-dashboard.html"), 1200);
      return;
    }
  }

  // Protected buyer marketplace & shopping pages
  if (isBuyerProtectedPage) {
    if (!currentUser) {
      window.location.replace("login.html?role=buyer");
      return;
    }
  }

  // If already logged in, redirect away from login/register
  if (isAuthPage && currentUser) {
    if (currentUser.role === "farmer") {
      window.location.replace("farmer-dashboard.html");
    } else {
      window.location.replace("buyer-dashboard.html");
    }
  }
}

/**
 * Login and Registration form bindings
 */
function initAuthForms() {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();
      const submitBtn = document.getElementById("loginSubmitBtn");

      let isValid = true;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        showInputError("email", "Please enter a valid email address");
        isValid = false;
      } else {
        clearInputError("email");
      }

      if (!password || password.length < 6) {
        showInputError("password", "Password must be at least 6 characters");
        isValid = false;
      } else {
        clearInputError("password");
      }

      if (!isValid) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Verifying with Supabase...";
      }

      const result = await window.agriMandiSupabase.signIn(email, password);

      if (result.error) {
        showToast(result.error.message || "Invalid email or password", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign In to AgriMandi";
        }
        return;
      }

      // Query authoritative role from profiles table
      const user = await window.agriMandiSupabase.getCurrentUser();
      if (!user) {
        showToast("Authenticated, but could not load profile.", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign In to AgriMandi";
        }
        return;
      }

      showToast(`Welcome back, ${user.name}! Redirecting...`);

      setTimeout(() => {
        if (user.role === "farmer") {
          window.location.href = "farmer-dashboard.html";
        } else {
          window.location.href = "buyer-dashboard.html";
        }
      }, 700);
    });
  }

  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();
      const role = document.getElementById("role").value;
      const location = document.getElementById("location") ? document.getElementById("location").value.trim() : "";
      const submitBtn = document.getElementById("registerSubmitBtn");

      let isValid = true;
      if (!name) {
        showInputError("name", "Full name is required");
        isValid = false;
      } else {
        clearInputError("name");
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        showInputError("email", "Please enter a valid email address");
        isValid = false;
      } else {
        clearInputError("email");
      }

      if (!password || password.length < 6) {
        showInputError("password", "Password must be at least 6 characters");
        isValid = false;
      } else {
        clearInputError("password");
      }

      if (!isValid) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating account in Supabase...";
      }

      const result = await window.agriMandiSupabase.signUp(email, password, { name, role, location });

      if (result.error) {
        showToast(result.error.message || "Registration failed", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create My Account";
        }
        return;
      }

      // If email confirmation is enabled in Supabase, session will be null
      if (result.user && !result.session) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create My Account";
        }
        showToast("Account created! Please check your email to confirm your account.", "info");
        const form = document.getElementById("registerForm");
        if (form) {
          form.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; border-radius: 8px; background-color: #d1e7dd; color: #0f5132; border: 1px solid #badbcc; margin-bottom: 1.5rem;">
              <h3 style="margin-top: 0; font-size: 1.25rem;">📧 Confirmation Email Sent!</h3>
              <p style="margin-bottom: 0.75rem;">We've sent an activation link to <strong>${escapeHtml(email)}</strong>.</p>
              <p style="font-size: 0.9rem; color: #146c43; margin-bottom: 1.25rem;">Please check your inbox (and spam folder) and click the link to activate your AgriMandi account.</p>
              <a href="login.html" class="btn btn-primary" style="display: inline-block;">Go to Sign In</a>
            </div>
          `;
        }
        return;
      }

      showToast("Account created successfully! Redirecting...");

      setTimeout(() => {
        if (role === "farmer") {
          window.location.href = "farmer-dashboard.html";
        } else {
          window.location.href = "buyer-dashboard.html";
        }
      }, 800);
    });
  }
}

// ==============================================================================
// 3. FARMER DASHBOARD LOGIC (Live API & Orders Fulfillment)
// ==============================================================================

let currentFarmerProduce = [];
let currentFarmerOrders = [];

async function initFarmerDashboard() {
  const tableBody = document.getElementById("farmerProduceTableBody");
  const addForm = document.getElementById("addProduceForm");
  if (!tableBody && !addForm) return;

  const currentUser = await window.agriMandiSupabase.getCurrentUser();
  if (!currentUser) return;

  // Setup tabs
  const tabListingsBtn = document.getElementById("tabListingsBtn");
  const tabOrdersBtn = document.getElementById("tabOrdersBtn");
  const viewListingsTab = document.getElementById("viewListingsTab");
  const viewOrdersTab = document.getElementById("viewOrdersTab");

  if (tabListingsBtn && tabOrdersBtn) {
    tabListingsBtn.addEventListener("click", () => {
      tabListingsBtn.className = "btn btn-primary btn-sm";
      tabOrdersBtn.className = "btn btn-outline btn-sm";
      if (viewListingsTab) viewListingsTab.style.display = "block";
      if (viewOrdersTab) viewOrdersTab.style.display = "none";
    });

    tabOrdersBtn.addEventListener("click", () => {
      tabOrdersBtn.className = "btn btn-primary btn-sm";
      tabListingsBtn.className = "btn btn-outline btn-sm";
      if (viewListingsTab) viewListingsTab.style.display = "none";
      if (viewOrdersTab) viewOrdersTab.style.display = "block";
    });
  }

  // Load Initial Data
  await refreshFarmerDashboard(currentUser.id);

  // Add Produce Form Submission
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = document.getElementById("cropName").value.trim();
      const category = document.getElementById("cropCategory").value;
      const quantity = parseFloat(document.getElementById("cropQuantity").value);
      const unit = document.getElementById("cropUnit").value;
      const price = parseFloat(document.getElementById("cropPrice").value);
      const location = document.getElementById("cropLocation").value.trim();
      const fileInput = document.getElementById("cropImageFile");
      const urlFallbackInput = document.getElementById("cropImageUrlFallback");
      const submitBtn = document.getElementById("submitProduceBtn");

      let isValid = true;
      if (!name) {
        showInputError("cropName", "Please enter crop name");
        isValid = false;
      } else {
        clearInputError("cropName");
      }

      if (!quantity || quantity <= 0) {
        showInputError("cropQuantity", "Quantity must be greater than 0");
        isValid = false;
      } else {
        clearInputError("cropQuantity");
      }

      if (!price || price <= 0) {
        showInputError("cropPrice", "Price must be greater than 0");
        isValid = false;
      } else {
        clearInputError("cropPrice");
      }

      if (!location) {
        showInputError("cropLocation", "Harvest location is required");
        isValid = false;
      } else {
        clearInputError("cropLocation");
      }

      if (!isValid) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Publishing Listing...";
      }

      // Handle Image: Upload to Supabase Storage if file selected
      let finalImageUrl = "";
      if (fileInput && fileInput.files && fileInput.files[0]) {
        try {
          const file = fileInput.files[0];
          submitBtn.textContent = "Uploading Image to Storage...";
          finalImageUrl = await window.agriMandiSupabase.uploadProduceImage(file, currentUser.id);
        } catch (uploadError) {
          console.warn("Storage upload failed, trying URL fallback:", uploadError);
          showToast(`Image upload notice: ${uploadError.message}. Using URL fallback.`, "error");
        }
      }

      if (!finalImageUrl && urlFallbackInput && urlFallbackInput.value.trim()) {
        finalImageUrl = urlFallbackInput.value.trim();
      }

      if (!finalImageUrl) {
        finalImageUrl = CATEGORY_IMAGES[category] || CATEGORY_IMAGES.Vegetables;
      }

      submitBtn.textContent = "Saving to AgriMandi API...";

      const payload = {
        name,
        category,
        quantity,
        unit,
        price,
        location,
        image: finalImageUrl
      };

      const resp = await window.agriMandiApi.produce.create(payload);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "🌾 Publish Produce Listing";
      }

      if (resp.success) {
        showToast(`"${name}" published successfully!`);
        addForm.reset();
        await refreshFarmerDashboard(currentUser.id);
      }
    });
  }

  // Event Delegation for Farmer Produce Table (Edit & Delete)
  if (tableBody) {
    tableBody.addEventListener("click", async (e) => {
      const editBtn = e.target.closest("[data-action='edit']");
      const deleteBtn = e.target.closest("[data-action='delete']");

      if (editBtn) {
        const id = editBtn.getAttribute("data-id");
        openEditModal(id);
      } else if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-id");
        await handleFarmerDelete(id, currentUser.id);
      }
    });
  }

  // Event Delegation for Farmer Orders Table (Status transitions)
  const ordersTableBody = document.getElementById("farmerOrdersTableBody");
  if (ordersTableBody) {
    ordersTableBody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-farmer-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-farmer-action");
      const orderId = btn.getAttribute("data-order-id");
      const cropName = btn.getAttribute("data-crop") || "harvest";
      if (!orderId || !action) return;

      if (action === "accept") {
        showConfirmDialog({
          title: "✓ Accept Order",
          message: `Are you sure you want to accept order #${orderId} for ${cropName}?`,
          confirmText: "Accept Order",
          isDanger: false,
          onConfirm: async () => {
            btn.disabled = true;
            const resp = await window.agriMandiApi.orders.updateStatus(orderId, "Confirmed");
            if (resp.success) {
              showToast(`Order #${orderId} accepted!`);
              await refreshFarmerDashboard(currentUser.id);
            } else {
              btn.disabled = false;
            }
          }
        });
      } else if (action === "reject") {
        showConfirmDialog({
          title: "✕ Reject Order",
          message: `Are you sure you want to reject order #${orderId}? The reserved produce stock will be restored.`,
          requireReason: true,
          reasonPlaceholder: "Enter short reason for buyer (e.g. Stock damaged by rain, out of requested grade)...",
          confirmText: "Reject Order",
          isDanger: true,
          onConfirm: async (reason) => {
            btn.disabled = true;
            const resp = await window.agriMandiApi.orders.updateStatus(orderId, "Rejected", reason);
            if (resp.success) {
              showToast(`Order #${orderId} rejected.`);
              await refreshFarmerDashboard(currentUser.id);
            } else {
              btn.disabled = false;
            }
          }
        });
      } else if (action === "dispatch") {
        showConfirmDialog({
          title: "🚚 Mark as Dispatched",
          message: `Mark order #${orderId} as dispatched? The buyer will be notified that produce is on the way.`,
          confirmText: "Mark Dispatched",
          isDanger: false,
          onConfirm: async () => {
            btn.disabled = true;
            const resp = await window.agriMandiApi.orders.updateStatus(orderId, "Dispatched");
            if (resp.success) {
              showToast(`Order #${orderId} dispatched!`);
              await refreshFarmerDashboard(currentUser.id);
            } else {
              btn.disabled = false;
            }
          }
        });
      } else if (action === "deliver") {
        showConfirmDialog({
          title: "✅ Mark Delivered",
          message: `Confirm that order #${orderId} has been successfully delivered?`,
          confirmText: "Mark Delivered",
          isDanger: false,
          onConfirm: async () => {
            btn.disabled = true;
            const resp = await window.agriMandiApi.orders.updateStatus(orderId, "Delivered");
            if (resp.success) {
              showToast(`Order #${orderId} marked as delivered!`);
              await refreshFarmerDashboard(currentUser.id);
            } else {
              btn.disabled = false;
            }
          }
        });
      }
    });
  }

  initEditModal(currentUser.id);
}

/**
 * Loads and refreshes farmer metrics, listings, and incoming orders from the API
 */
async function refreshFarmerDashboard(farmerId) {
  const tableBody = document.getElementById("farmerProduceTableBody");
  const ordersTableBody = document.getElementById("farmerOrdersTableBody");
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
          Loading your active listings...
        </td>
      </tr>
    `;
  }

  // 1. Fetch Farmer Produce
  const produceResp = await window.agriMandiApi.produce.list({ farmer_id: farmerId, limit: 50 });
  currentFarmerProduce = (produceResp.success && produceResp.data) ? produceResp.data : [];

  // 2. Fetch Farmer Orders
  const ordersResp = await window.agriMandiApi.orders.list();
  currentFarmerOrders = (ordersResp.success && ordersResp.data) ? ordersResp.data : [];

  // Sort orders: New/Pending orders at top, followed by date
  currentFarmerOrders.sort((a, b) => {
    if (a.status === "Pending" && b.status !== "Pending") return -1;
    if (b.status === "Pending" && a.status !== "Pending") return 1;
    const dateA = new Date(a.createdAt || a.orderDate || 0);
    const dateB = new Date(b.createdAt || b.orderDate || 0);
    return dateB - dateA;
  });

  // Update Stats Cards
  const countEl = document.getElementById("statTotalListings");
  const qtyEl = document.getElementById("statTotalQuantity");
  const ordersCountEl = document.getElementById("statTotalOrders");
  const revenueEl = document.getElementById("statTotalRevenue");
  const ordersBadge = document.getElementById("ordersCountBadge");
  const pendingBadge = document.getElementById("ordersPendingBadge");

  if (countEl) countEl.textContent = currentFarmerProduce.length;
  if (qtyEl) {
    const totalVolume = currentFarmerProduce.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
    qtyEl.textContent = `${totalVolume.toLocaleString()} units`;
  }
  if (ordersCountEl) ordersCountEl.textContent = currentFarmerOrders.length;
  if (ordersBadge) ordersBadge.textContent = currentFarmerOrders.length;

  // Pending count badge on Orders Tab
  const pendingOrdersCount = currentFarmerOrders.filter(o => o.status === "Pending").length;
  if (pendingBadge) {
    if (pendingOrdersCount > 0) {
      pendingBadge.textContent = `${pendingOrdersCount} waiting`;
      pendingBadge.style.display = "inline-flex";
    } else {
      pendingBadge.style.display = "none";
    }
  }

  if (revenueEl) {
    const deliveredRevenue = currentFarmerOrders
      .filter(o => o.status === "Delivered")
      .reduce((sum, o) => sum + Number(o.totalPrice || 0), 0);
    revenueEl.textContent = formatCurrency(deliveredRevenue);
  }

  // Render Produce Table
  renderFarmerProduceTable();

  // Render Orders Table
  renderFarmerOrdersTable();
}

function renderFarmerProduceTable() {
  const tableBody = document.getElementById("farmerProduceTableBody");
  if (!tableBody) return;

  if (currentFarmerProduce.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          No produce listed yet. Use the form on the left to add your first harvest!
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = currentFarmerProduce.map(item => `
    <tr id="row-${escapeHtml(item.id)}">
      <td>
        <div class="crop-cell">
          <img 
            src="${sanitizeImageUrl(item.image, item.category)}" 
            alt="${escapeHtml(item.name)}" 
            class="crop-thumb" 
            onerror="this.src='${CATEGORY_IMAGES.Vegetables}'" 
          />
          <div class="crop-info-text">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.category)}</small>
          </div>
        </div>
      </td>
      <td>
        <span class="badge badge-green">${escapeHtml(item.category)}</span>
      </td>
      <td>
        <strong>${item.quantity}</strong> ${escapeHtml(item.unit)}
      </td>
      <td>
        <strong style="color: var(--primary);">${formatCurrency(item.price)}</strong> / ${escapeHtml(item.unit)}
      </td>
      <td>
        <span style="color: var(--text-muted); font-size: 0.9rem;">📍 ${escapeHtml(item.location)}</span>
      </td>
      <td style="text-align: right;">
        <div class="action-buttons" style="justify-content: flex-end;">
          <button class="btn btn-sm btn-outline" data-action="edit" data-id="${escapeHtml(item.id)}" title="Edit Listing">
            ✏️ Edit
          </button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${escapeHtml(item.id)}" title="Delete Listing">
            🗑️ Delete
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderFarmerOrdersTable() {
  const ordersTableBody = document.getElementById("farmerOrdersTableBody");
  if (!ordersTableBody) return;

  if (currentFarmerOrders.length === 0) {
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          No customer orders received yet. Active marketplace listings will appear here when purchased.
        </td>
      </tr>
    `;
    return;
  }

  ordersTableBody.innerHTML = currentFarmerOrders.map(order => {
    let actionsHtml = "";
    if (order.status === "Pending") {
      actionsHtml = `
        <div style="display: flex; gap: 6px; justify-content: flex-end;">
          <button class="btn btn-sm btn-primary" data-farmer-action="accept" data-order-id="${escapeHtml(order.orderId)}" data-crop="${escapeHtml(order.produceName)}">
            ✓ Accept
          </button>
          <button class="btn btn-sm btn-danger" data-farmer-action="reject" data-order-id="${escapeHtml(order.orderId)}" data-crop="${escapeHtml(order.produceName)}">
            ✕ Reject
          </button>
        </div>
      `;
    } else if (order.status === "Confirmed") {
      actionsHtml = `
        <button class="btn btn-sm btn-primary" data-farmer-action="dispatch" data-order-id="${escapeHtml(order.orderId)}" data-crop="${escapeHtml(order.produceName)}">
          🚚 Mark as Dispatched
        </button>
      `;
    } else if (order.status === "Dispatched") {
      actionsHtml = `
        <button class="btn btn-sm btn-primary" data-farmer-action="deliver" data-order-id="${escapeHtml(order.orderId)}" data-crop="${escapeHtml(order.produceName)}">
          ✅ Mark Delivered
        </button>
      `;
    } else if (order.status === "Delivered") {
      actionsHtml = `<span style="color: var(--primary); font-size: 0.85rem; font-weight: 700;">Delivered ✓</span>`;
    } else if (order.status === "Rejected") {
      actionsHtml = `
        <span style="color: var(--danger); font-size: 0.85rem; font-weight: 600;">Rejected</span>
        ${order.rejectionReason ? `<br/><small style="color: var(--text-muted); font-size: 0.75rem;">"${escapeHtml(order.rejectionReason)}"</small>` : ''}
      `;
    } else {
      actionsHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">Cancelled</span>`;
    }

    return `
      <tr>
        <td>
          <strong>#${escapeHtml(order.orderId)}</strong><br/>
          <small style="color: var(--text-muted);">${escapeHtml(order.orderDate)}</small>
        </td>
        <td>
          <strong>${escapeHtml(order.produceName)}</strong>
        </td>
        <td>
          ${order.quantity} ${escapeHtml(order.unit)}
        </td>
        <td>
          <strong style="color: var(--primary);">${formatCurrency(order.totalPrice)}</strong>
        </td>
        <td>
          <strong>${escapeHtml(order.buyerName)}</strong><br/>
          <small style="color: var(--text-muted);">${escapeHtml(order.deliveryAddress)}</small>
        </td>
        <td>
          ${getStatusBadge(order.status)}
        </td>
        <td style="text-align: right;">
          ${actionsHtml}
        </td>
      </tr>
    `;
  }).join("");
}

async function handleFarmerDelete(produceId, farmerId) {
  const item = currentFarmerProduce.find(p => p.id === produceId);
  const name = item ? item.name : "this item";
  if (!confirm(`Are you sure you want to remove "${name}" from your listings?`)) {
    return;
  }

  const resp = await window.agriMandiApi.produce.delete(produceId);
  if (resp.success) {
    showToast(`"${name}" removed successfully.`);
    await refreshFarmerDashboard(farmerId);
  }
}

function initEditModal(farmerId) {
  const modal = document.getElementById("editModal");
  const editForm = document.getElementById("editProduceForm");
  const closeBtn = document.getElementById("closeEditModal");
  const cancelBtn = document.getElementById("cancelEditModal");

  if (!modal || !editForm) return;

  const closeModal = () => modal.classList.remove("active");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("editProduceId").value;
    const saveBtn = document.getElementById("saveEditBtn");

    const updates = {
      name: document.getElementById("editCropName").value.trim(),
      category: document.getElementById("editCropCategory").value,
      quantity: parseFloat(document.getElementById("editCropQuantity").value),
      unit: document.getElementById("editCropUnit").value,
      price: parseFloat(document.getElementById("editCropPrice").value),
      location: document.getElementById("editCropLocation").value.trim()
    };

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
    }

    const resp = await window.agriMandiApi.produce.update(id, updates);

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
    }

    if (resp.success) {
      closeModal();
      showToast(`Updated "${updates.name}" successfully!`);
      await refreshFarmerDashboard(farmerId);
    }
  });
}

function openEditModal(id) {
  const modal = document.getElementById("editModal");
  if (!modal) return;

  const item = currentFarmerProduce.find(i => i.id === id);
  if (!item) return;

  document.getElementById("editProduceId").value = item.id;
  document.getElementById("editCropName").value = item.name;
  document.getElementById("editCropCategory").value = item.category;
  document.getElementById("editCropQuantity").value = item.quantity;
  document.getElementById("editCropUnit").value = item.unit;
  document.getElementById("editCropPrice").value = item.price;
  document.getElementById("editCropLocation").value = item.location;

  modal.classList.add("active");
}

// ==============================================================================
// 4. BUYER DASHBOARD LOGIC (Marketplace, Filters, Purchase Modal)
// ==============================================================================

let buyerProduceList = [];
let buyerPagination = { page: 1, limit: 12, total: 0 };
let activePurchaseProduce = null;

async function initBuyerDashboard() {
  const grid = document.getElementById("produceGrid");
  if (!grid) return;

  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const locationFilter = document.getElementById("locationFilter");
  const minPriceFilter = document.getElementById("minPriceFilter");
  const maxPriceFilter = document.getElementById("maxPriceFilter");
  const resetBtn = document.getElementById("resetFiltersBtn");

  // Load marketplace listings from API
  await loadMarketplaceListings(1);

  // Debounce search and filter updates
  let filterTimer = null;
  const triggerFilter = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      loadMarketplaceListings(1);
    }, 300);
  };

  if (searchInput) searchInput.addEventListener("input", triggerFilter);
  if (categoryFilter) categoryFilter.addEventListener("change", triggerFilter);
  if (locationFilter) locationFilter.addEventListener("change", triggerFilter);
  if (minPriceFilter) minPriceFilter.addEventListener("input", triggerFilter);
  if (maxPriceFilter) maxPriceFilter.addEventListener("input", triggerFilter);

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (categoryFilter) categoryFilter.value = "";
      if (locationFilter) locationFilter.value = "";
      if (minPriceFilter) minPriceFilter.value = "";
      if (maxPriceFilter) maxPriceFilter.value = "";
      loadMarketplaceListings(1);
    });
  }

  // Event Delegation for "Buy Now" and "Add to Cart" on cards
  grid.addEventListener("click", (e) => {
    const buyBtn = e.target.closest("[data-buy-id]");
    if (buyBtn) {
      const id = buyBtn.getAttribute("data-buy-id");
      openPurchaseModal(id);
      return;
    }

    const cartBtn = e.target.closest("[data-cart-id]");
    if (cartBtn) {
      const id = cartBtn.getAttribute("data-cart-id");
      const item = buyerProduceList.find(p => String(p.id) === String(id));
      if (item) {
        addToCart(item, 1);
      }
    }
  });

  // Purchase Modal Form bindings
  initPurchaseModal();
}

async function loadMarketplaceListings(page = 1) {
  const grid = document.getElementById("produceGrid");
  const resultsCount = document.getElementById("resultsCount");
  if (!grid) return;

  grid.innerHTML = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 48px 0; color: var(--text-muted);">
      <div style="font-size: 2rem; margin-bottom: 8px;">🌾</div>
      Loading fresh harvests directly from growers...
    </div>
  `;

  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const locationFilter = document.getElementById("locationFilter");
  const minPriceFilter = document.getElementById("minPriceFilter");
  const maxPriceFilter = document.getElementById("maxPriceFilter");

  const queryParams = {
    page: page,
    limit: buyerPagination.limit,
    search: searchInput ? searchInput.value.trim() : "",
    category: categoryFilter ? categoryFilter.value : "",
    location: locationFilter ? locationFilter.value.trim() : "",
    min_price: minPriceFilter && minPriceFilter.value ? minPriceFilter.value : "",
    max_price: maxPriceFilter && maxPriceFilter.value ? maxPriceFilter.value : ""
  };

  const resp = await window.agriMandiApi.produce.list(queryParams);

  if (!resp.success) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load listings</h3>
        <p>${escapeHtml(resp.error)}</p>
      </div>
    `;
    return;
  }

  buyerProduceList = resp.data || [];
  buyerPagination.page = resp.page || page;
  buyerPagination.total = resp.total || buyerProduceList.length;

  if (resultsCount) {
    resultsCount.textContent = `Showing ${buyerProduceList.length} of ${buyerPagination.total} listing${buyerPagination.total === 1 ? '' : 's'}`;
  }

  populateLocationOptions(buyerProduceList);
  renderBuyerCards(buyerProduceList);
  renderPaginationControls();
}

function populateLocationOptions(items) {
  const locationSelect = document.getElementById("locationFilter");
  if (!locationSelect || locationSelect.options.length > 1) return;

  const locations = new Set();
  items.forEach(item => {
    if (item.location) {
      const parts = item.location.split(",");
      const region = parts[parts.length - 1].trim();
      if (region) locations.add(region);
    }
  });

  locations.forEach(region => {
    const opt = document.createElement("option");
    opt.value = region;
    opt.textContent = region;
    locationSelect.appendChild(opt);
  });
}

function renderBuyerCards(items) {
  const grid = document.getElementById("produceGrid");
  if (!grid) return;

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🌾</div>
        <h3>No produce matches your search</h3>
        <p>Try searching for a different crop name, change the category filter, or reset your filters.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="produce-card">
      <div class="produce-card-img-wrapper">
        <img 
          src="${sanitizeImageUrl(item.image, item.category)}" 
          alt="${escapeHtml(item.name)}" 
          class="produce-card-img" 
          onerror="this.src='${CATEGORY_IMAGES.Vegetables}'" 
        />
        <span class="badge badge-green card-category-badge">${escapeHtml(item.category)}</span>
      </div>
      <div class="produce-card-body">
        <h3 class="produce-card-title">${escapeHtml(item.name)}</h3>
        <div class="produce-meta-row">
          <span>👨‍🌾 ${escapeHtml(item.farmerName || 'Verified Farmer')}</span>
          <span>•</span>
          <span>📍 ${escapeHtml(item.location)}</span>
        </div>
        <div class="produce-details-box">
          <div>
            <div class="price-tag">${formatCurrency(item.price)} <small>/ ${escapeHtml(item.unit)}</small></div>
          </div>
          <div class="stock-tag">
            Available: <strong>${item.quantity} ${escapeHtml(item.unit)}</strong>
          </div>
        </div>
        <div class="produce-card-actions">
          <button type="button" class="btn-add-cart" data-cart-id="${escapeHtml(item.id)}" ${item.quantity <= 0 ? 'disabled' : ''} title="Add to Cart">
            🛒 Add to Cart
          </button>
          <button type="button" class="btn btn-primary" data-buy-id="${escapeHtml(item.id)}" ${item.quantity <= 0 ? 'disabled' : ''} title="Instant Checkout">
            ${item.quantity <= 0 ? 'Out of Stock' : '⚡ Buy Now'}
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

function renderPaginationControls() {
  const container = document.getElementById("paginationControls");
  if (!container) return;

  const totalPages = Math.ceil(buyerPagination.total / buyerPagination.limit) || 1;
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button class="btn btn-outline btn-sm" id="prevPageBtn" ${buyerPagination.page <= 1 ? "disabled" : ""}>
      ← Previous
    </button>
    <span style="font-weight: 600; color: var(--text-muted); font-size: 0.9rem;">
      Page ${buyerPagination.page} of ${totalPages}
    </span>
    <button class="btn btn-outline btn-sm" id="nextPageBtn" ${buyerPagination.page >= totalPages ? "disabled" : ""}>
      Next →
    </button>
  `;

  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => loadMarketplaceListings(buyerPagination.page - 1));
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => loadMarketplaceListings(buyerPagination.page + 1));
  }
}

// Purchase Order Modal Implementation
function initPurchaseModal() {
  const modal = document.getElementById("purchaseModal");
  const form = document.getElementById("purchaseOrderForm");
  const closeBtn = document.getElementById("closePurchaseModal");
  const cancelBtn = document.getElementById("cancelPurchaseModal");
  const qtyInput = document.getElementById("orderQuantity");

  if (!modal || !form) return;

  const closeModal = () => modal.classList.remove("active");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Dynamic order total update on quantity input
  if (qtyInput) {
    qtyInput.addEventListener("input", () => {
      updateModalComputedTotal();
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activePurchaseProduce) return;

    const qty = parseFloat(document.getElementById("orderQuantity").value);
    const address = document.getElementById("orderDeliveryAddress").value.trim();
    const submitBtn = document.getElementById("confirmOrderSubmitBtn");
    const qtyErr = document.getElementById("quantityError");
    const addrErr = document.getElementById("addressError");

    let isValid = true;

    if (!qty || qty <= 0) {
      if (qtyErr) {
        qtyErr.textContent = "Quantity must be greater than zero.";
        qtyErr.style.display = "block";
      }
      isValid = false;
    } else if (qty > activePurchaseProduce.quantity) {
      if (qtyErr) {
        qtyErr.textContent = `Requested quantity exceeds available stock (${activePurchaseProduce.quantity} ${activePurchaseProduce.unit}).`;
        qtyErr.style.display = "block";
      }
      isValid = false;
    } else {
      if (qtyErr) qtyErr.style.display = "none";
    }

    if (!address || address.length < 5) {
      if (addrErr) {
        addrErr.textContent = "Please provide complete delivery street address and city.";
        addrErr.style.display = "block";
      }
      isValid = false;
    } else {
      if (addrErr) addrErr.style.display = "none";
    }

    if (!isValid) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Placing Order with Server...";
    }

    const payload = {
      produceId: activePurchaseProduce.id,
      quantity: qty,
      deliveryAddress: address
    };

    const resp = await window.agriMandiApi.orders.create(payload);

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "✓ Confirm Purchase";
    }

    if (resp.success && resp.data) {
      closeModal();
      showToast("Order placed successfully! Redirecting...");
      const orderId = resp.data.orderId || resp.data.id;
      setTimeout(() => {
        window.location.href = `order-success.html?orderId=${encodeURIComponent(orderId)}`;
      }, 700);
    }
  });
}

function openPurchaseModal(produceId) {
  const modal = document.getElementById("purchaseModal");
  if (!modal) return;

  const item = buyerProduceList.find(p => p.id === produceId);
  if (!item) return;

  activePurchaseProduce = item;

  document.getElementById("orderProduceId").value = item.id;
  document.getElementById("orderCropName").textContent = item.name;
  document.getElementById("orderFarmerName").textContent = item.farmerName || "Verified Grower";
  document.getElementById("orderAvailableStock").textContent = `${item.quantity} ${item.unit}`;
  document.getElementById("orderRateDisplay").textContent = `${formatCurrency(item.price)} / ${item.unit}`;
  document.getElementById("orderUnitLabel").textContent = item.unit;

  const qtyInput = document.getElementById("orderQuantity");
  qtyInput.value = "1";
  qtyInput.max = item.quantity;

  updateModalComputedTotal();
  modal.classList.add("active");
}

function updateModalComputedTotal() {
  if (!activePurchaseProduce) return;
  const qty = parseFloat(document.getElementById("orderQuantity").value) || 0;
  const total = qty * Number(activePurchaseProduce.price);
  const totalDisplay = document.getElementById("orderEstimatedTotal");
  if (totalDisplay) {
    totalDisplay.textContent = formatCurrency(total);
  }
}

// ==============================================================================
// 4.5. CART PAGE IMPLEMENTATION (cart.html)
// ==============================================================================

function renderCartPage() {
  const container = document.getElementById("cartContainer");
  if (!container) return;

  const cart = getCart();
  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-cart-state">
        <div class="empty-cart-icon">🛒</div>
        <h3>Your Produce Cart is Empty</h3>
        <p>You haven't added any harvest crops yet. Discover fresh fruits, vegetables, and grains direct from local growers!</p>
        <a href="buyer-dashboard.html" class="btn btn-primary">
          🌾 Explore Farm Marketplace
        </a>
      </div>
    `;
    return;
  }

  const grandTotal = cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const totalItemCount = cart.reduce((sum, item) => sum + Number(item.quantity), 0);

  container.innerHTML = `
    <div class="cart-layout">
      <!-- Left: Cart Items -->
      <div class="cart-items-card">
        <div class="cart-header-row">
          <span style="font-weight: 700; color: var(--text-main);">Selected Produce (${cart.length} item${cart.length > 1 ? 's' : ''})</span>
          <button type="button" class="btn btn-outline btn-sm" id="clearEntireCartBtn" style="color: var(--danger); border-color: #fecaca;">
            🗑️ Clear Cart
          </button>
        </div>
        <div class="cart-items-body" id="cartItemsList">
          ${cart.map(item => `
            <div class="cart-item-row" data-item-id="${escapeHtml(item.id)}">
              <img 
                src="${sanitizeImageUrl(item.image, item.category)}" 
                alt="${escapeHtml(item.name)}" 
                class="cart-item-thumb" 
                onerror="this.src='${CATEGORY_IMAGES.Vegetables}'" 
              />
              <div class="cart-item-details">
                <h4>${escapeHtml(item.name)}</h4>
                <div class="cart-item-farmer">
                  👨‍🌾 Seller: <strong>${escapeHtml(item.farmerName || 'Verified Grower')}</strong> • 📍 ${escapeHtml(item.location || 'India')}
                </div>
                <div class="cart-item-price">
                  ${formatCurrency(item.price)} <small style="color: var(--text-muted); font-weight: normal;">/ ${escapeHtml(item.unit || 'Kg')}</small>
                </div>
              </div>
              <div class="cart-item-actions">
                <div class="qty-control">
                  <button type="button" class="qty-btn" data-qty-action="dec" data-id="${escapeHtml(item.id)}" aria-label="Decrease quantity">−</button>
                  <span class="qty-val">${item.quantity}</span>
                  <button type="button" class="qty-btn" data-qty-action="inc" data-id="${escapeHtml(item.id)}" aria-label="Increase quantity" ${item.quantity >= (item.maxQuantity || 9999) ? 'disabled' : ''}>+</button>
                </div>
                <div class="cart-line-total">
                  ${formatCurrency(item.price * item.quantity)}
                </div>
                <button type="button" class="cart-item-remove-btn" data-remove-id="${escapeHtml(item.id)}">
                  ✕ Remove
                </button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Right: Order Summary & Checkout -->
      <div class="cart-summary-card">
        <h3 class="cart-summary-title">Order Summary</h3>
        <div class="summary-line">
          <span>Items in Cart:</span>
          <strong>${cart.length} unique (${totalItemCount} units)</strong>
        </div>
        <div class="summary-line">
          <span>Direct Farm Delivery:</span>
          <span style="color: var(--primary); font-weight: 700;">FREE</span>
        </div>
        <div class="summary-line total-line">
          <span>Grand Total:</span>
          <strong>${formatCurrency(grandTotal)}</strong>
        </div>

        <form id="cartCheckoutForm">
          <div class="form-group" style="margin-bottom: 20px;">
            <label for="cartDeliveryAddress" class="form-label">Delivery Street Address & City *</label>
            <textarea 
              id="cartDeliveryAddress" 
              class="form-control" 
              rows="3" 
              placeholder="e.g. 142 Green Garden Road, Near Shiv Temple, Pune, MH 411038" 
              required
            ></textarea>
            <div id="cartAddressError" class="error-message" style="display: none;">Please provide your delivery address (at least 5 characters).</div>
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="placeCartOrderBtn" style="padding: 14px; font-size: 1.05rem;">
            🛒 Place Order (${formatCurrency(grandTotal)})
          </button>
        </form>

        <p style="margin-top: 14px; text-align: center; font-size: 0.8rem; color: var(--text-light);">
          🔒 Guaranteed direct payout to farmer upon confirmed delivery.
        </p>
      </div>
    </div>
  `;
}

function initCartPage() {
  const container = document.getElementById("cartContainer");
  if (!container) return;

  renderCartPage();

  container.addEventListener("click", async (e) => {
    // Quantity change
    const qtyBtn = e.target.closest("[data-qty-action]");
    if (qtyBtn) {
      const action = qtyBtn.getAttribute("data-qty-action");
      const id = qtyBtn.getAttribute("data-id");
      const cart = getCart();
      const item = cart.find(i => String(i.id) === String(id));
      if (item) {
        if (action === "dec") {
          if (item.quantity <= 1) {
            removeFromCart(id);
          } else {
            updateCartQuantity(id, item.quantity - 1);
          }
        } else if (action === "inc") {
          updateCartQuantity(id, item.quantity + 1);
        }
      }
      return;
    }

    // Remove single item
    const removeBtn = e.target.closest("[data-remove-id]");
    if (removeBtn) {
      const id = removeBtn.getAttribute("data-remove-id");
      removeFromCart(id);
      return;
    }

    // Clear entire cart
    const clearBtn = e.target.closest("#clearEntireCartBtn");
    if (clearBtn) {
      if (confirm("Are you sure you want to remove all items from your cart?")) {
        clearCart();
        renderCartPage();
        showToast("Cart cleared.");
      }
      return;
    }
  });

  // Handle Cart Checkout Form submission
  container.addEventListener("submit", async (e) => {
    if (e.target && e.target.id === "cartCheckoutForm") {
      e.preventDefault();
      const cart = getCart();
      if (cart.length === 0) {
        showToast("Your cart is empty.", "error");
        return;
      }

      const addressInput = document.getElementById("cartDeliveryAddress");
      const addressError = document.getElementById("cartAddressError");
      const address = addressInput ? addressInput.value.trim() : "";

      if (!address || address.length < 5) {
        if (addressError) {
          addressError.textContent = "Please enter complete street address and city (min 5 chars).";
          addressError.style.display = "block";
        }
        if (addressInput) addressInput.classList.add("is-invalid");
        return;
      }
      if (addressError) addressError.style.display = "none";
      if (addressInput) addressInput.classList.remove("is-invalid");

      const submitBtn = document.getElementById("placeCartOrderBtn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Placing Orders with Farmers...";
      }

      const payload = {
        deliveryAddress: address,
        items: cart.map(i => ({
          produceId: i.id,
          quantity: i.quantity
        }))
      };

      const resp = await window.agriMandiApi.orders.checkout(payload);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = `🛒 Place Order (${formatCurrency(cart.reduce((s, i) => s + (i.price * i.quantity), 0))})`;
      }

      if (resp.success && resp.data) {
        clearCart();
        showToast("Order placed successfully! Redirecting...");
        const firstOrder = resp.data.orders && resp.data.orders[0];
        const targetId = firstOrder ? (firstOrder.orderId || firstOrder.id) : "";
        setTimeout(() => {
          window.location.href = `order-success.html?orderId=${encodeURIComponent(targetId)}`;
        }, 600);
      } else {
        showToast(resp.error || "Failed to place orders. Please try again.", "error");
      }
    }
  });
}

// ==============================================================================
// 4.6. MY ORDERS PAGE IMPLEMENTATION (orders.html)
// ==============================================================================

let buyerOrdersCache = [];
let currentOrdersTab = "all";

async function initOrdersPage() {
  const container = document.getElementById("ordersListContainer");
  if (!container) return;

  // Filter tabs setup
  const tabBtns = document.querySelectorAll(".order-tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentOrdersTab = btn.getAttribute("data-tab") || "all";
      renderBuyerOrdersList();
    });
  });

  // Card click delegation
  container.addEventListener("click", (e) => {
    const card = e.target.closest("[data-order-card-id]");
    if (card && !e.target.closest("a, button")) {
      const orderId = card.getAttribute("data-order-card-id");
      if (orderId) {
        window.location.href = `order-detail.html?orderId=${encodeURIComponent(orderId)}`;
      }
    }
  });

  // Load orders from API
  await loadBuyerOrders();
}

async function loadBuyerOrders() {
  const container = document.getElementById("ordersListContainer");
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 48px 0; color: var(--text-muted);">
      <div class="loading-spinner"></div>
      <p style="margin-top: 10px;">Loading your purchase orders...</p>
    </div>
  `;

  const resp = await window.agriMandiApi.orders.list();

  if (!resp.success) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load orders</h3>
        <p>${escapeHtml(resp.error)}</p>
        <button class="btn btn-outline btn-sm" onclick="loadBuyerOrders()">↺ Try Again</button>
      </div>
    `;
    return;
  }

  buyerOrdersCache = resp.data || [];

  // Sort newest first
  buyerOrdersCache.sort((a, b) => {
    const da = new Date(a.orderDate || a.createdAt || 0);
    const db = new Date(b.orderDate || b.createdAt || 0);
    return db - da;
  });

  // Update tab counts
  const countAll = buyerOrdersCache.length;
  const countActive = buyerOrdersCache.filter(o => ["Pending", "Confirmed", "Dispatched"].includes(o.status)).length;
  const countDelivered = buyerOrdersCache.filter(o => o.status === "Delivered").length;
  const countCancelled = buyerOrdersCache.filter(o => ["Cancelled", "Rejected"].includes(o.status)).length;

  const countAllEl = document.getElementById("countAll");
  const countActiveEl = document.getElementById("countActive");
  const countDeliveredEl = document.getElementById("countDelivered");
  const countCancelledEl = document.getElementById("countCancelled");

  if (countAllEl) countAllEl.textContent = countAll;
  if (countActiveEl) countActiveEl.textContent = countActive;
  if (countDeliveredEl) countDeliveredEl.textContent = countDelivered;
  if (countCancelledEl) countCancelledEl.textContent = countCancelled;

  renderBuyerOrdersList();
}

function renderBuyerOrdersList() {
  const container = document.getElementById("ordersListContainer");
  if (!container) return;

  let filtered = buyerOrdersCache;
  if (currentOrdersTab === "active") {
    filtered = buyerOrdersCache.filter(o => ["Pending", "Confirmed", "Dispatched"].includes(o.status));
  } else if (currentOrdersTab === "delivered") {
    filtered = buyerOrdersCache.filter(o => o.status === "Delivered");
  } else if (currentOrdersTab === "cancelled") {
    filtered = buyerOrdersCache.filter(o => ["Cancelled", "Rejected"].includes(o.status));
  }

  if (filtered.length === 0) {
    let emptyMsg = "You don't have any orders in this category yet.";
    if (buyerOrdersCache.length === 0) {
      emptyMsg = "You haven't placed any orders yet. Discover seasonal farm-fresh crops in the marketplace!";
    }
    container.innerHTML = `
      <div class="empty-state" style="padding: 50px 20px;">
        <div class="empty-icon">📋</div>
        <h3>No Orders Found</h3>
        <p>${emptyMsg}</p>
        <a href="buyer-dashboard.html" class="btn btn-primary btn-sm">
          🌾 Browse Marketplace
        </a>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => `
    <div class="cart-items-card" data-order-card-id="${escapeHtml(order.orderId)}" style="margin-bottom: 20px; cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease;">
      <div class="cart-header-row" style="flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <strong style="color: var(--text-main); font-size: 1.05rem;">
            Order #${escapeHtml(order.orderCode || (order.orderId ? order.orderId.substring(0, 8).toUpperCase() : 'AGRI'))}
          </strong>
          ${getStatusBadge(order.status)}
        </div>
        <div style="color: var(--text-muted); font-size: 0.85rem;">
          📅 Ordered: <strong>${formatDateTime(order.orderDate || order.createdAt)}</strong>
        </div>
      </div>
      <div style="padding: 20px; display: grid; grid-template-columns: 80px 1fr auto; gap: 20px; align-items: center;">
        <img 
          src="${sanitizeImageUrl(order.produceImage, 'Vegetables')}" 
          alt="${escapeHtml(order.produceName)}" 
          style="width: 80px; height: 80px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-light);"
          onerror="this.src='${CATEGORY_IMAGES.Vegetables}'"
        />
        <div>
          <h4 style="margin-bottom: 4px; font-size: 1.1rem; color: var(--text-main);">
            ${escapeHtml(order.produceName)}
          </h4>
          <div style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 4px;">
            👨‍🌾 Seller: <strong>${escapeHtml(order.farmerName || 'Verified Grower')}</strong> (📍 ${escapeHtml(order.farmerLocation || 'India')})
          </div>
          <div style="font-size: 0.88rem; color: var(--text-muted);">
            Quantity: <strong>${order.quantity} ${escapeHtml(order.unit || 'Kg')}</strong> • Delivery to: <em>${escapeHtml(order.deliveryAddress)}</em>
          </div>
          ${order.status === "Rejected" && order.rejectionReason ? `
            <div style="margin-top: 6px; font-size: 0.82rem; color: var(--danger);">
              Reason: "${escapeHtml(order.rejectionReason)}"
            </div>
          ` : ''}
        </div>
        <div style="text-align: right; min-width: 140px;">
          <div style="font-size: 1.3rem; font-weight: 800; color: var(--primary); margin-bottom: 12px;">
            ${formatCurrency(order.totalPrice)}
          </div>
          <a href="order-detail.html?orderId=${encodeURIComponent(order.orderId)}" class="btn btn-outline btn-sm">
            Track Order & Details →
          </a>
        </div>
      </div>
    </div>
  `).join("");
}

// ==============================================================================
// 4.7. ORDER DETAIL & STATUS TRACKER IMPLEMENTATION (order-detail.html)
// ==============================================================================

async function initOrderDetailPage() {
  const container = document.getElementById("orderDetailContainer");
  if (!container) return;

  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get("orderId");

  if (!orderId) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>No Order Specified</h3>
        <p>Please select an order from your orders list to view its real-time tracking.</p>
        <a href="orders.html" class="btn btn-primary btn-sm">View My Orders</a>
      </div>
    `;
    return;
  }

  await loadOrderDetail(orderId);
}

async function loadOrderDetail(orderId) {
  const container = document.getElementById("orderDetailContainer");
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 48px 0; color: var(--text-muted);">
      <div class="loading-spinner"></div>
      <p style="margin-top: 10px;">Retrieving order status and timeline...</p>
    </div>
  `;

  const resp = await window.agriMandiApi.orders.get(orderId);

  if (!resp.success || !resp.data) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load order</h3>
        <p>${escapeHtml(resp.error || "Order not found.")}</p>
        <a href="orders.html" class="btn btn-outline btn-sm">← Back to My Orders</a>
      </div>
    `;
    return;
  }

  const order = resp.data;
  const status = order.status || "Pending";

  let step1Class = "completed";
  let step2Class = "";
  let step3Class = "";
  let step4Class = "";
  let fillWidth = 0;
  let nextStepText = "";

  const timePlaced = formatDateTime(order.orderDate || order.createdAt);
  let timeConfirmed = order.confirmedAt ? formatDateTime(order.confirmedAt) : "";
  let timeDispatched = order.dispatchedAt ? formatDateTime(order.dispatchedAt) : "";
  let timeDelivered = order.deliveredAt ? formatDateTime(order.deliveredAt) : "";

  if (status === "Pending") {
    step2Class = "active";
    fillWidth = 15;
    nextStepText = "Waiting for the farmer to confirm your order and inspect fresh crop stock.";
  } else if (status === "Confirmed") {
    step2Class = "completed";
    step3Class = "active";
    fillWidth = 50;
    nextStepText = "Farmer has accepted! Produce is being harvested, weighed, and packaged for dispatch.";
  } else if (status === "Dispatched") {
    step2Class = "completed";
    step3Class = "completed";
    step4Class = "active";
    fillWidth = 85;
    nextStepText = "Produce has been dispatched by the farmer and is en route to your delivery address.";
  } else if (status === "Delivered") {
    step2Class = "completed";
    step3Class = "completed";
    step4Class = "completed";
    fillWidth = 100;
    nextStepText = "Order delivered! Thank you for supporting local growers directly.";
  } else if (status === "Cancelled") {
    fillWidth = 0;
    nextStepText = `Order cancelled on ${formatDateTime(order.cancelledAt || order.updatedAt)}. The reserved stock was returned to the farmer.`;
  } else if (status === "Rejected") {
    fillWidth = 0;
    nextStepText = `Order was rejected by the farmer on ${formatDateTime(order.rejectedAt || order.updatedAt)}. Reason: "${escapeHtml(order.rejectionReason || 'Stock unavailable')}".`;
  }

  const isTerminalCancelledOrRejected = ["Cancelled", "Rejected"].includes(status);

  container.innerHTML = `
    <!-- Order Header Info Card -->
    <div class="cart-items-card" style="margin-bottom: 24px;">
      <div class="cart-header-row" style="flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-main);">
            Order #${escapeHtml(order.orderCode || order.orderId.substring(0, 8).toUpperCase())}
          </div>
          <small style="color: var(--text-muted);">Placed on: ${timePlaced}</small>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          ${getStatusBadge(status)}
        </div>
      </div>
    </div>

    <!-- Step-by-Step Order Status Tracker Card -->
    <div class="order-tracker-card">
      <h3 style="margin-bottom: 24px; font-size: 1.15rem; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
        <span>📍</span> Live Delivery Tracker
      </h3>

      ${!isTerminalCancelledOrRejected ? `
        <div class="tracker-progress-bar">
          <div class="tracker-line-track">
            <div class="tracker-line-fill" style="width: ${fillWidth}%;"></div>
          </div>

          <!-- Step 1: Placed -->
          <div class="tracker-node ${step1Class}">
            <div class="tracker-node-circle">${step1Class === "completed" ? "✓" : "1"}</div>
            <div class="tracker-node-label">Placed</div>
            <div class="tracker-node-time">${timePlaced}</div>
          </div>

          <!-- Step 2: Confirmed -->
          <div class="tracker-node ${step2Class}">
            <div class="tracker-node-circle">${step2Class === "completed" ? "✓" : "2"}</div>
            <div class="tracker-node-label">Confirmed</div>
            <div class="tracker-node-time">${timeConfirmed || (status === 'Pending' ? 'In review' : '')}</div>
          </div>

          <!-- Step 3: Dispatched -->
          <div class="tracker-node ${step3Class}">
            <div class="tracker-node-circle">${step3Class === "completed" ? "✓" : "3"}</div>
            <div class="tracker-node-label">Dispatched</div>
            <div class="tracker-node-time">${timeDispatched || (status === 'Confirmed' ? 'Preparing' : '')}</div>
          </div>

          <!-- Step 4: Delivered -->
          <div class="tracker-node ${step4Class}">
            <div class="tracker-node-circle">${step4Class === "completed" ? "✓" : "4"}</div>
            <div class="tracker-node-label">Delivered</div>
            <div class="tracker-node-time">${timeDelivered || (status === 'Dispatched' ? 'On the way' : '')}</div>
          </div>
        </div>
      ` : ''}

      <!-- Next Step Explanation Banner -->
      <div class="tracker-next-step-box" style="${status === 'Cancelled' ? 'background: #fee2e2; border-left-color: var(--danger); color: #991b1b;' : status === 'Rejected' ? 'background: #ffedd5; border-left-color: #c2410c; color: #9a3412;' : ''}">
        <span style="font-size: 1.25rem;">${status === 'Cancelled' ? '❌' : status === 'Rejected' ? '⚠️' : '💡'}</span>
        <div>
          <strong>${status === 'Cancelled' ? 'Order Cancelled' : status === 'Rejected' ? 'Order Rejected by Farmer' : 'Current Status:'}</strong>
          <div>${nextStepText}</div>
        </div>
      </div>

      <!-- Buyer Interactive Actions (Cancel while Pending / Mark Delivered once Dispatched) -->
      ${status === "Pending" ? `
        <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; align-items: center; gap: 14px;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">Changed your mind? You can cancel before farmer confirms.</span>
          <button type="button" class="btn btn-danger btn-sm" id="btnCancelPendingOrder">
            ✕ Cancel Order
          </button>
        </div>
      ` : ''}

      ${status === "Dispatched" ? `
        <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; align-items: center; gap: 14px;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">Have you received the produce? Confirm receipt here:</span>
          <button type="button" class="btn btn-primary btn-sm" id="btnReceivedDispatchedOrder">
            ✅ I Received This Order
          </button>
        </div>
      ` : ''}
    </div>

    <!-- Order Items & Full Details Breakdown -->
    <div class="cart-items-card">
      <div class="cart-header-row">
        <h4 style="margin: 0; font-size: 1rem; color: var(--text-main);">Purchased Produce Details</h4>
        <span style="font-weight: 700; color: var(--primary);">Total: ${formatCurrency(order.totalPrice)}</span>
      </div>
      <div style="padding: 24px;">
        <div style="display: grid; grid-template-columns: 90px 1fr auto; gap: 20px; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--border-light);">
          <img 
            src="${sanitizeImageUrl(order.produceImage, 'Vegetables')}" 
            alt="${escapeHtml(order.produceName)}" 
            style="width: 90px; height: 90px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-light);"
            onerror="this.src='${CATEGORY_IMAGES.Vegetables}'"
          />
          <div>
            <h3 style="font-size: 1.15rem; margin-bottom: 6px; color: var(--text-main);">${escapeHtml(order.produceName)}</h3>
            <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 4px;">
              👨‍🌾 Seller: <strong>${escapeHtml(order.farmerName || 'Verified Grower')}</strong>
              (📍 ${escapeHtml(order.farmerLocation || 'India')})
            </div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">
              Quantity: <strong>${order.quantity} ${escapeHtml(order.unit || 'Kg')}</strong> @ ${formatCurrency(order.unitPrice)} / ${escapeHtml(order.unit || 'Kg')}
            </div>
          </div>
          <div style="text-align: right; font-size: 1.35rem; font-weight: 800; color: var(--primary);">
            ${formatCurrency(order.totalPrice)}
          </div>
        </div>

        <div style="margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
          <div style="padding: 14px; background: var(--surface-alt); border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; font-weight: 700; text-transform: uppercase;">Delivery Address</div>
            <div style="color: var(--text-main); font-size: 0.95rem; font-weight: 600;">
              📍 ${escapeHtml(order.deliveryAddress)}
            </div>
          </div>

          <div style="padding: 14px; background: var(--surface-alt); border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; font-weight: 700; text-transform: uppercase;">Payment & Payout</div>
            <div style="color: var(--text-main); font-size: 0.95rem; font-weight: 600;">
              💳 Direct Settlement (${formatCurrency(order.totalPrice)})
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach button listeners
  const cancelBtn = document.getElementById("btnCancelPendingOrder");
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      showConfirmDialog({
        title: "✕ Cancel Order",
        message: `Are you sure you want to cancel order #${order.orderCode || order.orderId}? The produce will be returned to the farmer's inventory.`,
        confirmText: "Yes, Cancel Order",
        isDanger: true,
        onConfirm: async () => {
          cancelBtn.disabled = true;
          const uResp = await window.agriMandiApi.orders.updateStatus(order.orderId, "Cancelled");
          if (uResp.success) {
            showToast("Order cancelled successfully.");
            await loadOrderDetail(orderId);
          } else {
            cancelBtn.disabled = false;
          }
        }
      });
    };
  }

  const receivedBtn = document.getElementById("btnReceivedDispatchedOrder");
  if (receivedBtn) {
    receivedBtn.onclick = () => {
      showConfirmDialog({
        title: "✅ Confirm Delivery",
        message: `Did you receive your harvest of "${order.produceName}" in good condition? This will mark the order as delivered.`,
        confirmText: "Yes, I Received It",
        isDanger: false,
        onConfirm: async () => {
          receivedBtn.disabled = true;
          const uResp = await window.agriMandiApi.orders.updateStatus(order.orderId, "Delivered");
          if (uResp.success) {
            showToast("Order marked as delivered! Thank you for buying local.");
            await loadOrderDetail(orderId);
          } else {
            receivedBtn.disabled = false;
          }
        }
      });
    };
  }
}

// ==============================================================================
// 4.8. NOTIFICATION SYSTEM IMPLEMENTATION (Header Bell & Alerts)
// ==============================================================================

let notificationsListCache = [];
let notifIntervalTimer = null;

async function initNotificationSystem() {
  const bellBtn = document.getElementById("navBellBtn");
  const dropdown = document.getElementById("notifDropdown");
  const markAllBtn = document.getElementById("notifMarkAllReadBtn");
  const notifListEl = document.getElementById("notifList");
  const mobileAlertsBtn = document.getElementById("mobileNavAlertsBtn");

  if (!bellBtn || !dropdown) return;

  // Toggle dropdown on click
  bellBtn.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  };

  if (mobileAlertsBtn) {
    mobileAlertsBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdown.classList.toggle("show");
    };
  }

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== bellBtn && e.target !== mobileAlertsBtn) {
      dropdown.classList.remove("show");
    }
  });

  // Mark all read button
  if (markAllBtn) {
    markAllBtn.onclick = async (e) => {
      e.stopPropagation();
      await window.agriMandiApi.notifications.markAllRead();
      notificationsListCache.forEach(n => n.isRead = true);
      renderNotificationsList();
      updateNotificationBadges();
      showToast("All notifications marked as read.");
    };
  }

  // Click on individual notification item
  if (notifListEl) {
    notifListEl.onclick = async (e) => {
      const item = e.target.closest(".notif-item");
      if (!item) return;

      const notifId = item.getAttribute("data-notif-id");
      const orderId = item.getAttribute("data-order-id");

      if (notifId) {
        await window.agriMandiApi.notifications.markRead(notifId);
        const cached = notificationsListCache.find(n => String(n.id) === String(notifId));
        if (cached) cached.isRead = true;
        renderNotificationsList();
        updateNotificationBadges();
      }

      dropdown.classList.remove("show");

      if (orderId) {
        const user = window.agriMandiSupabase ? await window.agriMandiSupabase.getCurrentUser() : null;
        if (user && user.role === "farmer") {
          if (window.location.pathname.includes("farmer-dashboard")) {
            const ordersTabBtn = document.getElementById("tabOrdersBtn");
            if (ordersTabBtn) ordersTabBtn.click();
          } else {
            window.location.href = "farmer-dashboard.html";
          }
        } else {
          window.location.href = `order-detail.html?orderId=${encodeURIComponent(orderId)}`;
        }
      }
    };
  }

  // Initial load
  await refreshNotifications();

  // Auto-refresh notifications every 60 seconds (1 minute)
  if (!notifIntervalTimer) {
    notifIntervalTimer = setInterval(refreshNotifications, 60000);
  }
}

async function refreshNotifications() {
  if (!window.agriMandiApi || !window.agriMandiApi.notifications) return;

  const resp = await window.agriMandiApi.notifications.list();
  if (resp.success && Array.isArray(resp.data)) {
    notificationsListCache = resp.data;
    renderNotificationsList();
    updateNotificationBadges();
  }
}

function updateNotificationBadges() {
  const unreadCount = notificationsListCache.filter(n => !n.isRead).length;
  const badges = document.querySelectorAll("#navBellBadge, #mobileNavAlertsBadge");
  badges.forEach(b => {
    b.textContent = unreadCount;
    b.style.display = unreadCount > 0 ? "inline-flex" : "none";
  });
}

function renderNotificationsList() {
  const notifListEl = document.getElementById("notifList");
  if (!notifListEl) return;

  if (notificationsListCache.length === 0) {
    notifListEl.innerHTML = `
      <li style="padding: 28px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
        No notifications yet.
      </li>
    `;
    return;
  }

  notifListEl.innerHTML = notificationsListCache.map(n => {
    let icon = "🔔";
    if (n.type === "order_received") icon = "🛒";
    else if (n.type === "order_accepted") icon = "✅";
    else if (n.type === "order_dispatched") icon = "🚚";
    else if (n.type === "order_delivered") icon = "🎉";
    else if (n.type === "order_rejected") icon = "⚠️";
    else if (n.type === "order_cancelled") icon = "✕";

    return `
      <li class="notif-item ${!n.isRead ? 'unread' : ''}" data-notif-id="${escapeHtml(n.id)}" data-order-id="${escapeHtml(n.orderId || '')}">
        <div class="notif-icon">${icon}</div>
        <div class="notif-content">
          <div class="notif-title">${escapeHtml(n.title)}</div>
          <div class="notif-msg">${escapeHtml(n.message)}</div>
          <div class="notif-time">${formatDateTime(n.createdAt)}</div>
        </div>
        ${!n.isRead ? '<div class="notif-dot"></div>' : ''}
      </li>
    `;
  }).join("");
}

// ==============================================================================
// 5. ORDER SUCCESS LOGIC (order-success.html)
// ==============================================================================

async function initOrderSuccess() {
  const orderBox = document.getElementById("orderSummaryDetails");
  if (!orderBox) return;

  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get("orderId");

  if (!orderId) {
    orderBox.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted);">
        <p>No order ID specified.</p>
        <a href="buyer-dashboard.html" class="btn btn-primary btn-sm">Return to Marketplace</a>
      </div>
    `;
    return;
  }

  orderBox.innerHTML = `
    <div style="text-align: center; padding: 24px; color: var(--text-muted);">
      <div class="loading-spinner"></div>
      <p style="margin-top: 10px;">Loading verified order details from server...</p>
    </div>
  `;

  const resp = await window.agriMandiApi.orders.get(orderId);

  if (!resp.success || !resp.data) {
    orderBox.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted);">
        <p>Could not retrieve order details: ${escapeHtml(resp.error)}</p>
        <a href="buyer-dashboard.html" class="btn btn-outline btn-sm">Browse Marketplace</a>
      </div>
    `;
    return;
  }

  const order = resp.data;

  // Prominent Order Code Display & Track Order Button
  const codeBadge = document.getElementById("successOrderCodeBadge");
  if (codeBadge) {
    codeBadge.textContent = `Order #${escapeHtml(order.orderCode || order.orderId.substring(0, 8).toUpperCase())}`;
  }
  const trackBtn = document.getElementById("trackOrderActionBtn");
  if (trackBtn) {
    trackBtn.href = `order-detail.html?orderId=${encodeURIComponent(order.orderId)}`;
  }

  orderBox.innerHTML = `
    <div class="order-summary-header">
      <div>
        <div class="order-id">Order ID: #${escapeHtml(order.orderCode || order.orderId.substring(0, 8).toUpperCase())}</div>
        <small style="color: var(--text-muted);">Date: ${formatDateTime(order.orderDate || order.createdAt)}</small>
      </div>
      ${getStatusBadge(order.status || 'Pending')}
    </div>

    <div class="summary-row">
      <span>Item:</span>
      <strong style="color: var(--text-main);">${escapeHtml(order.produceName)}</strong>
    </div>

    <div class="summary-row">
      <span>Quantity:</span>
      <span>${order.quantity} ${escapeHtml(order.unit || 'Kg')}</span>
    </div>

    <div class="summary-row">
      <span>Rate:</span>
      <span>${formatCurrency(order.unitPrice)} / ${escapeHtml(order.unit || 'Kg')}</span>
    </div>

    <div class="summary-row">
      <span>Farmer / Source:</span>
      <span>${escapeHtml(order.farmerName || 'Verified Grower')} (📍 ${escapeHtml(order.farmerLocation || 'India')})</span>
    </div>

    <div class="summary-row">
      <span>Delivery To:</span>
      <span>${escapeHtml(order.deliveryAddress)}</span>
    </div>

    <div class="summary-row">
      <span>Est. Delivery:</span>
      <span>${escapeHtml(order.estimatedDelivery || '3-5 Business Days')}</span>
    </div>

    <div class="summary-row total-row">
      <span>Total Paid:</span>
      <span>${formatCurrency(order.totalPrice)}</span>
    </div>
  `;
}

// ==============================================================================
// 6. GLOBAL NAVIGATION & IDENTITY STATE
// ==============================================================================

async function updateNavigationState() {
  const path = window.location.pathname;
  const links = document.querySelectorAll(".nav-link");
  links.forEach(link => {
    const href = link.getAttribute("href");
    if (href && path.includes(href) && href !== "#") {
      link.classList.add("active");
    }
  });

  // Highlight active mobile bottom nav link
  const mobileLinks = document.querySelectorAll(".mobile-nav-link");
  mobileLinks.forEach(link => {
    const href = link.getAttribute("href");
    if (href && path.includes(href) && href !== "#") {
      link.classList.add("active");
    } else if (href && !path.includes(href) && href !== "#") {
      link.classList.remove("active");
    }
  });

  // Always update cart count badge across pages
  updateCartBadges();

  if (!window.agriMandiSupabase) return;

  const user = await window.agriMandiSupabase.getCurrentUser();
  const userBadge = document.getElementById("navUserBadge");
  const loginBtn = document.getElementById("navLoginBtn");
  const registerBtn = document.getElementById("navRegisterBtn");
  const notifContainer = document.getElementById("navNotifContainer");
  const cartBtn = document.getElementById("navCartBtn");
  const navOrdersLink = document.getElementById("navOrdersLink");
  const mobileAccountBtn = document.getElementById("mobileNavAccountBtn");

  if (cartBtn) {
    const cart = getCart();
    if (cart.length > 0 || !user || user.role === "buyer" || path.includes("buyer") || path.includes("cart") || path.includes("order")) {
      cartBtn.style.display = "inline-flex";
    }
  }

  if (userBadge && user) {
    const roleLabel = user.role === "farmer" ? "🚜 FARMER" : "🛒 BUYER";
    userBadge.textContent = `${roleLabel} | ${user.name} • Sign Out`;
    userBadge.style.display = "inline-flex";
    userBadge.style.cursor = "pointer";
    userBadge.title = "Click to sign out";
    userBadge.onclick = async () => {
      if (confirm(`Do you want to sign out from ${user.name}?`)) {
        await window.agriMandiSupabase.signOut();
        showToast("Signed out successfully.");
        setTimeout(() => {
          window.location.href = "login.html";
        }, 500);
      }
    };
    if (loginBtn) loginBtn.style.display = "none";
    if (registerBtn) registerBtn.style.display = "none";
    if (notifContainer) notifContainer.style.display = "block";
    if (navOrdersLink && user.role === "buyer") navOrdersLink.style.display = "";

    if (mobileAccountBtn) {
      mobileAccountBtn.onclick = async (e) => {
        e.preventDefault();
        if (confirm(`Signed in as ${user.name} (${user.role}). Sign out?`)) {
          await window.agriMandiSupabase.signOut();
          showToast("Signed out.");
          window.location.href = "login.html";
        }
      };
    }
  } else {
    if (userBadge) userBadge.style.display = "none";
    if (loginBtn) loginBtn.style.display = "";
    if (registerBtn) registerBtn.style.display = "";
  }
}

// Global Initialization on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  await enforceRoleGuards();
  await updateNavigationState();
  initAuthForms();
  initFarmerDashboard();
  initBuyerDashboard();
  initCartPage();
  initOrdersPage();
  initOrderDetailPage();
  initOrderSuccess();
  await initNotificationSystem();
});
