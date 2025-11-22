let CONFIG = {};
let PINS = [];
let MAP_VIEWS = [];

let currentPinGallery = [];
let currentImageIndex = 0;

const mapContainer = document.getElementById('mapContainer');
const mapWrapper = document.getElementById('mapImageWrapper');
const mapImage = document.getElementById('mapImage');
const mapViewportWrapper = document.getElementById('mapViewportWrapper');
const detailModal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalContent');
const viewButtonsContainer = document.getElementById('viewButtons');
const zoomSlider = document.getElementById('zoomSlider');
const pinScaleSlider = document.getElementById('pinScaleSlider');
const pinToggleCheckbox = document.getElementById('pinToggle');
const pinToggleLabel = document.getElementById('pinToggleLabel'); // Added label reference

const controlButtons = [
    zoomSlider,
    pinScaleSlider,
    pinToggleCheckbox,
    document.getElementById('panUp'),
    document.getElementById('panDown'),
    document.getElementById('panLeft'),
    document.getElementById('panRight')
];

const detailTitle = document.getElementById('detailTitle');
const detailImage = document.getElementById('detailImage');
const imageCaption = document.getElementById('imageCaption');
const galleryIndicators = document.getElementById('galleryIndicators');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const galleryContainer = document.getElementById('galleryContainer');
const detailDescription = document.getElementById('detailDescription');


let currentZoom = 1.0;
let pinCustomScale = 1.0;

let isDown = false;
let isDragging = false; // Flag to check if movement exceeded threshold
const DRAG_THRESHOLD = 5; // Movement threshold in pixels
let startX;
let startY;
let scrollLeft;
let scrollTop;


/**
 * map viewport
 */

/* Touch Support */
let touchStartDistance = 0;
let initialZoom = 1;
let touchDragging = false;
let lastTouchX = 0;
let lastTouchY = 0;

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
}

// pinch drag
mapContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        touchDragging = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
    }

    if (e.touches.length === 2) {
        touchDragging = false;
        touchStartDistance = getTouchDistance(e.touches);
        initialZoom = currentZoom;
    }

    e.preventDefault();
}, { passive: false });

mapContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && touchDragging) {
        const dx = e.touches[0].clientX - lastTouchX;
        const dy = e.touches[0].clientY - lastTouchY;

        translateX += dx;
        translateY += dy;

        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;

        applyTransforms();
    }

    if (e.touches.length === 2) {
        const newDist = getTouchDistance(e.touches);
        const scaleChange = newDist / touchStartDistance;

        let newZoom = initialZoom * scaleChange;

        newZoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, newZoom));

        currentZoom = newZoom;
        zoomSlider.value = newZoom;
        applyTransforms();
    }

    e.preventDefault();
}, { passive: false });

mapContainer.addEventListener('touchend', () => {
    touchDragging = false;
});


function calculateSquareSize() {
    if (!mapViewportWrapper || !mapContainer || !CONFIG.BASE_WIDTH) return;

    const availableWidth = mapViewportWrapper.clientWidth;
    const availableHeight = mapViewportWrapper.clientHeight;
    const size = Math.min(availableWidth, availableHeight);

    mapContainer.style.width = `${size}px`;
    mapContainer.style.height = `${size}px`;

    applyZoom(true, parseFloat(zoomSlider.value));
}


function applyZoom(recenterViewAfterZoom = false, newSliderValue = null) {
    if (!CONFIG.BASE_WIDTH) return;

    const newWidth = CONFIG.BASE_WIDTH * currentZoom;
    const newHeight = CONFIG.BASE_HEIGHT * currentZoom;

    mapWrapper.style.width = `${newWidth}px`;
    mapWrapper.style.height = `${newHeight}px`;
    mapWrapper.style.transform = '';

    const pinFinalScale = pinCustomScale;
    const pins = document.querySelectorAll('.map-pin');

    pins.forEach(pinElement => {
        const pinX = parseFloat(pinElement.getAttribute('data-pin-x'));
        const pinY = parseFloat(pinElement.getAttribute('data-pin-y'));

        pinElement.style.left = `${pinX * currentZoom}px`;
        pinElement.style.top = `${pinY * currentZoom}px`;


        pinElement.style.transform = `translate(-50%, -50%) scale(${pinFinalScale})`;
    });

    const mapContainerWidth = mapContainer.clientWidth;
    const mapContainerHeight = mapContainer.clientHeight;

    let leftOffset = 0;
    let topOffset = 0;
    let newScrollX = mapContainer.scrollLeft;
    let newScrollY = mapContainer.scrollTop;

    if (newWidth < mapContainerWidth) {
        leftOffset = (mapContainerWidth - newWidth) / 2;
        newScrollX = 0;
    } else if (recenterViewAfterZoom) {
        newScrollX = (newWidth - mapContainerWidth) / 2;
    }

    if (newHeight < mapContainerHeight) {
        topOffset = (mapContainerHeight - newHeight) / 2;
        newScrollY = 0;
    } else if (recenterViewAfterZoom) {
        newScrollY = (newHeight - mapContainerHeight) / 2;
    }

    mapWrapper.style.marginLeft = `${leftOffset}px`;
    mapWrapper.style.marginTop = `${topOffset}px`;

    mapContainer.scrollLeft = newScrollX;
    mapContainer.scrollTop = newScrollY;

    if (newSliderValue !== null) {
        zoomSlider.value = newSliderValue;
    }
}


