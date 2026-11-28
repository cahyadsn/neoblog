/**
 * NeoBlog Admin CMS Vanilla JavaScript
 * Tanpa dependensi eksternal: konfirmasi hapus, auto-slug, status artikel, dan moderasi komentar AJAX.
 */

document.addEventListener('DOMContentLoaded', () => {
    initDeleteConfirmations();
    initSlugGenerator();
    initPostStatusForms();
    initCommentModerationForms();
});

function getUtils() {
    return (typeof window !== 'undefined' && window.NeoBlogUtils) ? window.NeoBlogUtils : null;
}

function getCsrfToken(form) {
    const csrfInput = form ? form.querySelector('input[name="csrf_token"]') : null;
    if (csrfInput && csrfInput.value) {
        return csrfInput.value;
    }
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? (meta.getAttribute('content') || '') : '';
}

function initDeleteConfirmations() {
    const deleteForms = document.querySelectorAll('form.js-delete-form');
    deleteForms.forEach((form) => {
        form.addEventListener('submit', (e) => {
            const message = form.getAttribute('data-confirm') || 'Apakah Anda yakin ingin menghapus item ini?';
            if (!window.confirm(message)) {
                e.preventDefault();
            }
        });
    });
}

function slugifyTitle(text) {
    const utils = getUtils();
    if (utils && typeof utils.slugifyTitle === 'function') {
        return utils.slugifyTitle(text);
    }
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function initSlugGenerator() {
    const titleInput = document.getElementById('postTitle');
    const slugInput = document.getElementById('postSlug');
    if (!titleInput || !slugInput) {
        return;
    }

    let isManuallyEdited = slugInput.dataset.slugLocked === 'true' || slugInput.value.trim() !== '';

    slugInput.addEventListener('input', () => {
        isManuallyEdited = slugInput.value.trim() !== '';
    });

    titleInput.addEventListener('input', () => {
        if (!isManuallyEdited) {
            slugInput.value = slugifyTitle(titleInput.value);
        }
    });
}

function showAdminFeedback(message, type) {
    const feedback = document.getElementById('adminAjaxFeedback');
    if (!feedback) {
        return;
    }
    feedback.className = 'alert ' + (type === 'success' ? 'alert-success' : 'alert-danger');
    feedback.textContent = message;
    feedback.style.display = 'block';
}

function initPostStatusForms() {
    const statusForms = document.querySelectorAll('form.js-post-status-form');
    statusForms.forEach((form) => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : '';

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Memproses...';
            }

            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: new FormData(form),
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json',
                        'X-CSRF-Token': getCsrfToken(form)
                    }
                });

                const result = await response.json();
                if (response.ok && result && result.success) {
                    showAdminFeedback(result.message || 'Status artikel diperbarui.', 'success');
                    window.location.reload();
                    return;
                }

                showAdminFeedback((result && result.error) ? result.error : 'Gagal memperbarui status artikel.', 'danger');
            } catch (err) {
                showAdminFeedback('Kesalahan jaringan saat memperbarui status artikel.', 'danger');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }
        });
    });
}

function adjustFilterCount(key, delta) {
    const el = document.querySelector(`[data-filter-count="${key}"]`);
    if (!el) return;
    const current = parseInt(el.textContent || '0', 10);
    if (!Number.isNaN(current)) {
        el.textContent = String(Math.max(0, current + delta));
    }
}

function syncFilterCounts(counts) {
    if (!counts || typeof counts !== 'object') {
        return false;
    }
    const resolved = {
        all: counts.all !== undefined ? counts.all : counts.total,
        pending: counts.pending,
        approved: counts.approved
    };
    let hasAny = false;
    ['all', 'pending', 'approved'].forEach((key) => {
        if (resolved[key] !== undefined && resolved[key] !== null) {
            const val = Number(resolved[key]);
            if (!Number.isNaN(val)) {
                hasAny = true;
                const el = document.querySelector(`[data-filter-count="${key}"]`);
                if (el) {
                    el.textContent = String(Math.max(0, val));
                }
            }
        }
    });
    return hasAny;
}

