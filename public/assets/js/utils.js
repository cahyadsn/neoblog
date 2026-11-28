/**
 * NeoBlog Shared Vanilla JS Utilities (UMD IIFE)
 * Digunakan oleh browser (comments.js, admin.js) dan Node test runner (tests/js/runner.js).
 */
(function (root, factory) {
    const utils = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = utils;
    }
    if (root && typeof root === 'object') {
        root.NeoBlogUtils = utils;
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
    'use strict';

    function escapeHtml(str) {
        if (str === null || str === undefined) {
            return '';
        }
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function nl2brSafe(str) {
        return escapeHtml(str).replace(/\r\n|\r|\n/g, '<br>');
    }

    function validateEmail(email) {
        if (typeof email !== 'string') {
            return false;
        }
        const trimmed = email.trim().toLowerCase();
        if (trimmed === '') {
            return false;
        }
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(trimmed);
    }

    function slugifyTitle(text) {
        if (text === null || text === undefined) {
            return '';
        }
        return String(text)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    return {
        escapeHtml: escapeHtml,
        nl2brSafe: nl2brSafe,
        formatCommentText: nl2brSafe,
        validateEmail: validateEmail,
        slugifyTitle: slugifyTitle
    };
}));
