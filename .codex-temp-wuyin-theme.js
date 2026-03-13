
let allApiData = []; // å­å¨ææAPIæ°æ®
let currentPage = 1;
let pageSize = 12; // æ¯é¡µæ¾ç¤ºæ°é
let currentCategory = getCurrentCategoryId() || 'all';
let currentSearch = getCurrentSearch();

$(function () {
    if ($('.popular-apis').length) {
        // æ¾ç¤ºå è½½å¨ç»
        showLoading('#popularApis');
        $.get('/themes/DigitalBlue/api?action=index', function (res) {
            if (res.code == 200) {
                //$("#searchInput").attr("placeholder", res.data.placeholder);

                // æ¸²ææç´¢æ ç­¾
                $.each(res.data.search_tags, function (index, item) {
                    $(".quick-search-tags").append(`<div class="search-tag" data-search="${item}">${item}</div>`);
                });

                // ç»å®æç´¢æ ç­¾ç¹å»äºä»¶
                $(".quick-search-tags .search-tag").click(function () {
                    $("#searchInput").val($(this).data("search"));
                    $(".search-section form").submit();
                });

                // æ¸²æç­é¨æ¥å£
                const $container = $('#popularApis');
                $container.empty();

                $.each(res.data.api_hot_list, function (index, api) {
                    const tagsHtml = $.map(api.tags, function (tag) {
                        let tagClass = '';
                        if (tag === 'åè´¹') tagClass = 'badge badge-success border-0';
                        if (tag === 'ä»è´¹') tagClass = 'badge badge-warning border-0';
                        if (tag === 'å®å') tagClass = 'badge badge-info border-0';
                        if (tag === 'ä¼å') tagClass = 'badge badge-error border-0';
                        return `<span class="api-tag ${tagClass}">${tag}</span>`;
                    }).join('');
                    const icon = api.icon;

                    // æ£æµæ¯å¦æ¯ <i> æ ç­¾
                    let iconClass = '';
                    if (!icon.includes('<i class="') && !icon.startsWith('<i ')) {
                        // å¦æä¸æ¯ <i> æ ç­¾ï¼æ¯å¦æ¯ SVGï¼ï¼æ·»å  Bootstrap 5 çèæ¯å é¤ç±»
                        iconClass = 'bg-transparent';
                    }
                    const apiCard = $(`
        <div class="" data-aos="fade-up">
        <div class="api-card neuro neuro-hover">
            <div class="api-header">
                <div class="api-icon ${iconClass}" style="${iconClass ? 'background: transparent !important;' : ''}">${icon}</div>
                <div class="api-title">
                    <h3 class="text-truncate">${api.name}</h3>
                    <div class="api-tags">${tagsHtml}</div>
                </div>
            </div>
            <div class="api-description text-truncate-3" title="${api.the || 'ææ æè¿°'}">${api.the || 'ææ æè¿°'}</div>
            <div class="api-pricing">
                <div>
                    <div class="api-price ${api.type != 1 ? 'free' : ''}">${api.price || ''}</div>
                    ${api.bonus ? `<div class="api-bonus">${api.bonus}</div>` : ''}
                </div>
                <div class="api-actions">
                    <a href="/doc/${api.id}" class="btn btn-tech btn-api-detail">æ¥çè¯¦æ</a>
                </div>
            </div>
            </div>
        </div>
    `);

                    $container.append(apiCard);
                });

                // æ¸²æåç±»åè¡¨
                const $apicategories = $('#apicategories');
                $apicategories.empty();

                $.each(res.data.api_type_data, function (index, category) {
                    const categoryCard = $(`
            <div class="col-md-6 col-lg-3 mb-4" data-aos="fade-up">
                <div class="category-card neuro neuro-hover">
                    <div class="category-icon">
                        ${category.icon}
                    </div>
                    <h3 class="fs-5 fw-bold mt-3">${category.name}</h3>
                    <div class="text-container"><p class="text-muted small mb-4 text-truncate-4">${category.the}</p></div>
                    <a href="/type/${category.id}" class="btn btn-tech-outline align-self-start">æ¥çæ¥å£</a>
                </div>
            </div>
        `);

                    $apicategories.append(categoryCard);
                });

                // æ¸²ææç« åè¡¨
                // æ¸²æå¬åï¼topåç±»ï¼
                renderAnnouncements(res.data.post_list.top || []);
                // æ¸²æèµè®¯ï¼newsåç±»ï¼
                renderNews(res.data.post_list.news || []);
                // æ¸²æè§£å³æ¹æ¡ï¼decisionåç±»ï¼
                renderSolutions(res.data.post_list.faq_question || []);

            } else {
                showError('#popularApis', res.msg || 'ç½ç»è¯·æ±å¤±è´¥ï¼è¯·æ£æ¥ç½ç»è¿æ¥');
            }

        }).fail(function () {
            // æ¾ç¤ºç½ç»éè¯¯
            showError('#popularApis', 'ç½ç»è¯·æ±å¤±è´¥ï¼è¯·æ£æ¥ç½ç»è¿æ¥');
        });
    }

    if ($('.api-list-section').length) {
        showLoading('#apiGrid');
        if (currentSearch.length > 0) {
            $("#searchInput").val(currentSearch);
        }
        $.get('/themes/DigitalBlue/api?action=api_list', function (res) {
            if (res.code == 200) {
                // å­å¨ææAPIæ°æ®
                allApiData = res.data.api_list || [];

                // æ¸²æåç±»æ ç­¾
                renderCategories(res.data.api_type_data || []);

                // æ¸²æAPIåè¡¨
                renderApiList();

                // æ¸²æåé¡µ
                renderPagination();

                // ç»å®æç´¢äºä»¶
                bindSearchEvent();
            } else {

                showError('#apiGrid', res.msg || 'ç½ç»è¯·æ±å¤±è´¥ï¼è¯·æ£æ¥ç½ç»è¿æ¥');

            }
        }).fail(function () {
            // æ¾ç¤ºç½ç»éè¯¯
            showError('#apiGrid', 'ç½ç»è¯·æ±å¤±è´¥ï¼è¯·æ£æ¥ç½ç»è¿æ¥');
        });

    }
    // å¼æ­¥å è½½AOS
    $.getScript('/themes/DigitalBlue/assets/js/aos-next/dist/aos.js')
        .done(function () {
            // å è½½æåååå§åAOS
            if ($("[data-aos]").length) {
                AOS.init({
                    duration: 800,
                    mirror: true,
                    once: true,
                    offset: 50,
                });
            }
        })
        .fail(function () {
            console.warn('AOSå è½½å¤±è´¥ï¼é¡µé¢å¨ç»å°ä¸å¯ç¨');
        });

    // æ¸ç©ºæç´¢æé®
    const $clearBtn = $('#clearSearch');
    if ($clearBtn.length) {
        const $searchInput = $clearBtn.parent().find('input');

        // æ¸ç©ºæç´¢
        $clearBtn.click(function () {
            $searchInput.val('').focus();
            $(this).css('opacity', '0'); // ä½¿ç¨ opacity èä¸æ¯ class
            $searchInput.trigger('input');
        });

        // æ¾ç¤º/éèæ¸ç©ºæé®
        $searchInput.on('input', function () {
            if ($(this).val().length > 0) {
                $clearBtn.css('opacity', '1'); // æ¾ç¤ºæé®
            } else {
                $clearBtn.css('opacity', '0'); // éèæé®
            }
        });

        // åå§åæ£æ¥
        if ($searchInput.val().length > 0) {
            $clearBtn.css('opacity', '1');
        }
    }

});