function getActiveCommentFilter() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status') || 'all';
    return ['all', 'pending', 'approved'].includes(status) ? status : 'all';
}

function ensureEmptyStateIfNeeded() {
    const table = document.getElementById('commentsModerationTable');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody || tbody.querySelectorAll('tr').length > 0) return;

    const card = table.closest('.admin-card');
    if (!card) return;
    const responsiveWrap = table.closest('.table-responsive');
    if (responsiveWrap) {
        responsiveWrap.remove();
    }
    if (!card.querySelector('.admin-empty')) {
        const empty = document.createElement('p');
        empty.className = 'admin-empty';
        empty.textContent = 'Tidak ada komentar pada filter saat ini.';
        card.appendChild(empty);
    }
}

function createModerationRow(comment, csrfToken) {
    const utils = getUtils();
    const escapeHtml = utils && typeof utils.escapeHtml === 'function'
        ? utils.escapeHtml
        : (str) => String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    const nl2brSafe = utils && typeof utils.nl2brSafe === 'function'
        ? utils.nl2brSafe
        : (str) => escapeHtml(str).replace(/\r\n|\r|\n/g, '<br>');

    const id = Number(comment.id || 0);
    const parentId = comment.parent_id ? Number(comment.parent_id) : 0;
    const isAdminReply = Number(comment.is_admin_reply) === 1;
    const isBotReply = Number(comment.is_bot_reply) === 1;
    const isApproved = Number(comment.is_approved ?? 1) === 1;

    const tr = document.createElement('tr');
    tr.setAttribute('data-comment-id', String(id));
    tr.setAttribute('data-parent-id', parentId > 0 ? String(parentId) : '');
    tr.setAttribute('data-status', isApproved ? 'approved' : 'pending');

    let roleBadge = '';
    if (isAdminReply) {
        roleBadge = '<span class="badge badge-admin">Admin</span>';
    } else if (isBotReply) {
        roleBadge = '<span class="badge badge-bot">Assistant</span>';
    }

    const emailHtml = comment.author_email
        ? `<span class="table-subtext">${escapeHtml(comment.author_email)}</span>`
        : '';

    const parentIndicator = parentId > 0
        ? `<span class="comment-parent-indicator">Balasan untuk #${parentId}${comment.parent_author_name ? ' (' + escapeHtml(comment.parent_author_name) + ')' : ''}</span>`
        : '';

    const slug = String(comment.post_slug || '');
    const postStatus = String(comment.post_status || 'published');
    let slugSubtext = '';
    if (slug !== '') {
        if (postStatus === 'published') {
            slugSubtext = `<span class="table-subtext"><a href="/post/${encodeURIComponent(slug)}" target="_blank" rel="noopener noreferrer">/post/${escapeHtml(slug)}</a></span>`;
        } else {
            slugSubtext = `<span class="table-subtext">/post/${escapeHtml(slug)} (${escapeHtml(postStatus)})</span>`;
        }
    }

    const safeCsrf = escapeHtml(csrfToken);
    const toggleAction = isApproved ? 'hide' : 'approve';
    const toggleBtnClass = isApproved ? 'btn-warning' : 'btn-success';
    const toggleLabel = isApproved ? 'Sembunyikan' : 'Setujui';

    tr.innerHTML = `
        <td>
            <strong>${escapeHtml(comment.author_name || 'Admin')}</strong>
            ${roleBadge}
            ${emailHtml}
        </td>
        <td>
            ${parentIndicator}
            <div class="comment-moderation-text">${nl2brSafe(comment.comment_text || '')}</div>
        </td>
        <td>
            <strong>${escapeHtml(comment.post_title || 'Artikel')}</strong>
            ${slugSubtext}
        </td>
        <td>
            <span class="badge ${isApproved ? 'badge-approved' : 'badge-pending'}" data-status-badge>${isApproved ? 'Disetujui' : 'Menunggu'}</span>
        </td>
        <td>${escapeHtml(comment.created_at || 'Baru saja')}</td>
        <td>
            <div class="table-actions">
                <form method="POST" action="/admin/comments/${id}/${toggleAction}" class="inline-form js-comment-moderate-form" data-action="${toggleAction}">
                    <input type="hidden" name="csrf_token" value="${safeCsrf}">
                    <button type="submit" class="btn ${toggleBtnClass} btn-sm">${toggleLabel}</button>
                </form>
                <form method="POST" action="/admin/comments/${id}/delete" class="inline-form js-comment-delete-form" data-confirm="Yakin ingin menghapus komentar ini beserta seluruh balasannya?">
                    <input type="hidden" name="csrf_token" value="${safeCsrf}">
                    <button type="submit" class="btn btn-danger btn-sm">Hapus</button>
                </form>
            </div>
            <details class="admin-reply-details">
                <summary class="btn btn-secondary btn-sm">Balas</summary>
                <form method="POST" action="/admin/comments/${id}/reply" class="admin-reply-form js-comment-reply-form">
                    <input type="hidden" name="csrf_token" value="${safeCsrf}">
                    <textarea name="comment_text" class="form-control" rows="2" placeholder="Tulis balasan resmi admin..." required></textarea>
                    <button type="submit" class="btn btn-primary btn-sm">Kirim Balasan</button>
                </form>
            </details>
        </td>
    `;
    return tr;
}

