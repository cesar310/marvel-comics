let galleryState = {
    comics: [],
    currentIndex: 0
};

const selectors = {
    gallery: '.comics-gallery',
    loginForm: '#login-form',
    registerForm: '#register-form',
    loadingScreen: '.login-loading',
    formSide: '.form-side'
};

const GALLERY_CACHE_KEY = 'marvel_gallery_comics';
const CACHE_DURATION = 1000 * 60 * 5;

/**
 * Valida el formulario de inicio de sesión.
 *
 * @param {HTMLFormElement} form - El formulario de inicio de sesión que se va a validar.
 * @returns {Object} Un objeto que contiene los errores de validación. Las claves del objeto son los nombres de los campos y los valores son los mensajes de error correspondientes.
 */
function validateLoginForm(form) {
    const errors = {};
    const email = form.querySelector('input[name="email"]').value;
    const password = form.querySelector('input[name="password"]').value;

    if (!email.trim()) {
        errors.email = "El correo electrónico es requerido";
    } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        errors.email = "Correo electrónico inválido";
    }

    if (!password.trim()) {
        errors.password = "La contraseña es requerida";
    }

    return errors;
}

/**
 * Valida el formulario de registro.
 *
 * @param {HTMLFormElement} form - El formulario de registro que se va a validar.
 * @returns {Object} Un objeto que contiene los errores de validación. Las claves del objeto son los nombres de los campos y los valores son los mensajes de error correspondientes.
 */
function validateRegisterForm(form) {
    const errors = {};
    const username = form.querySelector('input[name="username"]').value;
    const email = form.querySelector('input[name="email"]').value;
    const password = form.querySelector('input[name="password"]').value;
    const confirmPassword = form.querySelector('input[name="confirm_password"]').value;

    if (!username.trim()) {
        errors.username = "El usuario es requerido";
    }

    if (!email.trim()) {
        errors.email = "El email es requerido";
    } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        errors.email = "Email inválido";
    }

    if (!password) {
        errors.password = "La contraseña es requerida";
    } else if (password.length < 8) {
        errors.password = "La contraseña debe tener al menos 8 caracteres";
    } else if (!/(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/.test(password)) {
        errors.password = "La contraseña debe incluir mayúsculas, minúsculas, números y caracteres especiales";
    }

    if (password !== confirmPassword) {
        errors.confirmPassword = "Las contraseñas no coinciden";
    }

    return errors;
}

/**
 * Muestra los errores de validación en el formulario.
 *
 * @param {HTMLFormElement} form - El formulario en el que se mostrarán los errores.
 * @param {Object} errors - Un objeto que contiene los errores de validación.
 * @returns {boolean} True si no hay errores, False en caso contrario.
 */
function showFormErrors(form, errors) {
    form.querySelectorAll('.error-message').forEach(el => el.remove());
    form.querySelectorAll('.form-group').forEach(el => el.classList.remove('error'));

    Object.entries(errors).forEach(([field, message]) => {
        const input = form.querySelector(`input[name="${field}"]`);
        if (input) {
            const formGroup = input.closest('.form-group');
            formGroup.classList.add('error');
            const errorSpan = document.createElement('span');
            errorSpan.className = 'error-message';
            errorSpan.textContent = message;
            formGroup.appendChild(errorSpan);
        }
    });

    return Object.keys(errors).length === 0;
}

/**
 * Carga los cómics en la galería.
 *
 * @async
 * @function loadGalleryComics
 * @returns {Promise<void>}
 */
