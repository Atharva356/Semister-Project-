/**
 * ==============================================================================
 * AgriMandi - Main Application Logic (app.js)
 * Direct Farmer-to-Buyer Marketplace
 * 
 * NOTE FOR BACKEND DEVELOPERS (Flask / REST API integration):
 * All state management currently uses an in-memory JS array persisted in localStorage.
 * Look for "BACKEND INTEGRATION HOOK" comments across this file to plug in
 * your Flask endpoints (e.g. /api/produce, /api/auth/login, /api/orders).
 * ==============================================================================
 */

// --- Default Seed Mock Data ---
const DEFAULT_PRODUCE = [
  {
    id: "prod-1",
    name: "Sharbati Wheat",
    category: "Grains",
    quantity: 50,
    unit: "Quintal",
    price: 3200,
    location: "Sehore, Madhya Pradesh",
    farmerName: "Rameshwar Patel",
    image: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80",
    dateAdded: "2026-09-08"
  },
  {
    id: "prod-2",
    name: "Organic Red Hybrid Tomatoes",
    category: "Vegetables",
    quantity: 250,
    unit: "Kg",
    price: 28,
    location: "Nashik, Maharashtra",
    farmerName: "Sanjay Deshmukh",
    image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80",
    dateAdded: "2026-09-09"
  },
  {
    id: "prod-3",
    name: "Royal Delicious Shimla Apples",
    category: "Fruits",
    quantity: 120,
    unit: "Crates",
    price: 1450,
    location: "Shimla, Himachal Pradesh",
    farmerName: "Baldev Chauhan",
    image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80",
    dateAdded: "2026-09-07"
  },
  {
    id: "prod-4",
    name: "Kolar Fresh Red Onions",
    category: "Vegetables",
    quantity: 400,
    unit: "Kg",
    price: 34,
    location: "Kolar, Karnataka",
    farmerName: "Narayana Gowda",
    image: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80",
    dateAdded: "2026-09-09"
  },
  {
    id: "prod-5",
    name: "Traditional Basmati Rice (Pusa 1121)",
    category: "Grains",
    quantity: 35,
    unit: "Quintal",
    price: 4600,
    location: "Karnal, Haryana",
    farmerName: "Gurpreet Singh",
    image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80",
    dateAdded: "2026-09-06"
  }
];

// Fallback images by category when farmer doesn't upload one
const CATEGORY_IMAGES = {
  Vegetables: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",
  Fruits: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=80",
  Grains: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80",
  Pulses: "https://images.unsplash.com/photo-1585672840545-21d96677c7f1?auto=format&fit=crop&w=600&q=80",
  Spices: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80"
};

// ==============================================================================
// 1. DATA ACCESS LAYER (Mock Storage with LocalStorage Persistence)
// ==============================================================================

/**
 * BACKEND INTEGRATION HOOK:
 * When connecting Flask backend, replace this with:
 * return await fetch('/api/produce').then(res => res.json());
 */
function getProduceList() {
  const stored = localStorage.getItem("agrimandi_produce");
  if (!stored) {
    localStorage.setItem("agrimandi_produce", JSON.stringify(DEFAULT_PRODUCE));
    return [...DEFAULT_PRODUCE];
  }
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Error reading localStorage produce data:", e);
    return [...DEFAULT_PRODUCE];
  }
}

/**
 * Saves current produce list to localStorage
 */
function saveProduceList(items) {
  localStorage.setItem("agrimandi_produce", JSON.stringify(items));
}

// Current User Session Helper
function getCurrentUser() {
  const user = localStorage.getItem("agrimandi_user");
  return user ? JSON.parse(user) : null;
}

function setCurrentUser(user) {
  localStorage.setItem("agrimandi_user", JSON.stringify(user));
}

// ==============================================================================
// 2. COMMON UTILITIES & TOAST NOTIFICATIONS
// ==============================================================================

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
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);
}

// ==============================================================================
// 3. AUTHENTICATION & VALIDATION (Login / Register)
// ==============================================================================

