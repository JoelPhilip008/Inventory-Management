# app.py

from flask import Flask, render_template, request, redirect, jsonify, send_from_directory, session, url_for
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
import openpyxl, threading, os
from pathlib import Path
from datetime import datetime

app = Flask(__name__)
# IMPORTANT: Change this to your own random, secret string for security.
app.secret_key = 's3cR3tK3Y'

# --- User and Admin Definitions ---
# Replace this with the dictionary you generated from hash_passwords.py
USERS = {
    'admin': 'scrypt:32768:8:1$es3aR6usGR8IVPxG$af6e21ef2b4b025c6ae332023ab4b984db8d2d7b89f9b4a1f5be90d7b0a95174bec5633d69dd73cace5210c528737dc16b40cb918bb86887cc77760ce815ea33',
    'joellah': 'scrypt:32768:8:1$LO9Txxu7J0MHpeRF$e09c096deebc815495da983a671c6d993ab9a8a65969744c3cecb3c10a2ebdbaf00fb112bbf6d2e949329e54b1d563185e05d666ae46819ac2791c762cdd3ec7',
    'user1': 'scrypt:32768:8:1$HmxyQ8TV8uITltnM$74994692c00c7cac6e71f91e0f2f155f4041734cf87f0604c6d46eb4a261f1b6930acd34ca71311553ec0b4745bfe4eef9691eb134a3b7f7799f6b87d51279df',
}
# This list defines who gets the 'admin' role upon successful login.
ADMIN_USERS = ['admin', 'joellah']


LOCK = threading.Lock()
BASE_DIR = Path(__file__).parent
EXCEL_FILE = BASE_DIR / 'inventory.xlsx'
LOG_FILE = BASE_DIR / 'retrieval_logs.xlsx'

# --- Decorators for Login and Admin Checks ---

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get('role') != 'admin':
            if request.is_json:
                return jsonify({'error': 'Admin access required'}), 403
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

# --- Helper Functions ---
def ensure_excel():
    if not EXCEL_FILE.exists():
        wb = openpyxl.Workbook()
        if 'Sheet' in wb.sheetnames: wb.remove(wb['Sheet'])
        ws = wb.create_sheet(title='Core Components')
        headers = ['Item No','Section','Section S.No','Component','Box No','Specifications','Existing Units','Part number','SKU ID','Remarks','URLS']
        ws.append(headers)
        ws.append(['1','Core Components','1','Resistor','B1','1k Ohm 0.25W','100','R1K0.25W','SKU001','In Stock','http://example.com/resistor'])
        wb.save(EXCEL_FILE)

def ensure_log_file():
    if not LOG_FILE.exists():
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Logs'
        headers = ['Timestamp', 'Username', 'Item No', 'Component', 'Section', 'Quantity Retrieved', 'Notes']
        ws.append(headers)
        wb.save(LOG_FILE)

def load_workbook():
    ensure_excel()
    return openpyxl.load_workbook(EXCEL_FILE)

def headers_and_rows():
    wb = load_workbook()
    if not wb.sheetnames: return [], []
    first_sheet = wb[wb.sheetnames[0]]
    headers = [cell.value for cell in first_sheet[1]]
    all_data = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        for row in ws.iter_rows(min_row=2, values_only=True):
            all_data.append(list(row))
    return headers, all_data

def save_workbook_with_reindex(wb):
    if not wb.sheetnames:
        wb.save(EXCEL_FILE)
        return
    headers = [cell.value for cell in wb[wb.sheetnames[0]][1]]
    item_no_col_idx = headers.index('Item No')
    section_col_idx = headers.index('Section')
    section_s_no_col_idx = headers.index('Section S.No')
    global_item_no_counter = 1
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        section_s_no_counter = 1
        for row_cells in ws.iter_rows(min_row=2):
            row_cells[item_no_col_idx].value = global_item_no_counter
            global_item_no_counter += 1
            row_cells[section_col_idx].value = sheet_name
            row_cells[section_s_no_col_idx].value = section_s_no_counter
            section_s_no_counter += 1
    wb.save(EXCEL_FILE)

def load_logs():
    ensure_log_file() # Make sure the file exists
    wb_log = openpyxl.load_workbook(LOG_FILE)
    ws_log = wb_log.active
    
    rows = list(ws_log.values)
    if not rows:
        return [], []
    
    headers = rows[0]
    data = rows[1:]
    return headers, data

