// map.js

let CONFIG = {};
let PINS = [];
let MAP_VIEWS = [];

const mapContainer = document.getElementById('mapContainer');
const mapWrapper = document.getElementById('mapImageWrapper'); // Holds the Image
const mapImage = document.getElementById('mapImage');
let pinOverlayLayer = null; // Will hold the Pins (Created in JS)

//ui
const zoomSlider = document.getElementById('zoomSlider');
const currentZoomValueLabel = document.getElementById('currentZoomValue');
const pinScaleSlider = document.getElementById('pinScaleSlider');
const pinToggleCheckbox = document.getElementById('pinToggle');
const pinToggleLabel = document.getElementById('pinToggleLabel');
const viewButtonsContainer = document.getElementById('viewButtons');
//popup
const detailModal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalContent');
const detailTitle = document.getElementById('detailTitle');
const detailDescription = document.getElementById('detailDescription');
const detailImage = document.getElementById('detailImage');
const galleryIndicators = document.getElementById('galleryIndicators');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const galleryContainer = document.getElementById('galleryContainer');

let state = {
    scale: 0.5,
    x: 0,
    y: 0,
    isDragging: false,
    hasMoved: false,
};

let pinSettings = {
    customScale: 1.5,
    visible: true
};

let galleryState = { images: [], currentIndex: 0 };
let pinElementsCache = [];
let isRenderScheduled = false;

async function initializeMap() {
    try {
        const response = await fetch('map_data.json');
        if (!response.ok) throw new Error("404");
        const data = await response.json();

        CONFIG = data.CONFIG;
        PINS = data.PINS;
        MAP_VIEWS = data.MAP_VIEWS;

        mapWrapper.style.transition = 'none';
        mapWrapper.classList.remove('transition-transform', 'duration-300', 'transition', 'ease-in-out');

        if (!document.getElementById('pinOverlayLayer')) {
            pinOverlayLayer = document.createElement('div');
            pinOverlayLayer.id = 'pinOverlayLayer';
            mapContainer.appendChild(pinOverlayLayer);
        } else {
            pinOverlayLayer = document.getElementById('pinOverlayLayer');
        }

        mapWrapper.style.width = CONFIG.BASE_WIDTH + 'px';
        mapWrapper.style.height = CONFIG.BASE_HEIGHT + 'px';

        configureUI();

        setupControls();
        renderViewButtons();

        if (MAP_VIEWS.length > 0) mapImage.src = MAP_VIEWS[0].url;

        state.scale = CONFIG.INITIAL_ZOOM;
        pinSettings.customScale = CONFIG.PIN_DEFAULT_SCALE;

        centerMap();
        createPins();
        scheduleRender();
        preloadImages();

        const loading = document.getElementById('loadingViews');
        if(loading) loading.remove();

    } catch (e) {
        console.error("Map Init Error:", e);
    }
}

//set variables from json
function configureUI() {
    if (zoomSlider) {
        zoomSlider.min = CONFIG.MIN_ZOOM;
        zoomSlider.max = CONFIG.MAX_ZOOM;
        zoomSlider.step = CONFIG.ZOOM_STEP;
        zoomSlider.value = CONFIG.INITIAL_ZOOM;
    }

    if (pinScaleSlider) {
        pinScaleSlider.min = CONFIG.PIN_MIN_SCALE;
        pinScaleSlider.max = CONFIG.PIN_MAX_SCALE;
        pinScaleSlider.step = CONFIG.PIN_SCALE_STEP;
        pinScaleSlider.value = CONFIG.PIN_DEFAULT_SCALE;
    }
}

function centerMap() {
    const rect = mapContainer.getBoundingClientRect();
    state.x = (rect.width - (CONFIG.BASE_WIDTH * state.scale)) / 2;
    state.y = (rect.height - (CONFIG.BASE_HEIGHT * state.scale)) / 2;
    scheduleRender();
}

function scheduleRender() {
    if (isRenderScheduled) return;
    isRenderScheduled = true;
    requestAnimationFrame(render);
}