function initAuthForms() {
  // Login Form Handler
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();
      const role = document.getElementById("role").value;
      const submitBtn = document.getElementById("loginSubmitBtn");

      let isValid = true;

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        showInputError("email", "Please enter a valid email address");
        isValid = false;
      } else {
        clearInputError("email");
      }

      // Password validation
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

      // Verify that Supabase authentication module is loaded
      if (!window.agriMandiSupabase || !window.agriMandiSupabase.isConfigured()) {
        showToast("Supabase is not configured yet. Please check your credentials.", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign In to AgriMandi";
        }
        return;
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

      if (!result.user) {
        showToast("Invalid credentials. Please check your email and password.", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign In to AgriMandi";
        }
        return;
      }

      const meta = result.user.user_metadata || {};
      const user = {
        id: result.user.id,
        name: meta.name || meta.full_name || email.split("@")[0].replace(".", " "),
        email: result.user.email || email,
        role: meta.role || role,
        location: meta.location || "India"
      };

      setCurrentUser(user);
      showToast(`Welcome back, ${user.name}! Redirecting...`);

      // Role-based redirection
      setTimeout(() => {
        if (user.role === "farmer") {
          window.location.href = "farmer-dashboard.html";
        } else {
          window.location.href = "buyer-dashboard.html";
        }
      }, 900);
    });
  }

  // Register Form Handler
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

      // Verify that Supabase authentication module is loaded
      if (!window.agriMandiSupabase || !window.agriMandiSupabase.isConfigured()) {
        showToast("Supabase is not configured yet. Please check your credentials.", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create My Account";
        }
        return;
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

      if (!result.user) {
        showToast("Registration failed. Please check your details.", "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create My Account";
        }
        return;
      }

      const user = {
        id: result.user.id,
        name: name,
        email: email,
        role: role,
        location: location || "Maharashtra, India"
      };

      setCurrentUser(user);
      showToast("Account created successfully! Redirecting...");

      setTimeout(() => {
        if (role === "farmer") {
          window.location.href = "farmer-dashboard.html";
        } else {
          window.location.href = "buyer-dashboard.html";
        }
      }, 900);
    });
  }
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
// 4. FARMER DASHBOARD LOGIC (Add, Edit, Delete Produce)
// ==============================================================================

function initFarmerDashboard() {
  const tableBody = document.getElementById("farmerProduceTableBody");
  const addForm = document.getElementById("addProduceForm");
  if (!tableBody && !addForm) return;

  // Render initial table
  renderFarmerTable();

  // Add Produce Form Submission
  if (addForm) {
    addForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = document.getElementById("cropName").value.trim();
      const category = document.getElementById("cropCategory").value;
      const quantity = parseFloat(document.getElementById("cropQuantity").value);
      const unit = document.getElementById("cropUnit").value;
      const price = parseFloat(document.getElementById("cropPrice").value);
      const location = document.getElementById("cropLocation").value.trim();
      const imageInput = document.getElementById("cropImage");

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

      const user = getCurrentUser() || { name: "Rameshwar Patel" };

      // Helper to finalize item addition
      const finalizeAdd = (imageUrl) => {
        /**
         * BACKEND INTEGRATION HOOK:
         * Replace with:
         * await fetch('/api/produce', { method: 'POST', body: JSON.stringify(newItem) });
         */
        const items = getProduceList();
        const newItem = {
          id: "prod-" + Date.now(),
          name: name,
          category: category,
          quantity: quantity,
          unit: unit,
          price: price,
          location: location,
          farmerName: user.name,
          image: imageUrl || CATEGORY_IMAGES[category] || CATEGORY_IMAGES.Vegetables,
          dateAdded: new Date().toISOString().split("T")[0]
        };

        items.unshift(newItem);
        saveProduceList(items);

        renderFarmerTable();
        addForm.reset();
        showToast(`"${name}" has been published to the marketplace!`);
      };

      // Check if custom image uploaded
      if (imageInput && imageInput.files && imageInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          finalizeAdd(evt.target.result);
        };
        reader.readAsDataURL(imageInput.files[0]);
      } else {
        finalizeAdd(null);
      }
    });
  }

  // Bind Edit Modal Submissions
  initEditModal();
}