function getEventPoint(e) {
    if (e.touches && e.touches.length > 0) {
        return { pageX: e.touches[0].pageX, pageY: e.touches[0].pageY };
    }
    return { pageX: e.pageX, pageY: e.pageY };
}

//Drag Start

function startDrag(e) {
    if (e.target.closest('#detailModal') || e.target.closest('#mapControls')) return;

    const point = getEventPoint(e);
    isDown = true;
    isDragging = false; // Reset drag state on press
    mapContainer.classList.add('dragging');

    startX = point.pageX;
    startY = point.pageY;
    scrollLeft = mapContainer.scrollLeft;
    scrollTop = mapContainer.scrollTop;

    if (e.type === 'touchstart' || e.type === 'mousedown') {
         e.preventDefault();
    }
}

//Drag Move
function moveDrag(e) {
    if (!isDown) return;
    e.preventDefault();

    const point = getEventPoint(e);

    const distMovedX = point.pageX - startX;
    const distMovedY = point.pageY - startY;

    if (Math.abs(distMovedX) > DRAG_THRESHOLD || Math.abs(distMovedY) > DRAG_THRESHOLD) {
        isDragging = true;
    }

    if (isDragging) {
        // (1:1 movement for cursor sticking)
        mapContainer.scrollLeft = scrollLeft - distMovedX;
        mapContainer.scrollTop = scrollTop - distMovedY;
    }
}

//Drag End.

function endDrag() {
    isDown = false;
    mapContainer.classList.remove('dragging');
}


function handleWheelZoom(e) {
    if (!CONFIG.ZOOM_STEP) return;
    e.preventDefault();

    const isZoomIn = e.deltaY < 0;

    const oldSliderVal = parseFloat(zoomSlider.value);
    let newSliderVal = oldSliderVal + (isZoomIn ? CONFIG.ZOOM_STEP : -CONFIG.ZOOM_STEP);

    const Z_min = CONFIG.MIN_ZOOM;
    const Z_max = CONFIG.MAX_ZOOM;

    newSliderVal = Math.max(Z_min, Math.min(Z_max, newSliderVal));

    if (newSliderVal === oldSliderVal) return;

    const Range = Z_max - Z_min;
    const P = (newSliderVal - Z_min) / Range;
    const P_curved = Math.pow(P, 2);
    const newZoom = Z_min + (P_curved * Range);

    const oldZoom = currentZoom;
    currentZoom = newZoom;

    const rect = mapContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const preZoomScrollX = mapContainer.scrollLeft;
    const preZoomScrollY = mapContainer.scrollTop;

    const marginX = parseFloat(mapWrapper.style.marginLeft || 0);
    const marginY = parseFloat(mapWrapper.style.marginTop || 0);

    const mapPointX = (mouseX + preZoomScrollX) - marginX;
    const mapPointY = (mouseY + preZoomScrollY) - marginY;

    applyZoom(false, newSliderVal);

    const zoomRatio = currentZoom / oldZoom;

    const newScrollX = (mapPointX * zoomRatio) + marginX - mouseX;
    const newScrollY = (mapPointY * zoomRatio) + marginY - mouseY;

    mapContainer.scrollLeft = newScrollX;
    mapContainer.scrollTop = newScrollY;
}

