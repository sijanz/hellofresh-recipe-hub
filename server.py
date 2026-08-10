import os
import json
import glob
import re
import smtplib
from email.message import EmailMessage
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder='web', static_url_path='/static')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(BASE_DIR, 'HelloFreshCrawler', 'downloads_de')

def get_recipe_files():
    if not os.path.exists(DOWNLOADS_DIR):
        return []
    return glob.glob(os.path.join(DOWNLOADS_DIR, '*.json'))

def load_recipe_by_filename(filename):
    filepath = os.path.join(DOWNLOADS_DIR, filename)
    if not os.path.exists(filepath):
        return None
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.route('/')
def index():
    return send_from_directory('web', 'index.html')

@app.route('/web/<path:path>')
def static_files(path):
    return send_from_directory('web', path)

def parse_duration_minutes(iso_str):
    if not iso_str:
        return 30
    m = re.search(r'PT(?:(\d+)H)?(?:(\d+)M)?', str(iso_str))
    if m:
        hours = int(m.group(1)) if m.group(1) else 0
        mins = int(m.group(2)) if m.group(2) else 0
        return (hours * 60) + mins
    return 30

@app.route('/api/recipes', methods=['GET'])
def list_recipes():
    recipe_files = get_recipe_files()
    recipes_meta = []
    
    for filepath in recipe_files:
        filename = os.path.basename(filepath)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            pdf_filename = filename.rsplit('.', 1)[0] + '.pdf'
            pdf_path = os.path.join(DOWNLOADS_DIR, pdf_filename)
            has_pdf = os.path.exists(pdf_path)
            
            cuisines = [c.get('name') for c in data.get('cuisines', []) if isinstance(c, dict) and c.get('name')]
            tags = [t.get('name') for t in data.get('tags', []) if isinstance(t, dict) and t.get('name')]
            ingredients_list = [ing.get('name') for ing in data.get('ingredients', []) if isinstance(ing, dict) and ing.get('name')]
            
            image_path = data.get('imagePath')
            if image_path:
                image_url = f"https://img.hellofresh.com/c_fill,f_auto,fl_lossy,h_400,q_auto,w_600/hellofresh_s3{image_path}"
            else:
                image_url = data.get('imageLink')
                if image_url and '/image/' in image_url:
                    path_part = '/image/' + image_url.split('/image/')[1]
                    image_url = f"https://img.hellofresh.com/c_fill,f_auto,fl_lossy,h_400,q_auto,w_600/hellofresh_s3{path_part}"

            prep_mins = parse_duration_minutes(data.get('prepTime'))

            meta = {
                'id': data.get('id', filename),
                'filename': filename,
                'title': data.get('name', filename.replace('.json', '')),
                'headline': data.get('headline', ''),
                'description': data.get('description', ''),
                'prepTime': data.get('prepTime'),
                'prepTimeMinutes': prep_mins,
                'totalTime': data.get('totalTime'),
                'difficulty': data.get('difficulty', 1),
                'image': image_url,
                'cuisines': cuisines,
                'tags': tags,
                'ingredientsPreview': ingredients_list[:6],
                'ingredientsCount': len(ingredients_list),
                'hasPdf': has_pdf,
                'pdfFilename': pdf_filename if has_pdf else None,
                'yieldsAvailable': [y.get('yields') for y in data.get('yields', []) if isinstance(y, dict)]
            }
            recipes_meta.append(meta)
        except Exception as e:
            print(f"Error reading {filename}: {e}")
            continue

    recipes_meta.sort(key=lambda x: x['title'])
    return jsonify(recipes_meta)

@app.route('/api/recipes/<path:filename>', methods=['GET'])
def get_recipe_detail(filename):
    data = load_recipe_by_filename(filename)
    if not data:
        return jsonify({'error': 'Recipe not found'}), 404
    return jsonify(data)

@app.route('/api/pdf/<path:filename>', methods=['GET'])
def serve_pdf(filename):
    return send_from_directory(DOWNLOADS_DIR, filename)