function renderFarmerTable() {
  const tableBody = document.getElementById("farmerProduceTableBody");
  if (!tableBody) return;

  const items = getProduceList();
  
  // Update Stats Counters
  const countEl = document.getElementById("statTotalListings");
  const qtyEl = document.getElementById("statTotalQuantity");
  if (countEl) countEl.textContent = items.length;
  if (qtyEl) {
    const totalQty = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
    qtyEl.textContent = totalQty.toLocaleString();
  }

  if (items.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          No produce listed yet. Use the form on the left to add your first harvest!
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = items.map(item => `
    <tr id="row-${item.id}">
      <td>
        <div class="crop-cell">
          <img src="${item.image}" alt="${item.name}" class="crop-thumb" onerror="this.src='https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=100&q=80'" />
          <div class="crop-info-text">
            <strong>${item.name}</strong>
            <small>${item.category}</small>
          </div>
        </div>
      </td>
      <td>
        <span class="badge badge-green">${item.category}</span>
      </td>
      <td>
        <strong>${item.quantity}</strong> ${item.unit}
      </td>
      <td>
        <strong style="color: var(--primary);">${formatCurrency(item.price)}</strong> / ${item.unit}
      </td>
      <td>
        <span style="color: var(--text-muted); font-size: 0.9rem;">📍 ${item.location}</span>
      </td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-sm btn-outline" onclick="openEditModal('${item.id}')" title="Edit Listing">
            ✏️ Edit
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteProduce('${item.id}')" title="Delete Listing">
            🗑️ Delete
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

/**
 * Delete Produce Item
 * BACKEND INTEGRATION HOOK:
 * Replace with:
 * await fetch(`/api/produce/${id}`, { method: 'DELETE' });
 */
function deleteProduce(id) {
  const items = getProduceList();
  const target = items.find(i => i.id === id);
  const cropName = target ? target.name : "Item";

  if (!confirm(`Are you sure you want to remove "${cropName}" from your listings?`)) {
    return;
  }

  const updated = items.filter(i => i.id !== id);
  saveProduceList(updated);
  renderFarmerTable();
  showToast(`"${cropName}" removed from marketplace.`);
}

// Edit Modal Functions
function initEditModal() {
  const modal = document.getElementById("editModal");
  const editForm = document.getElementById("editProduceForm");
  const closeBtn = document.getElementById("closeEditModal");
  const cancelBtn = document.getElementById("cancelEditModal");

  if (!modal || !editForm) return;

  const closeModal = () => modal.classList.remove("active");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  // Close when clicking outside content
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("editProduceId").value;
    const items = getProduceList();
    const index = items.findIndex(i => i.id === id);

    if (index === -1) return;

    items[index].name = document.getElementById("editCropName").value.trim();
    items[index].category = document.getElementById("editCropCategory").value;
    items[index].quantity = parseFloat(document.getElementById("editCropQuantity").value);
    items[index].unit = document.getElementById("editCropUnit").value;
    items[index].price = parseFloat(document.getElementById("editCropPrice").value);
    items[index].location = document.getElementById("editCropLocation").value.trim();

    /**
     * BACKEND INTEGRATION HOOK:
     * Replace with:
     * await fetch(`/api/produce/${id}`, { method: 'PUT', body: JSON.stringify(items[index]) });
     */
    saveProduceList(items);
    renderFarmerTable();
    closeModal();
    showToast(`Updated "${items[index].name}" successfully!`);
  });
}

function openEditModal(id) {
  const modal = document.getElementById("editModal");
  if (!modal) return;

  const items = getProduceList();
  const item = items.find(i => i.id === id);
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
// 5. BUYER DASHBOARD LOGIC (Marketplace Grid, Search & Filters)
// ==============================================================================

function initBuyerDashboard() {
  const grid = document.getElementById("produceGrid");
  if (!grid) return;

  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const locationFilter = document.getElementById("locationFilter");
  const resetBtn = document.getElementById("resetFiltersBtn");

  // Populate dynamic location filter options from current inventory
  populateLocationOptions();

  // Initial render of all produce
  renderBuyerCards(getProduceList());

  // Search & Filter event listeners
  const handleFilter = () => {
    const items = getProduceList();
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const selectedCategory = categoryFilter ? categoryFilter.value : "";
    const selectedLocation = locationFilter ? locationFilter.value : "";

    const filtered = items.filter(item => {
      const matchesSearch = query === "" || 
        item.name.toLowerCase().includes(query) || 
        item.location.toLowerCase().includes(query) ||
        item.farmerName.toLowerCase().includes(query);

      const matchesCategory = selectedCategory === "" || item.category === selectedCategory;
      const matchesLocation = selectedLocation === "" || item.location.toLowerCase().includes(selectedLocation.toLowerCase());

      return matchesSearch && matchesCategory && matchesLocation;
    });

    renderBuyerCards(filtered);
  };

  if (searchInput) searchInput.addEventListener("input", handleFilter);
  if (categoryFilter) categoryFilter.addEventListener("change", handleFilter);
  if (locationFilter) locationFilter.addEventListener("change", handleFilter);

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (categoryFilter) categoryFilter.value = "";
      if (locationFilter) locationFilter.value = "";
      renderBuyerCards(getProduceList());
    });
  }
}

function populateLocationOptions() {
  const locationSelect = document.getElementById("locationFilter");
  if (!locationSelect) return;

  const items = getProduceList();
  const states = new Set();

  items.forEach(item => {
    if (item.location) {
      // Extract state or city
      const parts = item.location.split(",");
      const region = parts[parts.length - 1].trim();
      if (region) states.add(region);
    }
  });

  states.forEach(region => {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    locationSelect.appendChild(option);
  });
}

function renderBuyerCards(items) {
  const grid = document.getElementById("produceGrid");
  if (!grid) return;

  const resultsCount = document.getElementById("resultsCount");
  if (resultsCount) {
    resultsCount.textContent = `Showing ${items.length} listing${items.length === 1 ? '' : 's'}`;
  }

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌾</div>
        <h3>No produce matches your search</h3>
        <p>Try searching for a different crop name, change the category filter, or reset filters.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="produce-card">
      <div class="produce-card-img-wrapper">
        <img 
          src="${item.image}" 
          alt="${item.name}" 
          class="produce-card-img" 
          onerror="this.src='https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80'"
        />
        <span class="badge badge-green card-category-badge">${item.category}</span>
      </div>
      <div class="produce-card-body">
        <h3 class="produce-card-title">${item.name}</h3>
        <div class="produce-meta-row">
          <span>👨‍🌾 ${item.farmerName || 'Local Farmer'}</span>
          <span>•</span>
          <span>📍 ${item.location}</span>
        </div>
        <div class="produce-details-box">
          <div>
            <div class="price-tag">${formatCurrency(item.price)} <small>/ ${item.unit}</small></div>
          </div>
          <div class="stock-tag">
            Available: <strong>${item.quantity} ${item.unit}</strong>
          </div>
        </div>
        <div class="produce-card-actions">
          <button class="btn btn-primary btn-block" onclick="handleBuyNow('${item.id}')">
            🛒 Buy Now
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

/**
 * Handles "Buy Now" click on buyer dashboard
 * Prepares the mock order and redirects to order-success.html
 */
function handleBuyNow(id) {
  const items = getProduceList();
  const item = items.find(i => i.id === id);
  if (!item) return;

  const currentUser = getCurrentUser() || { name: "Ananya Sharma", email: "ananya@example.com" };

  // Calculate mock purchase quantity (default: 1 unit or min available)
  const orderQuantity = 1;
  const totalAmount = item.price * orderQuantity;

  const orderData = {
    orderId: "AGRI-" + Math.floor(100000 + Math.random() * 900000),
    orderDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    produceName: item.name,
    category: item.category,
    quantity: orderQuantity,
    unit: item.unit,
    unitPrice: item.price,
    totalPrice: totalAmount,
    farmerName: item.farmerName || "Verified Grower",
    farmerLocation: item.location,
    buyerName: currentUser.name,
    buyerEmail: currentUser.email,
    deliveryAddress: currentUser.location || "102 Green Acres, Pune, Maharashtra",
    estimatedDelivery: "3-5 Business Days"
  };

  /**
   * BACKEND INTEGRATION HOOK:
   * Replace with:
   * const response = await fetch('/api/orders', { method: 'POST', body: JSON.stringify(orderData) });
   */
  localStorage.setItem("agrimandi_latest_order", JSON.stringify(orderData));

  // Redirect to order success page
  window.location.href = "order-success.html";
}

// ==============================================================================
// 6. ORDER SUCCESS LOGIC (order-success.html)
// ==============================================================================

function initOrderSuccess() {
  const orderBox = document.getElementById("orderSummaryDetails");
  if (!orderBox) return;

  // Retrieve stored order
  let order = null;
  try {
    const raw = localStorage.getItem("agrimandi_latest_order");
    if (raw) order = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse latest order", e);
  }

  // Fallback if accessed directly
  if (!order) {
    order = {
      orderId: "AGRI-582910",
      orderDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      produceName: "Sharbati Wheat",
      category: "Grains",
      quantity: 1,
      unit: "Quintal",
      unitPrice: 3200,
      totalPrice: 3200,
      farmerName: "Rameshwar Patel",
      farmerLocation: "Sehore, Madhya Pradesh",
      buyerName: "Rahul Verma",
      deliveryAddress: "Flat 401, Sun City, Pune, MH",
      estimatedDelivery: "3-4 Days"
    };
  }

  orderBox.innerHTML = `
    <div class="order-summary-header">
      <div>
        <div class="order-id">Order ID: #${order.orderId}</div>
        <small style="color: var(--text-muted);">Date: ${order.orderDate}</small>
      </div>
      <span class="badge badge-green">Confirmed</span>
    </div>

    <div class="summary-row">
      <span>Item:</span>
      <strong style="color: var(--text-main);">${order.produceName}</strong>
    </div>

    <div class="summary-row">
      <span>Quantity:</span>
      <span>${order.quantity} ${order.unit}</span>
    </div>

    <div class="summary-row">
      <span>Rate:</span>
      <span>${formatCurrency(order.unitPrice)} / ${order.unit}</span>
    </div>

    <div class="summary-row">
      <span>Farmer / Source:</span>
      <span>${order.farmerName} (📍 ${order.farmerLocation})</span>
    </div>

    <div class="summary-row">
      <span>Delivery To:</span>
      <span>${order.deliveryAddress}</span>
    </div>

    <div class="summary-row">
      <span>Est. Delivery:</span>
      <span>${order.estimatedDelivery}</span>
    </div>

    <div class="summary-row total-row">
      <span>Total Paid:</span>
      <span>${formatCurrency(order.totalPrice)}</span>
    </div>
  `;
}

// ==============================================================================
// 7. GLOBAL HEADER / ACTIVE NAVIGATION STATE
// ==============================================================================

function updateNavigationState() {
  const path = window.location.pathname;
  const links = document.querySelectorAll(".nav-link");
  links.forEach(link => {
    const href = link.getAttribute("href");
    if (href && path.includes(href) && href !== "#") {
      link.classList.add("active");
    }
  });

  // Display user name if logged in
  const user = getCurrentUser();
  const userBadge = document.getElementById("navUserBadge");
  const loginBtn = document.getElementById("navLoginBtn");
  const registerBtn = document.getElementById("navRegisterBtn");

  if (userBadge && user) {
    const roleLabel = user.role === "farmer" ? "\uD83D\uDE9C FARMER" : "\uD83D\uDED2 BUYER";
    userBadge.textContent = roleLabel + " | " + user.name + " \u2022 Sign Out";
    userBadge.style.display = "inline-flex";
    userBadge.style.cursor = "pointer";
    userBadge.title = "Click to sign out";
    userBadge.onclick = async () => {
      if (confirm("Do you want to sign out from " + user.name + "?")) {
        if (window.agriMandiSupabase) {
          await window.agriMandiSupabase.signOut();
        } else {
          localStorage.removeItem("agrimandi_user");
        }
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
document.addEventListener("DOMContentLoaded", () => {
  updateNavigationState();
  initAuthForms();
  initFarmerDashboard();
  initBuyerDashboard();
  initOrderSuccess();
});