function render() {
    isRenderScheduled = false;


    if (state.scale < CONFIG.MIN_ZOOM) state.scale = CONFIG.MIN_ZOOM;
    if (state.scale > CONFIG.MAX_ZOOM) state.scale = CONFIG.MAX_ZOOM;

    const rect = mapContainer.getBoundingClientRect();
    const mapWidth = CONFIG.BASE_WIDTH * state.scale;
    const mapHeight = CONFIG.BASE_HEIGHT * state.scale;

    //clamping
    if (mapWidth > rect.width) {
        const minX = rect.width - mapWidth;
        const maxX = 0;
        state.x = Math.max(minX, Math.min(maxX, state.x));
    } else {
        state.x = (rect.width - mapWidth) / 2;
    }

    if (mapHeight > rect.height) {
        const minY = rect.height - mapHeight;
        const maxY = 0;
        state.y = Math.max(minY, Math.min(maxY, state.y));
    } else {
        state.y = (rect.height - mapHeight) / 2;
    }

    mapWrapper.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;

    if (pinSettings.visible) {
        const len = pinElementsCache.length;
        for (let i = 0; i < len; i++) {
            const pinObj = pinElementsCache[i];
            const screenX = (pinObj.x * state.scale) + state.x;
            const screenY = (pinObj.y * state.scale) + state.y;
            pinObj.el.style.transform = `translate(-50%, -50%) translate(${screenX}px, ${screenY}px) scale(${pinSettings.customScale})`;
        }
    }

    if (zoomSlider) {
        zoomSlider.value = state.scale;
    }
    if (currentZoomValueLabel) {
        currentZoomValueLabel.textContent = Math.round(state.scale * 100) + '%';
    }
}

//inputs

function setupControls() {

    //mouse wheel to zoom
    mapContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = mapContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const direction = e.deltaY > 0 ? -1 : 1;
        const factor = 0.15;

        let newScale = state.scale * (1 + direction * factor);
        newScale = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, newScale));

        zoomToPoint(newScale, mouseX, mouseY);
    }, { passive: false });

    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;
    let pinchStartDist = 0;
    let pinchStartScale = 1;

    //touch controls
    mapContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            state.isDragging = true;
            state.hasMoved = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            initialX = state.x;
            initialY = state.y;
        } else if (e.touches.length === 2) {
            state.isDragging = false;
            pinchStartDist = getPinchDist(e);
            pinchStartScale = state.scale;
        }
    }, { passive: false });

    mapContainer.addEventListener('touchmove', (e) => {
        e.preventDefault();

        if (e.touches.length === 2) {
            //pinch with touch
            const currDist = getPinchDist(e);
            const scaleFactor = currDist / pinchStartDist;
            const center = getPinchCenter(e);
            const newScale = pinchStartScale * scaleFactor;
            zoomToPoint(newScale, center.x, center.y);

        } else if (e.touches.length === 1 && state.isDragging) {
            //pan with touch
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) state.hasMoved = true;

            state.x = initialX + dx;
            state.y = initialY + dy;
            scheduleRender();
        }
    }, { passive: false });

    const endTouch = () => { state.isDragging = false; };
    mapContainer.addEventListener('touchend', endTouch);
    mapContainer.addEventListener('touchcancel', endTouch);

    //mouse
    mapContainer.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();

        state.isDragging = true;
        state.hasMoved = false;

        startX = e.clientX;
        startY = e.clientY;
        initialX = state.x;
        initialY = state.y;

        mapContainer.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isDragging) return;
        e.preventDefault();

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.hasMoved = true;

        state.x = initialX + dx;
        state.y = initialY + dy;
        scheduleRender();
    });

    window.addEventListener('mouseup', () => {
        state.isDragging = false;
        mapContainer.style.cursor = 'grab';
    });

    zoomSlider.addEventListener('input', (e) => {
        const rect = mapContainer.getBoundingClientRect();
        zoomToPoint(parseFloat(e.target.value), rect.width/2, rect.height/2);
    });

    pinScaleSlider.addEventListener('input', (e) => {
        pinSettings.customScale = parseFloat(e.target.value);
        scheduleRender();
    });

    //smoothing
    const panSmooth = (dx, dy) => {
        const startX = state.x;
        const startY = state.y;
        const targetX = startX + dx;
        const targetY = startY + dy;
        const startTime = performance.now();
        const duration = 300;

        function animate(time) {
            let progress = (time - startTime) / duration;
            if (progress > 1) progress = 1;
            const ease = 1 - Math.pow(1 - progress, 3);
            state.x = startX + (targetX - startX) * ease;
            state.y = startY + (targetY - startY) * ease;
            scheduleRender();
            if (progress < 1) requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
    };

    //pan buttons on page
    document.getElementById('panUp').addEventListener('click', () => panSmooth(0, CONFIG.PAN_AMOUNT));
    document.getElementById('panDown').addEventListener('click', () => panSmooth(0, -CONFIG.PAN_AMOUNT));
    document.getElementById('panLeft').addEventListener('click', () => panSmooth(CONFIG.PAN_AMOUNT, 0));
    document.getElementById('panRight').addEventListener('click', () => panSmooth(-CONFIG.PAN_AMOUNT, 0));

    //popup gallery controls
    prevButton.addEventListener('click', () => cycleImage(-1));
    nextButton.addEventListener('click', () => cycleImage(1));

    pinToggleCheckbox.addEventListener('change', (e) => {
        pinSettings.visible = e.target.checked;
        pinToggleLabel.textContent = e.target.checked ? "Show Pins" : "Hide Pins";
        pinOverlayLayer.style.display = e.target.checked ? 'block' : 'none';
    });

    // Resize Handler
    window.addEventListener('resize', () => {
        scheduleRender();
    });
}