# --- Routes ---

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        user_hash = USERS.get(username.lower())
        if user_hash and check_password_hash(user_hash, password):
            session['username'] = username
            if username.lower() in [u.lower() for u in ADMIN_USERS]:
                session['role'] = 'admin'
            else:
                session['role'] = 'user'
            return redirect(url_for('index'))
        else:
            return render_template('login.html', error='Invalid username or password.')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    headers, data = headers_and_rows()
    all_sections = []
    try:
        section_col_idx = headers.index('Section')
        unique_sections = sorted(list(set(row[section_col_idx] for row in data if row[section_col_idx])))
        all_sections = unique_sections
    except (ValueError, IndexError):
        pass
    try:
        item_no_col_idx = headers.index('Item No')
        sorted_data = sorted(data, key=lambda row: int(row[item_no_col_idx] or 0))
    except (ValueError, IndexError):
        sorted_data = data
    return render_template('index.html', headers=headers, data=sorted_data, session=session, all_sections=all_sections)

@app.route('/retrieve')
@login_required
def retrieve_page():
    headers, data = headers_and_rows()
    try:
        item_no_col_idx = headers.index('Item No')
        sorted_data = sorted(data, key=lambda row: int(row[item_no_col_idx] or 0))
    except (ValueError, IndexError):
        sorted_data = data
    return render_template('retrieve.html', headers=headers, data=sorted_data, session=session)

@app.route('/update', methods=['POST'])
@login_required
@admin_required
def update():
    payload = request.get_json()
    item_no = int(payload.get('item_no'))
    col_name = payload.get('col_name')
    new_value = payload.get('new_value')
    with LOCK:
        wb = load_workbook()
        if not wb.sheetnames: return jsonify({'error': 'No sheets in workbook'}), 500
        headers = [cell.value for cell in wb[wb.sheetnames[0]][1]]
        item_no_col_idx = headers.index('Item No')
        target_cell = None; target_row_obj = None
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            for row in ws.iter_rows(min_row=2):
                if str(row[item_no_col_idx].value) == str(item_no):
                    # print("Excel Headers:", headers)
                    # print("Frontend Column Name:", col_name)
                    # col_idx = headers.index(col_name)
                    normalized_headers = [h.strip().lower() for h in headers]
                    normalized_col_name = col_name.strip().lower()

                    if normalized_col_name not in normalized_headers:
                        return jsonify({'success': False, 'error': f"Column '{col_name}' not found in Excel headers"}), 400
                    
                    col_idx = normalized_headers.index(normalized_col_name)
                    target_cell = ws.cell(row=row[0].row, column=col_idx + 1)
                    target_row_obj = row; break
            if target_cell: break
        if not target_cell: return jsonify({'error': 'Item not found'}), 404
        target_cell.value = new_value
        if str(col_name).strip().lower() in ('existing units','existing_units','units','quantity'):
            try:
                units = int(float(new_value))
                remark = 'Out of Stock' if units <= 0 else ('Low Stock' if units <= 5 else 'In Stock')
                remarks_col_idx = headers.index('Remarks')
                target_row_obj[remarks_col_idx].value = remark
            except (ValueError, IndexError): pass
        wb.save(EXCEL_FILE)
    return jsonify({'ok': True})

@app.route('/add', methods=['POST'])
@login_required
@admin_required
def add():
    payload = request.form
    section = payload.get('Section') or 'Uncategorized'
    with LOCK:
        wb = load_workbook()
        headers = [cell.value for cell in wb[wb.sheetnames[0]][1]] if wb.sheetnames else ['Item No','Section','Section S.No','Component','Box No','Specifications','Existing Units','Part number','SKU ID','Remarks','URLS']
        if section not in wb.sheetnames:
            ws = wb.create_sheet(title=section)
            ws.append(headers)
        else:
            ws = wb[section]
        new_row_values = [None] * len(headers)
        header_map = {h.lower(): i for i, h in enumerate(headers)}
        def set_val(col, val):
            if col.lower() in header_map: new_row_values[header_map[col.lower()]] = val
        set_val('Section', section); set_val('Component', payload.get('Component'))
        set_val('Box No', payload.get('Box No')); set_val('Specifications', payload.get('Specifications'))
        set_val('Part number', payload.get('Part number')); set_val('SKU ID', payload.get('SKU ID'))
        set_val('URLS', payload.get('URLS'))
        try:
            units = int(float(payload.get('Existing Units', 0)))
            set_val('Existing Units', units)
            set_val('Remarks', 'Out of Stock' if units <= 0 else ('Low Stock' if units <= 5 else 'In Stock'))
        except ValueError:
            set_val('Existing Units', 0); set_val('Remarks', 'Out of Stock')
        ws.append(new_row_values)
        save_workbook_with_reindex(wb)
    return redirect('/')