$(document).ready(function () {
    // å¯å¨åå§å
    initAll();
    // åå§åå·¥å·æç¤º
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });
});
// åå§åææåè½
function initAll() {
    //initSmoothScroll();
    initBackToTop();
}



// å¹³æ»æ»å¨
function initSmoothScroll() {
    $('a[href^="#"]').on('click', function (e) {
        e.preventDefault();
        const href = $(this).attr('href');

        // æ£æ¥hrefæ¯å¦ææï¼ä¸æ¯åªæ#ï¼
        if (href && href.length > 1) {
            const target = $(href);
            if (target.length) {
                $('html, body').animate({
                    scrollTop: target.offset().top - 80 // åå»å¯¼èªæ é«åº¦
                }, 800);
            }
        }
    });
}

// è¿åé¡¶é¨åè½
function initBackToTop() {
    const $backToTop = $('#backToTop');
    if (!$backToTop.length) return;

    // çå¬æ»å¨äºä»¶ï¼æ¾ç¤º/éèè¿åé¡¶é¨æé®
    $(window).scroll(function () {
        if ($(window).scrollTop() > 300) {
            $backToTop.addClass('show');
        } else {
            $backToTop.removeClass('show');
        }
    });

    // ç¹å»è¿åé¡¶é¨
    $backToTop.on('click', function () {
        $('html, body').animate({
            scrollTop: 0
        }, 200);
    });
}
// ç®åçæ¸è¿å¼æ°å­è®¡æ°å¨
function animateCounter(element, target, duration = 1500) {
    let start = 0;
    const startTime = performance.now();

    function updateCounter(currentTime) {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);

        // ç¼å¨å½æ°ä½¿å¨ç»æ´èªç¶
        const easeOut = 1 - Math.pow(1 - progress, 3);
        let currentValue = start + (target - start) * easeOut;

        // æ ¹æ®ç®æ å¼ç±»åæ ¼å¼åæ¾ç¤º
        if (Number.isInteger(target)) {
            element.textContent = Math.floor(currentValue).toLocaleString();
        } else {
            element.textContent = currentValue.toFixed(2);
        }

        if (progress < 1) {
            requestAnimationFrame(updateCounter);
        } else {
            // ç¡®ä¿æç»æ¾ç¤ºåç¡®å¼
            element.textContent = Number.isInteger(target) ?
                target.toLocaleString() : target.toFixed(2);
        }
    }

    requestAnimationFrame(updateCounter);
}