SUPERMARKET_AISLES = [
    ('🥦 Obst & Gemüse', ['apfel', 'aubergine', 'avocado', 'banane', 'basilikum', 'birne', 'blumenkohl', 'bohne', 'brokkoli', 'chili', 'dill', 'erbse', 'fenchel', 'frühlingszwiebel', 'gurke', 'ingwer', 'karotte', 'kartoffel', 'knoblauch', 'kohl', 'koriander', 'kürbis', 'lauch', 'limette', 'mais', 'mango', 'orange', 'paprika', 'petersilie', 'pfirsich', 'pilz', 'rettich', 'rosmarin', 'salat', 'schnittlauch', 'sellerie', 'spargel', 'spinat', 'thymian', 'tomate', 'zitrone', 'zucchini', 'zwiebel', 'kräuter', 'beete', 'radieschen', 'porree']),
    ('🥛 Kühlregal, Käse & Molkerei', ['käse', 'butter', 'ei', 'joghurt', 'milch', 'sahne', 'sauerrahm', 'schmand', 'feta', 'mozzarella', 'camembert', 'halloumi', 'quark', 'frischkäse', 'paneer', 'burrata', 'ricotta', 'hirtenkäse', 'ziegenkäse', 'blauschimmel', 'cheddar', 'gouda', 'parmesan', 'emmentaler']),
    ('🥩 Fleisch, Fisch & Veggie', ['ente', 'fisch', 'hähnchen', 'rind', 'schwein', 'fleisch', 'tofu', 'lachs', 'bacon', 'hack', 'filet', 'truthahn', 'patties', 'pattie', 'speck', 'wurst', 'chick-eria']),
    ('🍞 Brot, Back- & Teigwaren', ['brot', 'teig', 'pasta', 'reis', 'nudel', 'wrap', 'tortilla', 'ciabatta', 'pita', 'fladenbrot', 'spätzle', 'gnocchi', 'tortellini', 'couscous', 'bulgur', 'quinoa', 'linguine', 'penne', 'spaghetti', 'farfalle', 'strozzapreti', 'conchiglie', 'fiorelli', 'ravioli', 'filo', 'blätterteig', 'bun', 'baguette', 'pide', 'laugen', 'börek', 'brotteig']),
    ('🥫 Konserven, Saucen & Feinkost', ['soße', 'sosse', 'sauce', 'chutney', 'dip', 'dressing', 'ketchup', 'kokosmilch', 'mayo', 'pesto', 'senf', 'dose', 'kichererbse', 'ajvar', 'konserve', 'eingelegt', 'paste', 'oliven', 'relish', 'mojo', 'salsa', 'kapern', 'sriracha']),
    ('🧂 Gewürze, Öle, Nüsse & Vorrat', ['gewürz', 'öl', 'oel', 'essig', 'honig', 'mehl', 'pfeffer', 'salz', 'zucker', 'brühe', 'nuss', 'erdnuss', 'sesam', 'pinien', 'mandeln', 'samen', 'kurkuma', 'oregano', 'lorbeer', 'backpulver', 'paprikapulver', 'dukkah', 'baharat', 'harissa', 'ras el hanout', 'trüffelöl', 'panko', 'balsamico', 'schokolad'])
]

def categorize_ingredient(name, family_name=''):
    search_str = f"{name} {family_name}".lower()
    for aisle_name, keywords in SUPERMARKET_AISLES:
        for k in keywords:
            if len(k) <= 3:
                if re.search(r'\b' + re.escape(k) + r'\b', search_str):
                    return aisle_name
            else:
                if k in search_str:
                    return aisle_name
    return '🛒 Weitere Zutaten'

@app.route('/api/shopping-list', methods=['POST'])
def generate_shopping_list():
    payload = request.get_json() or {}
    selected_items = payload.get('items', [])
    
    aggregated_ingredients = {}
    processed_recipes = []
    
    for item in selected_items:
        filename = item.get('filename')
        target_servings = item.get('servings', 2)
        
        recipe_data = load_recipe_by_filename(filename)
        if not recipe_data:
            continue
            
        recipe_name = recipe_data.get('name', filename)
        processed_recipes.append({
            'title': recipe_name,
            'servings': target_servings
        })
        
        ing_meta_map = {}
        for ing in recipe_data.get('ingredients', []):
            ing_id = ing.get('id')
            fam_name = ing.get('family', {}).get('name', '') if isinstance(ing.get('family'), dict) else ''
            if ing_id:
                ing_meta_map[ing_id] = {
                    'name': ing.get('name'),
                    'shipped': ing.get('shipped', True),
                    'family': fam_name,
                    'slug': ing.get('slug', ''),
                    'image': ing.get('imageLink')
                }
                
        yields_list = recipe_data.get('yields', [])
        chosen_yield = None
        
        for y in yields_list:
            if y.get('yields') == target_servings:
                chosen_yield = y
                break
                
        if not chosen_yield and yields_list:
            chosen_yield = yields_list[0]
            
        if not chosen_yield:
            continue
            
        base_servings = chosen_yield.get('yields', 2)
        scale_factor = float(target_servings) / float(base_servings) if base_servings else 1.0
        
        for ing_item in chosen_yield.get('ingredients', []):
            ing_id = ing_item.get('id')
            meta = ing_meta_map.get(ing_id, {'name': 'Unbekannte Zutat', 'shipped': True, 'family': ''})
            name = meta['name']
            shipped = meta['shipped']
            family_name = meta['family']
            unit = ing_item.get('unit', '') or ''
            raw_amount = ing_item.get('amount')
            
            key = (name.lower().strip(), unit.lower().strip(), shipped)
            
            if key not in aggregated_ingredients:
                aggregated_ingredients[key] = {
                    'name': name,
                    'unit': unit,
                    'amount': 0.0,
                    'has_numeric': False,
                    'shipped': shipped,
                    'family': family_name,
                    'recipes': set()
                }
                
            aggregated_ingredients[key]['recipes'].add(recipe_name)
            
            if raw_amount is not None:
                try:
                    scaled_amt = float(raw_amount) * scale_factor
                    aggregated_ingredients[key]['amount'] += scaled_amt
                    aggregated_ingredients[key]['has_numeric'] = True
                except (ValueError, TypeError):
                    pass

    # Categorize items into Supermarket Aisles
    aisle_buckets = {aisle[0]: [] for aisle in SUPERMARKET_AISLES}
    aisle_buckets['🛒 Weitere Zutaten'] = []
    
    for key, data in aggregated_ingredients.items():
        recipes_str = ", ".join(sorted(list(data['recipes'])))
        amount_display = ""
        if data['has_numeric']:
            amt = data['amount']
            amt_str = f"{int(amt)}" if amt.is_integer() else f"{amt:.1f}"
            amount_display = f"{amt_str} {data['unit']}".strip()
        else:
            amount_display = data['unit'] if data['unit'] else "nach Geschmack"
            
        item_dict = {
            'name': data['name'],
            'amount': amount_display,
            'shipped': data['shipped'],
            'recipes': recipes_str
        }
        
        aisle = categorize_ingredient(data['name'], data['family'])
        aisle_buckets[aisle].append(item_dict)

    # Build structured list of non-empty categories
    categories = []
    markdown_lines = ["# Einkaufsliste\n"]
    markdown_lines.append("## Ausgewählte Rezepte:")
    for r in processed_recipes:
        markdown_lines.append(f"- **{r['title']}** ({r['servings']} Portionen)")
    markdown_lines.append("\n---\n")

    for aisle_name, items in aisle_buckets.items():
        if not items:
            continue
        items.sort(key=lambda x: x['name'])
        categories.append({
            'name': aisle_name,
            'items': items
        })
        
        markdown_lines.append(f"## {aisle_name}")
        for item in items:
            pantry_tag = "" if item['shipped'] else " *(Vorrat)*"
            markdown_lines.append(f"- [ ] **{item['amount']}** {item['name']}{pantry_tag} *(für {item['recipes']})*")
        markdown_lines.append("")

    markdown_text = "\n".join(markdown_lines).strip()
    
    return jsonify({
        'recipes': processed_recipes,
        'categories': categories,
        'markdown': markdown_text
    })

