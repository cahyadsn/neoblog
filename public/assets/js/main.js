/**
 * NeoBlog Main JavaScript (Vanilla ES6+)
 * Mengatur tema Dark/Light mode & interaktivitas global
 */

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
});

function initTheme() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const currentTheme = localStorage.getItem('neoblog_theme') || 
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeButtonText(themeToggleBtn, currentTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const activeTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('neoblog_theme', newTheme);
            updateThemeButtonText(themeToggleBtn, newTheme);
        });
    }
}

function updateThemeButtonText(btn, theme) {
    if (!btn) return;
    btn.innerHTML = theme === 'dark' ? '☀️ Mode Terang' : '🌙 Mode Gelap';
}