// åå§åææè®¡æ°å¨
function initCounters() {
    const counters = document.querySelectorAll('.counter');

    counters.forEach(counter => {
        const target = parseFloat(counter.getAttribute('data-target'));
        counter.textContent = '0';

        // æ»å¨è§¦åå¨ç»
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounter(counter, target);
                    observer.unobserve(entry.target);
                }
            });
        });

        observer.observe(counter);
    });
}

// é¡µé¢å è½½å®æååå§å
document.addEventListener('DOMContentLoaded', initCounters);

// éæ°å¼å§å¨ç»å½æ°
function restartCounters() {
    const counters = document.querySelectorAll('.counter');
    counters.forEach(counter => {
        counter.textContent = '0';
    });
    initCounters();
}

// ä¿®å¤ç§»å¨ç«¯å¤çº§èåç¹å»å±å¼é®é¢
document.addEventListener('DOMContentLoaded', function () {
    // åªå¨ç§»å¨ç«¯çæ
    if (window.innerWidth <= 991.98) {
        const dropdownSubmenus = document.querySelectorAll('.dropdown-submenu');

        dropdownSubmenus.forEach(submenu => {
            const toggle = submenu.querySelector('.dropdown-toggle');
            const menu = submenu.querySelector('.dropdown-menu');

            toggle.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                // å³é­å¶ä»å­èå
                dropdownSubmenus.forEach(otherSubmenu => {
                    if (otherSubmenu !== submenu) {
                        const otherMenu = otherSubmenu.querySelector('.dropdown-menu');
                        const otherToggle = otherSubmenu.querySelector('.dropdown-toggle');
                        otherMenu.classList.remove('show');
                        otherToggle.setAttribute('aria-expanded', 'false');
                    }
                });

                // åæ¢å½åå­èå
                const isExpanded = menu.classList.contains('show');
                menu.classList.toggle('show', !isExpanded);
                toggle.setAttribute('aria-expanded', !isExpanded);
            });
        });

        // ç¹å»é¡µé¢å¶ä»åºåå³é­ææå­èå
        document.addEventListener('click', function () {
            dropdownSubmenus.forEach(submenu => {
                const menu = submenu.querySelector('.dropdown-menu');
                const toggle = submenu.querySelector('.dropdown-toggle');
                menu.classList.remove('show');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });
    }
});
// å¨è·åæ°æ®åæ¾ç¤ºå è½½å¨ç»
function showLoading(divIdorClass) {
    const $apiGrid = $(divIdorClass);
    $apiGrid.html(`
        <div class="grid-loading-container" style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; min-height: 200px;">
            <div class="text-center py-5">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">å è½½ä¸­...</span>
                </div>
                <p class="mt-3 text-muted">æ­£å¨å è½½æ°æ®...</p>
            </div>
        </div>
    `);
}