def load_env_vars():
    env_vars = {}
    env_path = os.path.join(BASE_DIR, '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars

@app.route('/api/config', methods=['GET'])
def get_config():
    env_vars = load_env_vars()
    return jsonify({
        'defaultRecipient': env_vars.get('RECIPIENT_EMAIL', 'user@example.com'),
        'defaultSmtpUser': env_vars.get('SMTP_USER', 'user@example.com'),
        'defaultSmtpServer': env_vars.get('SMTP_SERVER', 'mail.gmx.net'),
        'defaultSmtpPort': int(env_vars.get('SMTP_PORT', 587)),
        'hasSavedPassword': bool(env_vars.get('SMTP_PASSWORD') or os.environ.get('SMTP_PASSWORD'))
    })

@app.route('/api/send-email', methods=['POST'])
def send_email_route():
    payload = request.get_json() or {}
    markdown_text = payload.get('markdown', '')
    recipient_email = payload.get('recipientEmail')
    password = payload.get('smtpPassword')
    
    env_vars = load_env_vars()
    
    smtp_server = payload.get('smtpServer') or env_vars.get('SMTP_SERVER') or os.environ.get('SMTP_SERVER', 'mail.gmx.net')
    smtp_port = int(payload.get('smtpPort') or env_vars.get('SMTP_PORT') or os.environ.get('SMTP_PORT', 587))
    smtp_user = payload.get('smtpUser') or env_vars.get('SMTP_USER') or os.environ.get('SMTP_USER', 'user@example.com')
    smtp_pass = password or env_vars.get('SMTP_PASSWORD') or os.environ.get('SMTP_PASSWORD')
    target_email = recipient_email or env_vars.get('RECIPIENT_EMAIL') or os.environ.get('RECIPIENT_EMAIL', 'user@example.com')
    
    if not smtp_pass:
        return jsonify({'error': 'Bitte SMTP-Passwort eingeben'}), 400
        
    try:
        msg = EmailMessage()
        msg['From'] = smtp_user
        msg['To'] = target_email
        msg['Subject'] = 'Einkaufsliste - HelloFresh'
        
        msg.set_content(f"Hallo!\n\nAnbei findest du deine aggregierte HelloFresh Einkaufsliste als Markdown-Datei.\n\n---\n\n{markdown_text}")
        
        msg.add_attachment(
            markdown_text.encode('utf-8'),
            maintype='text',
            subtype='markdown',
            filename='shopping_list.md'
        )
        
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
            
        return jsonify({'success': True, 'message': f'Einkaufsliste erfolgreich an {target_email} gesendet!'})
    except Exception as e:
        return jsonify({'error': f'E-Mail-Versand fehlgeschlagen: {str(e)}'}), 500

if __name__ == '__main__':
    print("Starting HelloFresh Recipe Web Server on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
