import requests
import json

# Credenciales
username = "LIBRAL_APP"
password = "JH7kl%64321"
url = "https://libral.core.abazal.com/api/auth/login?db=LIBRAL"

print("=" * 60)
print("PRUEBA DE AUTENTICACIÓN LIBRAL")
print("=" * 60)
print(f"URL: {url}")
print(f"Usuario: {username}")
print(f"Contraseña: {password}")
print("=" * 60)

# Configuración 1: Headers básicos
print("\n[TEST 1] Headers básicos (Content-Type)")
try:
    response = requests.post(
        url,
        json={"username": username, "password": password},
        headers={"Content-Type": "application/json"}
    )
    print(f"Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"Body: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Configuración 2: Headers completos
print("\n[TEST 2] Headers completos (Accept, User-Agent, etc.)")
try:
    response = requests.post(
        url,
        json={"username": username, "password": password},
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "es-ES,es;q=0.9"
        }
    )
    print(f"Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"Body: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Configuración 3: Form data en lugar de JSON
print("\n[TEST 3] Form data (application/x-www-form-urlencoded)")
try:
    response = requests.post(
        url,
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    print(f"Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"Body: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Configuración 4: Diferentes nombres de campos
print("\n[TEST 4] Campos alternativos (user/pass)")
try:
    response = requests.post(
        url,
        json={"user": username, "pass": password},
        headers={"Content-Type": "application/json"}
    )
    print(f"Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"Body: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Configuración 5: Sin query parameter db
print("\n[TEST 5] Sin parámetro db en URL")
try:
    response = requests.post(
        "https://libral.core.abazal.com/api/auth/login",
        json={"username": username, "password": password, "db": "LIBRAL"},
        headers={"Content-Type": "application/json"}
    )
    print(f"Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"Body: {response.text}")
except Exception as e:
    print(f"Error: {e}")

print("\n" + "=" * 60)
print("PRUEBAS COMPLETADAS")
print("=" * 60)