@app.route('/delete', methods=['POST'])
@login_required
@admin_required
def delete():
    payload = request.get_json()
    item_no = int(payload.get('item_no'))
    with LOCK:
        wb = load_workbook()
        if not wb.sheetnames: return jsonify({'error': 'No sheets in workbook'}), 500
        headers = [cell.value for cell in wb[wb.sheetnames[0]][1]]
        item_no_col_idx = headers.index('Item No')
        row_to_delete_num = None; sheet_to_delete_from = None
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            for r_idx, row in enumerate(ws.iter_rows(min_row=2)):
                if str(row[item_no_col_idx].value) == str(item_no):
                    row_to_delete_num = r_idx + 2
                    sheet_to_delete_from = ws; break
            if row_to_delete_num: break
        if not row_to_delete_num: return jsonify({'error': 'Item not found'}), 404
        sheet_to_delete_from.delete_rows(row_to_delete_num)
        if sheet_to_delete_from.max_row < 2 and len(wb.sheetnames) > 1:
            wb.remove(sheet_to_delete_from)
        save_workbook_with_reindex(wb)
    return jsonify({'ok': True})

@app.route('/retrieve/<int:item_no>', methods=['POST'])
@login_required
def retrieve_item(item_no):
    payload = request.get_json()
    quantity_to_retrieve = payload.get('quantity')

    if not quantity_to_retrieve or quantity_to_retrieve <= 0:
        return jsonify({'success': False, 'error': 'Invalid quantity provided.'}), 400

    username = session.get('username')
    
    with LOCK:
        wb_inv = openpyxl.load_workbook(EXCEL_FILE)
        
        headers = [cell.value for cell in wb_inv[wb_inv.sheetnames[0]][1]]
        item_no_col_idx = headers.index('Item No')
        units_col_idx = headers.index('Existing Units')
        
        target_row_obj = None
        for sheet_name in wb_inv.sheetnames:
            ws = wb_inv[sheet_name]
            for row in ws.iter_rows(min_row=2):
                if str(row[item_no_col_idx].value) == str(item_no):
                    target_row_obj = row
                    break
            if target_row_obj: break
        
        if not target_row_obj:
            return jsonify({'success': False, 'error': 'Item not found in inventory.'}), 404

        current_stock = int(target_row_obj[units_col_idx].value or 0)
        if quantity_to_retrieve > current_stock:
            return jsonify({'success': False, 'error': f'Not enough stock. Only {current_stock} available.'}), 400

        # Update inventory
        new_stock = current_stock - quantity_to_retrieve
        target_row_obj[units_col_idx].value = new_stock
        target_row_obj[headers.index('Remarks')].value = 'Out of Stock' if new_stock <= 0 else ('Low Stock' if new_stock <= 5 else 'In Stock')
        wb_inv.save(EXCEL_FILE)

        # Write to log file
        ensure_log_file()
        wb_log = openpyxl.load_workbook(LOG_FILE)
        ws_log = wb_log.active
        log_entry = [
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            username,
            item_no,
            target_row_obj[headers.index('Component')].value,
            target_row_obj[headers.index('Section')].value,
            quantity_to_retrieve,
            ''
        ]
        ws_log.append(log_entry)
        wb_log.save(LOG_FILE)

    return jsonify({'success': True})

@app.route('/logs')
@login_required
@admin_required
def view_logs():
    log_headers, log_data = load_logs()
    
    # Display the most recent logs first
    log_data.reverse()
    
    return render_template('logs.html', headers=log_headers, data=log_data, session=session)

@app.route('/download')
@login_required
@admin_required
def download():
    return send_from_directory(directory=str(BASE_DIR), path=EXCEL_FILE.name, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)