// æ¾ç¤ºéè¯¯ä¿¡æ¯
function showError(divIdorClass, message) {
    const $apiGrid = $(divIdorClass);
    $apiGrid.html(`
        <div class="grid-error-container" style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; min-height: 200px;">
            <div class="text-center py-5">
                <div class="text-danger mb-3">
                    <i class="fas fa-exclamation-triangle fa-3x"></i>
                </div>
                <p class="text-muted">${message}</p>
                <button class="btn btn-tech mt-3" onclick="location.reload()">éæ°å è½½</button>
            </div>
        </div>
    `);
}

// æ¸²æåç±»æ ç­¾
function renderCategories(categories) {
    const $categoryFilter = $('.category-filter');
    $categoryFilter.empty();

    // å­å¨åç±»æ°æ®ä¾åç»­ä½¿ç¨
    window.apiCategories = categories;

    // æ·»å "å¨é¨åç±»"æé®
    // $categoryFilter.append('<button class="category-btn active" data-category="all">å¨é¨</button>');

    $.each(categories, function (index, category) {
        const isActive = category.id == currentCategory;
        const activeClass = isActive ? 'active' : '';

        $categoryFilter.append(`
            <button class="category-btn ${activeClass}" data-category="${category.id}">
                ${category.name}
            </button>
        `);
    });

    // ç»å®åç±»ç¹å»äºä»¶
    $categoryFilter.on('click', '.category-btn', function () {
        const $this = $(this);
        const categoryId = $this.data('category');

        // æ´æ°æ¿æ´»ç¶æ
        $('.category-btn').removeClass('active');
        $this.addClass('active');

        // æ´æ°åç±»æ é¢
        updateSectionTitle(categoryId);

        // æ´æ°å½ååç±»å¹¶éæ°æ¸²æ
        currentCategory = categoryId;
        currentPage = 1; // éç½®å°ç¬¬ä¸é¡µ
        renderApiList();
        renderPagination();
    });

    // åå§åæ¾ç¤ºå¨é¨åç±»æ é¢
    updateSectionTitle(currentCategory);
}
function getCurrentSearch() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('so') || '';
}
// è·åå½ååç±»IDçå½æ°
function getCurrentCategoryId() {
    const path = window.location.pathname;
    const segments = path.split('/');
    const lastSegment = segments[segments.length - 1];

    // å¦ææ¯ 'all' æ 'vip' ç­å­ç¬¦ä¸²ï¼ç´æ¥è¿å
    if (lastSegment === 'all' || lastSegment === 'vip' || lastSegment === 'free') {
        return lastSegment;
    }

    // å°è¯è½¬æ¢ä¸ºæ°å­
    const categoryId = parseInt(lastSegment, 10);
    return isNaN(categoryId) ? null : categoryId;
}
// æ´æ°åç±»æ é¢
function updateSectionTitle(categoryId) {
    const $sectionTitle = $('.api-list-hero-content');

    // æ¥æ¾å¯¹åºçåç±»æ°æ®
    const category = window.apiCategories.find(cat => cat.id == categoryId);
    if (category) {
        const icon = category.icon;
        // æ£æµæ¯å¦æ¯ <i> æ ç­¾
        let iconClass = '';
        if (!icon.includes('<i class="') && !icon.startsWith('<i ')) {
            // å¦æä¸æ¯ <i> æ ç­¾ï¼æ¯å¦æ¯ SVGï¼ï¼æ·»å  Bootstrap 5 çèæ¯å é¤ç±»
            iconClass = 'bg-white';
        }
        $sectionTitle.html(`
                <div class="d-flex flex-column flex-md-row align-items-center text-center text-md-start mb-3">
                    <div class="section-icon mb-4 mb-md-0 me-md-4 p-4 ${iconClass}" style="${iconClass ? 'background: var(--tech-light) !important;' : ''}">
                        ${icon}
                    </div>
                    <div>
                        <h2 class="mb-1 fs-2">${category.name}</h2>
                        <p class="mb-0 text-truncate-2 fs-6">${category.the || 'ææ æè¿°'}</p>
                    </div>
                </div>
            `);
    }
}

