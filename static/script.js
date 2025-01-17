let currentOffset = 12;
let isLoading = false;

document.addEventListener('DOMContentLoaded', () => {
    showTab('catalog');
    scrollPositions = {
        'catalog': 0,
        'favorites': 0
    };

    // Debounce para el evento de scroll
    const catalogTab = document.getElementById('catalog-tab');
    catalogTab.addEventListener('scroll', debounce(handleScroll, 200));
});

let scrollPositions = {
    'catalog': 0,
    'favorites': 0
};

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
 * Maneja el evento de scroll para cargar más cómics cuando el usuario se acerca al final de la página.
 *
 * @param {Event} event - El evento de scroll.
 */
function handleScroll(event) {
    const catalogTab = event.target;
    if (catalogTab.style.display !== 'none' && 
        catalogTab.scrollHeight - catalogTab.scrollTop <= catalogTab.clientHeight + 100 && 
        !isLoading) {
        loadMoreComics();
    }
}

/**
 * Muestra el modal de confirmación de cierre de sesión.
 *
 * @param {Event} event - El evento de clic.
 */
function showLogoutConfirmation(event) {
    event.preventDefault();
    const logoutModal = document.getElementById('logoutModal');
    logoutModal.style.display = 'flex';

    document.getElementById('confirmLogout').onclick = () => {
        window.location.href = '/logout';
    };

    document.getElementById('cancelLogout').onclick = () => {
        logoutModal.style.display = 'none';
    };
}

// Cerrar modales al hacer clic fuera de ellos
window.onclick = function(event) {
    const modals = document.getElementsByClassName('modal');
    for (let modal of modals) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    }
}

/**
 * Actualiza todos los botones relacionados con un cómic específico.
 *
 * @param {number} comicId - El ID del cómic.
 * @param {boolean} isActive - Indica si el cómic es favorito.
 */
function updateAllRelatedButtons(comicId, isActive) {
    // Actualizar botones en tarjetas
    const allButtons = document.querySelectorAll(`button[onclick*="${comicId}"]`);
    allButtons.forEach(button => {
        button.classList.toggle('active', isActive);
        button.textContent = isActive ? '★ Quitar de favoritos' : '☆ Agregar a favoritos';
    });
    
    // Actualizar botón en el modal si está abierto
    const modalBtn = document.querySelector('#comicModal .favorite-btn');
    if (modalBtn) {
        modalBtn.classList.toggle('active', isActive);
        modalBtn.textContent = isActive ? '★ Quitar de favoritos' : '☆ Agregar a favoritos';
    }
}

/**
 * Carga más cómics cuando el usuario se desplaza hacia abajo.
 *
 * @async
 * @function loadMoreComics
 * @returns {Promise<void>}
 */
async function loadMoreComics() {
    if (isLoading || document.getElementById('catalog-tab').style.display === 'none') return;
    
    isLoading = true;
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = 'block';

    try {
        const response = await fetch(`/load_more_comics/${currentOffset}`);
        const data = await response.json();
        
        if (data.comics.length > 0) {
            const comicsGrid = document.querySelector('.comics-grid');
            
            data.comics.forEach(comic => {
                const cardHTML = createComicCard(comic, data.favorite_ids);
                comicsGrid.insertAdjacentHTML('beforeend', cardHTML);
            });
            
            currentOffset += 12;
        }
    } catch (error) {
        console.error('Error loading more comics:', error);
    } finally {
        isLoading = false;
        loadingIndicator.style.display = 'none';
    }
}

/**
 * Crea una tarjeta de cómic en formato HTML.
 *
 * @param {Object} comic - Los datos del cómic.
 * @param {Array} favoriteIds - Lista de IDs de cómics favoritos.
 * @returns {string} El HTML de la tarjeta del cómic.
 */