function initCommentModerationForms() {
    document.addEventListener('submit', async (e) => {
        const moderateForm = e.target.closest('form.js-comment-moderate-form');
        if (moderateForm) {
            e.preventDefault();
            await handleModerateSubmit(moderateForm);
            return;
        }

        const deleteForm = e.target.closest('form.js-comment-delete-form');
        if (deleteForm) {
            const confirmMsg = deleteForm.getAttribute('data-confirm') || 'Yakin ingin menghapus komentar ini?';
            if (!window.confirm(confirmMsg)) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            await handleCommentDeleteSubmit(deleteForm);
            return;
        }

        const replyForm = e.target.closest('form.js-comment-reply-form');
        if (replyForm) {
            e.preventDefault();
            await handleCommentReplySubmit(replyForm);
        }
    });
}

async function handleModerateSubmit(form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    const row = form.closest('tr[data-comment-id]');
    const prevStatus = row ? (row.getAttribute('data-status') || '') : '';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Memproses...';
    }

    try {
        const response = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
                'X-CSRF-Token': getCsrfToken(form)
            }
        });

        const result = await response.json();
        if (!response.ok || !result || !result.success) {
            showAdminFeedback((result && result.error) ? result.error : 'Gagal memproses moderasi komentar.', 'danger');
            return;
        }

        const newStatus = result.status === 'approved' ? 'approved' : 'pending';
        if (!syncFilterCounts(result.counts)) {
            if (prevStatus && prevStatus !== newStatus) {
                adjustFilterCount(prevStatus, -1);
                adjustFilterCount(newStatus, 1);
            }
        }

        const activeFilter = getActiveCommentFilter();
        if (row) {
            if (activeFilter !== 'all' && activeFilter !== newStatus) {
                row.remove();
                ensureEmptyStateIfNeeded();
            } else {
                row.setAttribute('data-status', newStatus);
                const badge = row.querySelector('[data-status-badge]');
                if (badge) {
                    badge.className = 'badge ' + (newStatus === 'approved' ? 'badge-approved' : 'badge-pending');
                    badge.textContent = result.status_label || (newStatus === 'approved' ? 'Disetujui' : 'Menunggu');
                }
                const commentId = row.getAttribute('data-comment-id') || '';
                const nextAction = newStatus === 'approved' ? 'hide' : 'approve';
                form.action = `/admin/comments/${commentId}/${nextAction}`;
                form.setAttribute('data-action', nextAction);
                if (submitBtn) {
                    submitBtn.className = 'btn btn-sm ' + (newStatus === 'approved' ? 'btn-warning' : 'btn-success');
                    submitBtn.textContent = newStatus === 'approved' ? 'Sembunyikan' : 'Setujui';
                }
            }
        }

        showAdminFeedback(result.message || 'Status komentar diperbarui.', 'success');
    } catch (err) {
        showAdminFeedback('Kesalahan jaringan saat memproses moderasi komentar.', 'danger');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            if (submitBtn.textContent === 'Memproses...') {
                submitBtn.textContent = originalText;
            }
        }
    }
}

