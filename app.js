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
  const isBuyerPage = path.includes("buyer-dashboard.html");
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

  // Protected buyer marketplace
  if (isBuyerPage) {
    if (!currentUser) {
      window.location.replace("login.html?role=buyer");
      return;
    }
    if (currentUser.role === "farmer") {
      // Guide farmers to portal if they navigate to marketplace
      // Farmers can view marketplace for price checks, but portal is primary
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
      const actionBtn = e.target.closest("[data-order-action]");
      if (!actionBtn) return;

      const orderId = actionBtn.getAttribute("data-order-id");
      const nextStatus = actionBtn.getAttribute("data-next-status");
      if (!orderId || !nextStatus) return;

      if (!confirm(`Update order #${orderId} status to "${nextStatus}"?`)) {
        return;
      }

      actionBtn.disabled = true;
      const resp = await window.agriMandiApi.orders.updateStatus(orderId, nextStatus);
      if (resp.success) {
        showToast(`Order #${orderId} updated to ${nextStatus}!`);
        await refreshFarmerDashboard(currentUser.id);
      } else {
        actionBtn.disabled = false;
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

  // Update Stats Cards
  const countEl = document.getElementById("statTotalListings");
  const qtyEl = document.getElementById("statTotalQuantity");
  const ordersCountEl = document.getElementById("statTotalOrders");
  const revenueEl = document.getElementById("statTotalRevenue");
  const ordersBadge = document.getElementById("ordersCountBadge");

  if (countEl) countEl.textContent = currentFarmerProduce.length;
  if (qtyEl) {
    const totalVolume = currentFarmerProduce.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
    qtyEl.textContent = `${totalVolume.toLocaleString()} units`;
  }
  if (ordersCountEl) ordersCountEl.textContent = currentFarmerOrders.length;
  if (ordersBadge) ordersBadge.textContent = currentFarmerOrders.length;

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
    let statusBadgeClass = "badge-earth";
    if (order.status === "Delivered") statusBadgeClass = "badge-green";
    else if (order.status === "Cancelled") statusBadgeClass = "badge-danger";

    let actionsHtml = "";
    if (order.status === "Pending") {
      actionsHtml = `
        <button class="btn btn-sm btn-primary" data-order-action="true" data-order-id="${escapeHtml(order.orderId)}" data-next-status="Confirmed">
          Confirm
        </button>
        <button class="btn btn-sm btn-danger" data-order-action="true" data-order-id="${escapeHtml(order.orderId)}" data-next-status="Cancelled" style="margin-left: 4px;">
          Cancel
        </button>
      `;
    } else if (order.status === "Confirmed") {
      actionsHtml = `
        <button class="btn btn-sm btn-primary" data-order-action="true" data-order-id="${escapeHtml(order.orderId)}" data-next-status="Dispatched">
          Dispatch 🚚
        </button>
        <button class="btn btn-sm btn-danger" data-order-action="true" data-order-id="${escapeHtml(order.orderId)}" data-next-status="Cancelled" style="margin-left: 4px;">
          Cancel
        </button>
      `;
    } else if (order.status === "Dispatched") {
      actionsHtml = `
        <button class="btn btn-sm btn-primary" data-order-action="true" data-order-id="${escapeHtml(order.orderId)}" data-next-status="Delivered">
          Mark Delivered ✅
        </button>
      `;
    } else {
      actionsHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">Completed</span>`;
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
          <span class="badge ${statusBadgeClass}">${escapeHtml(order.status)}</span>
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

  // Event Delegation for "Buy Now" on cards
  grid.addEventListener("click", (e) => {
    const buyBtn = e.target.closest("[data-buy-id]");
    if (buyBtn) {
      const id = buyBtn.getAttribute("data-buy-id");
      openPurchaseModal(id);
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
          <button class="btn btn-primary btn-block" data-buy-id="${escapeHtml(item.id)}" ${item.quantity <= 0 ? 'disabled' : ''}>
            ${item.quantity <= 0 ? 'Out of Stock' : '🛒 Buy Now'}
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
      Loading verified order details from server...
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

  orderBox.innerHTML = `
    <div class="order-summary-header">
      <div>
        <div class="order-id">Order ID: #${escapeHtml(order.orderId)}</div>
        <small style="color: var(--text-muted);">Date: ${escapeHtml(order.orderDate)}</small>
      </div>
      <span class="badge badge-green">${escapeHtml(order.status || 'Confirmed')}</span>
    </div>

    <div class="summary-row">
      <span>Item:</span>
      <strong style="color: var(--text-main);">${escapeHtml(order.produceName)}</strong>
    </div>

    <div class="summary-row">
      <span>Quantity:</span>
      <span>${order.quantity} ${escapeHtml(order.unit)}</span>
    </div>

    <div class="summary-row">
      <span>Rate:</span>
      <span>${formatCurrency(order.unitPrice)} / ${escapeHtml(order.unit)}</span>
    </div>

    <div class="summary-row">
      <span>Farmer / Source:</span>
      <span>${escapeHtml(order.farmerName)} (📍 ${escapeHtml(order.farmerLocation || 'India')})</span>
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

  if (!window.agriMandiSupabase) return;

  const user = await window.agriMandiSupabase.getCurrentUser();
  const userBadge = document.getElementById("navUserBadge");
  const loginBtn = document.getElementById("navLoginBtn");
  const registerBtn = document.getElementById("navRegisterBtn");

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
  initOrderSuccess();
});
