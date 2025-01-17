from flask import Flask, flash, jsonify, redirect, render_template, request, session, url_for
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import re
import requests
import pandas as pd
import hashlib
import random
from collections import deque
import threading
import time
from functools import wraps
import os

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "default_secret_key")
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get("DATABASE_URL", 'sqlite:///marvel.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CACHE_SIZE = 3
comic_cache = deque(maxlen=CACHE_SIZE)
cache_lock = threading.Lock()

db = SQLAlchemy(app)

API_KEY = os.environ.get('MARVEL_API_KEY')
PRIVATE_KEY = os.environ.get('MARVEL_PRIVATE_KEY')

class User(db.Model):
    """
    Clase User que representa un modelo de usuario en la base de datos.
    Atributos:
        id (int): Identificador único del usuario.
        username (str): Nombre de usuario, debe ser único y no nulo.
        email (str): Correo electrónico del usuario, debe ser único y no nulo.
        password (str): Contraseña del usuario, no nula.
        identification (str): Identificación única del usuario, debe ser única y no nula.
    Métodos:
        __repr__: Representación en cadena del objeto User.
    """
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    identification = db.Column(db.String(120), unique=True, nullable=False)

    def __repr__(self):
        return f'<User {self.username}>'

class Favorite(db.Model):
    """
    Clase que representa un cómic favorito en la base de datos.
    Atributos:
        id (int): Identificador único del favorito.
        user_id (int): Identificador del usuario que marcó el cómic como favorito.
        comic_id (int): Identificador del cómic.
        title (str): Título del cómic.
        pageCount (int, opcional): Número de páginas del cómic.
        price (float, opcional): Precio del cómic.
        thumbnail_path (str, opcional): Ruta de la imagen en miniatura del cómic.
        thumbnail_extension (str, opcional): Extensión de la imagen en miniatura del cómic.
        description (str, opcional): Descripción del cómic.
    Métodos:
        __repr__(): Representación en cadena del objeto Favorite.
    """
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    comic_id = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    pageCount = db.Column(db.Integer)
    price = db.Column(db.Float)
    thumbnail_path = db.Column(db.String(200))
    thumbnail_extension = db.Column(db.String(10))
    description = db.Column(db.String(500))

    def __repr__(self):
        return f'<Favorite {self.title}>'

def is_strong_password(password: str) -> bool:
    """
    Verifica si una contraseña es fuerte.

    Una contraseña se considera fuerte si cumple con los siguientes criterios:
    - Tiene al menos 8 caracteres.
    - Contiene al menos una letra mayúscula.
    - Contiene al menos una letra minúscula.
    - Contiene al menos un dígito.
    - Contiene al menos un carácter especial (por ejemplo, !@#$%^&*(),.?":{}|<>).

    Args:
        password (str): La contraseña a verificar.

    Returns:
        bool: True si la contraseña es fuerte, False en caso contrario.
    """
    return (
        len(password) >= 8 and
        re.search(r"[A-Z]", password) and
        re.search(r"[a-z]", password) and
        re.search(r"\d", password) and
        re.search(r"[!@#$%^&*(),.?\":{}|<>]", password)
    )

def generate_api_hash(ts: str, private_key: str, apikey: str) -> str:
    """
    Genera un hash MD5 para la autenticación de la API de Marvel.

    Args:
        ts (str): Marca de tiempo utilizada para la solicitud.
        private_key (str): Clave privada proporcionada por la API de Marvel.
        apikey (str): Clave pública proporcionada por la API de Marvel.

    Returns:
        str: Hash MD5 generado a partir de la concatenación de ts, private_key y apikey.
    """
    return hashlib.md5((ts + private_key + apikey).encode()).hexdigest()

def api_request(offset: int) -> pd.DataFrame:
    """
    Realiza una solicitud a la API de Marvel Comics para obtener una lista de cómics.
    
    Args:
        offset (int): El desplazamiento para la paginación de los resultados.
    
    Returns:
        pd.DataFrame: Un DataFrame de pandas que contiene los resultados de la solicitud,
                      con las columnas 'id', 'title', 'description', 'pageCount', 'prices' y 'thumbnail'.
    """
    url = 'http://gateway.marvel.com/v1/public/comics?'
    ts = str(random.randint(1, 1000))
    hash = generate_api_hash(ts, PRIVATE_KEY, API_KEY)

    params = {
        'ts': ts,
        'apikey': API_KEY,
        'hash': hash,
        'limit': 12,
        'offset': offset + 200
    }

    response = requests.get(url, params=params).json()
    data = pd.DataFrame(response['data']['results'],
                        columns=['id', 'title', 'description', 'pageCount', 'prices', 'thumbnail'])
    return data

def preload_comics(offset: int) -> None:
    """
    Pre-carga los cómics desde una API y los almacena en una caché si no están ya presentes.

    Args:
        offset (int): El desplazamiento para la solicitud de la API.

    Raises:
        Exception: Si ocurre un error durante la solicitud de la API o el almacenamiento en caché.
    """
    try:
        with cache_lock:
            if any(cache['offset'] == offset for cache in comic_cache):
                return
            data = api_request(offset)
            comic_cache.append({
                'offset': offset,
                'data': data,
                'timestamp': time.time()
            })
    except Exception as e:
        print(f"Error preloading comics: {e}")

def login_required(f: callable) -> callable:
    """
    Decorador que verifica si el usuario ha iniciado sesión antes de permitir el acceso a una función.

    Args:
        f (callable): La función a la que se aplicará el decorador.

    Returns:
        callable: La función decorada que verifica la sesión del usuario.

    Comportamiento:
        - Si 'user_id' no está presente en la sesión, redirige al usuario a la página de inicio de sesión y muestra un mensaje de error.
        - Si 'user_id' está presente en la sesión, permite la ejecución de la función decorada.
    """
    @wraps(f)
    def decorated_function(*args: tuple, **kwargs: dict) -> callable:
        if 'user_id' not in session:
            flash("Debes iniciar sesión para acceder a esta página", "error")
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route("/")
def index():
    """
    Ruta principal de la aplicación.

    Si el usuario ha iniciado sesión (existe 'user_id' en la sesión), 
    redirecciona al catálogo. De lo contrario, muestra la página de inicio de sesión.

    Returns:
        Response: Redirección a la ruta del catálogo o renderización de la plantilla de inicio de sesión.
    """
    if 'user_id' in session:
        return redirect(url_for('catalog'))
    return render_template("login.html")

@app.route("/logout")
def logout():
    """
    Cierra la sesión del usuario actual y redirige a la página de inicio de sesión.

    Esta función limpia todos los datos de la sesión actual y luego redirige al usuario
    a la página de inicio de sesión.

    Returns:
        Response: Una redirección a la ruta de inicio de sesión.
    """
    session.clear()
    return redirect(url_for("login"))

@app.route("/login", methods=["GET", "POST"])
def login():
    """
    Maneja la ruta de inicio de sesión para los usuarios.
    Si el usuario ya ha iniciado sesión (existe 'user_id' en la sesión), 
    redirecciona al catálogo.
    Para solicitudes POST, verifica las credenciales del usuario:
    - Si las credenciales son correctas, guarda el 'user_id' y 'username' en la sesión,
        muestra un mensaje de éxito y redirecciona al catálogo.
    - Si las credenciales son incorrectas, muestra un mensaje de error y redirecciona a la página de inicio de sesión.
    Para solicitudes GET, renderiza la plantilla de inicio de sesión.
    Returns:
            str: Redirección a la página correspondiente o renderizado de la plantilla de inicio de sesión.
    """
    if 'user_id' in session:
        return redirect(url_for('catalog'))

    if request.method == "POST":
        email = request.form["email"]
        password = request.form["password"]
        user = User.query.filter_by(email=email).first()

        if user and check_password_hash(user.password, password):
            session['user_id'] = user.id
            session['username'] = user.username
            flash("Inicio de sesión exitoso", "success")
            return redirect(url_for("catalog"))
        else:
            flash("Correo electrónico o contraseña incorrectos", "error")
            return redirect(url_for("login"))

    return render_template("login.html")

@app.route("/register", methods=["GET", "POST"])
def register():
    """
    Ruta para el registro de nuevos usuarios.
    Si el usuario ya ha iniciado sesión, redirige al catálogo.
    Maneja tanto solicitudes GET como POST:
    - GET: Renderiza el formulario de registro.
    - POST: Procesa los datos del formulario y registra un nuevo usuario si los datos son válidos.
    Validaciones realizadas:
    - Verifica si el nombre de usuario ya existe.
    - Verifica si el correo electrónico ya está registrado.
    - Verifica si la identificación ya está registrada.
    - Verifica si las contraseñas coinciden.
    - Verifica si la contraseña cumple con los requisitos de seguridad.
    Si hay errores en el formulario, se muestran en la página de registro.
    Si el registro es exitoso, redirige a la página de inicio de sesión.
    Returns:
        Response: Redirección a la página correspondiente o renderizado de la plantilla de registro.
    """
    if 'user_id' in session:
        return redirect(url_for('catalog'))

    form_data = {
        'username': '',
        'email': '',
        'identification': '',
        'errors': {}
    }

    if request.method == "POST":
        form_data['username'] = request.form["username"]
        form_data['email'] = request.form["email"]
        form_data['identification'] = request.form["identification"]
        password = request.form["password"]
        confirm_password = request.form["confirm_password"]

        has_error = False

        if User.query.filter_by(username=form_data['username']).first():
            form_data['errors']['username'] = "Este nombre de usuario ya existe"
            has_error = True

        if User.query.filter_by(email=form_data['email']).first():
            form_data['errors']['email'] = "Este correo ya está registrado"
            has_error = True

        if User.query.filter_by(identification=form_data['identification']).first():
            form_data['errors']['identification'] = "Esta identificación ya está registrada"
            has_error = True

        if password != confirm_password:
            form_data['errors']['password'] = "Las contraseñas no coinciden"
            has_error = True
        elif not is_strong_password(password):
            form_data['errors']['password'] = "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial (!@#$%^&*(),.?\":{}|<>)"
            has_error = True

        if not has_error:
            try:
                hashed_password = generate_password_hash(password)
                new_user = User(username=form_data['username'], 
                                email=form_data['email'], 
                                password=hashed_password,
                                identification=form_data['identification'])
                db.session.add(new_user)
                db.session.commit()
                flash("Registro exitoso", "success")
                return redirect(url_for("login"))
            except:
                db.session.rollback()
                flash("Error al registrar usuario", "error")

    return render_template("register.html", form=form_data)

@app.route("/add_favorite/<int:comic_id>", methods=["POST"])
def add_favorite(comic_id):
    """
    Agrega un cómic a la lista de favoritos del usuario autenticado.
    Args:
        comic_id (int): El ID del cómic a agregar a favoritos.
    Returns:
        Response: Un objeto JSON con un mensaje de éxito o error y el código de estado HTTP correspondiente.
    Errores:
        401: Usuario no autenticado.
        500: Error al agregar el cómic a favoritos.
    """
    if 'user_id' not in session:
        return jsonify({"error": "Usuario no autenticado"}), 401

    data = request.json
    favorite = Favorite(
        user_id=session['user_id'],
        comic_id=comic_id,
        title=data['title'],
        pageCount=data['pageCount'],
        price=data['price'],
        thumbnail_path=data['thumbnail_path'],
        thumbnail_extension=data['thumbnail_extension'],
        description=data['description']
    )

    try:
        db.session.add(favorite)
        db.session.commit()
        return jsonify({"message": "Comic agregado a favoritos"}), 200
    except:
        db.session.rollback()
        return jsonify({"error": "Error al agregar a favoritos"}), 500

@app.route("/remove_favorite/<int:comic_id>", methods=["POST"])
def remove_favorite(comic_id):
    """
    Elimina un cómic de los favoritos del usuario autenticado.
    Args:
        comic_id (int): El ID del cómic a eliminar de favoritos.
    Returns:
        Response: Un objeto JSON con un mensaje de éxito o error y el código de estado HTTP correspondiente.
            - 200: Si el cómic fue eliminado exitosamente de favoritos.
            - 401: Si el usuario no está autenticado.
            - 404: Si el cómic no se encuentra en los favoritos del usuario.
            - 500: Si hubo un error al intentar eliminar el cómic de favoritos.
    """
    if 'user_id' not in session:
        return jsonify({"error": "Usuario no autenticado"}), 401

    favorite = Favorite.query.filter_by(
        user_id=session['user_id'], 
        comic_id=comic_id
    ).first()

    if favorite:
        try:
            db.session.delete(favorite)
            db.session.commit()
            return jsonify({"message": "Comic eliminado de favoritos"}), 200
        except:
            db.session.rollback()
            return jsonify({"error": "Error al eliminar de favoritos"}), 500

    return jsonify({"error": "Favorito no encontrado"}), 404

@app.route("/catalog")
@login_required
def catalog():
    """
    Ruta para el catálogo de cómics.
    Requiere que el usuario haya iniciado sesión.
    Realiza una solicitud a la API para obtener datos de cómics y consulta los cómics favoritos del usuario actual.
    Inicia un hilo separado para precargar cómics adicionales.
    Returns:
        str: Renderiza la plantilla "catalog.html" con los datos de los cómics, los favoritos del usuario y los IDs de los favoritos.
    """
    data = api_request(0)
    favorites = Favorite.query.filter_by(user_id=session['user_id']).all()
    favorite_ids = [f.comic_id for f in favorites]

    threading.Thread(target=preload_comics, args=(12,)).start()

    return render_template("catalog.html", data=data, favorites=favorites, favorite_ids=favorite_ids)

@app.route("/load_more_comics/<int:offset>")
@login_required
def load_more_comics(offset):
    """
    Carga más cómics a partir de un offset dado.
    Ruta:
        /load_more_comics/<int:offset>
    Decoradores:
        @app.route
    Parámetros:
        offset (int): El desplazamiento desde el cual cargar más cómics.
    Retorna:
        Response: Un objeto JSON con los cómics cargados y los IDs de los favoritos del usuario, 
                o un mensaje de error en caso de fallo.
    Errores:
        401: Usuario no autenticado.
        500: Error interno del servidor.
    """
    if 'user_id' not in session:
        return jsonify({"error": "Usuario no autenticado"}), 401

    try:
        data = None

        with cache_lock:
            for cached in comic_cache:
                if cached['offset'] == offset:
                    data = cached['data']
                    break

        if data is None:
            data = api_request(offset)

        threading.Thread(target=preload_comics, args=(offset + 12,)).start()

        favorites = Favorite.query.filter_by(user_id=session['user_id']).all()
        favorite_ids = [f.comic_id for f in favorites]

        comics = data.to_dict('records')
        comics = [comic for comic in comics if int(comic['id']) not in favorite_ids]

        return jsonify({
            "comics": comics,
            "favorite_ids": favorite_ids
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/get_random_comics")
def get_random_comics():
    """
    Obtiene una lista de cómics aleatorios desde la API de Marvel y los devuelve en formato JSON.
    Returns:
        Response: Una respuesta JSON que contiene una lista de cómics con los siguientes campos:
            - id: ID del cómic.
            - title: Título del cómic.
            - thumbnail: URL de la imagen en miniatura del cómic.
        En caso de error, devuelve una respuesta JSON con un mensaje de error y un código de estado 500.
    """
    try:
        random_offset = random.randint(0,50)
        data = api_request(random_offset)
        comics = data.to_dict('records')
        gallery_comics = [{
            'id': comic['id'],
            'title': comic['title'],
            'thumbnail': f"{comic['thumbnail']['path']}/portrait_uncanny.{comic['thumbnail']['extension']}"
        } for comic in comics]

        return jsonify(gallery_comics), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0")