window.handleZoomSlider = function(value) {
    const Z_linear = parseFloat(value);
    const Z_min = CONFIG.MIN_ZOOM;
    const Z_max = CONFIG.MAX_ZOOM;
    const Range = Z_max - Z_min;

    const P = (Z_linear - Z_min) / Range;
    const P_curved = Math.pow(P, 2);

    currentZoom = Z_min + (P_curved * Range);

    applyZoom(true, Z_linear);
}

window.handlePinScaleSlider = function(value) {
    pinCustomScale = parseFloat(value);
    applyZoom(false, null);
}

window.panMap = function(direction) {
    if (!CONFIG.PAN_AMOUNT) return;
    const scrollBehavior = { behavior: 'smooth' };
    const panDistance = CONFIG.PAN_AMOUNT;

    switch(direction) {
        case 'up':
            mapContainer.scrollBy({ top: -panDistance, ...scrollBehavior });
            break;
        case 'down':
            mapContainer.scrollBy({ top: panDistance, ...scrollBehavior });
            break;
        case 'left':
            mapContainer.scrollBy({ left: -panDistance, ...scrollBehavior });
            break;
        case 'right':
            mapContainer.scrollBy({ left: panDistance, ...scrollBehavior });
            break;
    }
}

function preloadImages() {
    const imagesToPreload = new Set();

    PINS.forEach(pin => {
        if (pin.detailImages && Array.isArray(pin.detailImages)) {
            pin.detailImages.forEach(url => imagesToPreload.add(url));
        }
    });

    imagesToPreload.forEach(url => {
        const img = new Image();
        img.src = url;
    });
}

// PINS

function renderPins() {
    const existingPins = mapWrapper.querySelectorAll('.map-pin');
    existingPins.forEach(p => p.remove());

    const isChecked = pinToggleCheckbox.checked; // Get initial state once
    const pinFragment = document.createDocumentFragment();

    PINS.forEach(pin => {
        const pinElement = document.createElement('div');
        //  transition
        pinElement.className = 'map-pin absolute transition-opacity duration-300';
        pinElement.setAttribute('data-pin-id', pin.id);
        pinElement.setAttribute('data-pin-x', pin.x);
        pinElement.setAttribute('data-pin-y', pin.y);

        // ANIMATION
        pinElement.style.transformOrigin = '50% 50%';
        pinElement.style.opacity = isChecked ? 1 : 0;
        pinElement.style.pointerEvents = isChecked ? 'auto' : 'none';
        pinElement.style.display = isChecked ? 'flex' : 'none';


        // use pin.primaryIconUrl as the source
        pinElement.innerHTML = `
            <img src="${pin.primaryIconUrl}"
                 alt="${pin.title}"
                 style="width: ${pin.iconSizeX}px; height: ${pin.iconSizeY}px; pointer-events: none;"
                 onerror="this.src=''"
                 draggable="false"
            >
        `;


        let touchMoved = false;

        pinElement.addEventListener('touchstart', () => {
            touchMoved = false;
        }, { passive: true });

        pinElement.addEventListener('touchmove', () => {
            touchMoved = true;
        }, { passive: true });

        pinElement.addEventListener('touchend', (e) => {
            e.stopPropagation();
            if (!touchMoved) showDetail(pin);
        }, { passive: true });

        pinElement.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isDragging) showDetail(pin);
        });

        pinFragment.appendChild(pinElement);
    });
    mapWrapper.appendChild(pinFragment);
    applyZoom(false, parseFloat(zoomSlider.value));
}



function renderViewButtons() {
    viewButtonsContainer.innerHTML = '';
    MAP_VIEWS.forEach((view, index) => {
        const button = document.createElement('button');
        const activeClass = index === 0 ? 'bg-primary hover:bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600';

        button.className = `w-full text-sm font-medium py-2 px-3 rounded-md transition duration-150 ${activeClass}`;
        button.textContent = view.name;
        button.addEventListener('click', () => changeMapView(index));
        viewButtonsContainer.appendChild(button);
    });
}

window.changeMapView = function(index) {
    if (!MAP_VIEWS.length) return;
    const view = MAP_VIEWS[index];
    mapImage.src = view.url;
    mapImage.alt = view.name;

    viewButtonsContainer.querySelectorAll('button').forEach((btn, i) => {
        btn.classList.remove('bg-primary', 'hover:bg-indigo-600');
        btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
        if (i === index) {
            btn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
            btn.classList.add('bg-primary', 'hover:bg-indigo-600');
        }
    });
}

