# AgriMandi 🌾

> Connecting Farmers Directly to Buyers — Fair Pricing, Fresh Harvests, Zero Middlemen.

AgriMandi is a modern web application designed to empower farmers and agricultural producers by connecting them directly with consumers, businesses, restaurants, and wholesalers. By eliminating unnecessary intermediaries and middlemen, AgriMandi ensures fair profits for growers and fresh, affordable produce for buyers.

---

## 🌟 Key Features

### 🚜 Farmer Portal
- **Harvest Listing**: Easily list crops, fruits, vegetables, grains, and spices with custom pricing per kg/quintal.
- **Inventory Management**: Track stock levels, active listings, and update prices dynamically.
- **Direct Orders**: Monitor incoming order requests with real-time status updates (Pending, Confirmed, Dispatched).
- **Earnings Dashboard**: Overview of total revenue, units sold, and active buyer requests.

### 🛒 Buyer Marketplace
- **Live Produce Catalog**: Browse fresh listings categorized by vegetables, fruits, staples, and organic produce.
- **Search & Filter**: Search by crop name, farmer location, price range, and harvest date.
- **Direct Purchasing / Cart**: Add items directly to cart with transparent pricing and quantity selection.
- **Order Checkout**: Streamlined checkout experience with instant order confirmation.

### 🔐 Authentication & Roles
- Dedicated registration and login flows for **Farmers** and **Buyers**.
- Session state management and personalized dashboard routing.

---

## 💻 Tech Stack

- **Frontend**: HTML5, Modern CSS3 (CSS Variables, Flexbox, CSS Grid, Responsive Design)
- **Logic & State**: Pure Vanilla JavaScript (ES6+)
- **Storage**: Client-side persistence via `localStorage` for offline-friendly demonstration
- **Icons & Visuals**: Unicode / Modern Emoji icons & clean typography

---

## 🚀 Getting Started

### Prerequisites
You only need a modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari).

### Running Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Atharva356/Semister-Project-.git
   cd Semister-Project-
   ```

2. **Open the project**:
   - Simply double-click `index.html` to open it in your browser.
   - Or serve with any lightweight static server:
     ```bash
     # Using Python
     python -m http.server 5500

     # Using Node / npx
     npx serve .
     ```

3. **Visit**:
   Open [http://localhost:5500](http://localhost:5500) in your web browser.

---

## 📁 Project Structure

```text
AgriMandi/
├── index.html              # Homepage / Landing page
├── buyer-dashboard.html    # Buyer marketplace & produce browsing
├── farmer-dashboard.html   # Farmer portal for managing crop listings
├── login.html              # User login page
├── register.html           # Farmer & Buyer registration page
├── order-success.html      # Order confirmation & summary
├── app.js                  # Application state & business logic
├── style.css               # Styling, layout, and responsiveness
└── README.md               # Project documentation
```

---

## 👨‍💻 Author

- **Atharva Chavan** ([@Atharva356](https://github.com/Atharva356))
- Aryan Nerkar
- Krishna Mistri
- Gaurav Patil
