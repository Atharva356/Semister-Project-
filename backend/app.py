import os
from flask import Flask, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv

from routes.produce import produce_bp
from routes.orders import orders_bp

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)

# Enable CORS so frontend (localhost:5500, etc.) can communicate seamlessly
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize Supabase Client
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")

supabase: Client = None
if supabase_url and supabase_key and "your-project-id" not in supabase_url:
    try:
        supabase = create_client(supabase_url, supabase_key)
        print("[Supabase] Connected to Supabase client successfully.")
    except Exception as e:
        print(f"[Supabase] Initialization warning: {e}")

# Register AgriMandi API Blueprints
# Note: Authentication routes are handled entirely by Supabase Auth on the client
app.register_blueprint(produce_bp, url_prefix="/api/produce")
app.register_blueprint(orders_bp, url_prefix="/api/orders")

@app.route('/')
def index():
    if not supabase:
        return """
        <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2>&#127806; AgriMandi Backend Server</h2>
            <p>Status: <strong>Running</strong></p>
            <div style="background: #fff3cd; color: #856404; padding: 12px; border-radius: 6px; margin: 16px 0;">
                &#9888;&#65039; <strong>Supabase Credentials Needed:</strong><br/>
                Please paste your <code>SUPABASE_URL</code> and <code>SUPABASE_KEY</code> in <code>backend/.env</code>.
            </div>
            <h3>Available Endpoints:</h3>
            <ul>
                <li><a href="/api/health">/api/health</a> - Health Check</li>
                <li><a href="/api/produce">/api/produce</a> - Produce Listings</li>
                <li><a href="/api/orders">/api/orders</a> - Orders API</li>
            </ul>
        </div>
        """

    try:
        # Check 'produce' table in Supabase
        response = supabase.table('produce').select("*").execute()
        items = response.data or []
        html = '<div style="font-family: sans-serif; max-width: 650px; margin: 40px auto; padding: 24px;">'
        html += '<h2>&#127806; AgriMandi Produce (Connected to Supabase)</h2>'
        html += '<p style="color: green;">&#9989; Supabase connection active!</p><ul>'
        for item in items:
            html += f'<li><strong>{item.get("name")}</strong> ({item.get("category")}) - &#8377;{item.get("price")}/{item.get("unit")}</li>'
        html += '</ul>'
        html += '<hr/><p><a href="/api/produce">View JSON API (/api/produce)</a></p></div>'
        return html
    except Exception as e:
        # Fallback for 'todos' table if using Supabase tutorial schema
        try:
            response = supabase.table('todos').select("*").execute()
            todos = response.data or []
            html = '<div style="font-family: sans-serif; max-width: 600px; margin: 40px auto;"><h1>Todos</h1><ul>'
            for todo in todos:
                html += f'<li>{todo.get("name", todo.get("title", "Todo Item"))}</li>'
            html += '</ul></div>'
            return html
        except Exception:
            return f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto;">
                <h2>&#9889; Supabase Client Connected</h2>
                <p>Supabase client is authenticated, but no <code>produce</code> or <code>todos</code> table was found.</p>
                <p>Run the <code>schema.sql</code> script in your Supabase SQL Editor to create the tables!</p>
                <p><small>Database message: {e}</small></p>
            </div>
            """

@app.route('/api/health')
def health():
    return jsonify({
        "status": "healthy",
        "service": "AgriMandi Backend",
        "supabase_connected": supabase is not None
    })

if __name__ == '__main__':
    app.run(debug=True)