function zoomToPoint(newScale, screenX, screenY) {
    const oldScale = state.scale;
    const worldX = (screenX - state.x) / oldScale;
    const worldY = (screenY - state.y) / oldScale;
    state.scale = newScale;
    state.x = screenX - (worldX * state.scale);
    state.y = screenY - (worldY * state.scale);
    scheduleRender();
}

function getPinchDist(e) {
    return Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
    );
}

function getPinchCenter(e) {
    const rect = mapContainer.getBoundingClientRect();
    return {
        x: ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left,
        y: ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top
    };
}


//pins

function createPins() {
    pinOverlayLayer.innerHTML = '';
    pinElementsCache = [];

    PINS.forEach(pin => {
        const el = document.createElement('div');
        el.className = 'map-pin';
        el.innerHTML = `<img src="${pin.primaryIconUrl}" width="${pin.iconSizeX}" height="${pin.iconSizeY}" alt="${pin.title}">`;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!state.hasMoved) openModal(pin);
        });

        pinOverlayLayer.appendChild(el);
        pinElementsCache.push({ el: el, x: pin.x, y: pin.y });
    });
}

//Popup window when you click on a pin

function openModal(pin) {
    detailTitle.textContent = pin.title;
    detailDescription.textContent = pin.description;

    galleryState.images = (pin.detailImages && pin.detailImages.length)
        ? pin.detailImages.filter(i => i)
        : [pin.primaryIconUrl];

    galleryState.currentIndex = 0;
    updateGalleryUI();

    detailModal.classList.remove('hidden');
    detailModal.classList.add('flex');
    setTimeout(() => {
        modalContent.classList.remove('opacity-0', 'scale-95');
        modalContent.classList.add('opacity-100', 'scale-100');
    }, 10);
}

window.closeModal = function() {
    modalContent.classList.remove('opacity-100', 'scale-100');
    modalContent.classList.add('opacity-0', 'scale-95');
    setTimeout(() => {
        detailModal.classList.remove('flex');
        detailModal.classList.add('hidden');
    }, 300);
};

window.handleModalClick = function(e) {
    if (e.target === detailModal) closeModal();
};

function updateGalleryUI() {
    const url = galleryState.images[galleryState.currentIndex];
    detailImage.src = url;

    if (galleryState.images.length > 1) {
        galleryContainer.classList.remove('hidden');
        prevButton.style.display = 'block';
        nextButton.style.display = 'block';
        galleryIndicators.innerHTML = galleryState.images.map((_, i) =>
            `<div class="w-2 h-2 rounded-full cursor-pointer transition-colors ${i === galleryState.currentIndex ? 'bg-white' : 'bg-gray-600'}" onclick="jumpToImage(${i})"></div>`
        ).join('');
    } else {
        prevButton.style.display = 'none';
        nextButton.style.display = 'none';
        galleryIndicators.innerHTML = '';
    }
}

window.cycleImage = function(dir) {
    let i = galleryState.currentIndex + dir;
    if (i < 0) i = galleryState.images.length - 1;
    if (i >= galleryState.images.length) i = 0;
    galleryState.currentIndex = i;
    updateGalleryUI();
};

window.jumpToImage = function(i) {
    galleryState.currentIndex = i;
    updateGalleryUI();
};


function renderViewButtons() {
    viewButtonsContainer.innerHTML = '';
    MAP_VIEWS.forEach((view, index) => {
        const btn = document.createElement('button');
        btn.className = `w-full text-left px-4 py-2 rounded mb-1 text-sm font-medium transition-colors ${index === 0 ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`;
        btn.textContent = view.name;
        btn.onclick = () => {
            mapImage.src = view.url;
            Array.from(viewButtonsContainer.children).forEach((b, i) => {
                b.className = `w-full text-left px-4 py-2 rounded mb-1 text-sm font-medium transition-colors ${i === index ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`;
            });
        };
        viewButtonsContainer.appendChild(btn);
    });
}

function preloadImages() {
    PINS.forEach(p => {
        if(p.detailImages) p.detailImages.forEach(u => (new Image()).src = u);
    });
}

document.addEventListener('DOMContentLoaded', initializeMap);
