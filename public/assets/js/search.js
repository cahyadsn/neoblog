/**
 * Live Instant Search (Vanilla JavaScript ES6+)
 * Zero dependencies, debounced fetch, keyboard accessibility (Ctrl+K, Esc, Arrow navigation)
 */

(function () {
    'use strict';

    let searchModal = null;
    let searchInput = null;
    let resultsContainer = null;
    let debounceTimer = null;
    let selectedIndex = -1;
    let currentResults = [];

    function initSearch() {
        searchModal = document.getElementById('searchModal');
        if (!searchModal) return;

        searchInput = document.getElementById('searchInput');
        resultsContainer = document.getElementById('searchResults');
        const openBtn = document.getElementById('searchOpenBtn');
        const closeBtn = document.getElementById('searchCloseBtn');

        if (openBtn) {
            openBtn.addEventListener('click', openModal);
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        // Klik di area backdrop luar dialog untuk menutup
        searchModal.addEventListener('click', function (e) {
            if (e.target === searchModal) {
                closeModal();
            }
        });

        // Global Keyboard Shortcut: Ctrl+K / Cmd+K / Esc
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (isModalOpen()) {
                    closeModal();
                } else {
                    openModal();
                }
            } else if (e.key === 'Escape' && isModalOpen()) {
                e.preventDefault();
                closeModal();
            }
        });

        if (searchInput) {
            searchInput.addEventListener('input', function () {
                const query = this.value.trim();
                clearTimeout(debounceTimer);
                if (query.length === 0) {
                    renderEmptyMessage('Ketik kata kunci untuk mulai mencari artikel...');
                    currentResults = [];
                    selectedIndex = -1;
                    return;
                }

                renderLoading();
                debounceTimer = setTimeout(() => {
                    performSearch(query);
                }, 250); // 250ms debouncing
            });

            // Navigasi panah atas/bawah & Enter
            searchInput.addEventListener('keydown', function (e) {
                if (currentResults.length === 0) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedIndex = (selectedIndex + 1) % currentResults.length;
                    updateSelection();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
                    updateSelection();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (selectedIndex >= 0 && selectedIndex < currentResults.length) {
                        const target = currentResults[selectedIndex];
                        if (target && target.slug) {
                            window.location.href = '/post/' + encodeURIComponent(target.slug);
                        }
                    }
                }
            });
        }
    }

    function isModalOpen() {
        return searchModal && searchModal.classList.contains('active');
    }

    function openModal() {
        if (!searchModal) return;
        searchModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (searchInput) {
            searchInput.value = '';
            renderEmptyMessage('Ketik kata kunci untuk mencari artikel...');
            setTimeout(() => searchInput.focus(), 50);
        }
        selectedIndex = -1;
        currentResults = [];
    }

    function closeModal() {
        if (!searchModal) return;
        searchModal.classList.remove('active');
        document.body.style.overflow = '';
        selectedIndex = -1;
        currentResults = [];
    }

    function renderLoading() {
        if (!resultsContainer) return;
        resultsContainer.innerHTML = '<div class="search-loading-state">🔍 Mencari artikel relevan...</div>';
    }

    function renderEmptyMessage(message) {
        if (!resultsContainer) return;
        resultsContainer.innerHTML = `<div class="search-empty-state">${escapeHtmlText(message)}</div>`;
    }

    async function performSearch(query) {
        try {
            const res = await fetch('/api/search?q=' + encodeURIComponent(query));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
                renderEmptyMessage(`Tidak ada artikel yang cocok dengan "${query}"`);
                currentResults = [];
                selectedIndex = -1;
                return;
            }

            currentResults = json.data;
            selectedIndex = 0;
            renderResults(json.data, query);
        } catch (err) {
            renderEmptyMessage('Gagal memuat hasil pencarian. Coba lagi nanti.');
            currentResults = [];
            selectedIndex = -1;
        }
    }

    function renderResults(posts, query) {
        if (!resultsContainer) return;
        let html = '';

        posts.forEach((post, idx) => {
            const isSelected = idx === selectedIndex ? 'selected' : '';
            const highlightedTitle = highlightKeyword(escapeHtmlText(post.title || ''), query);
            const highlightedSnippet = highlightKeyword(escapeHtmlText(post.snippet || ''), query);
            const categoryBadge = post.category 
                ? `<span class="search-result-category">${escapeHtmlText(post.category)}</span>` 
                : '';

            html += `
                <a href="/post/${encodeURIComponent(post.slug)}" class="search-result-item ${isSelected}" data-index="${idx}">
                    <div class="search-result-title">
                        <span>${highlightedTitle}</span>
                        ${categoryBadge}
                    </div>
                    <div class="search-result-snippet">${highlightedSnippet}</div>
                </a>
            `;
        });

        resultsContainer.innerHTML = html;

        // Pasang event hover untuk sinkronisasi selectedIndex
        const items = resultsContainer.querySelectorAll('.search-result-item');
        items.forEach((item) => {
            item.addEventListener('mouseenter', function () {
                const idx = parseInt(this.getAttribute('data-index'), 10);
                if (!isNaN(idx)) {
                    selectedIndex = idx;
                    updateSelection();
                }
            });
        });
    }

    function updateSelection() {
        if (!resultsContainer) return;
        const items = resultsContainer.querySelectorAll('.search-result-item');
        items.forEach((item, idx) => {
            if (idx === selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    function highlightKeyword(safeHtml, query) {
        if (!query) return safeHtml;
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
        if (terms.length === 0) return safeHtml;

        // Hindari menimpa entitas HTML (&amp;, dll)
        const regex = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi');
        return safeHtml.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeHtmlText(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Ekspor ke window / module untuk pengujian atau integrasi jika diperlukan
    const exportObject = {
        init: initSearch,
        highlightKeyword: highlightKeyword,
        escapeRegex: escapeRegex
    };

    if (typeof window !== 'undefined') {
        window.NeoBlogSearch = exportObject;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exportObject;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initSearch);
        } else {
            initSearch();
        }
    }
})();
