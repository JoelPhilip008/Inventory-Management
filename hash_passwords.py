from werkzeug.security import generate_password_hash

# --- DEFINE YOUR USERS AND PASSWORDS HERE ---
# Use strong, unique passwords in a real application.
users_to_hash = {
    'admin': 'AD123',
    'joellah': 'JO456',
    'user1': 'US789'
}
# ---------------------------------------------

print("Copy the following into your app.py USERS dictionary:\n")
print("USERS = {")
for username, password in users_to_hash.items():
    hashed_password = generate_password_hash(password)
    print(f"    '{username}': '{hashed_password}',")
print("}")