async function handleCommentDeleteSubmit(form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    const row = form.closest('tr[data-comment-id]');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Menghapus...';
    }

    try {
        const response = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
                'X-CSRF-Token': getCsrfToken(form)
            }
        });

        const result = await response.json();
        if (!response.ok || !result || !result.success) {
            showAdminFeedback((result && result.error) ? result.error : 'Gagal menghapus komentar.', 'danger');
            return;
        }

        const syncedCounts = syncFilterCounts(result.counts);

        if (row) {
            const deletedIds = new Set([row.getAttribute('data-comment-id')]);
            const tbody = row.closest('tbody');
            const rowsToRemove = [row];

            if (tbody) {
                let changed = true;
                while (changed) {
                    changed = false;
                    tbody.querySelectorAll('tr[data-comment-id]').forEach((candidate) => {
                        const cid = candidate.getAttribute('data-comment-id');
                        const pid = candidate.getAttribute('data-parent-id');
                        if (pid && deletedIds.has(pid) && !deletedIds.has(cid)) {
                            deletedIds.add(cid);
                            rowsToRemove.push(candidate);
                            changed = true;
                        }
                    });
                }
            }

            rowsToRemove.forEach((r) => {
                if (!syncedCounts) {
                    const st = r.getAttribute('data-status');
                    adjustFilterCount('all', -1);
                    if (st === 'approved' || st === 'pending') {
                        adjustFilterCount(st, -1);
                    }
                }
                r.remove();
            });
            ensureEmptyStateIfNeeded();
        }

        showAdminFeedback(result.message || 'Komentar berhasil dihapus.', 'success');
    } catch (err) {
        showAdminFeedback('Kesalahan jaringan saat menghapus komentar.', 'danger');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

async function handleCommentReplySubmit(form) {
    const textarea = form.querySelector('textarea[name="comment_text"]');
    const replyText = textarea ? textarea.value.trim() : '';
    if (replyText === '') {
        showAdminFeedback('Teks balasan wajib diisi.', 'danger');
        return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    const details = form.closest('details');
    const csrfToken = getCsrfToken(form);

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Mengirim...';
    }

    try {
        const response = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
                'X-CSRF-Token': csrfToken
            }
        });

        const result = await response.json();
        if (!response.ok || !result || !result.success) {
            showAdminFeedback((result && result.error) ? result.error : 'Gagal mengirim balasan admin.', 'danger');
            return;
        }

        if (textarea) {
            textarea.value = '';
        }
        if (details) {
            details.open = false;
        }

        if (!syncFilterCounts(result.counts)) {
            adjustFilterCount('all', 1);
            adjustFilterCount('approved', 1);
        }

        const activeFilter = getActiveCommentFilter();
        const table = document.getElementById('commentsModerationTable');
        const tbody = table ? table.querySelector('tbody') : null;
        if (tbody && result.comment && activeFilter !== 'pending') {
            const newRow = createModerationRow(result.comment, csrfToken);
            tbody.prepend(newRow);
        }

        showAdminFeedback(result.message || 'Balasan admin berhasil dikirim.', 'success');
    } catch (err) {
        showAdminFeedback('Kesalahan jaringan saat mengirim balasan admin.', 'danger');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}
