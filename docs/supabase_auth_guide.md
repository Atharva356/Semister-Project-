# Supabase Auth Configuration Guide (Email Confirmation & Password Reset)

This guide documents the configuration required in your Supabase project for user authentication, email confirmation, and password reset flows in AgriMandi.

---

## 1. Auth URL Configuration (Site URL & Redirect URLs)

In the [Supabase Dashboard](https://supabase.com/dashboard), navigate to **Authentication -> URL Configuration**.

### Site URL
Set the primary site URL to your deployed frontend domain:
```
https://<your-site>.netlify.app
```
*(For local testing, you can temporarily set this to `http://localhost:5500`)*

### Redirect URLs (Allow list)
Add all the following URLs to your **Redirect URLs** list:
```
https://<your-site>.netlify.app/**
https://<your-site>.netlify.app/reset-password.html
https://<your-site>.netlify.app/login.html
http://localhost:5500/**
http://127.0.0.1:5500/**
http://localhost:8080/**
```

> **Why this matters**: When Supabase generates email confirmation or password reset links, it validates that the redirect target is present in this allow list. If it is missing, users will experience redirect loops or error pages when clicking email links.

---

## 2. Email Confirmation Flow

### How it works
1. A new farmer or buyer submits the registration form on `register.html`.
2. The frontend calls `supabase.auth.signUp()` with:
   - User credentials & profile metadata (`name`, `role`, `location`)
   - `emailRedirectTo: window.location.origin + "/login.html"`
3. If **Confirm email** is enabled in Supabase:
   - A new record is created in `auth.users`, and our database trigger `handle_new_user()` creates their initial profile in `public.profiles`.
   - Supabase returns `user` with `session: null`.
   - The frontend detects `session: null` and displays a confirmation message telling the user to verify their email.
4. When the user clicks the link in their email:
   - Supabase activates their account and redirects them to `login.html`.
   - The user enters their credentials to log in.

### Configuration
In Supabase Dashboard -> **Authentication -> Providers -> Email**:
- **Enable Email provider**: Checked
- **Confirm email**:
  - For **production**, recommended **ON** (prevents fake/spam account creation).
  - For **local hackathon/demo testing**, you can turn it **OFF** if you want instant login without waiting for email delivery.

---

## 3. Password Reset Flow

### How it works
1. The user navigates to `forgot-password.html` (accessible via the "Forgot password?" link on `login.html`).
2. The user enters their email address and clicks **Send Recovery Link**.
3. The frontend calls:
   ```javascript
   supabase.auth.resetPasswordForEmail(email, {
     redirectTo: window.location.origin + "/reset-password.html"
   });
   ```
4. Supabase sends an email containing a secure password recovery link.
5. When the user clicks the link, they land on `reset-password.html`.
6. Supabase JS automatically extracts the recovery access token from the URL and establishes an authenticated recovery session.
7. The user enters and confirms their new password.
8. The frontend calls:
   ```javascript
   supabase.auth.updateUser({ password: newPassword });
   ```
9. On success, the user is signed out of the recovery session and redirected to `login.html` to sign in with their new password.

---

## 4. Production Email Delivery (SMTP)

By default, Supabase provides a built-in email service with a rate limit of **3 to 4 emails per hour**.

For real production use with farmers and buyers:
1. Open Supabase Dashboard -> **Project Settings -> Authentication -> SMTP Settings**.
2. Enable **Custom SMTP**.
3. Provide credentials from an email service like **Resend**, **SendGrid**, or **Amazon SES**:
   - Host: `smtp.resend.com` (or provider host)
   - Port: `465` or `587`
   - User: `resend` (or API user)
   - Password: `<your-api-key>`
   - Sender Email: `noreply@yourdomain.com`
   - Sender Name: `AgriMandi Marketplace`