async function loadGalleryComics() {
    const gallery = document.querySelector(selectors.gallery);
    if (!gallery) return;

    try {
        const cache = sessionStorage.getItem(GALLERY_CACHE_KEY);
        let comics;

        if (cache) {
            const { data, timestamp } = JSON.parse(cache);
            if (Date.now() - timestamp < CACHE_DURATION) {
                comics = data;
            }
        }

        if (!comics) {
            const response = await fetch('/get_random_comics');
            comics = await response.json();

            sessionStorage.setItem(GALLERY_CACHE_KEY, JSON.stringify({
                data: comics,
                timestamp: Date.now()
            }));
        }

        if (!Array.isArray(comics)) return;

        const fragment = document.createDocumentFragment();
        const galleryInner = document.createElement('div');
        galleryInner.className = 'comics-gallery-inner';

        comics.forEach(comic => {
            const img = document.createElement('img');
            img.src = comic.thumbnail;
            img.alt = comic.title;
            img.className = 'gallery-comic';
            img.loading = 'lazy';
            img.decoding = 'async';
            galleryInner.appendChild(img);
        });

        fragment.appendChild(galleryInner);

        const clone = galleryInner.cloneNode(true);
        fragment.appendChild(clone);

        gallery.innerHTML = '';
        gallery.appendChild(fragment);
        gallery.classList.remove('hidden');

    } catch (error) {
        console.error('Error loading gallery comics:', error);
    }
}

/**
 * Función de debounce para limitar la frecuencia de ejecución de una función.
 *
 * @param {Function} func - La función a la que se aplicará el debounce.
 * @param {number} wait - El tiempo de espera en milisegundos.
 * @returns {Function} Una función con debounce aplicado.
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Configura los listeners para los formularios de inicio de sesión y registro.
 * 
 * @function setupFormListeners
 * 
 * @description
 * Esta función selecciona los formularios de inicio de sesión y registro, así como otros elementos relevantes de la página.
 * Luego, agrega listeners para manejar el envío de formularios. Valida los formularios antes de enviarlos y muestra errores si los hay.
 * Si la validación es exitosa, envía los datos del formulario al servidor y maneja la respuesta.
 * 
 * @async
 * @param {Event} event - El evento de envío del formulario.
 * @param {string} url - La URL a la que se enviará el formulario.
 * 
 * @throws {Error} Error al enviar el formulario.
 */
function setupFormListeners() {
    const elements = {
        loginForm: document.querySelector(selectors.loginForm),
        registerForm: document.querySelector(selectors.registerForm),
        loadingScreen: document.querySelector(selectors.loadingScreen),
        formSide: document.querySelector(selectors.formSide)
    };

    const handleFormSubmit = async (event, url) => {
        event.preventDefault();
        const form = event.target;

        const errors = form.id === 'login-form' 
            ? validateLoginForm(form)
            : validateRegisterForm(form);

        if (Object.keys(errors).length > 0) {
            showFormErrors(form, errors);
            return;
        }

        try {
            elements.loadingScreen.style.display = 'flex';
            const formData = new FormData(form);

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'text/html'
                }
            });

            const html = await response.text();
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');

            if (newDoc.querySelector('.error-message, .alert.alert-error')) {
                elements.loadingScreen.style.display = 'none';
                const newFormSide = newDoc.querySelector(selectors.formSide);
                elements.formSide.innerHTML = newFormSide.innerHTML;
                setupFormListeners();
            } else {
                window.location.href = response.url;
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            elements.loadingScreen.style.display = 'none';
        }
    };

    if (elements.loginForm) {
        elements.loginForm.addEventListener('submit', e => handleFormSubmit(e, '/login'));
    }

    if (elements.registerForm) {
        elements.registerForm.addEventListener('submit', e => handleFormSubmit(e, '/register'));
    }
}

/**
 * Maneja la transición de página para los enlaces de registro e inicio de sesión.
 *
 * @param {Event} event - El evento de clic.
 * @param {string} targetPage - La URL de la página de destino.
 */
function handlePageTransition(event, targetPage) {
    event.preventDefault();
    const formSide = document.querySelector(selectors.formSide);

    requestAnimationFrame(() => {
        formSide.style.opacity = '0';
        formSide.style.transform = 'translateX(-20px)';
    });

    fetch(targetPage)
        .then(response => response.text())
        .then(html => {
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');
            const newFormSide = newDoc.querySelector(selectors.formSide);

            requestAnimationFrame(() => {
                formSide.innerHTML = newFormSide.innerHTML;
                formSide.style.opacity = '1';
                formSide.style.transform = 'translateX(0)';
                setupFormListeners();
            });
        });
}

document.addEventListener('DOMContentLoaded', setupFormListeners);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

/**
 * Inicializa la carga de cómics en la galería y configura los listeners de los formularios.
 */
function init() {
    loadGalleryComics();
    setupFormListeners();
}