// ç»å®æç´¢äºä»¶
function bindSearchEvent() {
    $('#searchInput').on('input', function () {
        currentSearch = $(this).val().trim();
        currentPage = 1; // éç½®å°ç¬¬ä¸é¡µ
        renderApiList();
        renderPagination();
    });
}

// ç­éAPIæ°æ®
function filterApiData() {
    let filteredData = allApiData;

    // æåç±»ç­é
    if (currentCategory == 'vip') {
        filteredData = filteredData.filter(api => api.allvip_on == '1');
    } else if (currentCategory == 'free') {
        filteredData = filteredData.filter(api => api.type == '0');
    } else if (currentCategory !== 'all') {
        filteredData = filteredData.filter(api => api.api_type == currentCategory);
    }
    // ææç´¢å³é®è¯ç­é
    if (currentSearch) {
        const searchLower = currentSearch.toLowerCase();
        filteredData = filteredData.filter(api =>
            (api.name && api.name.toLowerCase().includes(searchLower)) ||
            (api.the && api.the.toLowerCase().includes(searchLower)) ||
            (api.tags && api.tags.some(tag => tag.toLowerCase().includes(searchLower)))
        );
    }

    return filteredData;
}

// æ¸²æAPIåè¡¨
function renderApiList() {
    const $apiGrid = $('#apiGrid');
    $apiGrid.empty();

    const filteredData = filterApiData();
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    // è®¡ç®å½åé¡µçæ°æ®èå´
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const currentPageData = filteredData.slice(startIndex, endIndex);

    if (currentPageData.length === 0) {
        $("#noResults").show();
        return;
    } else {
        $("#noResults").hide();
    }

    // æ¸²æå½åé¡µçAPIå¡ç
    $.each(currentPageData, function (index, api) {
        const tagsHtml = $.map(api.tags || [], function (tag) {
            let tagClass = '';
            if (tag === 'åè´¹') tagClass = 'badge badge-success border-0';
            if (tag === 'ä»è´¹') tagClass = 'badge badge-warning border-0';
            if (tag === 'å®å') tagClass = 'badge badge-info border-0';
            if (tag === 'ä¼å') tagClass = 'badge badge-error border-0';
            return `<span class="api-tag ${tagClass}">${tag}</span>`;
        }).join('');

        const icon = api.icon || '';
        let iconClass = '';
        if (!icon.includes('<i class="') && !icon.startsWith('<i ')) {
            iconClass = 'bg-transparent';
        }

        const apiCard = $(`
            <div class="" data-aos="fade-up">
            <div class="api-card neuro neuro-hover">
                <div class="api-header">
                    <div class="api-icon ${iconClass}" style="${iconClass ? 'background: transparent !important;' : ''}">${icon}</div>
                    <div class="api-title">
                        <h3 class="text-truncate">${api.name || 'æªå½åAPI'}</h3>
                        <div class="api-tags">${tagsHtml}</div>
                    </div>
                </div>
                <div class="api-description text-truncate-3" title="${api.the || 'ææ æè¿°'}">${api.the || 'ææ æè¿°'}</div>
                <div class="api-pricing">
                    <div>
                        <div class="api-price ${api.type != 1 ? 'free' : ''}">${api.price || ''}</div>
                        ${api.bonus ? `<div class="api-bonus">${api.bonus}</div>` : ''}
                    </div>
                    <div class="api-actions">
                        <a href="/doc/${api.id}" class="btn btn-tech-outline btn-api-detail">æ¥çææ¡£</a>
                    </div>
                </div>
                </div>
            </div>
        `);

        $apiGrid.append(apiCard);
    });
}

