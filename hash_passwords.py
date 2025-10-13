from werkzeug.security import generate_password_hash

# --- DEFINE YOUR USERS AND PASSWORDS HERE ---
# Use strong, unique passwords in a real application.
users_to_hash = {
    'admin': 'AD123',
    'chindu': '1623',
    'joel': '1911',
    'justin': '1742',
    'arjun': '1795',
    'dayal': '1766',
    'vivek': '1624',
    'adarsh': '1741',
    'jedin': '1740',
    'abel': '1891',
    'fahad': '1892',
    'athul': '1921',
    'akhil': '1627',
    'vishnu': '1650',
    'user1': 'US789'
}
# ---------------------------------------------

print("Copy the following into your app.py USERS dictionary:\n")
print("USERS = {")
for username, password in users_to_hash.items():
    hashed_password = generate_password_hash(password)
    print(f"    '{username}': '{hashed_password}',")
print("}")