function enableControls() {
    controlButtons.forEach(btn => btn.disabled = false);
    viewButtonsContainer.querySelectorAll('button').forEach(btn => btn.disabled = false);
}

//window
window.closeModal = function() {
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        detailModal.classList.add('hidden');
        detailModal.classList.remove('flex');
    }, 300);
}

window.handleModalClick = function(event) {
    if (event.target === detailModal) {
        closeModal();
    }
}
function showDetail(pin) {
    detailTitle.textContent = pin.title;
    detailDescription.textContent = pin.description;

    const iconUrls = [];
    if (pin.primaryIconUrl) {
        iconUrls.push(pin.primaryIconUrl);
    }
    if (pin.additionalIcons && Array.isArray(pin.additionalIcons)) {
        iconUrls.push(...pin.additionalIcons);
    }

    if (pin.detailImages && Array.isArray(pin.detailImages) && pin.detailImages.length > 0) {
        currentPinGallery = pin.detailImages.map(url => ({
            url: url,
            //allows multiple "caption" images
            caption: iconUrls
        }));
    } else {
        currentPinGallery = [];
    }

    currentImageIndex = 0;
    updateGallery();

    detailModal.classList.remove('hidden');
    detailModal.classList.add('flex');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function updateGallery() {
    if (currentPinGallery.length > 0) {
        galleryContainer.classList.remove('hidden');
        const currentImage = currentPinGallery[currentImageIndex];

        detailImage.src = currentImage.url;
        detailImage.alt = 'Gallery Image';

        imageCaption.innerHTML = '';
        const iconUrls = currentImage.caption;

        if (Array.isArray(iconUrls) && iconUrls.length > 0) {
            let html = '';
            iconUrls.forEach(url => {
                html += `<img src="${url}" alt="Pin Icon" class="h-6 w-auto mx-1">`;
            });
            imageCaption.innerHTML = html;
        } else {
             imageCaption.innerHTML = '';
        }

        const isSingleImage = currentPinGallery.length <= 1;
        prevButton.disabled = isSingleImage || currentImageIndex === 0;
        nextButton.disabled = isSingleImage || currentImageIndex === currentPinGallery.length - 1;

        prevButton.style.display = isSingleImage ? 'none' : 'block';
        nextButton.style.display = isSingleImage ? 'none' : 'block';
        galleryIndicators.style.display = isSingleImage ? 'none' : 'flex';

        galleryIndicators.innerHTML = currentPinGallery.map((_, i) =>
            `<span class="h-2 w-2 rounded-full cursor-pointer gallery-indicator ${i === currentImageIndex ? 'bg-secondary' : 'bg-gray-600 hover:bg-gray-500'}" data-index="${i}"></span>`
        ).join('');

    } else {
        galleryContainer.classList.add('hidden');
        imageCaption.innerHTML = '<p class="text-xs text-gray-400">This location currently has no detail images.</p>';
    }
}

window.setCurrentGalleryIndex = function(index) {
    currentImageIndex = index;
    updateGallery();
}

window.cycleImage = function(direction) {
    const newIndex = currentImageIndex + direction;
    if (newIndex >= 0 && newIndex < currentPinGallery.length) {
        currentImageIndex = newIndex;
        updateGallery();
    }
}

function attachEventListeners() {
    //Drag and Zoom
    mapContainer.addEventListener('mousedown', startDrag);
    mapContainer.addEventListener('mousemove', moveDrag);
    mapContainer.addEventListener('mouseup', endDrag);
    mapContainer.addEventListener('mouseleave', endDrag);
    mapContainer.addEventListener('touchstart', startDrag);
    mapContainer.addEventListener('touchmove', moveDrag);
    mapContainer.addEventListener('touchend', endDrag);
    mapContainer.addEventListener('touchcancel', endDrag);
    mapContainer.addEventListener('wheel', handleWheelZoom);


    zoomSlider.addEventListener('input', (e) => handleZoomSlider(e.target.value));
    pinScaleSlider.addEventListener('input', (e) => handlePinScaleSlider(e.target.value));

    //pan buttons
    document.getElementById('panUp').addEventListener('click', () => panMap('up'));
    document.getElementById('panDown').addEventListener('click', () => panMap('down'));
    document.getElementById('panLeft').addEventListener('click', () => panMap('left'));
    document.getElementById('panRight').addEventListener('click', () => panMap('right'));

    // window background and close
    detailModal.addEventListener('click', handleModalClick);
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });

    // window pop-up image cycling
    prevButton.addEventListener('click', () => cycleImage(-1));
    nextButton.addEventListener('click', () => cycleImage(1));
    galleryIndicators.addEventListener('click', (e) => {
        const indicator = e.target.closest('.gallery-indicator');
        if (indicator) {
            const index = parseInt(indicator.getAttribute('data-index'), 10);
            setCurrentGalleryIndex(index);
        }
    });

    //other stuff

    pinToggleCheckbox.addEventListener('change', handlePinToggle);
    window.addEventListener('resize', calculateSquareSize);

    //keyboard panning
    window.addEventListener('keydown', handleKeyPan);
}