function renderPagination() {
    const $pagination = $('#pagination');
    $pagination.empty();

    const filteredData = filterApiData();
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    if (totalPages <= 1) {
        return; // åªæä¸é¡µæ¶ä¸æ¾ç¤ºåé¡µ
    }

    // è®¡ç®æ¾ç¤ºçé¡µç èå´ï¼æå¤æ¾ç¤º5ä¸ªé¡µç ï¼
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    // è°æ´èµ·å§é¡µç ï¼ç¡®ä¿æ¾ç¤º5ä¸ªé¡µç 
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    // åå»ºåé¡µå®¹å¨
    const pagination = $('<ul class="pagination justify-content-center"></ul>');

    // é¦é¡µæé® - åªè¦ä¸æ¯å¨ç¬¬ä¸é¡µå°±æ¾ç¤º
    if (currentPage > 1) {
        pagination.append(`
            <li class="page-item">
                <a class="page-link" href="#" data-page="1">
                    é¦é¡µ
                </a>
            </li>
        `);
    }

    // ä¸ä¸é¡µæé®
    if (currentPage > 1) {
        pagination.append(`
            <li class="page-item">
                <a class="page-link" href="#" data-page="${currentPage - 1}">
                    ä¸ä¸é¡µ
                </a>
            </li>
        `);
    }

    // é¡µç æé® - æºè½ååºå¼æ¾ç¤º
    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === currentPage;

        // å¤æ­æ¾ç¤ºé»è¾
        let displayClass = getPageDisplayClass(i, currentPage, startPage, endPage);

        pagination.append(`
        <li class="page-item ${isActive ? 'active' : ''} ${displayClass}">
            <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>
    `);
    }

    function getPageDisplayClass(page, currentPage, startPage, endPage) {
        const totalPages = endPage - startPage + 1;

        // å¦ææ»é¡µæ°å°äºç­äº3ï¼ææé¡µé¢é½æ¾ç¤º
        if (totalPages <= 3) {
            return '';
        }

        // å°å±å¹é»è¾ï¼æå¤æ¾ç¤º3ä¸ªï¼
        if (window.innerWidth < 768) {
            // å§ç»æ¾ç¤ºçé¡µé¢ï¼å½åé¡µãç¬¬ä¸é¡µãæåä¸é¡µ
            if (page === currentPage || page === startPage || page === endPage) {
                return '';
            }

            // å¦æå½åé¡µæ¯ç¬¬ä¸é¡µï¼æ¾ç¤ºç¬¬2é¡µ
            if (currentPage === startPage && page === startPage + 1) {
                return '';
            }

            // å¦æå½åé¡µæ¯æåä¸é¡µï¼æ¾ç¤ºåæ°ç¬¬2é¡µ
            if (currentPage === endPage && page === endPage - 1) {
                return '';
            }

            // å¶ä»æåµéè
            return 'd-none d-md-block';
        }

        // å¤§å±å¹æ¾ç¤ºææè®¡ç®èå´åçé¡µç ï¼æå¤5ä¸ªï¼
        return '';
    }

    // ä¸ä¸é¡µæé®
    if (currentPage < totalPages) {
        pagination.append(`
            <li class="page-item">
                <a class="page-link" href="#" data-page="${currentPage + 1}">
                    ä¸ä¸é¡µ
                </a>
            </li>
        `);
    }

    // å°¾é¡µæé® - åªè¦ä¸æ¯å¨æåä¸é¡µå°±æ¾ç¤º
    if (currentPage < totalPages) {
        pagination.append(`
            <li class="page-item">
                <a class="page-link" href="#" data-page="${totalPages}">
                    å°¾é¡µ
                </a>
            </li>
        `);
    }

    $pagination.append(pagination);

    // ç»å®åé¡µç¹å»äºä»¶
    $pagination.on('click', '.page-link', function (e) {
        e.preventDefault();
        const page = parseInt($(this).data('page'));
        if (page !== currentPage) {
            currentPage = page;
            renderApiList();
            renderPagination();

            // æ»å¨å°é¡¶é¨
            $('html, body').animate({ scrollTop: $('#apiGrid').offset().top - 100 }, 300);
        }
    });
}
/**
 * æ¸²æå¬ååè¡¨å°æå®å®¹å¨
 * @param {Array<Object>} articles - å¬åæç« æ°ç»ï¼æ¯ä¸ªåç´ åå«ä»¥ä¸å±æ§ï¼
 *   @property {string} post_date - æç« åå¸æ¥æ
 *   @property {string} path - æç« è·¯å¾
 *   @property {string} id - æç« ID
 *   @property {string} post_title - æç« æ é¢
 *   @property {string} post_excerpt - æç« æè¦
 * @returns {void}
 */