function createComicCard(comic, favoriteIds) {
    const isFavorite = favoriteIds.includes(comic.id);
    const safeTitle = comic.title.replace(/'/g, "\\'");
    const safeDesc = (comic.description || 'No disponible').replace(/['"]/g, '&quot;');
    const safeDesc2 = (comic.description || 'No disponible').replace(/['"]/g, "\\'");
    return `
        <div class="comic-card" data-comic-id="${comic.id}" data-description="${safeDesc}">
            <img src="${comic.thumbnail.path}/portrait_uncanny.${comic.thumbnail.extension}" 
                 alt="${comic.title}"
                 class="comic-image"
                 loading="lazy">
            <div class="comic-title">
                <h3>${comic.title}</h3>
            </div>
            <div class="comic-hover-info">
                <div class="comic-hover-details">
                    <p><strong>Páginas:</strong> ${comic.pageCount || 'No disponible'}</p>
                    <p><strong>Precio:</strong> ${('$' + comic.prices[0]?.price) || 'No disponible'}</p>
                    <button class="favorite-btn ${isFavorite ? 'active' : ''}"
                            onclick="handleFavoriteClick(event, this, ${comic.id}, 
                                    '${safeTitle}', 
                                    ${comic.pageCount || 0}, 
                                    ${comic.prices[0]?.price || 0}, 
                                    '${comic.thumbnail.path}', 
                                    '${comic.thumbnail.extension}',
                                    '${safeDesc2}')">
                        ${isFavorite ? '★ Quitar de favoritos' : '☆ Agregar a favoritos'}
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Maneja el clic en el botón de favorito para agregar o quitar un cómic de favoritos.
 *
 * @async
 * @function handleFavoriteClick
 * @param {Event} event - El evento de clic.
 * @param {HTMLElement} btn - El botón de favorito.
 * @param {number} comicId - El ID del cómic.
 * @param {string} title - El título del cómic.
 * @param {number} pageCount - El número de páginas del cómic.
 * @param {number} price - El precio del cómic.
 * @param {string} thumbPath - La ruta de la miniatura del cómic.
 * @param {string} thumbExt - La extensión de la miniatura del cómic.
 * @param {string} description - La descripción del cómic.
 */
async function handleFavoriteClick(event, btn, comicId, title, pageCount, price, thumbPath, thumbExt, description) {
    event.preventDefault();
    event.stopPropagation(); // Evitar que el click se propague

    const isActive = btn.classList.contains('active');

    if (isActive) {
        const confirmModal = document.getElementById('confirmModal');
        confirmModal.style.display = 'flex';

        document.getElementById('confirmDelete').onclick = async () => {
            confirmModal.style.display = 'none';
            await removeFavorite({ btn, comicId });

            // Actualizar todos los botones relacionados
            updateAllRelatedButtons(comicId, false);
        };

        document.getElementById('cancelDelete').onclick = () => {
            confirmModal.style.display = 'none';
        };
    } else {
        await addFavorite(btn, comicId, title, pageCount, price, thumbPath, thumbExt, description);

        // Actualizar todos los botones relacionados
        updateAllRelatedButtons(comicId, true);
    }
}

/**
 * Muestra el contenido de la pestaña seleccionada y oculta las demás.
 *
 * @param {string} tabName - El nombre de la pestaña a mostrar.
 */
function showTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-btn');

    // Guardar la posición del scroll del tab actual
    tabs.forEach(tab => {
        if (tab.classList.contains('active')) {
            const currentTabName = tab.id.replace('-tab', '');
            scrollPositions[currentTabName] = tab.scrollTop;
        }
    });

    // Ocultar todos los tabs
    tabs.forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
    });

    // Remover active de todos los botones
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });

    // Mostrar el tab seleccionado
    const selectedTab = document.getElementById(`${tabName}-tab`);
    selectedTab.style.display = 'block';
    
    // Restaurar la posición del scroll
    selectedTab.scrollTop = scrollPositions[tabName];
    
    setTimeout(() => selectedTab.classList.add('active'), 50);
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
}

/**
 * Alterna el estado de favorito de un cómic.
 *
 * @async
 * @function toggleFavorite
 * @param {HTMLElement} btn - El botón de favorito.
 * @param {number} comicId - El ID del cómic.
 * @param {string} title - El título del cómic.
 * @param {number} pageCount - El número de páginas del cómic.
 * @param {number} price - El precio del cómic.
 * @param {string} thumbPath - La ruta de la miniatura del cómic.
 * @param {string} thumbExt - La extensión de la miniatura del cómic.
 * @param {string} description - La descripción del cómic.
 */
async function toggleFavorite(btn, comicId, title, pageCount, price, thumbPath, thumbExt, description) {
    const isActive = btn.classList.contains('active');

    if (isActive) {
        const confirmModal = document.getElementById('confirmModal');
        confirmModal.style.display = 'flex';

        document.getElementById('confirmDelete').onclick = async () => {
            confirmModal.style.display = 'none';
            await removeFavorite({ btn, comicId });
        };

        document.getElementById('cancelDelete').onclick = () => {
            confirmModal.style.display = 'none';
        };
    } else {
        await addFavorite(btn, comicId, title, pageCount, price, thumbPath, thumbExt, description);
    }
}

/**
 * Elimina un cómic de los favoritos del usuario.
 *
 * @async
 * @function removeFavorite
 * @param {Object} params - Los parámetros para eliminar el favorito.
 * @param {HTMLElement} params.btn - El botón de favorito.
 * @param {number} params.comicId - El ID del cómic.
 */
async function removeFavorite({ btn, comicId }) {
    try {
        const response = await fetch(`/remove_favorite/${comicId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            updateAllRelatedButtons(comicId, false);

            const favoriteTab = document.getElementById('favorites-tab');
            const cardToRemove = favoriteTab.querySelector(`.comic-card[data-comic-id="${comicId}"]`);
            if (cardToRemove) {
                cardToRemove.remove();
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Agrega un cómic a los favoritos del usuario.
 *
 * @async
 * @function addFavorite
 * @param {HTMLElement} btn - El botón de favorito.
 * @param {number} comicId - El ID del cómic.
 * @param {string} title - El título del cómic.
 * @param {number} pageCount - El número de páginas del cómic.
 * @param {number} price - El precio del cómic.
 * @param {string} thumbPath - La ruta de la miniatura del cómic.
 * @param {string} thumbExt - La extensión de la miniatura del cómic.
 * @param {string} description - La descripción del cómic.
 */
async function addFavorite(btn, comicId, title, pageCount, price, thumbPath, thumbExt, description) {
    try {
        const response = await fetch(`/add_favorite/${comicId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                pageCount: pageCount,
                price: price,
                thumbnail_path: thumbPath,
                thumbnail_extension: thumbExt,
                description: description 
            })
        });

        if (response.ok) {
            updateAllRelatedButtons(comicId, true);
            
            const favoritesGrid = document.querySelector('#favorites-tab .comics-grid');
            const newCard = createFavoriteCard(comicId, title, pageCount, price, thumbPath, thumbExt, description);
            favoritesGrid.insertAdjacentHTML('beforeend', newCard);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Crea una tarjeta de cómic favorito en formato HTML.
 *
 * @param {number} comicId - El ID del cómic.
 * @param {string} title - El título del cómic.
 * @param {number} pageCount - El número de páginas del cómic.
 * @param {number} price - El precio del cómic.
 * @param {string} thumbPath - La ruta de la miniatura del cómic.
 * @param {string} thumbExt - La extensión de la miniatura del cómic.
 * @param {string} description - La descripción del cómic.
 * @returns {string} El HTML de la tarjeta del cómic favorito.
 */
function createFavoriteCard(comicId, title, pageCount, price, thumbPath, thumbExt, description) {
    const safeDesc = (description || 'No disponible').replace(/'/g, "'").replace(/"/g, '&quot;');
    const safeDesc2 = (description || 'No disponible').replace(/'/g, "\\'").replace(/"/g, '\\"');
    const safeTitle = title.replace(/'/g, "\\'");
    
    return `
        <div class="comic-card" data-comic-id="${comicId}" data-description="${safeDesc}">
            <img src="${thumbPath}/portrait_uncanny.${thumbExt}" 
                 alt="${title}"
                 class="comic-image"
                 loading="lazy">
            <div class="comic-title">
                <h3>${title}</h3>
            </div>
            <div class="comic-hover-info">
                <div class="comic-hover-details">
                    <p><strong>Páginas:</strong> ${pageCount || 'No disponible'}</p>
                    <p><strong>Precio:</strong> ${('$' + price) || 'No disponible'}</p>
                    <button class="favorite-btn active"
                            onclick="handleFavoriteClick(event, this, ${comicId}, '${safeTitle}', 
                                     ${pageCount}, ${price}, 
                                     '${thumbPath}', '${thumbExt}', '${safeDesc2}')">
                        ★ Quitar de favoritos
                    </button>
                </div>
            </div>
        </div>
    `;
}

document.addEventListener('click', (event) => {
    const comicCard = event.target.closest('.comic-card');
    if (comicCard && !event.target.classList.contains('favorite-btn')) {
        const comic = {
            id: comicCard.dataset.comicId,
            title: comicCard.querySelector('.comic-title h3')?.textContent || 'Sin título',
            thumbnail: {
                path: comicCard.querySelector('img').src.split('/portrait_')[0],
                extension: comicCard.querySelector('img').src.split('.').pop()
            },
            pageCount: parseInt(comicCard.querySelector('.comic-hover-details p:first-of-type')?.textContent.split(': ')[1]) || 0,
            prices: [{
                price: parseFloat(comicCard.querySelector('.comic-hover-details p:last-of-type')?.textContent.split('$')[1]) || 0
            }],
            description: comicCard.dataset.description || 'No disponible'
        };

        showComicDetails(comic);
    }
});

/**
 * Muestra los detalles de un cómic en un modal.
 *
 * @param {Object} comic - Los datos del cómic.
 */
function showComicDetails(comic) {
    const modal = document.getElementById('comicModal');
    const modalContent = modal.querySelector('.modal-content');
    const isFavorite = document.querySelector(`.comic-card[data-comic-id="${comic.id}"] .favorite-btn`)?.classList.contains('active');
    const safeDesc = (comic.description || 'No disponible').replace(/['"]/g, "\\'");
    const safeTitle = comic.title.replace(/'/g, "\\'");

    modalContent.innerHTML = `
        <button class="modal-close" onclick="closeModal()">×</button>
        <div class="modal-grid">
            <div class="modal-image">
                <img src="${comic.thumbnail.path}/portrait_uncanny.${comic.thumbnail.extension}" 
                     alt="${comic.title}">
            </div>
            <div class="modal-info">
                <h2>${comic.title}</h2>
                <button class="favorite-btn ${isFavorite ? 'active' : ''}"
                        onclick="handleFavoriteClick(event, this, ${comic.id}, 
                                 '${safeTitle}', 
                                 ${comic.pageCount || 0}, 
                                 ${comic.prices[0]?.price || 0}, 
                                 '${comic.thumbnail.path}', 
                                 '${comic.thumbnail.extension}',
                                 '${safeDesc}')">
                    ${isFavorite ? '★ Quitar de favoritos' : '☆ Agregar a favoritos'}
                </button>
                <div class="modal-details">
                    <p><strong>Páginas:</strong> ${comic.pageCount || 'No disponible'}</p>
                    <p><strong>Precio:</strong> $${comic.prices[0]?.price || 'No disponible'}</p>
                    <p><strong>Descripción:</strong><br>${comic.description || 'No disponible'}</p>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

/**
 * Cierra el modal de detalles del cómic.
 */
function closeModal() {
    const modal = document.getElementById('comicModal');
    modal.style.display = 'none';
}