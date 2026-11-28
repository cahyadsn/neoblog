/**
 * NeoBlog Comments Handler (AJAX Fetch API Native)
 * Mengirim komentar/balasan, menangani antrean moderasi, dan memperbarui thread DOM secara real-time.
 */

document.addEventListener('DOMContentLoaded', () => {
    const commentForm = document.getElementById('commentForm');
    const commentsList = document.getElementById('commentsList');
    const feedbackMsg = document.getElementById('commentFeedback');
    const parentIdInput = document.getElementById('commentParentId');
    const replyingBanner = document.getElementById('replyingToBanner');
    const replyingToName = document.getElementById('replyingToName');
    const cancelReplyBtn = document.getElementById('cancelReplyBtn');
    const commentTextarea = document.getElementById('comment_text');

    const utils = (typeof window !== 'undefined' && window.NeoBlogUtils) ? window.NeoBlogUtils : null;
    const escapeHtml = utils && typeof utils.escapeHtml === 'function'
        ? utils.escapeHtml
        : (str) => {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };
    const nl2brSafe = utils && typeof utils.nl2brSafe === 'function'
        ? utils.nl2brSafe
        : (str) => escapeHtml(str).replace(/\r\n|\r|\n/g, '<br>');

    function clearReplyState() {
        if (parentIdInput) {
            parentIdInput.value = '';
        }
        if (replyingToName) {
            replyingToName.textContent = '';
        }
        if (replyingBanner) {
            replyingBanner.style.display = 'none';
        }
    }

    if (cancelReplyBtn) {
        cancelReplyBtn.addEventListener('click', () => {
            clearReplyState();
        });
    }

    if (commentsList) {
        commentsList.addEventListener('click', (e) => {
            const btn = e.target.closest('.reply-btn');
            if (!btn) return;

            const cid = btn.getAttribute('data-comment-id') || '';
            const author = btn.getAttribute('data-author') || 'komentar';

            if (parentIdInput && cid !== '') {
                parentIdInput.value = cid;
            }
            if (replyingToName) {
                replyingToName.textContent = author;
            }
            if (replyingBanner) {
                replyingBanner.style.display = 'flex';
            }
            if (commentTextarea) {
                commentTextarea.focus();
                if (typeof commentTextarea.scrollIntoView === 'function') {
                    commentTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });
    }

    if (!commentForm) return;

    commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = commentForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.textContent : 'Kirim Komentar';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Mengirim...';
        }

        if (feedbackMsg) {
            feedbackMsg.style.display = 'none';
            feedbackMsg.className = '';
        }

        const formData = new FormData(commentForm);
        const csrfInput = commentForm.querySelector('input[name="csrf_token"]');
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const csrfToken = (csrfInput && csrfInput.value)
            || (csrfMeta ? csrfMeta.getAttribute('content') : '')
            || '';

        try {
            const response = await fetch('/api/comments', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken
                }
            });

            let result = null;
            try {
                result = await response.json();
            } catch (parseErr) {
                result = null;
            }

            if (response.ok && result && result.success && result.comment) {
                const isApproved = Number(
                    result.is_approved !== undefined ? result.is_approved : (result.comment.is_approved !== undefined ? result.comment.is_approved : 1)
                ) === 1 && result.status !== 'pending';

                if (isApproved) {
                    if (commentsList) {
                        const emptyMsg = commentsList.querySelector('.empty-comments');
                        if (emptyMsg) {
                            emptyMsg.remove();
                        }
                        insertCommentIntoList(commentsList, result.comment);
                    }
                    incrementCommentsCount();
                    commentForm.reset();
                    clearReplyState();
                    showFeedback(result.message || 'Komentar berhasil dikirim!', 'success');
                } else {
                    commentForm.reset();
                    clearReplyState();
                    showFeedback(
                        result.message || 'Komentar Anda telah diterima dan menunggu persetujuan moderasi.',
                        'warning'
                    );
                }
            } else {
                showFeedback(
                    (result && result.error) ? result.error : 'Terjadi kesalahan saat menyimpan komentar.',
                    'error'
                );
            }
        } catch (err) {
            showFeedback('Gagal terhubung ke server. Periksa koneksi Anda.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        }
    });

    function insertCommentIntoList(listEl, comment) {
        const parentId = comment.parent_id ? String(comment.parent_id) : '';
        if (parentId !== '') {
            const escapedParentId = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
                ? CSS.escape(parentId)
                : parentId.replace(/["\\]/g, '\\$&');
            const parentEl = listEl.querySelector(`.comment-item[data-comment-id="${escapedParentId}"]`);
            if (parentEl) {
                const parentDepth = parseInt(parentEl.getAttribute('data-depth') || '0', 10) || 0;
                const childDepth = parentDepth + 1;
                const commentEl = createCommentElement(comment, childDepth);

                let anchor = parentEl;
                let cursor = parentEl.nextElementSibling;
                while (cursor && cursor.classList.contains('comment-item')) {
                    const cursorDepth = parseInt(cursor.getAttribute('data-depth') || '0', 10) || 0;
                    if (cursorDepth <= parentDepth) {
                        break;
                    }
                    anchor = cursor;
                    cursor = cursor.nextElementSibling;
                }
                anchor.insertAdjacentElement('afterend', commentEl);
                return;
            }
        }

        const rootEl = createCommentElement(comment, parentId !== '' ? 1 : 0);
        listEl.appendChild(rootEl);
    }

    function createCommentElement(c, depth) {
        const item = document.createElement('div');
        const numericId = c.id ? Number(c.id) : 0;
        const isAdminReply = Number(c.is_admin_reply) === 1;
        const isBotReply = Number(c.is_bot_reply) === 1;

        const classes = ['comment-item'];
        if (depth > 0 || c.parent_id) {
            classes.push('comment-reply');
            const capped = Math.min(Math.max(depth, 1), 3);
            if (capped >= 2) {
                classes.push(`depth-${capped}`);
            }
        }
        if (isAdminReply) {
            classes.push('admin-reply');
        } else if (isBotReply) {
            classes.push('bot-reply');
        }

        item.className = classes.join(' ');
        if (numericId > 0) {
            item.id = `comment-${numericId}`;
            item.setAttribute('data-comment-id', String(numericId));
        }
        item.setAttribute('data-parent-id', c.parent_id ? String(c.parent_id) : '');
        item.setAttribute('data-depth', String(depth));

        const safeName = escapeHtml(c.author_name);
        const safeBody = nl2brSafe(c.comment_text);
        const safeDate = escapeHtml(c.created_at || 'Baru saja');

        let badgeHtml = '';
        if (isAdminReply) {
            badgeHtml = '<span class="badge badge-admin">Admin</span>';
        } else if (isBotReply) {
            badgeHtml = '<span class="badge">Assistant</span>';
        }

        const actionsHtml = numericId > 0
            ? `<div class="comment-actions"><button type="button" class="reply-btn" data-comment-id="${numericId}" data-author="${safeName}">Balas</button></div>`
            : '';

        item.innerHTML = `
            <div class="comment-header">
                <span class="comment-author">${safeName} ${badgeHtml}</span>
                <span class="comment-date">${safeDate}</span>
            </div>
            <div class="comment-body">${safeBody}</div>
            ${actionsHtml}
        `;
        return item;
    }

    function incrementCommentsCount() {
        const countEl = document.getElementById('commentsCount');
        if (countEl) {
            const current = parseInt(countEl.textContent || '0', 10);
            if (!Number.isNaN(current)) {
                countEl.textContent = String(current + 1);
                return;
            }
        }

        const headings = document.querySelectorAll('.comments-section h3');
        headings.forEach((h3) => {
            const match = h3.textContent.match(/Diskusi Komunitas\s*\((\d+)\)/i);
            if (match) {
                const next = parseInt(match[1], 10) + 1;
                h3.textContent = `Diskusi Komunitas (${next})`;
            }
        });
    }

    function showFeedback(message, type) {
        if (!feedbackMsg) return;
        feedbackMsg.textContent = message;
        feedbackMsg.style.display = 'block';
        feedbackMsg.style.marginTop = '12px';

        if (type === 'success') {
            feedbackMsg.className = 'alert alert-success';
        } else if (type === 'warning') {
            feedbackMsg.className = 'alert alert-warning';
        } else {
            feedbackMsg.className = 'alert alert-danger';
        }
    }
});
