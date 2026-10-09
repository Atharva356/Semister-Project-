# AgriMandi Build Scripts

This directory contains utility scripts for build and deployment automation.

## `build-config.js`

Generates `config.js` in the project root from environment variables during deploy time.

### Why is this needed?
The frontend is plain static HTML, CSS, and Vanilla JavaScript with no bundler (no Webpack, Vite, or Next.js).
To keep production Supabase credentials and backend API URLs configurable in hosting platforms like **Netlify** or **Vercel** without committing secrets into git:
1. `config.js` is ignored in `.gitignore`.
2. Hosting platforms run `node scripts/build-config.js` as their build command.
3. The script reads platform environment variables and writes a fresh `config.js` before static files are served.

### Supported Environment Variables
| Variable | Description | Default Fallback |
|---|---|---|
| `API_BASE_URL` | Deployed URL of the Flask backend API (e.g., `https://agrimandi-api.onrender.com`) | `http://localhost:5000` |
| `SUPABASE_URL` | Supabase Project URL (e.g., `https://xyz.supabase.co`) | `https://your-project-id.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase Anon/Publishable API Key | `your-supabase-publishable-or-anon-key` |

### Deployment Configurations

#### Netlify (`netlify.toml`)
```toml
[build]
  command = "node scripts/build-config.js"
  publish = "."
```

#### Vercel (`vercel.json`)
```json
{
  "buildCommand": "node scripts/build-config.js",
  "outputDirectory": "."
}
```

#### Local Development
For local dev, either copy `config.example.js` to `config.js`:
```bash
cp config.example.js config.js
```
Or run the script with environment variables:
```bash
API_BASE_URL=http://localhost:5000 SUPABASE_URL=https://... SUPABASE_ANON_KEY=... node scripts/build-config.js
```