function renderAnnouncements(articles) {
    const $content = $('#articles .col-lg-4:eq(0) .info-content');
    $content.empty();

    articles.forEach(article => {
        const date = formatDateForAnnouncement(article.post_date);
        const html = `
            <div class="announcement-item">
                <div class="announcement-date">
                    <div class="announcement-day">${date.day}</div>
                    <div class="announcement-month">${date.month}</div>
                </div>
                <div class="announcement-content">
                    <a href="/blog/${article.path}/${article.id}.html" class="announcement-title">${article.post_title}</a>
                    <div class="announcement-excerpt text-truncate-2">${article.post_excerpt}</div>
                </div>
            </div>
        `;
        $content.append(html);
        $('#articles .col-lg-4:eq(0) .info-footer a').attr('href', '/blog/' + article.path);
    });

}

/**
 * æ¸²ææ°é»æç« åè¡¨å°æå®å®¹å¨
 * @param {Array<Object>} articles - æ°é»æç« æ°ç»ï¼æ¯ç¯æç« åå«ä»¥ä¸å±æ§ï¼
 *   @param {string} img - æç« ç¼©ç¥å¾URL
 *   @param {string} post_title - æç« æ é¢
 *   @param {string} path - æç« è·¯å¾
 *   @param {number} id - æç« ID
 *   @param {string} post_date - æç« åå¸æ¥æ
 *   @param {number} post_pv - æç« æµè§é
 */