//Toggle Pin Button
function handlePinToggle() {
    const isChecked = pinToggleCheckbox.checked;
    const pinElements = document.querySelectorAll('.map-pin');

    pinToggleLabel.textContent = isChecked ? 'Show Pins' : 'Hide Pins';    //defualt text

    pinElements.forEach(pin => {
        if (isChecked) {

            pin.style.display = 'flex';
            setTimeout(() => {
                pin.style.opacity = 1;
                pin.style.pointerEvents = 'auto';
            }, 10);
        } else {
            pin.style.opacity = 0;
            pin.style.pointerEvents = 'none';

            setTimeout(() => {
                if (pin.style.opacity === '0') {
                    pin.style.display = 'none';
                }
            }, 200); // speed for transition in ms
        }
    });
}


//panning
window.handleKeyPan = function(e) {
    if (detailModal.classList.contains('flex') || e.target.tagName === 'INPUT') return;

    let direction = null;

    switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
            direction = 'up';
            break;
        case 's':
        case 'arrowdown':
            direction = 'down';
            break;
        case 'a':
        case 'arrowleft':
            direction = 'left';
            break;
        case 'd':
        case 'arrowright':
            direction = 'right';
            break;
    }

    if (direction) {
        e.preventDefault(); //stop default browser scroll behavior
        panMap(direction);
    }
}



//initializeMap
async function initializeMap() {
    try {
        const response = await fetch('map_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const mapData = await response.json();

        CONFIG = mapData.CONFIG;
        PINS = mapData.PINS;
        MAP_VIEWS = mapData.MAP_VIEWS;

        preloadImages();

        const loadingViews = document.getElementById('loadingViews');
        if (loadingViews) loadingViews.remove();

    } catch (error) {
        console.error("Failed to load map data from map_data.json:", error);
        mapImage.src = '';
        mapViewportWrapper.innerHTML += '<p class="absolute inset-0 flex items-center justify-center text-red-400 bg-gray-900 bg-opacity-70 z-20 rounded-xl">Error loading map data. Please ensure map_data.json exists.</p>';
        controlButtons.forEach(btn => btn.disabled = true);
        viewButtonsContainer.innerHTML = '<p class="text-xs text-red-400">Data load failed.</p>';
        return;
    }

    if (MAP_VIEWS.length > 0) {
        mapImage.src = MAP_VIEWS[0].url;
        mapImage.alt = MAP_VIEWS[0].name;
    } else {
         mapImage.src = '';
    }

    zoomSlider.min = CONFIG.MIN_ZOOM;
    zoomSlider.max = CONFIG.MAX_ZOOM;
    zoomSlider.step = CONFIG.ZOOM_STEP;

    pinScaleSlider.min = CONFIG.PIN_MIN_SCALE;
    pinScaleSlider.max = CONFIG.PIN_MAX_SCALE;

    pinCustomScale = CONFIG.PIN_DEFAULT_SCALE;
    pinScaleSlider.value = pinCustomScale;

    const initialSliderValue = CONFIG.INITIAL_ZOOM;
    zoomSlider.value = initialSliderValue;

    const Z_min = CONFIG.MIN_ZOOM;
    const Z_max = CONFIG.MAX_ZOOM;
    const Range = Z_max - Z_min;
    const P = (initialSliderValue - Z_min) / Range;
    const P_curved = Math.pow(P, 2);
    currentZoom = Z_min + (P_curved * Range);

    renderPins();
    renderViewButtons();
    calculateSquareSize();

    attachEventListeners();
    enableControls();

    pinToggleCheckbox.checked = true; //checkbox is true on reload
    pinToggleLabel.textContent = 'Show Pins';

    console.log("Map Initialized successfully.");
}


document.addEventListener('DOMContentLoaded', initializeMap);