function renderNews(articles) {
    const $content = $('#articles .col-lg-4:eq(1) .info-content');
    $content.empty();

    articles.forEach(article => {
        const html = `
            <div class="news-item">
                <div class="news-thumbnail">
                    <img src="${article.img}" alt="${article.post_title}" onerror="this.src='/themes/DigitalBlue/assets/image/default.png'">
                </div>
                <div class="news-content">
                    <a href="/blog/${article.path}/${article.id}.html" class="news-title text-truncate-2">${article.post_title}</a>
                    <div class="news-meta">
                        <span><i class="far fa-calendar"></i> ${article.post_date}</span>
                        <span><i class="far fa-eye"></i> ${formatViewCount(article.post_pv)}</span>
                    </div>
                </div>
            </div>
        `;
        $content.append(html);
        $('#articles .col-lg-4:eq(1) .info-footer a').attr('href', '/blog/' + article.path);
    });
}

/**
 * æ¸²æè§£å³æ¹æ¡æç« åè¡¨å°æå®å®¹å¨
 * @param {Object[]} articles - æç« å¯¹è±¡æ°ç»
 * @param {string} articles[].img - æç« ç¼©ç¥å¾URL
 * @param {string} articles[].post_title - æç« æ é¢
 * @param {string} articles[].path - æç« è·¯å¾
 * @param {string} articles[].id - æç« ID
 * @param {string} articles[].post_date - æç« åå¸æ¥æ
 * @param {number} articles[].post_pv - æç« æµè§é
 */
function renderSolutions(articles) {
    const $content = $('#articles .col-lg-4:eq(2) .info-content');
    $content.empty();

    articles.forEach(article => {
        const html = `
            <div class="index-faq-item">
                <div class="index-faq-question">
                    <i class="fas fa-question"></i>
                    <a href="/help/?type=${article.help_type}" class="faq-link text-truncate">${article.post_title}</a>
                </div>
                <div class="index-faq-answer text-truncate-2">
                    ${article.post_content}
                </div>
            </div>
        `;
        $content.append(html);
        $('#articles .col-lg-4:eq(2) .info-footer a').attr('href', '/help/');
    });
}

// å·¥å·å½æ°ï¼æ ¼å¼åæ¥æä¸ºå¬åæ ·å¼
function formatDateForAnnouncement(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;

    const monthNames = ['1æ', '2æ', '3æ', '4æ', '5æ', '6æ', '7æ', '8æ', '9æ', '10æ', '11æ', '12æ'];

    return {
        day: day.toString().padStart(2, '0'),
        month: monthNames[month - 1]
    };
}
// å·¥å·å½æ°ï¼æ ¼å¼åæµè§é
function formatViewCount(count) {
    const num = parseInt(count);
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}
// FAQåæ¢åè½
function toggleFaq(element) {
    const faqItem = element.closest('.faq-item');
    faqItem.classList.toggle('active');
}
// å¨å±å¤å¶æé®
$('.btn-copy').click(function () {
    var $btn = $(this);
    var originalText = $btn.html();
    var text = $btn.attr('data-copy') || $btn.text();

    // ä½¿ç¨ç°ä»£Clipboard API
    navigator.clipboard.writeText(text).then(function () {
        // å¤å¶æå
        $btn.html('<i class="fas fa-check-circle me-2"></i>å¤å¶æå');
        $btn.addClass('btn-copy-success');

        // 2ç§åæ¢å¤åç¶
        setTimeout(function () {
            $btn.html(originalText);
            $btn.removeClass('btn-copy-success');
        }, 2000);

    }).catch(function (err) {
        // å¦æClipboard APIå¤±è´¥ï¼ä½¿ç¨å¤ç¨æ¹æ³
        fallbackCopyText(text);
        $btn.html('<i class="fas fa-check-circle me-2"></i>å¤å¶æå');
        $btn.addClass('btn-copy-success');

        setTimeout(function () {
            $btn.html(originalText);
            $btn.removeClass('btn-copy-success');
        }, 2000);
    });
});

// å¤ç¨å¤å¶æ¹æ³
function fallbackCopyText(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        document.execCommand('copy');
    } catch (err) {
        console.error('å¤å¶å¤±è´¥:', err);
    }

    document.body.removeChild(textArea);
}
